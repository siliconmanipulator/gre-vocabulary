/* Small learning rounds, individual retrieval and a calm, connected workspace. */
let lastStudyTick=Date.now(),lastInteraction=Date.now(),weakCursor=0,weakRotationAt=Date.now(),weakPaused=false;
const revealedStudyWords=new Set();
function resetStudyReveal(){revealedStudyWords.clear();}
function shortMeaning(text,limit=16){const first=String(text).split(';')[0].replace(/^1\.\s*/,'').trim(),parts=first.split(/\s+/);return parts.length>limit?parts.slice(0,limit).join(' ')+'…':first;}
function currentStudyNames(){if(view==='round'){const r=activeRound();return r?.groups[r.cursor]||[];}if(view==='cards'&&session()?.index<session().words.length)return visibleStudyNames(session());return [];}
function revealStudy(word=null){const names=word?[word]:currentStudyNames();const open=names.some(name=>!revealedStudyWords.has(name));names.forEach(name=>open?revealedStudyWords.add(name):revealedStudyWords.delete(name));render();}
function studyNavigation(backAction,nextAction,atStart=false,atEnd=false){return `<div class="study-navigation">${button('← Back',backAction,'btn secondary',atStart?'disabled':'')}${button(currentStudyNames().every(w=>revealedStudyWords.has(w))?'Hide details · Space':'Reveal details · Space','reveal-study','btn secondary')}${button('Next →',nextAction,'btn secondary',atEnd?'disabled':'')}<span>← / → browse · Space reveal</span></div>`;}
const toneNames={'+':'Positive','-':'Negative','=':'Neutral','?':'Context matters'};
function activeRound(day=state.currentDay){return state.learning.days[day]?.at(-1)||null;}
function roundHistory(day=state.currentDay){return state.learning.days[day]||[];}
function weakWords(){return Object.keys(state.learning.weak).filter(w=>byWord[w]&&state.learning.weak[w].misses>0&&state.learning.weak[w].streak<2).sort((a,b)=>state.learning.weak[b].misses-state.learning.weak[a].misses||a.localeCompare(b));}
function recallWords(){return [...new Set([...weakWords(),...state.mistakeBank])].filter(w=>byWord[w]);}
function toneCopy(w){
  return w.polarity_note||({'+':'This sense suggests praise or benefit. Picture a thumbs-up.',
    '-':'This sense suggests harm or discomfort. Picture a warning light.',
    '=':'This is a neutral description; context determines its tone.',
    '?':'Sentence chara plus/minus stamp marish na! Ki ba kake bola hochhe, seta dekhe tone dhor.'}[w.polarity]);
}
function toneBadge(w){return `<span class="tone tone-${w.polarity==='+'?'positive':w.polarity==='-'?'negative':'neutral'}">${w.polarity==='?'?'↔':w.polarity} ${toneNames[w.polarity]}</span>`;}
function memoryHook(w){return w.memory_hook||'';}
function conceptMap(names,{label='',note='',progress=''}={}){
  const entries=names.map(w=>byWord[w]).filter(Boolean),anyRevealed=names.some(w=>revealedStudyWords.has(w));
  if(names.includes('abound')&&names.includes('proliferate'))note='Abound = prochur ache · Proliferate = shongkhay bare · Burgeon = druto bere othe. Eki biryani factory-r tin alada camera shot!';
  if(names.includes('austere')&&names.includes('ascetic'))note='Austere = kothor/simple · Spartan = luxury kom · Ascetic = nijer ichchhay bhog tyag. Tinjon eki khali hostel-e, kintu karon alada!';
  return `<section class="concept-map" aria-label="Connected vocabulary flashcards"><div class="concept-hub"><span class="eyebrow">${entries.length>1?'ONE CONNECTION · '+entries.length+' WORDS':'VOCABULARY RECALL'}</span><h2>${esc(label||'Meaning → memory → recall')}</h2>${note&&anyRevealed?`<p>${esc(note)}</p>`:''}</div>
    <div class="map-nodes nodes-${entries.length}">${entries.map(w=>{
      const open=revealedStudyWords.has(w.word);
      return `<article class="memory-node ${open?'revealed':'unrevealed'}" data-action="reveal-study-word" data-word="${w.word}"><div class="node-top"><span class="small muted">G${w.groups.join(' / G')}</span>${open?toneBadge(w):''}${button('♫','speak','icon-button',`data-word="${w.word}" aria-label="Pronounce ${w.word}"`)}</div><h3>${esc(w.word)}</h3>
        <p class="node-definition">${esc(open?w.gregmat_meaning:shortMeaning(w.gregmat_meaning))}</p><p class="node-bengali" lang="bn">${esc(open?w.bengali:shortMeaning(w.bengali,12))}</p>
        ${open?`<div class="node-memory"><span class="label">${memoryHook(w)?'SOUND HOOK + FUNNY SCENE':'VISUAL MNEMONIC'}</span>${memoryHook(w)?`<strong>${esc(memoryHook(w))}</strong>`:''}<p>${esc(state.customMnemonics[w.word]||w.mnemonic_bn)}</p></div><p class="node-tone">${esc(toneCopy(w))}</p><div class="node-example"><div class="label">IN CONTEXT</div><p>${esc(w.source_example||w.sentence)}</p>${w.source_example?'<p class="small muted">Adapted from your supplied practice material.</p>':''}<div class="flex wrap">${button('Edit mnemonic','edit-mnemonic','text-button',`data-word="${w.word}"`)}${button(state.bookmarks.includes(w.word)?'★ Saved':'☆ Save','bookmark','text-button',`data-word="${w.word}"`)}</div></div>`:
          button('Click or press Space to reveal','reveal-study-word','node-reveal-hint',`data-word="${w.word}" aria-label="Reveal all details for ${w.word}"`)}</article>`;
    }).join('')}</div>${progress?`<p class="map-caption">${progress}</p>`:''}</section>`;
}
function packFor(names){return Object.values(synonymSets).find(s=>names.length>1&&names.every(w=>s.words.includes(w)))||null;}
function remainingDaily(){
  const p=plan(),exposed=new Set(state.studyByDay[p.day]||[]),roundWords=new Set(roundHistory().flatMap(r=>r.words));
  return p.words.filter(w=>!roundWords.has(w)&&!exposed.has(w)&&!(p.kind==='learn'&&state.minimizationMode&&C.learnedTogether(state,byWord[w],p)));
}
function buildRound(){
  const p=plan(),remaining=remainingDaily(),groups=[],selected=[],reserved=new Set(roundHistory().flatMap(r=>r.words));
  for(const name of remaining){
    if(selected.includes(name)||selected.length>=10)continue;
    const group=[name];selected.push(name);
    if(state.minimizationMode&&p.kind==='learn'){
      const set=learningSet(byWord[name]);
      for(const peer of set?.words||[]){
        if(group.length>=3||selected.length>=10)break;
        if(peer===name||selected.includes(peer)||reserved.has(peer)||state.boxData[peer]?.seen)continue;
        group.push(peer);selected.push(peer);
      }
    }
    groups.push(group);
  }
  if(!selected.length)return null;
  const carry=[...new Set([...(activeRound()?.missed||[]),...recallWords()])].filter(w=>!selected.includes(w)).slice(0,3);
  const round={id:roundHistory().length+1,words:selected,groups,carry,page:0,cursor:0,phase:'learn',queue:[],index:0,results:[],submitted:false,answer:'',feedback:false,missed:[]};
  (state.learning.days[p.day]||=([])).push(round);return round;
}
function startRound(){
  let r=activeRound();if(!r||r.phase==='done')r=buildRound();
  if(!r){toast('Today’s words are covered. Revisit a round or practice your weak words.');navigate('today');return;}
  state.learning.paused=false;lastInteraction=Date.now();resetStudyReveal();save();navigate(r.phase==='quiz'?'round-quiz':'round');
}
function roundHeader(r,quiz=false){return `<div class="learning-top"><div><span class="eyebrow">DAY ${state.currentDay} / ROUND ${r.id}</span><h1>${quiz?'Make it stick.':'A small set. A clear connection.'}</h1></div><div class="learning-steps"><span class="${!quiz?'active':''}">01 Learn ${r.words.length}</span><i>→</i><span class="${quiz?'active':''}">02 Recall</span><i>→</i><span>03 Revisit</span></div></div>`;}
function roundView(){
  const r=activeRound();if(!r)return heading('Ten words at a time.','A short learning round, followed by a quiz that responds to your mistakes.')+button('Start a round','study-daily');
  const names=r.groups[r.cursor]||[],pack=packFor(names),covered=r.groups.slice(0,r.page).flat().length;
  return roundHeader(r)+`<div class="round-meter"><div class="round-dots">${r.words.map((w,i)=>`<span class="${i<covered?'done':names.includes(w)?'current':''}" title="${w}">${i<covered?'✓':i+1}</span>`).join('')}</div><span>${covered} / ${r.words.length} explored</span>${studyClock()}</div>`+
    conceptMap(names,{label:pack?.sense||'Look. Imagine. Say it once.',note:pack?.note||'',progress:(names.length>1?'Mobile-e pasher word dekhte swipe kor. ':'')+'Prottek word-er ortho ar mnemonic por. Tarpor chokh soriye nijeke meaning-ta bol.'})+
    studyNavigation('round-back','round-next',r.cursor===0)+`<div class="round-controls">${button('Save & take a break','open-today','btn secondary')}<span>${r.carry.length?`${r.carry.length} earlier weak words return in the quiz`:'Meaning quiz follows this short round'}</span>${r.phase!=='learn'?button(r.phase==='done'?'Back to result →':'Resume meaning quiz →','resume-round-quiz'):''}</div>`;
}
function roundBack(){const r=activeRound();if(!r||r.cursor<=0)return;r.cursor--;resetStudyReveal();save();render();window.scrollTo({top:0,behavior:'instant'});}
function reviewRound(){const r=activeRound();if(!r)return;r.cursor=Math.min(r.page,r.groups.length-1);resetStudyReveal();save();navigate('round');}
function exploreNext(){
  const r=activeRound();if(!r)return;
  if(r.cursor<Math.min(r.page,r.groups.length-1)){r.cursor++;resetStudyReveal();save();render();return;}
  if(r.phase!=='learn'){navigate('round-quiz');return;}
  for(const word of r.groups[r.page]||[])C.rate(state,word,2,plan().words.includes(word)?'daily':'linked',state.currentDay);
  r.page++;
  r.cursor=Math.min(r.page,r.groups.length-1);resetStudyReveal();
  if(r.page>=r.groups.length){
    r.phase='quiz';
    r.queue=r.words.map((word,i)=>({word,kind:i%2?'meaning':'mcq',retry:0,carry:false,options:[]}));
    r.carry.forEach((word,i)=>r.queue.splice(Math.min(3+i*4,r.queue.length),0,{word,kind:i%2?'mcq':'meaning',retry:0,carry:true,options:[]}));
    prepareRoundOptions(r);save();navigate('round-quiz');return;
  }
  save();render();window.scrollTo({top:0,behavior:'instant'});
}
function prepareRoundOptions(r){for(const q of r.queue){if(q.kind==='cloze')q.kind='meaning';if(q.kind==='polarity')q.kind='mcq';if(q.options.length!==4||!q.options.includes(q.word)||q.options.some(w=>!byWord[w]))q.options=makeRecall(byWord[q.word],D.vocab).optionWords;}}
function clozeText(w){
  const escaped=w.word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp('\\b'+escaped+'(?:s|es|d|ed|ing)?\\b','i');
  const example=w.source_example||w.sentence;
  return pattern.test(example)?example.replace(pattern,'_____'):`Supply the word meaning: ${w.gregmat_meaning}`;
}
function roundQuizView(){
  const r=activeRound();if(!r)return roundView();if(r.phase==='done')return roundSummary(r);
  const q=r.queue[r.index];if(!q)return roundSummary(r);
  prepareRoundOptions(r);const w=byWord[q.word];
  const prompt=q.kind==='mcq'?`Which meaning belongs to “${w.word}”?`:`Which word matches this GregMat meaning?`;
  const options=q.options.map(name=>({value:name,label:q.kind==='mcq'?byWord[name].gregmat_meaning:name}));
  const answerText=w.word;
  return roundHeader(r,true)+`<div class="round-meter"><span>Question ${r.index+1} / ${r.queue.length}</span><span>${q.retry?'↻ Same meaning, reverse direction':q.carry?'↶ From an earlier round':q.kind==='mcq'?'Word → meaning':'Meaning → word'} · GregMat source definitions</span>${studyClock()}</div><section class="retrieval-card"><p class="quiz-stem">${esc(prompt)}</p>${q.kind==='meaning'?`<p class="meaning-prompt">${esc(w.gregmat_meaning)}</p>`:''}
    <div class="quiz-options">${options.map((o,i)=>button(`<span class="letter">${String.fromCharCode(65+i)}</span><span>${esc(o.label)}</span>`,'round-option',`quiz-option ${r.answer===o.value?'selected':''} ${r.submitted&&o.value===w.word?'correct':''} ${r.submitted&&!r.feedback&&r.answer===o.value?'incorrect':''}`,`data-value="${esc(o.value)}" aria-pressed="${r.answer===o.value}" ${r.submitted?'disabled':''}`)).join('')}</div>
    ${r.submitted?`<div class="round-feedback ${r.feedback?'success':'repair'}" role="status"><div class="flex between"><h3>${r.feedback?'✓ Recalled.':'Let’s make this one memorable.'}</h3><strong>${esc(answerText)}</strong></div><p><b>${w.word}</b> — ${esc(w.gregmat_meaning)}</p>${memoryHook(w)?`<p class="hook-line">${esc(memoryHook(w))}</p>`:''}<p>${esc(state.customMnemonics[w.word]||w.mnemonic_bn)}</p><p class="tone-explain">${esc(toneCopy(w))}</p>${!r.feedback?`<small>${q.retry<2?'Ektu pore ei word abar onno dhoroner question-e ashbe.':'Ei word next round-er weak-word queue-te roilo.'}</small>`:''}</div>`:''}
    <div class="round-controls">${button('← Review round words','review-round','text-button')}<span>${r.results.filter(x=>!x.retry&&x.correct).length} recalled on first try</span>${r.submitted?button(r.index===r.queue.length-1?'See round result →':'Next question →','round-question-next'):button('Check answer','round-submit','btn',!r.answer.trim()?'disabled':'')}</div></section>`;
}
function submitRoundAnswer(){
  const r=activeRound(),q=r?.queue[r.index];if(!q||r.submitted||!r.answer.trim())return;
  const w=byWord[q.word],correct=r.answer.trim().toLowerCase()===w.word;
  if(!SprintLearning.answer(r,correct))return;
  const weak=state.learning.weak[w.word]||={misses:0,streak:0,lastDay:state.currentDay};
  if(!correct){weak.misses++;weak.streak=0;if(!state.mistakeBank.includes(w.word))state.mistakeBank.push(w.word);C.rate(state,w.word,1,'round',state.currentDay);}
  else{
    weak.streak++;if(r.results.filter(x=>x.word===w.word&&x.correct).length===1)C.rate(state,w.word,3,'round',state.currentDay);
    if(weak.streak>=2)state.mistakeBank=state.mistakeBank.filter(name=>name!==w.word);
    const group=r.groups.find(g=>g.includes(w.word));if(state.minimizationMode&&group&&group[0]!==w.word)state.boxData[w.word].learnedWith=group[0];
  }
  weak.lastDay=state.currentDay;const st=dayStats();st.answered++;if(correct)st.correct++;
  prepareRoundOptions(r);save();render();
}
function nextRoundQuestion(){
  const r=activeRound();if(!r?.submitted)return;
  r.index++;r.answer='';r.submitted=false;
  if(r.index>=r.queue.length)r.phase='done';save();render();window.scrollTo({top:0,behavior:'instant'});
}
function roundSummary(r){
  const first=r.results.filter(x=>!x.retry),repairs=r.results.filter(x=>x.retry&&x.correct),remaining=remainingDaily();
  return heading('One round, carried forward.',`Day ${state.currentDay} · Round ${r.id} complete.`)+`<section class="round-result"><span class="eyebrow">SMALL SESSION. REAL PROGRESS.</span><h2>${first.filter(x=>x.correct).length}<span> / ${first.length}</span></h2><p>recalled on the first try</p><div class="result-facts"><span><b>${r.words.length}</b> words explored</span><span><b>${repairs.length}</b> successful repair answers</span><span><b>${r.missed.length}</b> words to revisit</span></div>${r.missed.length?`<p class="muted">Next round-e age bhul howa word-gulo theke 3 ta abar ashbe. Baki-gulo weak-word queue-te thakbe.</p><div class="twin-tags">${r.missed.map(w=>`<span class="tag">${w}</span>`).join('')}</div>`:'<p class="muted">Bhalo recall. Porer round-e notun connection toiri kor.</p>'}<div class="flex wrap mt">${remaining.length?button('Next 10 words →','study-daily'):button('Back to today','open-today')}${button('Review round words','review-round','btn secondary')}${button('Take a break','open-today','btn secondary')}${r.missed.length?button('Revisit missed words','study-mistakes','btn secondary'):''}</div></section>`;
}
function studySeconds(){return state.learning.seconds[C.localDate()]||0;}
function durationText(seconds){const n=Math.floor(seconds);return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
function isStudying(){
  if(state.learning.paused||window.VocabNativeForeground===false||document.visibilityState!=='visible'||Date.now()-lastInteraction>120000)return false;
  if(view==='round')return !!activeRound();
  if(view==='round-quiz')return !!activeRound()&&activeRound().phase!=='done';
  if(view==='cards')return !!session()&&session().index<session().words.length;
  if(view==='quiz')return !!state.quiz&&state.quiz.index<state.quiz.items.length;
  return view==='matcher'&&matcher&&matcher.matched.length<matcher.pairs.length||view==='blitz'&&blitz?.running;
}
function studyClock(){return `<div class="study-clock"><span class="clock-dot ${state.learning.paused?'paused':''}"></span><span data-study-time>${durationText(studySeconds())}</span>${button(state.learning.paused?'Resume':'Pause','study-clock-toggle','text-button')}</div>`;}
function learningTick(){
  const now=Date.now(),delta=Math.min(2,Math.max(0,(now-lastStudyTick)/1000));lastStudyTick=now;
  if(isStudying())state.learning.seconds[C.localDate()]=(state.learning.seconds[C.localDate()]||0)+delta;
  document.querySelectorAll('[data-study-time]').forEach(el=>el.textContent=durationText(studySeconds()));
  if(view==='today'&&!weakPaused&&document.visibilityState==='visible'&&now-weakRotationAt>=10000){weakCursor++;weakRotationAt=now;if($('weak-recall'))$('weak-recall').innerHTML=weakRecallCard();}
}
function weakRecallCard(){
  const pool=recallWords(),word=pool[weakCursor%pool.length];
  if(!word)return `<div class="eyebrow">YOUR PERSONAL RECALL QUEUE</div><h3>No weak words yet.</h3><p>Quiz-e je word prothom cheshtay atke jabe, tar mnemonic ekhane fire ashbe.</p>${button('Start a learning round','study-daily','btn secondary')}`;
  const w=byWord[word];return `<div class="flex between"><span class="eyebrow">NEEDS ANOTHER LOOK</span><span class="small muted">${weakCursor%pool.length+1} / ${pool.length}</span></div><h3>${w.word}</h3>${toneBadge(w)}<p>${esc(state.customMnemonics[w.word]||w.mnemonic_bn)}</p><details><summary>Recall the meaning, then check</summary><p>${esc(w.gregmat_meaning)}</p></details><div class="flex wrap mt">${button('Practice this word','weak-practice','btn secondary',`data-word="${w.word}"`)}${button('Next','weak-next','text-button')}${button(weakPaused?'Play':'Pause','weak-pause','text-button')}</div>`;
}
function todayView(){
  const p=plan(),history=roundHistory(),r=activeRound(),completed=history.filter(x=>x.phase==='done').length,progress=dailyProgress(),remaining=remainingDaily().length;
  const first=history.flatMap(x=>x.results).filter(x=>!x.retry),correct=first.filter(x=>x.correct).length,done=tasks();
  const percentage=seen()/words.length*100;
  return heading('Ten words. Then make them stick.',`Day ${p.day} · ${p.kind==='learn'?`Groups ${p.groups.join(' + ')}`:'Consolidation'} · Learn → recall → repair`,daySelect())+
    `<div class="overview-grid"><section class="round-hero"><div><span class="eyebrow">YOUR NEXT SMALL STEP</span><h2>${r&&r.phase!=='done'?`Continue round ${r.id}.`:'Build your next connection.'}</h2><p>${r&&r.phase==='quiz'?'Your quiz is saved exactly where you left it.':`Up to 10 new words. A few connected ideas. A quiz that brings mistakes back.`}</p><div class="flex wrap mt">${button(r&&r.phase==='quiz'?'Resume quiz →':r&&r.phase==='learn'?'Continue learning →':remaining?'Start next round →':'Review today’s words',remaining||r&&r.phase!=='done'?'study-daily':'review-day')}${button('Practice hub','open-drills','btn secondary')}</div></div><div class="hero-ten"><strong>10</strong><span>words at a time</span><div class="mini-dots">${Array.from({length:10},(_,i)=>`<i class="${i<3?'lit':''}"></i>`).join('')}</div></div></section><section class="panel progress-panel"><span class="eyebrow">YOUR VOCABULARY</span><div class="progress-number">${seen()}<span> / ${words.length}</span></div><p>words explored</p><div class="bar"><span style="width:${percentage}%"></span></div><div class="flex between small mt"><span>${percentage>0&&percentage<1?percentage.toFixed(1):Math.round(percentage)}% explored</span><span>${streak()} day streak</span></div><div class="progress-divider"></div><strong>${correct} / ${first.length}</strong><span class="muted small"> first-try answers today</span></section></div>
    <div class="session-stats"><div><span>Today’s coverage</span><b>${progress}<small> / ${p.words.length}</small></b></div><div><span>Rounds completed</span><b>${completed}</b></div><div><span>Words to revisit</span><b>${recallWords().length}</b></div><div><span>Active study today</span><b data-study-time>${durationText(studySeconds())}</b></div></div>
    <div class="dashboard-lower"><section class="panel"><div class="panel-heading"><h2>Your learning path</h2><span class="pill">${remaining} source words left</span></div><div class="round-timeline">${history.length?history.map(x=>`<div class="timeline-row"><span class="timeline-number ${x.phase==='done'?'complete':''}">${x.phase==='done'?'✓':x.id}</span><div><h3>Round ${x.id} <small>· ${x.words.length} words</small></h3><p>${x.words.slice(0,4).join(' · ')}${x.words.length>4?' …':''}</p></div><span class="pill">${x.phase==='done'?'Complete':x.phase==='quiz'?'Recall':'Learning'}</span></div>`).join(''):'<div class="path-empty"><span>01</span><div><h3>Your first ten</h3><p>Connected words, individual mnemonics, then meaning recall in both directions.</p></div></div>'}</div><div class="routine-compact"><div>${button(`Due review · ${due().length}`,'study-due','btn secondary')}${button('Bedtime recall','bedtime','btn secondary')}</div><label><input type="checkbox" id="reflection" ${done[3]?'checked':''}> I finished my bedtime recall</label>${button('Complete day','complete-day','btn',done.every(Boolean)?'':'disabled')}</div></section><div class="dashboard-aside"><section class="panel memory-preview" id="weak-recall">${weakRecallCard()}</section><section class="panel auto-time"><span class="eyebrow">TIME THAT MEANS SOMETHING</span><h3 data-study-time>${durationText(studySeconds())}</h3><p>Learning ba practice khulle count shuru. Tab lukiye gele, pause korle, ba 2 minute kono interaction na hole count theme jay.</p></section></div></div>`;
}
function addWeak(word){const w=state.learning.weak[word]||={misses:0,streak:0,lastDay:state.currentDay};w.misses++;w.streak=0;w.lastDay=state.currentDay;}
function weakPractice(word){
  const w=byWord[word];modal(`Quick recall · ${word}`,`<p class="quiz-stem">Which meaning belongs to “${word}”?</p><div class="quiz-options">${makeRecall(w,D.vocab).optionWords.map(n=>button(esc(byWord[n].gregmat_meaning),'weak-answer','quiz-option',`data-word="${word}" data-answer="${n}"`)).join('')}</div><div id="weak-feedback" role="status"></div>`);
}
function answerWeak(b){
  const word=b.dataset.word,w=byWord[word],correct=b.dataset.answer===word;
  $('modal-body').querySelectorAll('[data-action="weak-answer"]').forEach(el=>el.disabled=true);
  if(!correct){addWeak(word);if(!state.mistakeBank.includes(word))state.mistakeBank.push(word);}else{const weak=state.learning.weak[word];if(weak&&++weak.streak>=2)state.mistakeBank=state.mistakeBank.filter(x=>x!==word);}
  C.recordActivity(state);save();$('weak-feedback').innerHTML=`<div class="round-feedback ${correct?'success':'repair'}"><h3>${correct?'✓ Recalled.':'Read the hook, then try again later.'}</h3><p>${esc(w.gregmat_meaning)}</p><p>${esc(w.mnemonic_bn)}</p></div>`;
}
const usedConnectionSets=new Set();
function startMatcher(){
  const ready=new Set([...plan().words,...words.filter(w=>state.boxData[w]?.seen)]);
  const available=Object.values(synonymSets).filter(s=>s.kind==='synonym'&&s.words.some(w=>ready.has(w)));
  let candidates=available.filter(s=>!usedConnectionSets.has(s.id));
  if(candidates.length<4){usedConnectionSets.clear();candidates=available;}
  const chosen=[],used=new Set();
  for(const set of C.shuffle(candidates)){
    const pair=set.words.slice(0,2);
    if(pair.some(w=>used.has(w)||byWord[w].synonyms.some(s=>used.has(s))))continue;
    chosen.push({id:set.id,answers:pair,sense:set.sense,note:set.note});pair.forEach(w=>used.add(w));usedConnectionSets.add(set.id);
    if(chosen.length===4)break;
  }
  if(!chosen.length){toast('Learn a few more connections first.');return;}
  matcher={pairs:chosen,tiles:C.shuffle(chosen.flatMap(p=>p.answers.map(word=>({word,pair:p.id})))),selected:[],matched:[],checked:false,feedback:''};
  state.learning.paused=false;navigate('matcher');
}
function matcherView(){
  if(!matcher)return drillsView();
  return heading('Two words. One connection.','Find the near-synonym pairs. Each match explains the shared sense and its limits.',button('Fresh set','start-matcher','btn secondary'))+
    `<section class="retrieval-card"><div class="round-meter"><span>${matcher.matched.length} / ${matcher.pairs.length} pairs connected</span>${studyClock()}</div><div class="quiz-options">${matcher.tiles.map(t=>button(`${t.word}${matcher.matched.includes(t.pair)?' ✓':''}`,'match-tile',`quiz-option ${matcher.selected.includes(t.word)?'selected':''} ${matcher.matched.includes(t.pair)?'correct':''}`,`data-word="${t.word}" ${matcher.matched.includes(t.pair)||matcher.checked?'disabled':''}`)).join('')}</div><div class="mt" aria-live="polite">${matcher.feedback}</div>${matcher.checked?button('Continue','matcher-continue','btn mt'):''}${matcher.matched.length===matcher.pairs.length?`<div class="mt">${button('Another fresh set','start-matcher')}</div>`:''}<p class="source-note">Connections start with today’s vocabulary. A partner can preview a later group; matching alone does not mark it learned.</p></section>`;
}
function matchTile(word){
  if(!matcher||matcher.checked||matcher.selected.includes(word)||matcher.matched.includes(matcher.tiles.find(t=>t.word===word)?.pair))return;
  matcher.selected.push(word);
  if(matcher.selected.length===2){
    const [a,b]=matcher.selected.map(w=>matcher.tiles.find(t=>t.word===w));matcher.checked=true;
    if(a.pair===b.pair){
      matcher.matched.push(a.pair);const p=matcher.pairs.find(s=>s.id===a.pair);
      matcher.feedback=`<div class="round-feedback"><h3>✓ ${esc(p.sense)}</h3><p>${esc(p.note)}</p>${p.answers.map(name=>{const w=byWord[name];return `<p><strong>${w.word}</strong> — ${esc(w.gregmat_meaning)}</p><p>${esc(w.mnemonic_bn)}</p><p class="small muted">${esc(w.sentence)}</p>`;}).join('')}</div>`;
      C.recordActivity(state);save();
    }else{
      [a.word,b.word].forEach(addWeak);save();matcher.feedback=`<div class="round-feedback repair"><h3>Compare the meanings.</h3>${[a,b].map(t=>`<p><b>${t.word}</b> — ${esc(byWord[t.word].gregmat_meaning)}</p><p>${esc(byWord[t.word].mnemonic_bn)}</p>`).join('')}</div>`;
    }
  }
  render();
}
