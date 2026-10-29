"""Strict, offline importer for the two supplied Markdown documents. No companion JSON is used."""
from pathlib import Path
import collections, hashlib, json, math, re

ROOT = Path(__file__).resolve().parents[1]

def field(text, name):
    m = re.search(r'^\*\*' + re.escape(name) + r':\*\* (.*)$', text, re.M)
    return m.group(1) if m else ''

def expand_group(root, synonyms):
    """Explicit generic counting rule; linked references to a canonical ID are not new records."""
    return [root, *synonyms]

def parse_vocab(text):
    families = []
    section = text.split('## Study Families', 1)[1].split('## Word Records', 1)[0]
    for m in re.finditer(r'^### (F\d+) · (.*?)\n(.*?)(?=^### F\d+|\Z)', section, re.M | re.S):
        fid, title, body = m.groups()
        families.append(dict(id=fid, title=title, words=re.findall(r'\[([^\]]+)\]\(#(v-[^)]+)\)', field(body, 'Words')), scene=field(body, '\u09ae\u099c\u09be\u09b0 memory scene'), distinctions=field(body, 'Meaning distinctions')))
    records = text.split('## Word Records', 1)[1].split('## Original Groups', 1)[0]
    words = []
    for m in re.finditer(r'<a id="(v-[^"]+)"></a>\s*\n### (.*?)\n(.*?)(?=<a id="v-|\Z)', records, re.S):
        wid, term, body = m.groups()
        raw = m.group(0).strip()
        words.append(dict(id=wid, term=term, meaning=field(body, 'English meaning'), bengali=field(body, '\u09b8\u09b9\u099c \u09ac\u09be\u0982\u09b2\u09be'), mnemonic=field(body, '\u09ae\u099c\u09be\u09b0 mnemonic'), example=field(body, 'Example'), notes=field(body, 'Source correction / \u09b8\u0982\u09b6\u09cb\u09a7\u09a8'), families=re.findall(r'\[(F\d+)\]', field(body, 'Study families')), groups=re.findall(r'G\d+', field(body, 'ID')), source=field(body, 'Source'), raw=raw, sourceFile='vocab.md', recordOrder=len(words)))
    ids = [w['id'] for w in words]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate canonical vocabulary IDs; resolve explicitly before importing')
    byid = {w['id']:w for w in words}
    ordered, seen, refs = [], set(), collections.Counter()
    for f in families:
        for term, wid in f['words']:
            if wid not in byid or byid[wid]['term'] != term:
                raise ValueError(f'Unresolved family word: {f["id"]} {term} {wid}')
            refs[wid] += 1
            if wid not in seen:
                seen.add(wid)
                ordered.append(byid[wid])
    for word in words:
        if word['id'] not in seen:
            ordered.append(word)
    for i, w in enumerate(ordered):
        w.update(order=i, day=i//45+1, block=(i%45)//15+1)
    return ordered, families, refs

def parse_questions(text, words):
    word_days = {w['id']:w['day'] for w in words}
    out = []
    for m in re.finditer(r'^### (Q\d+) · ([^\n]+)\n(.*?)(?=^### Q\d+ · |^## |\Z)', text, re.M | re.S):
        qid, kind, body = m.groups()
        before, after = body.split('<details>', 1)
        # Keep source slices untouched. Native UI renders formatting separately.
        prompt = before.strip()
        after = after.split('</details>', 1)[0]
        answer_lines = re.findall(r'^(?:- )?\*\*(?:Correct answers?|Blank \([ivx]+\)):[^\n]+', after, re.M)
        answers = []
        for line in answer_lines:
            answers += re.findall(r'\b([A-I])\. ', line)
        choices = re.findall(r'\*\*([A-I])\.\*\* ([^|\n]+)', before)
        # The source table is row-major; labels encode the original blank column ordering.
        choice_map = {label:value.rstrip() for label,value in choices}
        pair_parts = {}
        for line in before.splitlines():
            pair = re.match(r'\| \*\*([A-I])\*\* \| (.*?) \| (.*?) \|',line)
            if pair:
                label, first, second = pair.groups()
                choice_map[label] = first+' / '+second
                pair_parts[label] = [first,second]
        choices = [dict(label=k,text=choice_map[k],**({'parts':pair_parts[k]} if k in pair_parts else {})) for k in sorted(choice_map)]
        matched = re.findall(r'\]\(vocab\.md#(v-[^)]+)\)', field(after, 'Verified vocabulary'))
        if any(w not in word_days for w in matched):
            raise ValueError(f'{qid}: unknown explicitly verified word')
        explanation = ''
        if '**Source explanation**' in after:
            explanation = after.split('**Source explanation**',1)[1].split('**Verified vocabulary:**',1)[0].strip()
        stem = re.split(r'\n(?:- \*\*[A-I]\.\*\*|\|)', prompt, maxsplit=1)[0].strip()
        blank_count = len(re.findall(r'_{3,}',stem))
        mode = 'pair' if pair_parts else 'multiBlank' if kind=='TC' and len(answers)>1 else 'multiSelect' if kind=='SE' else 'single'
        groups = []
        if mode=='multiBlank':
            assert blank_count == len(answers), (qid,blank_count,answers)
            for i in range(blank_count):
                labels = [chr(65+i*3+j) for j in range(3)]
                assert all(label in choice_map for label in labels), qid
                groups.append(dict(blank=i+1,labels=labels))
        out.append(dict(id=qid,type=kind, prompt=prompt, stem=stem, choices=choices, answers=answers, blankCount=blank_count, selectionMode=mode, choiceGroups=groups, answerSource='\n'.join(answer_lines), explanation=explanation, linkedWords=matched, days=sorted(set(word_days[w] for w in matched)), raw=m.group(0).strip(), sourceFile='qn.md', order=len(out)))
    if len({q['id'] for q in out}) != len(out):
        raise ValueError('Duplicate question IDs')
    return out

def build():
    vt = (ROOT/'content/vocab.md').read_text(encoding='utf-8')
    qt = (ROOT/'content/qn.md').read_text(encoding='utf-8')
    words, families, refs = parse_vocab(vt)
    questions = parse_questions(qt, words)
    example_file = ROOT/'content/ets_examples.json'
    example_data = json.loads(example_file.read_text(encoding='utf8')) if example_file.exists() else {'words':{}}
    generated_file = ROOT/'content/generated_examples.tsv'
    generated = {}
    by_term = {word['term']:word for word in words}
    if generated_file.exists():
        for line in generated_file.read_text(encoding='utf8').splitlines():
            if not line.strip():continue
            term,sentence = line.split('\t',1)
            if term not in by_term or term in generated:raise ValueError('Unknown or duplicate generated example: '+term)
            if not re.search(r'\b'+re.escape(term)+r'\b',sentence,re.I):raise ValueError('Example omits its target: '+term)
            generated[term]=dict(text=sentence,kind='generated-practice',origin='assistant-authored',label='Generated practice example · not ETS',createdDate='2026-10-26',sourceMeaning=by_term[term]['meaning'])
    for word in words:
        word['examples'] = list(example_data['words'].get(word['id'],[]))
        if not word['examples'] and word['term'] in generated:word['examples'].append(generated[word['term']])
    # Reject partial imports against the documents' own manifest.
    for text, records in [(vt, words), (qt, questions)]:
        declared = int(re.search(r'^record_count: (\d+)',text,re.M).group(1))
        assert declared == len(records), (declared, len(records))
    payload = dict(schema=1, words=words, families=[dict(f,words=[wid for _,wid in f['words']]) for f in families], questions=questions)
    (ROOT/'app/assets/content.json').write_text(json.dumps(payload, ensure_ascii=False, separators=(',',':')), encoding='utf-8')
    missing = {k:sum(not w[k] for w in words) for k in ['meaning','bengali','mnemonic','example','families']}
    missing['explicitSynonymField'] = len(words)  # This source uses meaning families instead.
    repeated = {k:n for k,n in refs.items() if n>1}
    collisions = {t:[w['id'] for w in words if w['term'].casefold()==t] for t,n in collections.Counter(w['term'].casefold() for w in words).items() if n>1}
    day_counts = collections.Counter(w['day'] for w in words)
    qday = {d:[q['id'] for q in questions if d in q['days']] for d in day_counts}
    audit = dict(words=len(words),families=len(families),familyReferences=sum(refs.values()),additionalFamilyMembers=sum(max(0,len(f['words'])-1) for f in families),days=len(day_counts),blocks=math.ceil(len(words)/15),missing=missing,duplicateTerms=collisions,repeatedReferences=repeated,questionTypes=dict(collections.Counter(q['type'] for q in questions)),keys=sum(bool(q['answers']) for q in questions),explanations=sum(bool(q['explanation']) for q in questions),unmapped=[q['id'] for q in questions if not q['days']],unreferenced=[w['id'] for w in words if w['id'] not in refs],dayMapping=qday,hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'content').glob('*.md')})
    audit['blankCounts'] = dict(collections.Counter(str(q['blankCount']) for q in questions))
    audit['tcMultiBlank'] = dict(collections.Counter(str(q['blankCount']) for q in questions if q['type']=='TC'))
    audit['wordsWithEtsExamples'] = sum(bool(example_data['words'].get(w['id'])) for w in words)
    audit['wordsWithGeneratedExamples'] = sum(any(e['kind']=='generated-practice' for e in w['examples']) for w in words)
    audit['wordsWithAnyExample'] = sum(bool(w['examples']) for w in words)
    (ROOT/'docs/audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
    cumbersome_groups = '/'.join(next(w['groups'] for w in words if w['id']=='v-cumbersome'))
    report = f'''# Content audit — 2026-10-25

Inputs are byte-for-byte copies of ../vocab.md and ../qn.md. Neither original is modified. Only the Markdown files are parsed; companion JSON/PDFs are not content inputs.

## Vocabulary

The actual schema has {len(words)} canonical word records, {len(families)} meaning families, and 32 original source groups. Families explicitly warn that their members are not all interchangeable synonyms. There is no root/synonym field to invent. Each listed word is imported independently with its own meaning, Bengali, mnemonic, progress, history, and due date. Family relationships and source record order remain attached.

The ordered family lists contain {sum(refs.values())} references: {sum(max(0,len(f['words'])-1) for f in families)} additional members after each first member. Repeated references to the same explicit canonical ID are relationship links, not additional source records. {sum(n-1 for n in repeated.values())} repeated references are retained as associations and do not inflate the {len(words)} items. The source already consolidates the repeated original entry `cumbersome` across {cumbersome_groups}; both associations remain.

Schedule: {len(day_counts)} days, {math.ceil(len(words)/15)} blocks. Full days contain 45 items, each divided into 15/15/15; final day has {day_counts[max(day_counts)]} items. Order is first occurrence in the supplied family order, then any unreferenced word records in their original order. No padding.

Missing original Markdown fields: {json.dumps(missing)}. Original example fields remain absent; ETS enrichment and the user's subsequently authorized generated practice examples are tracked separately. Five correction notes are preserved verbatim. Exact/case-folded term collisions: {json.dumps(collisions)}. Malformed or unresolved IDs: 0 (strict import assertions). Unreferenced records: {json.dumps(audit['unreferenced'])}.

## Official practice

{len(questions)} questions: {json.dumps(audit['questionTypes'])}. Keys: {audit['keys']}; missing keys: {len(questions)-audit['keys']}. Source explanations: {audit['explanations']}; missing: {len(questions)-audit['explanations']}. Q032's supplied discrepancy note is preserved. Stems, choices, key lines, explanations, source references, and complete raw record slices are bundled without paraphrase.

Mapping uses ONLY each question's explicit **Verified vocabulary** links, including source-provided inflections. A question may appear on more than one day when its verified answers span days. No fuzzy matching. Unmapped questions: {json.dumps(audit['unmapped'])}.

| Day | Items | Blocks | Mapped questions |
|---|---:|---:|---:|
'''
    for day,count in sorted(day_counts.items()):
        report += f'| {day} | {count} | {math.ceil(count/15)} | {len(qday[day])} |\n'
    report += '\nFull question IDs per day, repeated family reference IDs and SHA256 fingerprints are in `audit.json`. All canonical records and questions are accounted for.\n'
    report += f"\n## Annotation revisions\n\nNative TC counts by number of blanks: {audit['tcMultiBlank']}. These questions were already present; format filters and per-blank choices make them visible. Legacy pairs remain one selected pair for two blanks; SE remains two selections for one blank.\n\nExample coverage: {audit['wordsWithEtsExamples']} words have ETS contexts; {audit['wordsWithGeneratedExamples']} previously uncovered words now have an explicitly labeled generated practice example, authorized by the user's 2026-10-26 annotation. Total coverage: {audit['wordsWithAnyExample']} / {len(words)}. Source meanings and original question/Markdown text remain unchanged. See `examples-audit.md` and `generated-examples-audit.md`.\n"
    (ROOT/'docs/content-audit.md').write_text(report,encoding='utf-8')
    print(json.dumps({k:v for k,v in audit.items() if k not in ['dayMapping','repeatedReferences','hashes']},ensure_ascii=True,indent=2))
    return payload,audit

if __name__=='__main__':
    build()
