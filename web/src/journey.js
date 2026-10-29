/* Guided UI: extends the existing shell and keeps optional tools available. */
const J=SprintJourney;
const journey=()=>state.journey||(state.journey=J.fresh());
const currentGuided=()=>view==='journey-review'?journey().supplemental:J.active(journey());
const stateLabels={unintroduced:'Not introduced',introduced:'Introduced',awaiting:'Awaiting delayed recall',learned:'Learned',revision:'Needs revision'};
const stageLabels={revision:'Revision',learn:'Learn 15',meaning:'Meaning quiz','meaning-result':'Round results',context:'Original TC/SE','context-review':'Mistake review',summary:'Session summary',done:'Complete'};
const trustedOriginals=Object.fromEntries((D.originalDrills||[]).map(q=>[q.id,q]));
let guidedNotice='';
const savedViews={today:todayView,trail:trailView,render,navigate,startStudy,isStudying,learningTick,currentStudyNames,weakRecallCard,rateCurrentCard,exploreNext,submitRoundAnswer};
function guidedSave(){C.recordActivity(state);save();render();}
function guidedCounts(){return J.counts(journey(),words);}
function statusBadge(word){const status=J.status(journey(),word);return `<span class="word-state state-${status}">${stateLabels[status]}</span>`;}
function additionalRecallPool(){return J.revision(journey()).filter(word=>!journey().evidence[word].successDates.includes(J.today()));}
function startAdditionalRecall(){
  const j=journey();
  if(!j.supplemental||j.supplemental.stage==='done'){
    const pool=additionalRecallPool().slice(0,15);if(!pool.length){toast('No additional dated recall is due. Come back on the next review date.');return;}
    j.supplemental={id:'R'+(++j.serial),number:0,supplemental:true,stage:'revision',words:[],groups:[],page:0,cursor:0,revision:J.assessment(pool,true),meaning:null,context:null,reviewDone:false,seconds:0};
  }
  state.learning.paused=false;lastInteraction=Date.now();save();navigate('journey-review');
}
function stageHeader(s){return `<header class="guided-header"><div><span class="eyebrow">LESSON ${journey().day} · SESSION ${s.number}${s.extra?' · EXTRA ROUND':''}</span><h1>${stageLabels[s.stage]}</h1></div><div class="guided-header-actions"><span class="small muted">Session <b data-session-time>${durationText(s.seconds||0)}</b></span>${button('Save & exit','open-today','btn secondary')}</div></header><nav class="guided-steps" aria-label="Session stages">${['revision','learn','meaning','context','context-review'].map(k=>`<span ${s.stage===k?'aria-current="step" class="current"':''}>${stageLabels[k]}</span>`).join('')}</nav>`;}
function refreshOriginalSet(s,reason){
  const old=s.context;
  if(!old)return;
  s.contextArchive=[...(s.contextArchive||[]),JSON.parse(JSON.stringify(old))].slice(-10);
  s.context=null;
  const c=J.chooseContext(journey(),D,s),kept=old.ids.filter(id=>trustedOriginals[id]);
  c.ids=[...new Set([...kept,...c.ids])].slice(0,10);
  c.answers=c.ids.map(id=>{const i=old.ids.indexOf(id);return i<0?null:old.answers[i]||null;});
  c.diagnoses=Object.fromEntries(c.ids.map((id,i)=>[i,old.diagnoses[old.ids.indexOf(id)]]).filter(([i,cause])=>cause));
  c.applied=old.applied.filter(key=>c.ids.some(id=>key===`${s.id}:${id}`));
  c.shortfall=10-c.ids.length;c.index=Math.max(0,c.ids.indexOf(old.ids[old.index]));
  s.stage='context';s.reviewDone=false;s.sourceNotice=reason+' Your earlier set and responses are preserved in the progress backup; valid drafts were carried forward. Submit this updated set when ready.';
}
function guidedContinue(){
  const j=journey(),legacy=activeRound();
  if(!j.days[j.day]&&legacy&&legacy.phase!=='done'){navigate(legacy.phase==='quiz'?'round-quiz':'round');return;}
  let s=J.begin(j,D);
  if(!s){
    const d=j.days[j.day],pending=d?.sessions.find(x=>x.context?.shortfall);
    if(pending){s=pending;refreshOriginalSet(s,'Original-question coverage was incomplete. The verified bank was checked again.');}
    else{navigate('today');return;}
  }
  state.learning.paused=false;lastInteraction=Date.now();resetStudyReveal();save();navigate('journey');
}
function guidedStats(){const c=guidedCounts();return `<div class="guided-counts">${['introduced','awaiting','learned','revision'].map(k=>`<div><span>${stateLabels[k]}</span><strong>${c[k]}</strong></div>`).join('')}</div>`;}
function guidedToday(){
  const j=journey(),d=j.days[j.day],s=J.active(j),legacy=activeRound(),remaining=J.selectWords(j,D).words.length;
  const done=d?.sessions.filter(x=>x.stage==='done').length||0,activeText=s?`Session ${s.number} · ${stageLabels[s.stage]}`:!d&&legacy&&legacy.phase!=='done'?'Resume your preserved earlier round':d?.complete?'Today’s planned work is complete':d?'Original practice is still pending':'Start session 1';
  const c=guidedCounts(),coverage=words.length-c.unintroduced;
  return heading('Your next small step.',`Lesson ${j.day} · Three sessions, at your pace. Learning quality comes first.`)+
    `<div class="overview-grid"><section class="round-hero"><div><span class="eyebrow">GUIDED LEARNING · ${C.localDate()}</span><h2>${esc(activeText)}</h2><p>Revision → 15 connected words → meaning recall → original TC/SE → mistake review.</p><div class="flex wrap mt">${d?.complete?button(remaining?'Start next lesson':'Continue revision',remaining?'guided-next-day':'guided-start-revision'):button('Continue →','guided-continue')}</div></div>${mountain()}</section><section class="panel progress-panel"><span class="eyebrow">ASSESSED RECALL</span><div class="progress-number">${c.learned}<span> / ${words.length}</span></div><p>learned across different dates</p><div class="bar"><span style="width:${c.learned/words.length*100}%"></span></div><p>${coverage} introduced · ${words.length-coverage} not introduced</p></section></div>`+
    guidedStats()+`<div class="dashboard-lower"><section class="panel"><div class="panel-heading"><h2>Today’s sessions</h2><span class="pill">${done} / ${d?.sessions.length||3} finished</span></div>${(d?.sessions||[1,2,3].map(number=>({number,stage:'revision'}))).map(x=>`<div class="timeline-row"><span class="timeline-number ${x.stage==='done'?'complete':''}">${x.stage==='done'?'✓':x.number}</span><div><h3>${x.number===1?'Morning spelling':x.extra?'Optional extra round':'Session '+x.number}</h3><p>${x.stage==='done'?'Tasks attempted and mistake review finished':stageLabels[x.stage]}${x.context?.shortfall?` · ${x.context.shortfall} original questions still unavailable`:''}</p></div></div>`).join('')}<p class="source-note">Daily tasks and learned-word mastery are separate. A completed lesson does not mean every word is learned.</p>${done>=3&&d?.sessions.length===3&&!d.extraDeclined&&remaining?`<div class="extra-offer"><h3>Room for 15 more?</h3><p>Only add a round if recall feels comfortable. Your required revision stays in place.</p>${button('Accept extra round','guided-extra','btn secondary')} ${button('Not now','guided-no-extra','text-button')}</div>`:''}</section><aside class="dashboard-aside"><section class="panel memory-preview" id="weak-recall">${weakRecallCard()}</section><section class="panel"><h2>Your preparation dates</h2><p class="mt"><b>November 13</b><br>First-pass learning target</p><p class="mt"><b>November 15, 2026</b><br>All 959 words meet the recall criterion</p><p class="source-note">GRE exam date undecided. Dates never grant automatic learning credit.</p></section><section class="panel"><h2>Outside the guided session</h2><div class="flex wrap mt">${button(j.supplemental&&j.supplemental.stage!=='done'?'Resume extra revision':`Assessed revision · ${additionalRecallPool().length} due`,'guided-additional-recall','btn secondary')}${button('Word library','guided-library','btn secondary')}${button('Preview vocabulary','open-trail','btn secondary')}${button('Optional practice','open-drills','btn secondary')}${button('Settings & backup','open-settings','text-button')}</div></section></aside></div>`;
}
function prepareGuidedOptions(q){
  if(q.kind==='typed')return;
  if(q.options?.length===4&&q.options.includes(q.word))return;
  const target=byWord[q.word],excluded=new Set([q.word,...target.synonyms,...target.twins,...target.related,...target.family_ids.flatMap(id=>families[id]?.words||[])]);
  q.options=C.shuffle([q.word,...C.shuffle(D.vocab.filter(w=>!excluded.has(w.word)&&w.gregmat_meaning!==target.gregmat_meaning)).slice(0,3).map(w=>w.word)]);
}
function clue(word){return `${word[0]}${' _'.repeat(Math.max(0,word.length-1))} · ${word.length} characters`;}
function guidedAssessment(s,which){
  const a=s[which],q=a?.queue[a.index];if(!q)return `<section class="panel"><p>No eligible old words are due. Continue with the next block.</p>${button('Continue','guided-continue')}</section>`;
  prepareGuidedOptions(q);const w=byWord[q.word],typed=q.kind==='typed';
  const initial=a.results.filter(r=>!r.retry&&!r.old),old=a.results.filter(r=>r.old&&!r.retry),repair=a.results.filter(r=>r.retry);
  return `<div class="round-meter"><span>${which==='revision'?(s.number===1?'Morning spelling':'Session revision'):`New ${initial.length} / ${s.words.length} · Old ${old.length} / ${a.queue.filter(x=>x.old&&!x.retry).length} · Repairs ${repair.length}`}</span><span>Question ${a.index+1} / ${a.queue.length}${q.retry?' · Repair '+q.retry+'/2':q.old?' · Earlier word':''}</span></div><section class="retrieval-card"><span class="eyebrow">${typed?'DEFINITION → EXACT WORD':'WORD → MEANING'}</span><p class="quiz-stem">${typed?esc(w.gregmat_meaning):`Which meaning belongs to “${esc(w.word)}”?`}</p>${typed?`<label class="fill-label" for="guided-answer">Type the exact word <span>${esc(clue(w.word))}</span></label><input class="fill-input" id="guided-answer" value="${esc(a.answer)}" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="done" ${a.submitted?'disabled':''}>`:`<div class="quiz-options">${q.options.map((name,i)=>button(`<span class="letter">${i+1}</span><span>${esc(byWord[name].gregmat_meaning)}</span>`,'guided-option',`quiz-option ${a.answer===name?'selected':''} ${a.submitted&&name===q.word?'correct':''}`,`data-word="${name}" aria-pressed="${a.answer===name}" ${a.submitted?'disabled':''}`)).join('')}</div>`}${a.submitted?`<div class="round-feedback ${a.correct?'':'repair'}" role="status"><h3>${a.correct?'Correct recall':a.couldnt?'Couldn’t remember · incorrect attempt':'Incorrect · revisit this meaning'}</h3><p><b>${w.word}</b> — ${esc(w.gregmat_meaning)}</p><p>${esc(w.mnemonic_bn)}</p><p>${esc(toneCopy(w))}</p>${statusBadge(w.word)}<p class="source-note">${a.correct?'A same-day success cannot count as another calendar date.':'No learning credit. '+(which==='meaning'&&q.retry<2?'A changed-format repair will return shortly.':'This word remains in your revision queue.')}</p></div>`:''}<div class="round-controls">${which==='meaning'?button('Review round words','guided-review-words','text-button'):''}${a.submitted?button('Next →','guided-answer-next'):button('Check answer','guided-check','btn',a.answer.trim()?'':'disabled')}${!a.submitted?button('I cannot remember','guided-couldnt','btn secondary'):''}</div></section>`;
}
function guidedCards(s){
  const names=s.groups[s.cursor]||[];const pack=packFor(names),browsing=s.stage!=='learn';
  return `<div class="round-meter"><span>${s.page>=s.groups.length?s.words.length:s.groups.slice(0,s.page).flat().length} / ${s.words.length} introduced in this round</span><span>${names.map(w=>esc(w)).join(' · ')}</span></div>`+conceptMap(names,{label:pack?.sense||'Meaning → memory → recall',note:pack?.note||'',progress:'Each connected word counts within the round. Browse freely; exposure does not mean learned.'})+`<div class="study-navigation">${button('← Back','guided-word-back','btn secondary',s.cursor===0?'disabled':'')}${button(names.every(w=>revealedStudyWords.has(w))?'Hide details · Space':'Reveal details · Space','reveal-study','btn secondary')}${button(browsing?'Next →':s.cursor>=s.groups.length-1?'Start meaning quiz →':'Next →','guided-word-next')}${browsing?button('Resume meaning quiz','guided-resume-quiz'):''}</div>`;
}
function guidedMeaningResult(s){const a=s.meaning,initial=a.results.filter(r=>!r.retry&&!r.old),repairs=a.results.filter(r=>r.retry&&r.correct);return `<section class="round-result"><span class="eyebrow">INITIAL RECALL AND REPAIRS ARE SEPARATE</span><h2>${initial.filter(r=>r.correct).length}<span> / ${s.words.length}</span></h2><p>new words recalled on the first attempt</p><div class="result-facts"><span><b>${repairs.length}</b> successful repairs</span><span><b>${s.words.filter(w=>J.status(journey(),w)==='revision').length}</b> need revision</span></div><p>Correct today is different from learned across two dates. There is no accuracy gate.</p><div class="flex wrap mt">${button(s.extra?'Continue to summary':'Continue to original TC/SE','guided-to-context')}${button('Review round words','guided-review-words','btn secondary')}</div></section>`;}
function contextAnswerReady(q,a){return !!a&&(a.couldnt||q.answers.every((group,i)=>(a.selected[i]||[]).length===group.length));}
function originalReference(q){return `${q.source.book} · PDF page ${q.source.page} · ${q.source.question}`;}
function guidedContext(s){
  const c=J.chooseContext(journey(),D,s),q=trustedOriginals[c.ids[c.index]];
  if(!q)return `<section class="retrieval-card"><h2>No eligible verified original questions yet</h2><p class="mt">The available originals do not yet cover your introduced words. The existing adaptations are kept in optional practice and are not presented as original questions.</p><p class="source-note">This TC/SE block remains pending; it will not count as completed.</p><div class="flex wrap mt">${button('Continue with TC/SE pending','guided-context-pending','btn secondary')}${button('Save & exit','open-today')}</div></section>`;
  const a=c.answers[c.index]||{selected:q.answers.map(()=>[]),couldnt:false,declaredFailure:false};
  return `<div class="round-meter"><span>${q.kind} · Question ${c.index+1} / ${c.ids.length}${c.shortfall?` · ${c.shortfall} still unavailable`:''}</span><span>${journey().contextHistory.includes(q.id)?'Repeat · ':''}${esc(originalReference(q))}</span></div><nav class="question-navigator" aria-label="Question navigation">${c.ids.map((id,i)=>button(String(i+1),'guided-context-jump',`question-number ${i===c.index?'current':''} ${contextAnswerReady(trustedOriginals[id],c.answers[i])?'answered':''}`,`data-index="${i}" aria-label="Question ${i+1}${contextAnswerReady(trustedOriginals[id],c.answers[i])?', answered':''}"`)).join('')}</nav><section class="retrieval-card"><p class="quiz-stem">${esc(q.stem)}</p>${q.option_groups.map((group,g)=>`<fieldset class="blank-group"><legend>${q.kind==='SE'?'Select two answers':q.answers.length>1?'Blank '+(g+1):'Select one answer'}</legend><div class="quiz-options">${group.map(o=>button(`<span class="letter">${o.id}</span><span>${esc(o.text)}</span>`,'guided-context-option',`quiz-option ${a.selected[g]?.includes(o.id)?'selected':''}`,`data-group="${g}" data-option="${o.id}" aria-pressed="${a.selected[g]?.includes(o.id)||false}"`)).join('')}</div></fieldset>`).join('')}${a.declaredFailure?'<p class="source-note">“I cannot answer” recorded an incorrect attempt with no learning credit. You may still inspect or edit your response.</p>':''}<div class="round-controls">${button('← Back','guided-context-back','btn secondary',c.index===0?'disabled':'')}${button('I cannot answer','guided-context-couldnt','btn secondary')}${c.index===c.ids.length-1?button('Review & submit set','guided-context-confirm'):button('Save answer & next →','guided-context-next')}</div><p class="source-note">Answers remain editable until final submission. No correctness feedback is shown during the set.</p></section>`;
}
  function originalReasoning(q){
    const r=q.reasoning_bn;
    const added=r?`<dl class="question-reasoning"><dt>Key clue</dt><dd>${esc(r.clue)}</dd><dt>Answer logic</dt><dd>${esc(r.logic)}</dd><dt>Why the other options fail</dt><dd>${esc(r.distractors)}</dd></dl>`:`<p>${esc(q.commentary_bn)}</p>`;
    return `<h4>Added Banglish reasoning</h4>${added}<details class="source-explanation"><summary>Original English explanation</summary><p>${esc(q.original_explanation||'No original explanation is included in this verified record.')}</p></details><p class="source-note">Banglish analysis is added study commentary. Original wording, options and answer key are preserved.</p>`;
  }
  function guidedContextReview(s){
  const c=s.context,q=trustedOriginals[c.ids[c.reviewIndex]];if(!q){s.stage='summary';return guidedSummary(s);}
  const a=c.answers[c.reviewIndex],correct=J.contextCorrect(q,a),applied=c.applied.includes(`${s.id}:${q.id}`),cause=c.diagnoses[c.reviewIndex];
  const score=c.ids.filter((id,i)=>J.contextCorrect(trustedOriginals[id],c.answers[i])).length;
  return `<div class="round-meter"><span>Set submitted · ${score} / ${c.ids.length} correct</span><span>Review ${c.reviewIndex+1} / ${c.ids.length}</span></div><section class="retrieval-card"><p class="source-note">${esc(originalReference(q))}</p><p class="quiz-stem">${esc(q.stem)}</p><div class="answer-comparison"><div><b>Your response</b><p>${esc(a?.couldnt?'I cannot answer':q.option_groups.map((g,i)=>g.filter(o=>a?.selected[i]?.includes(o.id)).map(o=>o.text).join(' + ')).join(' / '))}</p></div><div><b>Original answer</b><p>${esc(q.option_groups.map((g,i)=>g.filter(o=>q.answers[i].includes(o.id)).map(o=>o.text).join(' + ')).join(' / '))}</p></div></div><div class="round-feedback ${correct?'':'repair'}"><h3>${correct?'Correct':'Incorrect attempt · diagnose the cause'}</h3>${originalReasoning(q)}</div>${!correct?`<fieldset class="diagnosis"><legend>What caused this mistake?</legend>${[['meaning','Meaning gap'],['logic','Sentence logic'],['both','Both']].map(([value,label])=>button(label,'guided-diagnosis',`btn ${cause===value?'':'secondary'}`,`data-cause="${value}" ${applied?'disabled':''} aria-pressed="${cause===value}"`)).join(' ')}<p class="source-note">Sentence logic alone never lowers vocabulary mastery. Both routes apply only when you explicitly choose Both.</p>${applied?'<p role="status">Recovery saved for your selected cause.</p>':button('Save diagnosis','guided-diagnosis-save','btn mt',cause?'':'disabled')}</fieldset>`:''}<div class="round-controls">${button('← Previous','guided-review-back','btn secondary',c.reviewIndex===0?'disabled':'')}${button(c.reviewIndex===c.ids.length-1?'Finish mistake review':'Next review →','guided-review-next','btn',!correct&&!applied?'disabled':'')}</div></section>`;
}
function guidedSummary(s){const pending=s.context?.shortfall||0;return `<section class="round-result"><span class="eyebrow">SESSION ${s.number}${s.extra?' · EXTRA ROUND':''}</span><h2>A step forward.</h2><div class="summary-list">${[['Revision',s.revision?.done||s.extra],['New learning',s.page>=s.groups.length],['Meaning quiz',s.meaning?.done||!s.words.length],['Original TC/SE',!pending],['Mistake review',s.reviewDone]].map(([label,done])=>`<p><span>${done?'✓':'○'}</span> ${label}${label==='Original TC/SE'&&pending?` · ${pending} questions pending source coverage`:''}</p>`).join('')}</div><p>Session time: ${durationText(s.seconds||0)} · Today: ${durationText(studySeconds())}</p><p class="source-note">${pending?'This session can be saved, but the day cannot be reported complete while original practice is missing.':'Daily task completion and learned-word mastery remain separate.'}</p>${button('Save & take a break','guided-finish-session')}${guidedNotice?`<p role="status">${esc(guidedNotice)}</p>`:''}</section>`;}
function guidedView(){
  const s=currentGuided();if(!s)return guidedToday();
  if(s.context?.ids.some(id=>!trustedOriginals[id])){refreshOriginalSet(s,'A source question was withdrawn from the verified bank.');save();}
  if(s.supplemental){const header=`<header class="guided-header"><div><span class="eyebrow">OPTIONAL ASSESSED REVISION · NO NEW WORDS</span><h1>Make the recall last.</h1></div>${button('Save & exit','open-today','btn secondary')}</header>`;return header+(s.stage==='summary'?`<section class="round-result"><h2>Revision saved.</h2><p>${s.revision.results.filter(r=>r.correct).length} / ${s.revision.results.length} correct.</p><p>Only actual different-date recall can advance learned status. Your guided-session tasks were not changed.</p>${button('Back to Today','guided-finish-session')}</section>`:guidedAssessment(s,'revision'));}
  let content='';
  if(s.browsing)content=guidedCards(s);
  else if(s.stage==='revision')content=guidedAssessment(s,'revision');
  else if(s.stage==='learn')content=guidedCards(s);
  else if(s.stage==='meaning')content=guidedAssessment(s,'meaning');
  else if(s.stage==='meaning-result')content=guidedMeaningResult(s);
  else if(s.stage==='context')content=guidedContext(s);
  else if(s.stage==='context-review')content=guidedContextReview(s);
  else content=guidedSummary(s);
  const emptyRevision=s.stage==='learn'&&!s.extra&&s.revision?.done&&!s.revision.queue.length?'<p class="empty-revision-note" role="status">No eligible old words are due yet. Your revision block is empty, so we continued to new learning.</p>':'';
  return stageHeader(s)+(s.sourceNotice?`<p class="empty-revision-note" role="status">${esc(s.sourceNotice)}</p>`:'')+emptyRevision+content;
}
function guidedTrail(){
  const j=journey(),c=guidedCounts();return heading('Your vocabulary mountain.','Coverage is the path. Delayed recall is what stays.')+guidedStats()+`<section class="panel mountain-overview">${mountain()}<div><span class="eyebrow">${c.learned} / ${words.length} LEARNED</span><h2>October 25 → November 15</h2><p>First-pass target: November 13. Exam date: undecided.</p><p class="source-note">A learned word needs correct recall on two different dates, including typed success. Later meaning/spelling failure starts recovery again.</p></div></section><div class="day-grid mt">${Array.from({length:22},(_,i)=>{const d=j.days[i+1];return `<button class="day-card ${i+1===j.day?'active':''} ${d?.complete?'complete':''}" data-action="guided-preview" data-day="${i+1}"><small>${J.plus(J.START,i)}</small><strong>Lesson ${i+1}</strong><span>${d?.complete?'Tasks complete':d?'In progress':'Preview only'}</span></button>`;}).join('')}</div><p class="source-note">Previewing another lesson never changes your active lesson, word evidence, or Continue destination. Extra rounds can shift future vocabulary allocations.</p>`;}
