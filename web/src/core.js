/* Pure study rules. Shared by the offline UI and regression tests. */
(function (root) {
  'use strict';
  const BOX_DAYS = [0, 1, 2, 4, 7, 14];
  const WORD = /^[a-z][a-z -]{0,50}$/;
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  function localDate(date = new Date()) {
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function addDays(date, amount) {
    const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate()+amount); return localDate(d);
  }
  function daysBetween(a, b) { return Math.round((Date.parse(`${b}T00:00:00Z`)-Date.parse(`${a}T00:00:00Z`))/86400000); }
  function freshState() {
    return {version:6,currentDay:1,minimizationMode:true,theme:'light',streak:0,lastActiveDate:'',journey:typeof SprintJourney!=='undefined'?SprintJourney.fresh():null,
      boxData:{},mistakeBank:[],questionMistakes:[],routineChecks:{},completedDays:[],studyByDay:{},
      dayStats:{},activity:{},sessions:{},activeSessionKey:'',quiz:null,customMnemonics:{},bookmarks:[],
      timer:{remaining:1500,duration:1500,running:false,end:0},learning:{days:{},weak:{},seconds:{},paused:false},lastSaved:''};
  }
  function normalize(input, allowed, strict = false) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('The backup must contain a progress object.');
    if (strict && input.version !== 6 && !own(input,'boxData')) throw new Error('This is not a Vocab Sprint progress backup.');
    if (strict && own(input,'version') && ![4,5,6].includes(input.version)) throw new Error('This backup version is not supported.');
    if (strict && own(input,'boxData') && (!input.boxData || typeof input.boxData!=='object' || Array.isArray(input.boxData))) throw new Error('The word progress in this backup is invalid.');
    const s = freshState(), wordSet = new Set(allowed);
    const valid = word => typeof word === 'string' && WORD.test(word) && wordSet.has(word);
    const unique = arr => [...new Set(Array.isArray(arr) ? arr.filter(valid) : [])];
    const object = x => x && typeof x === 'object' && !Array.isArray(x);
    const integer = (n, min, max, fallback) => Number.isInteger(n) && n>=min && n<=max ? n : fallback;
    const date = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x));
    s.currentDay = integer(input.currentDay,1,20,1);
    s.minimizationMode = input.minimizationMode !== false;
    s.theme = input.theme === 'dark' ? 'dark':'light';
    s.lastActiveDate = date(input.lastActiveDate) ? input.lastActiveDate : '';
    s.streak = integer(input.streak,0,100000,0);
    if (object(input.boxData)) for (const [word, raw] of Object.entries(input.boxData)) {
      if (!valid(word)) continue;
      const value = typeof raw === 'number' ? {box:raw,seen:1,due:localDate()} : raw;
      if (!object(value)) continue;
      s.boxData[word] = {box:integer(value.box,1,5,1),due:date(value.due)?value.due:localDate(),
        lastReviewed:date(value.lastReviewed)?value.lastReviewed:'',seen:integer(value.seen,0,100000,0),
        lapses:integer(value.lapses,0,100000,0),successes:integer(value.successes,0,100000,0),
        learnedWith:valid(value.learnedWith)?value.learnedWith:null};
    }
    s.mistakeBank = unique(input.mistakeBank);
    s.bookmarks = unique(input.bookmarks);
    s.questionMistakes = [...new Set(Array.isArray(input.questionMistakes)?input.questionMistakes.filter(x=>typeof x==='string' && /^[A-Z]{2}-\d{3}$/.test(x)):[])].slice(0,1000);
    s.completedDays = [...new Set(Array.isArray(input.completedDays)?input.completedDays.filter(n=>Number.isInteger(n)&&n>=1&&n<=20):[])];
    for (let d=1;d<=20;d++) {
      s.studyByDay[d] = unique(input.studyByDay?.[d]);
      const st = input.dayStats?.[d] || {};
      s.dayStats[d] = {answered:integer(st.answered,0,100000,0),correct:integer(st.correct,0,100000,0),reviews:integer(st.reviews,0,100000,0)};
      const checks = input.routineChecks?.[d] || {};
      s.routineChecks[d] = {reflect:checks.reflect === true || checks['task-n'] === true};
    }
    if (object(input.activity)) for (const [day, amount] of Object.entries(input.activity)) {
      if (date(day)) s.activity[day] = integer(amount,0,1000000,0);
    }
    if (object(input.customMnemonics)) for (const [word, note] of Object.entries(input.customMnemonics)) {
      if (valid(word) && typeof note==='string') s.customMnemonics[word]=note.slice(0,1200);
    }
    if (object(input.sessions)) for (const [key, v] of Object.entries(input.sessions).slice(0,100)) {
      if (!/^(daily|due|mistakes|single|group|bookmarks):[a-z0-9 -]+$/.test(key) || !object(v)) continue;
      const words=unique(v.words); if (!words.length) continue;
      const mode=key.split(':')[0];
      s.sessions[key]={mode,day:integer(v.day,1,20,s.currentDay),words,index:integer(v.index,0,words.length,0),
        layer:2,includeCovered:v.includeCovered===true,linked:integer(v.linked,0,allowed.length,0),
        ratedIndices:[...new Set(Array.isArray(v.ratedIndices)?v.ratedIndices.filter(n=>Number.isInteger(n)&&n>=0&&n<words.length):Array.from({length:integer(v.index,0,words.length,0)},(_,i)=>i))],
        again:integer(v.again,0,words.length,0),good:integer(v.good,0,words.length,0),hard:integer(v.hard,0,words.length,0)};
    }
    if (typeof input.activeSessionKey==='string' && own(s.sessions,input.activeSessionKey)) s.activeSessionKey=input.activeSessionKey;
    // Restored question text is rebuilt from trusted bundled content in the UI.
    if (object(input.quiz) && Array.isArray(input.quiz.items)) {
      const items=input.quiz.items.filter(q=>q && typeof q.id==='string' && (q.kind==='recall' ? valid(q.word) : /^(TC|SE)-\d{3}$/.test(q.id))).slice(0,100);
      s.quiz={day:integer(input.quiz.day,1,20,s.currentDay),mode:input.quiz.mode==='mistakes'?'mistakes':'daily',
        items:items.map(q=>({id:q.id,kind:q.kind==='recall'?'recall':q.id.slice(0,2),word:valid(q.word)?q.word:undefined,
          optionWords:unique(q.optionWords).slice(0,6)})),
        index:integer(input.quiz.index,0,items.length,0),selected:unique(input.quiz.selected),submitted:input.quiz.submitted===true,
        correct:integer(input.quiz.correct,0,items.length,0),results:Array.isArray(input.quiz.results)?input.quiz.results.filter(q=>q&&typeof q.id==='string').slice(0,100).map(q=>({id:q.id,correct:q.correct===true})):[]};
      if (!items.length) s.quiz=null;
    }
    const t=input.timer;
    if (object(t)) s.timer={duration:integer(t.duration,60,7200,1500),remaining:integer(t.remaining,0,7200,1500),running:t.running===true&&Number.isFinite(t.end)&&t.end>0,end:Number.isFinite(t.end)?t.end:0};
    s.learning=typeof SprintLearning!=='undefined'?SprintLearning.normalize(input.learning,allowed):s.learning;
    if(typeof SprintJourney!=='undefined'){
      s.journey=SprintJourney.normalize(input.journey,allowed);
      if(!input.journey)for(const [word,record] of Object.entries(s.boxData))if(record.seen){const evidence=SprintJourney.introduce(s.journey,word,record.lastReviewed||localDate());if(s.mistakeBank.includes(word)){evidence.needsRevision=true;evidence.failures=record.lapses||1;evidence.due=localDate();}}
    }
    s.lastSaved=typeof input.lastSaved==='string'?input.lastSaved:'';
    return s;
  }
  function recordActivity(state, today=localDate()) {
    if (state.lastActiveDate !== today) {
      state.streak=state.lastActiveDate && daysBetween(state.lastActiveDate,today)===1 ? state.streak+1:1;
      state.lastActiveDate=today;
    }
    state.activity[today]=(state.activity[today]||0)+1;
  }
  function dueWords(state, words, today=localDate()) {return words.filter(w=>state.boxData[w]?.seen>0 && state.boxData[w].due<=today);}
  function rate(state, word, rating, mode, sprintDay, today=localDate()) {
    if (![1,2,3].includes(rating)) throw new Error('Unknown card rating');
    const previous=state.boxData[word]||{box:1,seen:0,lapses:0,successes:0};
    const box=rating===1?1:rating===2?previous.box:Math.min(5,previous.box+1);
    state.boxData[word]={...previous,box,seen:previous.seen+1,lastReviewed:today,
      due:addDays(today,rating===2?1:BOX_DAYS[box]),lapses:previous.lapses+(rating===1?1:0),successes:previous.successes+(rating===3?1:0)};
    if (rating===1 && !state.mistakeBank.includes(word)) state.mistakeBank.push(word);
    if (rating===3 && mode==='mistakes') state.mistakeBank=state.mistakeBank.filter(w=>w!==word);
    state.studyByDay[sprintDay] ||= [];
    if (mode==='daily' && !state.studyByDay[sprintDay].includes(word)) state.studyByDay[sprintDay].push(word);
    state.dayStats[sprintDay] ||= {answered:0,correct:0,reviews:0};
    if (['due','mistakes'].includes(mode)) state.dayStats[sprintDay].reviews++;
    recordActivity(state,today);
    return state.boxData[word];
  }
  function eligibleAnchor(state, entry, familyWords, byWord, currentGroup=entry.group) {
    if (!state.minimizationMode) return null;
    if (entry.groups.length>1 && entry.group<currentGroup && state.boxData[entry.word]?.box>=2) return entry;
    return familyWords.map(w=>byWord[w]).filter(Boolean).filter(w=>w.group<currentGroup && state.boxData[w.word]?.box>=2 && state.boxData[w.word]?.seen>0)
      .sort((a,b)=>a.group-b.group)[0]||null;
  }
  function learnedTogether(state, entry, studyPlan) {
    const record=state.boxData[entry.word];
    if (!record || record.box<2 || !record.seen || state.mistakeBank.includes(entry.word)) return false;
    return !!record.learnedWith || (entry.groups.length>1 && studyPlan.groups.some(g=>entry.groups.includes(g)&&g>entry.group));
  }
  function dayCoveredCount(state, studyPlan, byWord) {
    const attempted=new Set(state.studyByDay[studyPlan.day]||[]);
    return studyPlan.words.filter(word=>{
      if(attempted.has(word))return true;
      if(studyPlan.kind!=='learn')return false;
      const record=state.boxData[word],entry=byWord[word];
      // Coverage records exposure, not mastery. A later mistake must not erase
      // an already finished learning task, nor pre-complete a consolidation day.
      return !!record?.seen && (!!record.learnedWith || (entry.groups.length>1 && studyPlan.groups.some(g=>entry.groups.includes(g)&&g>entry.group)));
    }).length;
  }
  function rateTogether(state, word, partners, rating, mode, sprintDay, today=localDate()) {
    rate(state,word,rating,mode,sprintDay,today);
    const learned=[];
    if(rating===3 && state.minimizationMode){
      for(const partner of [...new Set(partners)]){
        if(partner===word || state.boxData[partner]?.seen || state.mistakeBank.includes(partner))continue;
        rate(state,partner,3,'linked',sprintDay,today);
        state.boxData[partner].learnedWith=word;
        learned.push(partner);
      }
    }
    return learned;
  }
  function shuffle(items, random=Math.random) {
    const arr=[...items]; for (let i=arr.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];} return arr;
  }
  function editDistance(a,b,limit=2) {
    if(Math.abs(a.length-b.length)>limit)return limit+1;
    let previous=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){
      const current=[i];
      for(let j=1;j<=b.length;j++)current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
      if(Math.min(...current)>limit)return limit+1;
      previous=current;
    }
    return previous[b.length];
  }
  root.SprintCore={BOX_DAYS,localDate,addDays,daysBetween,freshState,normalize,recordActivity,dueWords,rate,rateTogether,learnedTogether,dayCoveredCount,eligibleAnchor,shuffle,editDistance};
  if (typeof module!=='undefined') module.exports=root.SprintCore;
})(typeof globalThis!=='undefined'?globalThis:this);
