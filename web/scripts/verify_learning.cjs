/* No browser or personal storage: exercise the compiled application in an isolated VM. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const data=JSON.parse(scripts[0]),byWord=Object.fromEntries(data.vocab.map(w=>[w.word,w]));
let checks=0;
function check(name,fn){fn();checks++;process.stdout.write('PASS '+name+'\n');}
function app(saved=null,route='#today',native=null){
  const elements={},events={},errors=[],storage=new Map(saved?[['vocab_mountain_state_v5',JSON.stringify(saved)]]:[]);
  const el=id=>elements[id]||=( {id,innerHTML:'',textContent:'',value:'',hidden:false,open:false,dataset:{},disabled:false,contains:()=>false,setAttribute(){},focus(){},querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){},showModal(){this.open=true},close(){this.open=false}} );
  el('sprint-data').textContent=scripts[0];
  let now=Date.parse('2026-10-24T10:00:00+05:30');
  class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const document={getElementById:el,activeElement:null,body:{dataset:{}},visibilityState:'visible',querySelectorAll:()=>[],querySelector:()=>null,addEventListener:(n,fn)=>{(events[n]||=[]).push(fn)}};
  const sandbox={document,console:{...console,error:e=>errors.push(String(e))},Date:Clock,location:{hash:route},history:{replaceState(a,b,hash){sandbox.location.hash=hash;}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout:()=>0,clearTimeout(){},setInterval(){},scrollTo(){},addEventListener(){},speechSynthesis:{cancel(){},speak(){}}};
  if(native)sandbox.AndroidApp=native;
  sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(scripts[1],sandbox);
  const instrumented=scripts[2].replace('// A deliberately read-only diagnostics surface',`globalThis.TestAPI={actions,startRound,exploreNext,submitRoundAnswer,nextRoundQuestion,activeRound,roundHistory,remainingDaily,weakWords,recallWords,prepareRoundOptions,learningTick,isStudying,navigate,startMatcher,matchTile,render,save,clozeText,getMatcher:()=>matcher,getState:()=>state,getView:()=>view};\n// A deliberately read-only diagnostics surface`);
  vm.runInContext(instrumented,sandbox);
  const key=(key,target={tagName:'BODY'})=>{const event={key,target,preventDefault(){this.prevented=true}};for(const handler of events.keydown||[])handler(event);return event;};
  return {api:sandbox.TestAPI,state:()=>JSON.parse(JSON.stringify(sandbox.SprintDiagnostics.snapshot())),data,errors,markup:()=>el('main').innerHTML,document,clock:ms=>{now+=ms},storage,sandbox,element:el,key};
}
function learnRound(a){a.api.startRound();let guard=20;while(a.api.activeRound().phase==='learn'&&guard--)a.api.exploreNext();assert.ok(guard>0);}
function answer(a,correct){const r=a.api.activeRound(),q=r.queue[r.index];r.answer=correct?q.word:q.options.find(w=>w!==q.word);a.api.submitRoundAnswer();}
check('compile: both executable scripts parse',()=>{new vm.Script(scripts[1]);new vm.Script(scripts[2]);});
check('scope: 959 unique words, all options and sources in Groups 1–32',()=>{
  assert.equal(data.vocab.length,959);assert.equal(new Set(data.vocab.map(w=>w.word)).size,959);
  assert.equal(Object.values(data.groups).flat().length,960);
  for(const q of data.drills){assert.ok(q.options.every(w=>byWord[w]));assert.ok(q.answers.every(w=>q.options.includes(w)));}
  assert.equal(data.drills.filter(q=>q.source_reference).length,13);
  assert.ok(data.drills.every(q=>q.source_reference),'Every context question must come from supplied material');
  assert.ok(data.vocab.every(w=>w.mnemonic_bn&&['+','-','=','?'].includes(w.polarity)));
});
let a=app();
check('dashboard: guided Continue replaces the old countdown and clipped ring',()=>{assert.ok(a.markup().includes('Your next small step.'));assert.ok(a.markup().includes('guided-continue'));assert.ok(!a.markup().includes('class="ring"'));assert.ok(!a.markup().includes('Start focus'));});
check('round: exactly ten distinct words including displayed partners',()=>{
  a.api.startRound();const r=a.api.activeRound();assert.equal(r.words.length,10);assert.equal(new Set(r.words).size,10);assert.deepEqual(Array.from(r.groups[0]),['abound','proliferate','burgeon']);
  assert.equal((a.markup().match(/class="memory-node unrevealed"/g)||[]).length,3);
  assert.ok(!a.markup().includes('node-memory'));assert.ok(a.markup().includes('node-definition'));assert.ok(a.markup().includes('node-bengali'));
  a.key(' ');for(const w of r.groups[0])assert.ok(a.markup().replace(/&#39;/g,"'").includes(byWord[w].mnemonic_bn));
  assert.ok(a.markup().includes('IN CONTEXT'));a.key(' ');assert.ok(!a.markup().includes('node-memory'));
});
check('card click reveals that word; Space reveals the entire visible set',()=>{
  const b=app();b.api.startRound();b.api.actions['reveal-study-word']({dataset:{word:'abound'}});
  assert.equal((b.markup().match(/class="memory-node revealed"/g)||[]).length,1);b.key(' ');assert.equal((b.markup().match(/class="memory-node revealed"/g)||[]).length,3);
});
check('round arrows go back and forward without counting exposure twice',()=>{
  const b=app();b.api.startRound();b.key('ArrowLeft');assert.equal(b.api.activeRound().cursor,0);
  b.key('ArrowRight');const before=b.state();assert.equal(b.api.activeRound().cursor,1);b.key('ArrowLeft');assert.equal(b.api.activeRound().cursor,0);b.key(' ');b.key('ArrowRight');
  assert.equal(b.api.activeRound().cursor,1);assert.equal(b.api.activeRound().page,1);assert.deepEqual(b.state().boxData,before.boxData);assert.ok(!b.markup().includes('node-memory'));
});
check('review arrows and ratings do not promote an already-rated card twice',()=>{
  const b=app();b.api.actions['review-day']();b.api.actions.rate({dataset:{rating:'3'}});const before=b.state().boxData.abound;
  b.key('ArrowLeft');assert.equal(b.state().sessions['daily:1'].index,0);b.key('3');assert.deepEqual(b.state().boxData.abound,before);
  b.key('ArrowLeft');const restored=app(b.state(),'#cards'),restoredRecord=restored.state().boxData.abound;restored.key('ArrowRight');restored.key('ArrowLeft');restored.key('3');assert.deepEqual(restored.state().boxData.abound,restoredRecord);
});
check('exposure does not promote untested partners',()=>{a.api.exploreNext();for(const w of ['abound','proliferate','burgeon']){assert.equal(a.state().boxData[w].box,1);assert.equal(a.state().boxData[w].learnedWith,undefined);}});
check('reload: resumes exact learning page and ten-word membership',()=>{const before=a.state();a=app(before,'#round');assert.equal(a.api.activeRound().page,1);assert.deepEqual(a.state().learning.days[1][0].words,before.learning.days[1][0].words);});
check('round quiz: every word is assessed with meaning-only questions in both directions',()=>{learnRound(a);const r=a.api.activeRound();assert.equal(r.queue.length,10);assert.equal(new Set(r.queue.map(q=>q.word)).size,10);assert.equal(new Set(r.queue.map(q=>q.kind)).size,2);assert.ok(r.queue.every(q=>['mcq','meaning'].includes(q.kind)));assert.ok(!a.markup().includes('Fill in the blank'));assert.ok(!a.markup().includes('usual tone'));});
check('quiz-to-words review and arrow navigation preserve the exact unanswered question',()=>{
  const b=app();learnRound(b);const before=JSON.parse(JSON.stringify(b.api.activeRound().queue));b.key('ArrowLeft');assert.equal(b.api.getView(),'round');b.key('ArrowLeft');b.key(' ');
  b.api.actions['resume-round-quiz']();assert.equal(b.api.getView(),'round-quiz');assert.equal(b.api.activeRound().index,0);assert.deepEqual(JSON.parse(JSON.stringify(b.api.activeRound().queue)),before);
  b.key('2');assert.equal(b.api.activeRound().answer,b.api.activeRound().queue[0].options[1]);b.key('Enter');assert.equal(b.api.activeRound().submitted,true);
});
const missed=[];
check('adaptive: three misses create delayed questions in changed formats',()=>{
  for(let i=0;i<3;i++){
    const r=a.api.activeRound(),q={...r.queue[r.index]};missed.push(q.word);answer(a,false);
    const retry=r.queue.findIndex((x,j)=>j>r.index&&x.word===q.word);assert.equal(retry,r.index+3);assert.notEqual(r.queue[retry].kind,q.kind);
    const n=r.results.length;a.api.submitRoundAnswer();assert.equal(r.results.length,n);
    a.api.nextRoundQuestion();
  }
  assert.equal(a.api.activeRound().queue.length,13);
});
check('reload: submitted answer, retries and score persist',()=>{
  answer(a,true);const before=a.state();a=app(before,'#round-quiz');assert.equal(a.api.activeRound().submitted,true);assert.deepEqual(a.state().learning.days,before.learning.days);a.api.nextRoundQuestion();
});
check('recovery: quiz finishes; first-try score is distinct from repairs',()=>{
  let guard=80;while(a.api.activeRound().phase!=='done'&&guard--){answer(a,true);a.api.nextRoundQuestion();}assert.ok(guard>0);
  const r=a.api.activeRound();assert.equal(r.results.filter(q=>!q.retry&&q.correct).length,7);assert.equal(r.results.filter(q=>q.retry&&q.correct).length,3);assert.equal(r.missed.length,3);
  assert.deepEqual(Array.from(a.api.weakWords()).sort(),missed.slice().sort());
});
check('next round: carries the three earlier misses without exceeding ten new words',()=>{a.api.startRound();const r=a.api.activeRound();assert.equal(r.words.length,10);assert.deepEqual(Array.from(r.carry).sort(),missed.slice().sort());assert.ok(!r.words.some(w=>r.carry.includes(w)));learnRound(a);assert.equal(a.api.activeRound().queue.filter(q=>q.carry).length,3);});
check('clock: starts automatically, pauses on hidden tab and manual pause',()=>{
  const initial=a.state().learning.seconds['2026-10-24']||0;a.clock(1000);a.api.learningTick();assert.equal(a.state().learning.seconds['2026-10-24'],initial+1);
  a.document.visibilityState='hidden';a.clock(1000);a.api.learningTick();assert.equal(a.state().learning.seconds['2026-10-24'],initial+1);
  a.document.visibilityState='visible';a.api.actions['study-clock-toggle']();a.clock(1000);a.api.learningTick();assert.equal(a.state().learning.seconds['2026-10-24'],initial+1);
  a.api.actions['study-clock-toggle']();a.clock(121000);a.api.learningTick();assert.equal(a.state().learning.seconds['2026-10-24'],initial+1);
});
check('fresh matcher: four pairs; all have separate mnemonic and example material',()=>{
  const b=app();b.api.startMatcher();const m=b.api.getMatcher();assert.equal(m.pairs.length,4);const ids=m.pairs.map(p=>p.id);
  for(const p of m.pairs){assert.ok(p.answers.every(w=>byWord[w].mnemonic_bn&&byWord[w].sentence));}
  b.api.matchTile(m.pairs[0].answers[0]);b.api.matchTile(m.pairs[0].answers[1]);assert.equal(m.matched.length,1);
  b.api.startMatcher();assert.ok(b.api.getMatcher().pairs.some(p=>!ids.includes(p.id)));
});
check('retry cap: a stubborn miss returns twice, then remains weak for a later round',()=>{
  const b=app();learnRound(b);const target=b.api.activeRound().queue[0].word;let guard=100;
  while(b.api.activeRound().phase!=='done'&&guard--){const q=b.api.activeRound().queue[b.api.activeRound().index];answer(b,q.word!==target);b.api.nextRoundQuestion();}
  assert.ok(guard>0);assert.equal(b.api.activeRound().results.filter(q=>q.word===target).length,3);assert.ok(b.api.weakWords().includes(target));
});
check('every day: all source words are reachable in finite ten-word rounds',()=>{
  const b=app();let total=0;
  for(let day=1;day<=20;day++){
    b.api.getState().currentDay=day;let guard=120;
    while(b.api.remainingDaily().length&&guard--){learnRound(b);const r=b.api.activeRound();assert.ok(r.words.length<=10);let qguard=100;while(r.phase!=='done'&&qguard--){answer(b,true);b.api.nextRoundQuestion();}assert.ok(qguard>0);total++;}
    assert.ok(guard>0,'Day '+day+' failed to finish');assert.equal(b.sandbox.SprintCore.dayCoveredCount(b.api.getState(),data.plan[day-1],byWord),data.plan[day-1].words.length);
  }
  assert.ok(total>100);assert.equal(Object.keys(b.state().boxData).length,959);assert.equal(b.errors.length,0);
});
check('normalization: old progress retained and hostile round content filtered',()=>{
  const raw=a.state();raw.boxData.abound.box=4;raw.learning.days[1][0].queue.push({word:'outside-scope',kind:'cloze',options:['bad']});raw.learning.days[1][0].words.push('outside-scope');
  const b=app(raw);assert.equal(b.state().boxData.abound.box,4);assert.ok(b.state().learning.days[1][0].words.every(w=>byWord[w]));assert.ok(b.state().learning.days[1][0].queue.every(q=>byWord[q.word]));
});
check('old cloze/polarity rounds migrate to meaning questions without losing progress',()=>{
  const b=app();learnRound(b);const old=b.state(),r=old.learning.days[1][0];r.queue[0].kind='polarity';r.queue[1].kind='cloze';r.answer='+';r.submitted=false;
  const restored=app(old,'#round-quiz'),next=restored.api.activeRound();assert.equal(next.queue[0].kind,'mcq');assert.equal(next.queue[1].kind,'meaning');assert.equal(next.answer,'');assert.equal(next.index,0);assert.equal(next.words.length,10);
});
check('removed original context questions do not shift the resumed quiz past an unanswered source item',()=>{
  const b=app(),old=b.state();old.quiz={day:1,mode:'daily',items:[{id:'TC-001',kind:'TC',optionWords:[]},{id:'TC-801',kind:'TC',optionWords:[]}],index:1,selected:[],submitted:false,correct:1,results:[{id:'TC-001',correct:true}]};
  const restored=app(old,'#quiz');assert.equal(restored.state().quiz.index,0);assert.equal(restored.state().quiz.items[0].id,'TC-801');assert.equal(restored.state().quiz.correct,0);
});
check('text entry and modal dialogs retain normal Space/arrow behavior',()=>{
  const b=app();b.api.startRound();assert.ok(!b.key(' ',{tagName:'INPUT'}).prevented);assert.ok(!b.key('ArrowRight',{tagName:'TEXTAREA'}).prevented);assert.equal(b.api.activeRound().page,0);
  b.element('modal').open=true;assert.ok(!b.key(' ').prevented);assert.ok(!b.key('ArrowRight').prevented);assert.equal(b.api.activeRound().page,0);
});
check('application actions emitted no errors',()=>assert.deepEqual(a.errors,[]));
check('other practice routes: source questions, polarity and full-day review render',()=>{
  const b=app();b.api.actions['start-quiz']();assert.ok(b.markup().includes('Check answer'));assert.ok(b.state().quiz.items.some(q=>Number(q.id.split('-')[1])>=801));
  b.api.actions['start-blitz']();assert.ok(b.markup().includes('Context matters'));b.api.actions['blitz-answer']({dataset:{tone:'+'}});
  b.api.actions['review-day']();assert.ok(b.markup().includes('Rate your recall of'));assert.equal(b.state().sessions['daily:1'].includeCovered,true);assert.equal(b.errors.length,0);
});
check('Android bridge: restores progress, persists changes, exports JSON and uses native pronunciation',()=>{
  const previous=app();previous.api.startRound();previous.api.exploreNext();const saved=previous.state(),calls={};
  const native={readProgress:()=>JSON.stringify(saved),persistProgress:json=>calls.saved=JSON.parse(json),setTheme:theme=>calls.theme=theme,saveFile:(name,json)=>{calls.export={name,data:JSON.parse(json)}},speak:word=>calls.word=word};
  const mobile=app(null,'#round',native);assert.equal(mobile.api.activeRound().page,1);assert.equal(calls.theme,'light');
  mobile.api.exploreNext();assert.equal(calls.saved.learning.days[1][0].page,2);
  mobile.api.actions.export();assert.equal(calls.export.data.app,'Vocab Sprint');assert.equal(calls.export.data.state.learning.days[1][0].page,2);
  mobile.api.actions.speak({dataset:{word:'abound'}});assert.equal(calls.word,'abound');assert.equal(mobile.errors.length,0);
});
check('Android Back preserves the quiz, browses words, closes dialogs and returns to Today',()=>{
  const b=app();assert.equal(b.sandbox.SprintNativeBack(),false);learnRound(b);const index=b.api.activeRound().index;
  assert.equal(b.sandbox.SprintNativeBack(),true);assert.equal(b.api.getView(),'round');assert.equal(b.api.activeRound().index,index);
  const cursor=b.api.activeRound().cursor;b.sandbox.SprintNativeBack();assert.equal(b.api.activeRound().cursor,cursor-1);
  b.element('modal').open=true;b.sandbox.SprintNativeBack();assert.equal(b.element('modal').open,false);
  b.api.navigate('library');b.sandbox.SprintNativeBack();assert.equal(b.api.getView(),'today');
});
check('Android background lifecycle pauses study counting even if WebView remains visible',()=>{
  const b=app();b.api.startRound();b.clock(1000);b.api.learningTick();const elapsed=b.state().learning.seconds['2026-10-24'];
  b.sandbox.VocabNativeForeground=false;b.clock(1000);b.api.learningTick();assert.equal(b.state().learning.seconds['2026-10-24'],elapsed);
  b.sandbox.VocabNativeForeground=true;b.clock(1000);b.api.learningTick();assert.equal(b.state().learning.seconds['2026-10-24'],elapsed+1);
});
fs.writeFileSync(path.join(root,'qa','learning-verification.json'),JSON.stringify({passed:checks,method:'Compiled application in isolated Node VM; no browser or real progress storage',visualBrowserCheck:false,wordCount:959,sourceAdaptations:13},null,2));
console.log(checks+' checks passed.');
