/* Persistent ten-word rounds. Questions store identifiers, never imported HTML. */
(function(root){
  'use strict';
  function fresh(){return {days:{},weak:{},seconds:{},paused:false};}
  function normalize(raw,allowed){
    const out=fresh(),valid=new Set(allowed),obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
    const list=x=>[...new Set(Array.isArray(x)?x.filter(w=>valid.has(w)):[])];
    const num=(x,max=100000)=>Number.isFinite(x)?Math.max(0,Math.min(max,Math.floor(x))):0;
    if(!obj(raw))return out;
    out.paused=raw.paused===true;
    for(const [key,v] of Object.entries(obj(raw.seconds)?raw.seconds:{}))if(/^\d{4}-\d{2}-\d{2}$/.test(key))out.seconds[key]=num(v,86400);
    for(const [w,v] of Object.entries(obj(raw.weak)?raw.weak:{}))if(valid.has(w)&&obj(v))out.weak[w]={misses:num(v.misses),streak:num(v.streak),lastDay:num(v.lastDay,20)};
    for(let day=1;day<=20;day++){
      const rounds=raw.days?.[day];if(!Array.isArray(rounds))continue;
      out.days[day]=rounds.slice(0,120).filter(r=>obj(r)&&list(r.words).length).map(r=>{
        const words=list(r.words).slice(0,15),allowedRound=new Set([...words,...list(r.carry).slice(0,3)]);
        const groups=Array.isArray(r.groups)?r.groups.map(g=>list(g).filter(w=>words.includes(w))).filter(g=>g.length).map(g=>g.slice(0,3)):[];
        const flattened=groups.flat();if(new Set(flattened).size!==words.length||flattened.length!==words.length)groups.splice(0,groups.length,...words.map(w=>[w]));
        const item=q=>obj(q)&&allowedRound.has(q.word)&&['mcq','meaning','cloze','polarity'].includes(q.kind);
        const queue=(Array.isArray(r.queue)?r.queue:[]).filter(item).slice(0,100).map(q=>({word:q.word,kind:q.kind==='cloze'?'meaning':q.kind==='polarity'?'mcq':q.kind,retry:num(q.retry,2),carry:q.carry===true,options:list(q.options).slice(0,4)}));
        const results=(Array.isArray(r.results)?r.results:[]).slice(0,100).filter(item).map(q=>({word:q.word,kind:q.kind,correct:q.correct===true,retry:num(q.retry,2),carry:q.carry===true}));
        const index=Math.min(num(r.index),queue.length),page=Math.min(num(r.page),groups.length);
        const answer=r.submitted===true&&r.feedback===true&&queue[index]?queue[index].word:valid.has(r.answer)?r.answer:'';
        return {words,groups,carry:list(r.carry).slice(0,3),page,cursor:Math.min(Number.isInteger(r.cursor)?num(r.cursor):page,Math.max(0,groups.length-1)),phase:['learn','quiz','done'].includes(r.phase)?r.phase:'learn',queue,index,results,submitted:r.submitted===true,answer,feedback:r.feedback===true,missed:list(r.missed).filter(w=>allowedRound.has(w)),id:num(r.id,120)};
      });
    }
    return out;
  }
  function nextKind(kind){return kind==='mcq'?'meaning':'mcq';}
  function answer(round,correct){
    if(round.submitted||!round.queue[round.index])return null;
    const q=round.queue[round.index];round.submitted=true;round.feedback=correct;
    round.results.push({word:q.word,kind:q.kind,correct,retry:q.retry||0,carry:!!q.carry});
    if(!correct){
      if(!round.missed.includes(q.word))round.missed.push(q.word);
      // Two intervening questions when possible; each failed attempt changes format.
      if((q.retry||0)<2)round.queue.splice(Math.min(round.index+3,round.queue.length),0,{word:q.word,kind:nextKind(q.kind),retry:(q.retry||0)+1,carry:!!q.carry,options:[]});
    }
    return q;
  }
  root.SprintLearning={fresh,normalize,answer,nextKind};
  if(typeof module!=='undefined')module.exports=root.SprintLearning;
})(typeof globalThis!=='undefined'?globalThis:this);
