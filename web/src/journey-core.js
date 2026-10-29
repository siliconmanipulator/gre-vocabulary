/* Guided learning rules. Pure, date-injectable, and independent of the DOM. */
(function (root) {
  'use strict';
  const START='2026-10-25', FIRST_PASS='2026-11-13', DEADLINE='2026-11-15';
  const dateOK=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x));
  const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
  const number=(x,max=100000)=>Number.isInteger(x)&&x>=0?Math.min(x,max):0;
  const list=x=>Array.isArray(x)?x:[];
  const unique=x=>[...new Set(x)];
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  function plus(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
  function fresh(){return {version:1,day:1,days:{},evidence:{},events:[],serial:0,contextHistory:[],retests:{}};}
  function cleanContext(c){if(!obj(c))return null;return {ids:list(c.ids).filter(x=>typeof x==='string').slice(0,10),index:number(c.index,9),submitted:c.submitted===true,reviewIndex:number(c.reviewIndex,9),answers:list(c.answers).slice(0,10).map(a=>obj(a)?{selected:list(a.selected).slice(0,3).map(g=>unique(list(g).filter(x=>typeof x==='string').map(x=>x.slice(0,20))).slice(0,2)),couldnt:a.couldnt===true,declaredFailure:a.declaredFailure===true}:null),diagnoses:obj(c.diagnoses)?Object.fromEntries(Object.entries(c.diagnoses).filter(([k,v])=>/^\d+$/.test(k)&&['meaning','logic','both'].includes(v))):{},applied:list(c.applied).filter(x=>typeof x==='string'),shortfall:number(c.shortfall,10)};}
  function normalize(raw,allowed){
    const j=fresh(),valid=new Set(allowed),words=x=>unique(list(x).filter(w=>valid.has(w))),dates=x=>unique(list(x).filter(dateOK)).sort();
    if(!obj(raw))return j;
    j.day=Math.max(1,number(raw.day,400));j.serial=number(raw.serial);
    j.events=list(raw.events).filter(e=>obj(e)&&typeof e.id==='string').slice(-20000).map(e=>({id:e.id.slice(0,160),word:valid.has(e.word)?e.word:null,date:dateOK(e.date)?e.date:START,correct:e.correct===true,typed:e.typed===true,reason:String(e.reason||'').slice(0,40)}));
    for(const [word,r] of Object.entries(obj(raw.evidence)?raw.evidence:{}))if(valid.has(word)&&obj(r))j.evidence[word]={introduced:dateOK(r.introduced)?r.introduced:'',successDates:dates(r.successDates),typedDates:dates(r.typedDates),needsRevision:r.needsRevision===true,failures:number(r.failures),due:dateOK(r.due)?r.due:START};
    for(const [key,d] of Object.entries(obj(raw.days)?raw.days:{})){
      if(!/^\d+$/.test(key)||!obj(d))continue;
      j.days[key]={id:Number(key),opened:dateOK(d.opened)?d.opened:START,complete:d.complete===true,extraDeclined:d.extraDeclined===true,sessions:list(d.sessions).slice(0,4).filter(obj).map((s,i)=>{
        const cleanAssessment=a=>{
          if(!obj(a))return null;
          const queue=list(a.queue).filter(q=>obj(q)&&valid.has(q.word)).slice(0,160).map(q=>({word:q.word,kind:q.kind==='typed'?'typed':'mcq',retry:number(q.retry,2),old:q.old===true,options:words(q.options).slice(0,4)}));
          return {queue,index:Math.min(number(a.index),queue.length),answer:typeof a.answer==='string'?a.answer.slice(0,80):'',submitted:a.submitted===true,correct:a.correct===true,couldnt:a.couldnt===true,results:list(a.results).filter(r=>obj(r)&&valid.has(r.word)).slice(0,160).map(r=>({word:r.word,kind:r.kind==='typed'?'typed':'mcq',correct:r.correct===true,retry:number(r.retry,2),old:r.old===true,couldnt:r.couldnt===true})),done:a.done===true};
        };
        const names=words(s.words).slice(0,15),used=new Set();
        const groups=list(s.groups).map(g=>words(g).filter(w=>names.includes(w)&&!used.has(w)).filter(w=>(used.add(w),true))).filter(g=>g.length);
        for(const w of names)if(!used.has(w))groups.push([w]);
        const stages=['revision','learn','meaning','meaning-result','context','context-review','summary','done'];
        const context=cleanContext(s.context);
        return {id:`D${Number(key)}S${i+1}`,number:i+1,extra:i>=3,stage:stages.includes(s.stage)?s.stage:'revision',words:names,groups,page:Math.min(number(s.page),groups.length),cursor:Math.min(number(s.cursor),Math.max(0,groups.length-1)),revision:cleanAssessment(s.revision),meaning:cleanAssessment(s.meaning),context,contextArchive:list(s.contextArchive).slice(-10).map(cleanContext).filter(Boolean),sourceNotice:typeof s.sourceNotice==='string'?s.sourceNotice.slice(0,600):'',reviewDone:s.reviewDone===true,browsing:s.browsing===true,seconds:number(s.seconds,86400)};
      })};
    }
    j.contextHistory=unique(list(raw.contextHistory).filter(x=>typeof x==='string')).slice(-3000);
    j.retests=Object.fromEntries(Object.entries(obj(raw.retests)?raw.retests:{}).filter(([k,v])=>typeof k==='string'&&obj(v)).map(([k,v])=>[k,{after:number(v.after),resolved:v.resolved===true}]));
    if(obj(raw.supplemental)){
      const holder=normalize({days:{1:{sessions:[raw.supplemental]}}},allowed);
      const review=holder.days[1]?.sessions[0];
      if(review){review.id=/^R\d+$/.test(raw.supplemental.id)?raw.supplemental.id:'R0';review.supplemental=true;j.supplemental=review;}
    }
    return j;
  }
  function status(j,word){const e=j.evidence[word];if(!e?.introduced)return 'unintroduced';if(e.needsRevision)return 'revision';if(unique(e.successDates).length>=2&&e.typedDates.some(d=>e.successDates.includes(d)))return 'learned';return e.successDates.length?'awaiting':'introduced';}
  function introduce(j,word,date=today()){const e=j.evidence[word]||={introduced:'',successDates:[],typedDates:[],needsRevision:false,failures:0,due:date};if(!e.introduced)e.introduced=date;return e;}
  function assess(j,word,correct,typed,date,eventId,reason='recall'){
    if(!dateOK(date))throw new Error('Assessment needs a valid calendar date');
    if(j.events.some(e=>e.id===eventId))return false;
    const e=introduce(j,word,date);
    if(correct){e.successDates=unique([...e.successDates,date]);if(typed)e.typedDates=unique([...e.typedDates,date]);if(e.successDates.length>=2&&e.typedDates.length)e.needsRevision=false;e.due=plus(date,2);}
    else{e.successDates=[];e.typedDates=[];e.needsRevision=true;e.failures++;e.due=plus(date,1);}
    j.events.push({id:eventId,word,date,correct,typed,reason});return true;
  }
  function counts(j,names){const c={unintroduced:0,introduced:0,awaiting:0,learned:0,revision:0};for(const w of names)c[status(j,w)]++;return c;}
  function revision(j,date=today(),exclude=[]){const skip=new Set(exclude);return Object.keys(j.evidence).filter(w=>j.evidence[w].introduced&&!skip.has(w)&&(j.evidence[w].needsRevision||j.evidence[w].due<=date)).sort((a,b)=>Number(j.evidence[b].needsRevision)-Number(j.evidence[a].needsRevision)||j.evidence[b].failures-j.evidence[a].failures||j.evidence[a].due.localeCompare(j.evidence[b].due));}
  function selectWords(j,data,count=15,extraReserved=[]){
    const reserved=new Set([...Object.values(j.days).flatMap(d=>d.sessions.flatMap(s=>s.words)),...Object.keys(j.evidence).filter(w=>j.evidence[w].introduced),...extraReserved]);
    const byWord=Object.fromEntries(data.vocab.map(w=>[w.word,w])),sets=Object.fromEntries(data.synonymSets.map(s=>[s.id,s]));
    const order=unique(Object.keys(data.groups).sort((a,b)=>Number(a)-Number(b)).flatMap(g=>data.groups[g]));
    const names=[],groups=[];
    for(const word of order){if(reserved.has(word)||names.length>=count)continue;const group=[word];names.push(word);reserved.add(word);
      for(const peer of sets[byWord[word].learning_set_id]?.words||[]){if(group.length>=3||names.length>=count)break;if(!reserved.has(peer)&&byWord[peer]){group.push(peer);names.push(peer);reserved.add(peer);}}
      groups.push(group);
    }return {words:names,groups};
  }
  function ensureDay(j,data,date=today()){
    if(j.days[j.day])return j.days[j.day];
    const day={id:j.day,opened:date,complete:false,sessions:[]};j.days[j.day]=day;
    for(let i=1;i<=3;i++){const selected=selectWords(j,data);day.sessions.push({id:`D${j.day}S${i}`,number:i,extra:false,stage:'revision',...selected,page:0,cursor:0,revision:null,meaning:null,context:null,reviewDone:false});}return day;
  }
  function active(j){return j.days[j.day]?.sessions.find(s=>s.stage!=='done')||null;}
  function assessment(names,typed=false){return {queue:names.map((word,i)=>({word,kind:typed||i%2?'typed':'mcq',retry:0,old:false,options:[]})),index:0,answer:'',submitted:false,correct:false,couldnt:false,results:[],done:names.length===0};}
  function begin(j,data,date=today()){
    ensureDay(j,data,date);const s=active(j);if(!s)return null;
    if(s.stage==='revision'&&!s.revision){s.revision=assessment(revision(j,date,s.words).slice(0,10),s.number===1);if(s.revision.done)s.stage=s.words.length?'learn':'context';}
    return s;
  }
  function readNext(j,s,date=today()){
    if(s.cursor<s.page){s.cursor++;return;}
    for(const w of s.groups[s.page]||[])introduce(j,w,date);
    s.page++;s.cursor=Math.min(s.page,Math.max(0,s.groups.length-1));
    if(s.page>=s.groups.length){const old=revision(j,date,s.words).slice(0,3);s.meaning=assessment(s.words);old.forEach((word,i)=>s.meaning.queue.splice(Math.min(3+i*5,s.meaning.queue.length),0,{word,kind:i%2?'typed':'mcq',retry:0,old:true,options:[]}));s.stage='meaning';}
  }
  function answer(j,s,which,date=today(),couldnt=false){
    const a=s[which],q=a?.queue[a.index];if(!q||a.submitted||a.done)return false;
    if(!couldnt&&!a.answer.trim())return false;
    const correct=!couldnt&&a.answer.trim().toLowerCase()===q.word;
    a.correct=correct;a.couldnt=couldnt;a.submitted=true;a.results.push({...q,options:undefined,correct,couldnt});
    assess(j,q.word,correct,q.kind==='typed',date,`${s.id}:${which}:${a.index}`,couldnt?'couldnt-remember':'recall');
    if(which==='meaning'&&!correct&&q.retry<2)a.queue.splice(Math.min(a.index+3,a.queue.length),0,{word:q.word,kind:q.kind==='typed'?'mcq':'typed',retry:q.retry+1,old:q.old,options:[]});
    return true;
  }
  function nextAnswer(s,which){const a=s[which];if(!a?.submitted)return;a.index++;a.answer='';a.submitted=false;a.couldnt=false;if(a.index>=a.queue.length){a.done=true;s.stage=which==='revision'?(s.words.length?'learn':'context'):'meaning-result';}}
  function addExtra(j,data){const d=j.days[j.day];if(!d||d.sessions.length>=4||!d.sessions.slice(0,3).every(s=>s.stage==='done'))return false;const selected=selectWords(j,data);if(!selected.words.length)return false;d.sessions.push({id:`D${j.day}S4`,number:4,extra:true,stage:'learn',...selected,page:0,cursor:0,revision:assessment([]),meaning:null,context:null,reviewDone:false});d.complete=false;return true;}
  function contextCorrect(q,answer){return !!answer&&!answer.couldnt&&!answer.declaredFailure&&q.answers.every((group,i)=>{const got=answer.selected[i]||[];return got.length===group.length&&group.every(x=>got.includes(x));});}
  function chooseContext(j,data,s){
    if(s.context)return s.context;
    // The approved daily scope includes today's scheduled new words and earlier
    // introduced words, not the entire unseen syllabus. Prefer actually introduced
    // targets when enough questions exist, without replacing originals by MCQs.
    const introduced=new Set(Object.keys(j.evidence).filter(w=>j.evidence[w].introduced));
    const studied=new Set([...introduced,...(j.days[j.day]?.sessions.flatMap(x=>x.words)||[])]);
    const eligible=(data.originalDrills||[]).filter(q=>q.verified===true&&q.correct_words.some(w=>studied.has(w)));
    const position=(j.day-1)*3+s.number;
    eligible.sort((a,b)=>Number(!!j.retests[b.id]&&!j.retests[b.id].resolved&&j.retests[b.id].after<position)-Number(!!j.retests[a.id]&&!j.retests[a.id].resolved&&j.retests[a.id].after<position)||Number(j.contextHistory.includes(a.id))-Number(j.contextHistory.includes(b.id))||Number(b.correct_words.some(w=>introduced.has(w)))-Number(a.correct_words.some(w=>introduced.has(w))));
    const ids=eligible.slice(0,s.extra?0:10).map(q=>q.id);
    s.context={ids,index:0,answers:ids.map(()=>null),submitted:false,reviewIndex:0,diagnoses:{},applied:[],shortfall:s.extra?0:10-ids.length};return s.context;
  }
  function diagnose(j,s,q,index,cause,date=today()){
    if(!['meaning','logic','both'].includes(cause)||!s.context?.submitted)return false;
    const key=`${s.id}:${q.id}`;if(s.context.applied.includes(key))return false;
    if(cause==='meaning'||cause==='both')for(const w of q.correct_words)if(j.evidence[w]?.introduced)assess(j,w,false,false,date,key+':'+w,'meaning-gap');
    if(cause==='logic'||cause==='both')j.retests[q.id]={after:(j.day-1)*3+s.number,resolved:false};
    s.context.diagnoses[index]=cause;s.context.applied.push(key);return true;
  }
  function finishSession(j,s){if(s.stage!=='summary'||!s.reviewDone)return false;s.stage='done';const d=j.days[j.day];d.complete=d.sessions.every(x=>x.stage==='done'&&(!x.context||x.context.shortfall===0));return true;}
  root.SprintJourney={START,FIRST_PASS,DEADLINE,today,plus,fresh,normalize,status,introduce,assess,counts,revision,selectWords,ensureDay,active,assessment,begin,readNext,answer,nextAnswer,addExtra,contextCorrect,chooseContext,diagnose,finishSession};
  if(typeof module!=='undefined')module.exports=root.SprintJourney;
})(typeof globalThis!=='undefined'?globalThis:this);