function showGuidedPreview(day){
  const j=journey(),copy=J.normalize(j,words);let d=copy.days[day];
  if(!d){for(let n=1;n<=day;n++){copy.day=n;J.ensureDay(copy,D);}d=copy.days[day];}
  modal(`Lesson ${day} · preview only`,`<p class="muted">A vocabulary preview. No learning credit or active-lesson change.</p><div class="preview-word-list">${d.sessions.flatMap(s=>s.words).map(word=>{const w=byWord[word];return `<details><summary><b>${esc(word)}</b> · G${w.groups.join('/G')}</summary><p>${esc(w.gregmat_meaning)}</p><p class="bengali" lang="bn">${esc(w.bengali)}</p><p>${esc(w.mnemonic_bn)}</p></details>`;}).join('')}</div>`);
}
Object.assign(actions,{
  'guided-continue':guidedContinue,
  'guided-library':()=>navigate('library'),
  'guided-next-day':()=>{if(journey().days[journey().day]?.complete){journey().day++;guidedSave();guidedContinue();}},
  'guided-extra':()=>{if(J.addExtra(journey(),D)){guidedNotice='Extra round accepted. Required revision stays in place.';guidedSave();guidedContinue();}},
  'guided-no-extra':()=>{journey().days[journey().day].extraDeclined=true;guidedSave();toast('No extra words added. Your regular plan is unchanged.');},
  'guided-preview':b=>showGuidedPreview(Number(b.dataset.day)),
  'guided-start-revision':()=>{const j=journey();if(!j.days[j.day]?.complete)return;j.day++;guidedSave();guidedContinue();},
  'guided-word-back':()=>{const s=currentGuided();if(s.cursor){s.cursor--;resetStudyReveal();guidedSave();}},
  'guided-word-next':()=>{const s=currentGuided();if(s.browsing)s.cursor=Math.min(s.cursor+1,s.groups.length-1);else J.readNext(journey(),s);resetStudyReveal();guidedSave();},
  'guided-review-words':()=>{const s=currentGuided();s.browsing=true;s.cursor=0;resetStudyReveal();guidedSave();},
  'guided-resume-quiz':()=>{currentGuided().browsing=false;guidedSave();},
  'guided-option':b=>{const s=currentGuided(),a=s[s.stage==='revision'?'revision':'meaning'];if(!a.submitted){a.answer=b.dataset.word;guidedSave();}},
  'guided-check':()=>{const s=currentGuided();J.answer(journey(),s,s.stage==='revision'?'revision':'meaning',J.today(),false);guidedSave();},
  'guided-couldnt':()=>{const s=currentGuided();J.answer(journey(),s,s.stage==='revision'?'revision':'meaning',J.today(),true);guidedSave();},
  'guided-answer-next':()=>{const s=currentGuided();J.nextAnswer(s,s.stage==='revision'?'revision':'meaning');if(s.supplemental&&s.revision.done){s.stage='summary';s.reviewDone=true;}guidedSave();},
  'guided-to-context':()=>{const s=currentGuided();s.browsing=false;if(s.extra){s.reviewDone=true;s.stage='summary';}else{s.stage='context';J.chooseContext(journey(),D,s);}guidedSave();},
  'guided-context-option':b=>{const s=currentGuided(),c=s.context,q=trustedOriginals[c.ids[c.index]],g=Number(b.dataset.group),id=b.dataset.option;if(!q?.option_groups[g]?.some(o=>o.id===id)||c.submitted)return;const a=c.answers[c.index]||={selected:q.answers.map(()=>[]),couldnt:false,declaredFailure:false};const selected=a.selected[g]||=[];a.selected[g]=selected.includes(id)?selected.filter(x=>x!==id):q.answers[g].length===1?[id]:[...selected,id].slice(-q.answers[g].length);a.couldnt=false;guidedSave();},
  'guided-context-couldnt':()=>{const c=currentGuided().context,q=trustedOriginals[c.ids[c.index]];const a=c.answers[c.index]||={selected:q.answers.map(()=>[])};a.couldnt=true;a.declaredFailure=true;guidedSave();},
  'guided-context-back':()=>{const c=currentGuided().context;c.index=Math.max(0,c.index-1);guidedSave();},
  'guided-context-next':()=>{const c=currentGuided().context;c.index=Math.min(c.ids.length-1,c.index+1);guidedSave();},
  'guided-context-jump':b=>{const c=currentGuided().context;c.index=Math.max(0,Math.min(c.ids.length-1,Number(b.dataset.index)));guidedSave();},
  'guided-context-confirm':()=>{const c=currentGuided().context,missing=c.ids.map((id,i)=>contextAnswerReady(trustedOriginals[id],c.answers[i])?null:i+1).filter(Boolean);if(missing.length){toast('Answer or choose I cannot answer for questions '+missing.join(', '));return;}modal('Submit this set?',`<p>${c.ids.length} answers are ready. After submission, responses are locked and explanations become available.</p><div class="modal-actions">${button('Keep reviewing','close-modal','btn secondary')}${button('Submit set','guided-context-submit')}</div>`);},
  'guided-context-submit':()=>{const s=currentGuided(),c=s.context;if(c.submitted)return;if(!c.ids.every((id,i)=>contextAnswerReady(trustedOriginals[id],c.answers[i])))return;c.submitted=true;c.reviewIndex=0;journey().contextHistory=[...new Set([...journey().contextHistory,...c.ids])];c.ids.forEach((id,i)=>{if(J.contextCorrect(trustedOriginals[id],c.answers[i])&&journey().retests[id])journey().retests[id].resolved=true;});s.stage='context-review';$('modal').close();guidedSave();},
  'guided-context-pending':()=>{const s=currentGuided();s.stage='summary';s.reviewDone=true;guidedSave();},
  'guided-diagnosis':b=>{const c=currentGuided().context;c.diagnoses[c.reviewIndex]=b.dataset.cause;guidedSave();},
  'guided-diagnosis-save':()=>{const s=currentGuided(),c=s.context;J.diagnose(journey(),s,trustedOriginals[c.ids[c.reviewIndex]],c.reviewIndex,c.diagnoses[c.reviewIndex]);guidedSave();},
  'guided-review-back':()=>{const c=currentGuided().context;c.reviewIndex=Math.max(0,c.reviewIndex-1);guidedSave();},
  'guided-review-next':()=>{const s=currentGuided(),c=s.context,q=trustedOriginals[c.ids[c.reviewIndex]];if(!J.contextCorrect(q,c.answers[c.reviewIndex])&&!c.applied.includes(`${s.id}:${q.id}`))return;if(c.reviewIndex<c.ids.length-1)c.reviewIndex++;else if(c.ids.every((id,i)=>J.contextCorrect(trustedOriginals[id],c.answers[i])||c.applied.includes(`${s.id}:${id}`))){s.stage='summary';s.reviewDone=true;}guidedSave();},
  'guided-finish-session':()=>{const s=currentGuided();if(s?.supplemental){s.stage='done';save();navigate('today');return;}if(J.finishSession(journey(),s)){guidedNotice='';save();navigate('today');}},
  'guided-additional-recall':startAdditionalRecall,
  'guided-export-original':()=>{const raw=localStorage.getItem('vocab_sprint_pre_guided_backup');if(raw)download('vocab-sprint-pre-guided-recovery.json',raw);else toast('No pre-guided migration backup exists in this browser.');}
});
todayView=guidedToday;trailView=guidedTrail;
currentStudyNames=function(){const s=currentGuided();return view==='journey'&&s&&(s.stage==='learn'||s.browsing)?s.groups[s.cursor]||[]:savedViews.currentStudyNames();};
startStudy=function(mode,word=null,restart=false){if(mode==='daily'&&!restart)guidedContinue();else savedViews.startStudy(mode,word,restart);};
isStudying=function(){if(['journey','journey-review'].includes(view))return !!currentGuided()&&!state.learning.paused&&window.VocabNativeForeground!==false&&document.visibilityState==='visible'&&Date.now()-lastInteraction<=120000;return savedViews.isStudying();};
learningTick=function(){const before=studySeconds();savedViews.learningTick();const s=currentGuided();if(['journey','journey-review'].includes(view)&&s)s.seconds=(s.seconds||0)+Math.max(0,studySeconds()-before);document.querySelectorAll('[data-session-time]').forEach(el=>el.textContent=durationText(s?.seconds||0));};
render=function(){
  const previous=document.activeElement,wasInside=$('main').contains(previous),previousAction=previous?.dataset?.action,previousWord=previous?.dataset?.word,previousOption=previous?.dataset?.option,previousGroup=previous?.dataset?.group;
  savedViews.render();
  if(['journey','journey-review'].includes(view)){
    if(wasInside){
      const controls=[...$('main').querySelectorAll('[data-action]')];
      const focus=controls.find(el=>!el.disabled&&el.dataset.action===previousAction&&(!previousWord||el.dataset.word===previousWord)&&(!previousOption||el.dataset.option===previousOption)&&(!previousGroup||el.dataset.group===previousGroup))||controls.find(el=>!el.disabled&&['guided-answer-next','guided-check','guided-word-next','guided-context-next','guided-review-next'].includes(el.dataset.action));
      if(focus)focus.focus({preventScroll:true});else $('main').focus({preventScroll:true});
    }
  }
  document.body.dataset.guided=['journey','journey-review'].includes(view)?'true':'false';
  $('header-day').textContent=`LESSON ${journey().day} · NOV 15 TARGET`;
  if(['journey','journey-review'].includes(view))document.querySelectorAll('.nav-link').forEach(el=>{const active=el.getAttribute('href')==='#cards';el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
};
wordRows=function(list,limit=48){return list.slice(0,limit).map(w=>`<article class="word-row"><div class="word-row-content"><div class="flex wrap"><h3>${esc(w.word)}</h3><span class="pill">G${w.groups.join(' / G')}</span>${statusBadge(w.word)}</div><p>${esc(w.gregmat_meaning)}</p><p lang="bn" class="bengali">${esc(w.bengali)}</p></div>${button('Study','single','task-action',`data-word="${w.word}" aria-label="Study ${w.word}"`)}</article>`).join('');};
const legacyLibrary=libraryView;
libraryView=function(){return legacyLibrary().replace('Learned · Box 2+','Learned · two dates').replace('<option value="due"','<option value="awaiting">Awaiting delayed recall</option><option value="revision">Needs revision</option><option value="due"');};
updateLibrary=function(){const query=listQuery.trim().toLowerCase(),dueSet=new Set(J.revision(journey()));const list=D.vocab.filter(w=>(listGroup==='all'||w.groups.includes(Number(listGroup)))&&matchesQuery(w,query)&&(listStatus==='all'||listStatus==='new'&&J.status(journey(),w.word)==='unintroduced'||listStatus==='learned'&&J.status(journey(),w.word)==='learned'||listStatus==='awaiting'&&J.status(journey(),w.word)==='awaiting'||['revision','mistakes'].includes(listStatus)&&J.status(journey(),w.word)==='revision'||listStatus==='due'&&dueSet.has(w.word)||listStatus==='saved'&&state.bookmarks.includes(w.word)));list.sort((a,b)=>a.word.localeCompare(b.word));$('library-results').innerHTML=`<div class="list-count" role="status">${list.length} words</div><div class="word-list">${wordRows(list,listLimit)}</div>${list.length>listLimit?button('Show more words','show-more','btn secondary mt'):''}`;};
const oldSettings=settingsView;
settingsView=function(){return oldSettings().replace('Word minimization','Earlier optional decks: word minimization').replace('Include connected words in a ten-word round. Every word has its own mnemonic and quiz check. Successfully recalled partners do not repeat as new cards in later groups; scheduled reviews remain individual.','This switch applies to earlier optional decks. Guided rounds always keep connected words inside the fifteen-word quota, with individual assessment and revision.').replace('Five boxes. Better timing.','Legacy review history').replace('Reset v5 progress in this browser. The original v4 storage is preserved.','Reset current guided progress and imported history in this browser. Earlier browser saves remain preserved.')+`<section class="panel mt"><h2>Guided-learning recovery</h2><p>Legacy boxes and history are preserved. They do not prove the new two-date typed-recall criterion.</p>${button('Export pre-guided recovery copy','guided-export-original','btn secondary mt')}<p class="source-note">Current progress saves under a new v6 browser key. The old v5 browser save is not overwritten.</p></section>`;};
actions['reset-confirm']=()=>modal('Reset current progress?',`<p class="muted">This clears the current guided save, imported earlier study history, mistakes, saved words and custom memory scenes. Earlier v4/v5 browser keys and the pre-guided recovery copy remain preserved. Export the current backup before resetting if you want to recover it.</p><div class="modal-actions">${button('Export first','export','btn secondary')}${button('Cancel','close-modal','btn secondary')}${button('Reset current progress','reset-apply','btn danger')}</div>`);
actions['reset-apply']=()=>{state=C.normalize(C.freshState(),words);storageBroken=false;corruptRaw='';$('storage-warning').hidden=true;save();$('modal').close();navigate('today');toast('Current guided progress reset. Earlier browser saves remain preserved.');};
const priorCardsView=cardsView;
cardsView=function(){return priorCardsView().replace('Ten words per round','Fifteen words per guided round').replace('Learn in tens','Guided learning').replace('The ten-word rounds','The guided rounds').replace('Learn the next ten','Continue guided learning');};
const priorDrillsView=drillsView;
drillsView=function(){return priorDrillsView().replace('Ten words, then word-to-meaning and meaning-to-word MCQs from your GregMat definitions.','Fifteen words, then mixed meaning MCQs and exact-spelling typed recall.');};
help=function(){modal('Your guided vocabulary climb.',`<div class="help-copy"><h3>One Continue action</h3><p>Resume revision, connected cards, a meaning quiz, original TC/SE, or mistake review from Today. Reading a card is exposure, not mastery.</p><h3>Fifteen words per round</h3><p>Connected partners count within the fifteen. Space or a click reveals details; arrows browse. Meaning quizzes mix MCQs and exact-spelling typed answers, with at most two repair attempts.</p><h3>Delayed recall</h3><p>Learned means correct recall on two calendar dates including typed success. A later meaning/spelling failure requires two fresh dates of recovery. Daily tasks are separate.</p><h3>Original TC/SE</h3><p>Answers are editable before set submission. Explanations appear after submission. Sentence logic alone never lowers vocabulary mastery; Both routes apply only when you explicitly choose Both.</p><h3>Your data</h3><p>Exports preserve guided progress and legacy history. A pre-guided browser recovery copy remains available in Settings. Phone/desktop transfer is manual.</p></div>`);};
actions.help=help;
const priorMistakesView=mistakesView,priorRecallWords=recallWords;
recallWords=function(){return [...new Set([...Object.keys(journey().evidence).filter(w=>J.status(journey(),w)==='revision'),...priorRecallWords()])];};
mistakesView=function(){const names=Object.keys(journey().evidence).filter(w=>J.status(journey(),w)==='revision'),retakes=Object.entries(journey().retests).filter(([id,r])=>!r.resolved);return heading('Your recovery queue.','Meaning and spelling recovery are separate from sentence-logic retests.',button('Assessed word revision','guided-additional-recall'))+`<section class="panel mb"><div class="flex wrap"><span class="pill">${names.length} words need revision</span><span class="pill">${retakes.length} original-question retests queued</span></div><p class="source-note">Logic-only errors do not lower vocabulary mastery. Due question retests are selected in the next main session.</p>${retakes.map(([id])=>`<p class="mt">${esc(trustedOriginals[id]?originalReference(trustedOriginals[id]):id)}</p>`).join('')}</section><div class="word-list">${wordRows(names.map(w=>byWord[w]),959)}</div><details class="panel mt"><summary>Earlier application mistake history</summary>${priorMistakesView()}</details>`;};
const priorWeakPractice=weakPractice,priorAnswerWeak=answerWeak;
let quickRecall=null;
weakPractice=function(word){quickRecall={word,id:'quick:'+ ++journey().serial,answered:false};priorWeakPractice(word);};
answerWeak=function(b){if(!quickRecall||quickRecall.answered||quickRecall.word!==b.dataset.word)return;quickRecall.answered=true;J.assess(journey(),b.dataset.word,b.dataset.answer===b.dataset.word,false,J.today(),quickRecall.id);priorAnswerWeak(b);};
const oldExport=exportBackup;
exportBackup=function(){download(`vocab-sprint-${C.localDate()}.json`,JSON.stringify({app:'Vocab Sprint',version:6,exportedAt:new Date().toISOString(),state},null,2));toast('Progress backup downloaded.');};
actions.export=exportBackup;
exploreNext=function(){savedViews.exploreNext();for(const [word,r] of Object.entries(state.boxData))if(r.seen)J.introduce(journey(),word,r.lastReviewed||J.today());save();};
submitRoundAnswer=function(){const r=activeRound(),q=r?.queue[r.index],wasSubmitted=r?.submitted;savedViews.submitRoundAnswer();if(q&&!wasSubmitted&&r.submitted){J.assess(journey(),q.word,r.feedback,false,J.today(),`legacy:${state.currentDay}:${r.id}:${r.index}`);save();}};
document.addEventListener('input',e=>{if(e.target.id!=='guided-answer')return;const s=currentGuided(),a=s?.[s.stage==='revision'?'revision':'meaning'];if(!a||a.submitted)return;a.answer=e.target.value.slice(0,80);save();const check=document.querySelector('[data-action="guided-check"]');if(check)check.disabled=!a.answer.trim();});
document.addEventListener('keydown',e=>{
  if(!['journey','journey-review'].includes(view)||$('modal').open||e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;
  const typing=['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.target.isContentEditable,s=currentGuided();
  if(e.key==='Enter'&&e.target.id==='guided-answer'){e.preventDefault();actions['guided-check']();return;}
  if(typing||!s)return;
  if(s.stage==='learn'||s.browsing){if(e.key===' '){e.preventDefault();revealStudy();}else if(e.key==='ArrowLeft'){e.preventDefault();actions['guided-word-back']();}else if(e.key==='ArrowRight'){e.preventDefault();actions['guided-word-next']();}}
  else if(['revision','meaning'].includes(s.stage)){const a=s[s.stage==='revision'?'revision':'meaning'],q=a.queue[a.index];if(e.key==='Enter'&&e.target.tagName!=='BUTTON'){e.preventDefault();actions[a.submitted?'guided-answer-next':'guided-check']();}else if(!a.submitted&&q.kind==='mcq'&&'1234'.includes(e.key)&&e.key.length===1){e.preventDefault();prepareGuidedOptions(q);actions['guided-option']({dataset:{word:q.options[Number(e.key)-1]}});}}
});
