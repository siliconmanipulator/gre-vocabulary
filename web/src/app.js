(function () {
  'use strict';
  const D=JSON.parse(document.getElementById('sprint-data').textContent), C=SprintCore;
  const byWord=Object.fromEntries(D.vocab.map(w=>[w.word,w])), byQuestion=Object.fromEntries(D.drills.map(q=>[q.id,q]));
  const words=D.vocab.map(w=>w.word), families=Object.fromEntries(D.families.map(f=>[f.id,f]));
  const synonymSets=Object.fromEntries(D.synonymSets.map(set=>[set.id,set]));
  const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const SANDBOX=document.querySelector('meta[name="vocab-preview"]')?.content==='true';
  const STORE=SANDBOX?'vocab_sprint_preview_v1':'vocab_sprint_guided_v6';
  let state=C.normalize(C.freshState(),words), storageBroken=false, corruptRaw='', view='today', listQuery='', listGroup='all', listStatus='all', listLimit=48;
  let toastId, lastFocus, pendingImport=null, matcher=null, blitz=null;
  const ICONS={today:'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',cards:'M5 4h14v16H5z M9 8h6 M9 12h6',drills:'m13 2-8 12h6l-1 8 9-13h-6z',trail:'m3 20 6-12 4 6 3-10 5 16Z',library:'M3 5q5-2 9 1 4-3 9-1v15q-5-2-9 1-4-3-9-1Z M12 6v15',mistakes:'M12 3 2 21h20Z M12 9v5 M12 17v.5',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 m5 12 6 6',arrow:'M4 12h16 m-6-6 6 6-6 6',check:'m5 12 4 4L19 6',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l4 2',star:'m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z'};
  function icon(name,size=19){return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]||ICONS.cards}"/></svg>`;}
  function button(label,action,cls='btn',attrs=''){return `<button class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;}
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastId);toastId=setTimeout(()=>$('toast').hidden=true,4000);}
  function storageWarning(message){$('storage-warning').hidden=false;$('storage-warning').innerHTML=`${esc(message)} ${button('Export a backup','export','text-button')} ${corruptRaw?button('Download unreadable data','export-corrupt','text-button'):''}`;}
  function save(){
    if(storageBroken)return;
    state.lastSaved=new Date().toISOString();
    if(!SANDBOX&&window.AndroidApp?.persistProgress){try{window.AndroidApp.persistProgress(JSON.stringify(state));}catch(e){console.error('Native progress backup failed',e);}}
    try{localStorage.setItem(STORE,JSON.stringify(state));}
    catch(e){storageBroken=true;storageWarning('Progress is currently held only in this tab. Browser storage is unavailable or full. Export a backup before closing.');}
  }
  function initStorage(){
    if(SANDBOX){
      try{const raw=localStorage.getItem(STORE);state=raw?C.normalize(JSON.parse(raw),words,true):createSandboxState();}
      catch(e){storageBroken=true;state=createSandboxState();storageWarning('Sandbox storage is unavailable. Your real learning save has not been opened or changed.');}
      return;
    }
    try{
      const local=localStorage.getItem(STORE),native=window.AndroidApp?.readProgress?window.AndroidApp.readProgress():'';
      let raw=local||native||localStorage.getItem('vocab_mountain_state_v5');
      if(local&&native){try{const a=JSON.parse(local),b=JSON.parse(native);if(b.version===6&&(a.version!==6||Date.parse(b.lastSaved)>Date.parse(a.lastSaved)))raw=native;}catch(e){/* Preserve unreadable raw data through the existing recovery path. */}}
      if(raw&&!local&&!localStorage.getItem('vocab_sprint_pre_guided_backup')){try{localStorage.setItem('vocab_sprint_pre_guided_backup',raw);}catch(e){storageBroken=true;storageWarning('Progress was restored, but its migration recovery copy could not be saved. Export a backup before closing.');}}
      if(raw){try{state=C.normalize(JSON.parse(raw),words,true);}catch(e){corruptRaw=raw;storageBroken=true;storageWarning('Saved progress could not be read. The original data has been preserved. You can download it or restore a valid backup in Settings.');}}
      else{const legacy=localStorage.getItem('vocab_mountain_state_v4');if(legacy){state=C.normalize(JSON.parse(legacy),words);save();toast('Your previous word boxes and mistakes have been migrated. The v4 backup remains in browser storage.');}}
    }catch(e){storageBroken=true;storageWarning('Browser storage is blocked. Export progress before closing this tab.');}
  }
  const plan=(day=state.currentDay)=>D.plan[day-1];
  const dayStats=(day=state.currentDay)=>state.dayStats[day]||(state.dayStats[day]={answered:0,correct:0,reviews:0});
  const due=()=>C.dueWords(state,words);
  const learned=()=>words.filter(w=>state.boxData[w]?.box>=2).length;
  const mastered=()=>words.filter(w=>state.boxData[w]?.box>=4).length;
  const seen=()=>words.filter(w=>state.boxData[w]?.seen>0).length;
  const streak=()=>state.lastActiveDate && C.daysBetween(state.lastActiveDate,C.localDate())<=1?state.streak:0;
  function dailyProgress(day=state.currentDay){return C.dayCoveredCount(state,plan(day),byWord);}
  function tasks(day=state.currentDay){const st=dayStats(day),rounds=roundHistory(day);return [dailyProgress(day)===plan(day).words.length, due().length===0,rounds.length?rounds.every(r=>r.phase==='done'):st.answered>=10,!!state.routineChecks[day]?.reflect];}
  function heading(title,description,extra=''){return `<div class="page-heading"><div><div class="eyebrow">${view==='today'?'MAKE ROOM FOR BETTER WORDS':view==='cards'?'LEARN THE CONNECTIONS':'YOUR VOCABULARY SPRINT'}</div><h1>${title}</h1><p>${description}</p></div>${extra}</div>`;}
  function daySelect(){return `<label class="small muted">${'<span class="label" style="display:block">SPRINT DAY</span>'}<select class="day-select" id="day-select" aria-label="Select sprint day">${D.plan.map(p=>`<option value="${p.day}" ${p.day===state.currentDay?'selected':''}>Day ${String(p.day).padStart(2,'0')}${p.kind!=='learn'?' · Review':''}</option>`).join('')}</select></label>`;}
  function navigate(target,focus=true){
    if(blitz?.running && target!=='blitz')stopBlitz();
    view=target;if($('modal').open)$('modal').close();render();
    const hash='#'+target;if(location.hash!==hash)history.replaceState(null,'',hash);
    if(focus){$('main').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
  }
  function nav(){
    const entries=[['today','Today'],['cards','Flashcards'],['drills','Practice'],['trail','Study trail'],['library','Word library'],['mistakes','Mistakes'],['settings','Settings']];
    const active=['quiz','matcher','blitz','round-quiz'].includes(view)?'drills':view==='round'?'cards':view;
    const mistakeCount=state.journey?Object.values(state.journey.evidence).filter(e=>e.needsRevision).length:state.mistakeBank.length;
    const link=([id,label])=>`<a href="#${id}" class="nav-link ${id===active?'active':''}" ${id===active?'aria-current="page"':''} title="${label}">${icon(id)}<span class="nav-label">${label}</span>${id==='mistakes'&&mistakeCount?`<span class="nav-count">${mistakeCount}</span>`:''}</a>`;
    $('navigation').innerHTML=entries.map(link).join('');
    $('mobile-navigation').innerHTML=entries.filter(x=>['today','cards','drills','trail','library'].includes(x[0])).map(x=>link([x[0],x[0]==='cards'?'Cards':x[0]==='library'?'Library':x[0]==='trail'?'Trail':x[1]])).join('');
    $('header-day').textContent=`DAY ${String(state.currentDay).padStart(2,'0')} / 20`;
    $('theme-button').setAttribute('aria-label',`Switch to ${state.theme==='dark'?'light':'dark'} theme`);
    document.body.dataset.theme=state.theme;
    if(window.AndroidApp?.setTheme)window.AndroidApp.setTheme(state.theme);
  }
  function mountain(){return `<svg class="mountain-art" viewBox="0 0 250 290" fill="none" aria-hidden="true"><circle cx="181" cy="72" r="40" fill="#c7df9d" opacity=".13"/><circle cx="181" cy="72" r="28" stroke="#d5e8b5" stroke-opacity=".25"/><path d="M-15 290 104 76l130 214Z" fill="#2c6250"/><path d="m43 290 129-191 115 191Z" fill="#47735b"/><path d="m104 76-26 47 27-8 22 13Z" fill="#d5e4be"/><path d="m172 99-29 43 27-8 28 9Z" fill="#d5e4be"/><path d="M119 290c-53-41 47-65 7-93-21-15 20-29 17-48" stroke="#d0deaf" stroke-width="2" stroke-dasharray="4 5"/><path d="M172 99V64m0 0h28l-8 10 8 10h-28" stroke="#c7df9d" stroke-width="2"/><circle cx="51" cy="83" r="2" fill="#c7df9d"/><path d="m34 44 3-6 3 6m-6-1h6" stroke="#c7df9d" opacity=".4"/></svg>`;}
  function session(){return state.sessions[state.activeSessionKey];}
  function startStudy(mode, word=null, restart=false){
    if(mode==='daily'&&!restart){startRound();return;}
    resetStudyReveal();
    const day=state.currentDay,p=plan(),key=mode==='single'?`single:${word}`:mode==='group'?`group:${word}`:`${mode}:${day}`;
    let deck=mode==='daily'?p.words:mode==='due'?due():mode==='mistakes'?state.mistakeBank:mode==='single'?[word]:mode==='bookmarks'?state.bookmarks:D.groups[word];
    deck=[...new Set(deck||[])].filter(w=>byWord[w]);
    if(!deck.length){toast(mode==='due'?'No scheduled reviews are due. Come back tomorrow or practice your mistakes.':'There are no words in this deck yet.');return;}
    if(!state.sessions[key]||restart||mode==='single'||((mode==='due'||mode==='mistakes')&&state.sessions[key].index>=state.sessions[key].words.length)){
      if(mode==='due')deck.sort((a,b)=>state.boxData[a].due.localeCompare(state.boxData[b].due));
      state.sessions[key]={mode,day,words:[...deck],index:0,layer:2,includeCovered:restart,linked:0,again:0,hard:0,good:0,ratedIndices:[]};
    }
    state.activeSessionKey=key;save();navigate('cards');
  }
  /* INLINE_CARDS */
  /* INLINE_ROUNDS */
  function wordRows(list,limit=48){return list.slice(0,limit).map(w=>`<article class="word-row"><div class="word-row-content"><div class="flex wrap"><h3>${w.word}</h3><span class="pill">G${w.groups.join(' / G')}</span>${state.boxData[w.word]?`<span class="pill green">Box ${state.boxData[w.word].box}</span>`:''}</div><p>${esc(w.gregmat_meaning)}</p><p lang="bn" class="bengali" style="font-size:13px">${esc(w.bengali)}</p></div>${button('Study','single','task-action',`data-word="${w.word}" aria-label="Study ${w.word}"`)}</article>`).join('');}
  function libraryView(){return heading('Your word library.','All 32 source groups, with the exact GregMat definitions and a memorable way in.',`<div class="flex">${button('Saved words','study-bookmarks','btn secondary')}${button('Settings','open-settings','btn secondary')}</div>`)+`<div class="filter-bar"><input id="library-search" type="search" placeholder="Search a word, definition or Bangla meaning…" aria-label="Search word library" value="${esc(listQuery)}"><select id="group-filter" aria-label="Filter vocabulary by group"><option value="all">All 32 groups</option>${Object.keys(D.groups).map(g=>`<option value="${g}" ${listGroup===g?'selected':''}>Group ${g}</option>`).join('')}</select><select id="status-filter" aria-label="Filter vocabulary by status">${[['all','All words'],['new','Not studied'],['learned','Learned · Box 2+'],['due','Due today'],['mistakes','Mistakes'],['saved','Saved']].map(([v,l])=>`<option value="${v}" ${listStatus===v?'selected':''}>${l}</option>`).join('')}</select></div><div id="library-results"></div>`;}
  function matchesQuery(w,q){return !q||[w.word,w.gregmat_meaning,w.bengali,w.mnemonic_bn].some(s=>s.toLowerCase().includes(q))||(q.length>=4&&C.editDistance(w.word,q,q.length>7?2:1)<=(q.length>7?2:1));}
  function updateLibrary(){
    const q=listQuery.trim().toLowerCase(),dueSet=new Set(due());
    const list=D.vocab.filter(w=>(listGroup==='all'||w.groups.includes(Number(listGroup)))&&matchesQuery(w,q)&&
      (listStatus==='all'||listStatus==='new'&&!state.boxData[w.word]?.seen||listStatus==='learned'&&state.boxData[w.word]?.box>=2||listStatus==='due'&&dueSet.has(w.word)||listStatus==='mistakes'&&state.mistakeBank.includes(w.word)||listStatus==='saved'&&state.bookmarks.includes(w.word)));
    list.sort((a,b)=>{const rank=w=>w.word===q?0:w.word.startsWith(q)?1:2;return rank(a)-rank(b)||a.word.localeCompare(b.word);});
    $('library-results').innerHTML=`<div class="list-count" role="status">${list.length} ${list.length===1?'word':'words'}${list.length>listLimit?` · showing ${listLimit}`:''}${listGroup!=='all'?` · Group ${listGroup}`:''}</div>${list.length?`<div class="word-list">${wordRows(list,listLimit)}</div>${list.length>listLimit?`<div class="mt">${button('Show more words','show-more','btn secondary')}</div>`:''}`:`<div class="empty"><h2>No words match yet.</h2><p>Try another spelling or remove a filter.</p></div>`}`;
  }
  function mistakesView(){return heading('Another look changes things.','Words marked “Not yet” and missed practice answers live here.',button('Retest these words','study-mistakes'))+`<div class="flex wrap mb"><span class="pill">${state.mistakeBank.length} WORDS TO REVISIT</span><span class="pill">${state.questionMistakes.length} CONTEXT QUESTIONS</span>${state.questionMistakes.length?button('Retry missed questions','retry-quiz','btn soft'):''}</div>${state.mistakeBank.length?`<div class="word-list">${wordRows(state.mistakeBank.map(w=>byWord[w]),960)}</div><p class="source-note">A “Got it” rating in the mistake retest removes a word from this bank. A correct context retry resolves that question separately.</p>`:`<div class="empty"><div class="eyebrow">A CLEAN SLATE</div><h2>No words waiting here.</h2><p>When you miss a word, this becomes a focused place to practice it again.</p>${button('Start today’s practice','start-quiz')}</div>`}`;}
  function trailView(){return heading('One trail. Twenty days.','Four learning days, then a day to connect and consolidate. The final summit revisits every group.',button('How it works','help','btn secondary'))+`<div class="day-grid">${D.plan.map(p=>`<button class="day-card ${state.currentDay===p.day?'active':''} ${state.completedDays.includes(p.day)?'complete':''}" data-action="jump-day" data-day="${p.day}"><small>${p.kind==='learn'?'LEARN':p.kind==='summit'?'GRAND SUMMIT':'CONSOLIDATE'}</small><strong>${String(p.day).padStart(2,'0')} ${state.completedDays.includes(p.day)?'✓':''}</strong><span>${p.day===20?'All 32 groups':`Groups ${p.groups[0]}–${p.groups.at(-1)}`}</span><small>${p.words.length} unique cards · ${dailyProgress(p.day)} reviewed</small><div class="bar"><span style="width:${dailyProgress(p.day)/p.words.length*100}%"></span></div></button>`).join('')}</div><section class="panel mt"><h3>Count the words, not the duplicates.</h3><p class="small muted mt">The supplied workbook has 30 entries in each of Groups 1–32. “Cumbersome” appears in Groups 11 and 22, so 960 placements represent 959 unique words. Both placements remain in the trail; learning progress is shared. Day 20 includes all 959 words.</p></section>`;}
  function drillsView(){return heading('Knowing is good. Using is better.','Practice the current day’s words and revisit earlier connections.',daySelect())+`<div class="grid3">${[
    ['cards','Learn → recall → repair','Ten words, then word-to-meaning and meaning-to-word MCQs from your GregMat definitions.','study-daily','Continue rounds'],
    ['check','Meaning connections','Fresh sets of four pairs. Compare both meanings, both mnemonics and the difference in usage.','start-matcher','Connect words'],
    ['clock','Polarity blitz','A 60-second drill on words with curated default tone. Context can still change the tone.','start-blitz','Play a minute'],
    ['mistakes','Mistake retest',`${state.mistakeBank.length} words and ${state.questionMistakes.length} context questions ready for another look.`,'open-mistakes','Open mistakes'],
    ['library','Daily words practice','Meaning recall plus source-based TC/SE for today’s vocabulary, from your supplied ETS and Manhattan material.','start-quiz','Practice today’s words'],
    ['star','Summit assessment','Cumulative meaning recall and the verified source-context bank across all 32 groups.','summit-quiz','Take assessment']
    ].map(([i,t,p,a,l])=>`<section class="panel drill-card"><div class="drill-icon">${icon(i)}</div><h3>${t}</h3><p>${p}</p>${button(l,a)}</section>`).join('')}</div><section class="panel mt"><div class="eyebrow">FROM YOUR MATERIAL</div><p class="small muted">Meaning questions use the supplied GregMat definitions. TC/SE use ${D.drills.length} verified adaptations of your ETS and Manhattan material, with a source reference on each answer. If today’s words have no verified context question, the set uses their GregMat meanings. All tested words and answer options stay within Groups 1–32.</p></section>`;}
  function eligibleWords(day){const p=plan(day),last=day===20?32:Math.max(...p.groups);return D.vocab.filter(w=>w.group<=last);}
  function makeRecall(w,pool){
    const related=new Set([w.word,...w.synonyms,...w.twins,...w.related,...w.family_ids.flatMap(id=>families[id].words)]);
    const candidates=pool.filter(x=>!related.has(x.word)&&x.gregmat_meaning!==w.gregmat_meaning);
    const others=C.shuffle(candidates).slice(0,3).map(x=>x.word);
    return {id:`RECALL:${w.word}`,kind:'recall',word:w.word,optionWords:C.shuffle([w.word,...others])};
  }
  function startQuiz(mode='daily',restart=false){
    if(state.quiz&&state.quiz.index<state.quiz.items.length&&!restart&&mode==='daily'&&state.quiz.mode==='daily'&&state.quiz.day===state.currentDay){navigate('quiz');return;}
    const day=mode==='summit'?20:state.currentDay,p=plan(day),pool=eligibleWords(day);let context=[];
    if(mode==='mistakes')context=state.questionMistakes.map(id=>byQuestion[id]).filter(Boolean);
    else{
      const available=D.drills.filter(q=>q.available_day<=day&&q.target_groups.some(g=>p.groups.includes(g)));
      for(const kind of ['TC','SE'])context.push(...C.shuffle(available.filter(q=>q.kind===kind)).sort((a,b)=>Number(!!b.source_reference)-Number(!!a.source_reference)).slice(0,mode==='summit'?5:2));
    }
    const targets=mode==='mistakes'?state.mistakeBank.map(w=>byWord[w]):p.words.map(w=>byWord[w]);
    const recalls=C.shuffle(targets).slice(0,mode==='summit'?20:Math.max(0,10-context.length)).map(w=>makeRecall(w,pool));
    const items=C.shuffle([...context.map(q=>({id:q.id,kind:q.kind,optionWords:C.shuffle(q.options)})),...recalls]);
    if(!items.length){toast('No missed questions to retry. Try a daily practice set.');return;}
    state.quiz={day,mode:mode==='mistakes'?'mistakes':'daily',items,index:0,selected:[],submitted:false,correct:0,results:[]};save();navigate('quiz');
  }
  function currentQuestion(){
    const item=state.quiz?.items[state.quiz.index];if(!item)return null;
    if(item.kind==='recall'){const w=byWord[item.word];if(!w)return null;if(!Array.isArray(item.optionWords)||item.optionWords.length!==4||new Set(item.optionWords).size!==4||!item.optionWords.includes(w.word)||item.optionWords.some(x=>!byWord[x]))item.optionWords=makeRecall(w,eligibleWords(state.quiz.day)).optionWords;return {...item,answers:[w.word],stem:`Which GregMat definition belongs to “${w.word}”?`,explanation:`${w.word}: ${w.gregmat_meaning}`,source_label:'GregMat definition recall'};}
    const trusted=byQuestion[item.id];return trusted?{...trusted,optionWords:trusted.options.length===item.optionWords?.length&&item.optionWords.every(w=>trusted.options.includes(w))?item.optionWords:C.shuffle(trusted.options)}:null;
  }
  function sanitizePracticeQuiz(progress){
    progress.questionMistakes=progress.questionMistakes.filter(id=>byQuestion[id]);
    const z=progress.quiz;if(!z)return;
    const valid=q=>q&&(q.kind==='recall'?!!byWord[q.word]:!!byQuestion[q.id]);
    const currentValid=valid(z.items[z.index]),newIndex=z.items.slice(0,z.index).filter(valid).length;
    z.items=z.items.filter(valid);z.index=Math.min(newIndex,z.items.length);
    const ids=new Set(z.items.map(q=>q.id));z.results=z.results.filter(q=>ids.has(q.id));z.correct=z.results.filter(q=>q.correct).length;
    if(!currentValid){z.selected=[];z.submitted=false;}
    if(!z.items.length)progress.quiz=null;
  }
  function quizView(){
    const qz=state.quiz;if(!qz)return heading('A little practice goes a long way.','Choose a day and start a mixed practice set.')+button('Start practice','start-quiz');
    if(qz.index>=qz.items.length)return heading('Practice, carried forward.',`Day ${qz.day} · ${qz.items.length} answers submitted.`)+`<div class="empty"><div class="eyebrow">PRACTICE COMPLETE</div><h2>${qz.correct} of ${qz.items.length} correct</h2><p>Missed words are waiting in your mistake bank. Correct context retries clear those questions; vocabulary is cleared after a successful card retest.</p><div class="flex wrap" style="justify-content:center">${button('Review mistakes','open-mistakes')}${button('Try a new set','new-quiz','btn secondary')}${button('Back to today','open-today','btn secondary')}</div></div>`;
    const q=currentQuestion();if(!q)return heading('This question is no longer available.','Start a fresh set from the bundled practice bank.')+button('New practice set','new-quiz');
    const required=q.answers.length,correct=qz.submitted&&q.answers.length===qz.selected.length&&q.answers.every(w=>qz.selected.includes(w));
    const options=q.optionWords.filter(w=>byWord[w]);
    return heading(q.kind==='SE'?'Two words. One meaning.':q.kind==='TC'?'Let the clues do the work.':'Recall the definition.',`Day ${qz.day} · Question ${qz.index+1} of ${qz.items.length}`,button('Practice hub','open-drills','btn secondary'))+`<div class="card-stage"><div class="session-bar"><span>${esc(q.source_label)}</span><span>${q.kind==='SE'?'SELECT TWO ANSWERS':'SELECT ONE ANSWER'}</span></div><div class="bar"><span style="width:${qz.index/qz.items.length*100}%"></span></div><section class="study-card"><div class="quiz-stem">${esc(q.stem).replace('___','<span class="blank">&nbsp;&nbsp;&nbsp;</span>')}</div><div class="quiz-options">${options.map((w,i)=>{const selected=qz.selected.includes(w),isCorrect=q.answers.includes(w);return `<button class="quiz-option ${selected?'selected':''} ${qz.submitted?(isCorrect?'correct':selected?'incorrect':''):''}" data-action="quiz-option" data-word="${w}" aria-pressed="${selected}" ${qz.submitted?'disabled':''}><span class="letter">${String.fromCharCode(65+i)}</span><span>${q.kind==='recall'?esc(byWord[w].gregmat_meaning):w}</span>${qz.submitted&&isCorrect?'<span aria-label="Correct answer">✓</span>':qz.submitted&&selected?'<span aria-label="Incorrect selection">×</span>':''}</button>`;}).join('')}</div>${qz.submitted?`<div class="quiz-feedback ${correct?'':'wrong'}" role="status"><h3>${correct?'That’s the connection.':'A useful one to revisit.'}</h3><p>${esc(q.explanation)}</p>${q.source_reference?`<details><summary>Source & adaptation</summary><p>${esc(q.source_reference)}</p><p>${esc(q.adaptation)}</p></details>`:''}<details><summary>Definitions, Bangla meanings & memory scenes</summary>${options.map(w=>`<div class="mt"><strong>${w}</strong> · ${esc(byWord[w].gregmat_meaning)}<p class="bengali" lang="bn">${esc(byWord[w].bengali)}</p><p class="small muted">${esc(state.customMnemonics[w]||byWord[w].mnemonic_bn)}</p></div>`).join('')}</details></div>`:''}<div class="mt flex between"><span class="small muted">${qz.submitted?`${qz.correct} correct so far`:`${qz.selected.length} / ${required} selected`}</span>${qz.submitted?button(qz.index===qz.items.length-1?'See results':'Next question '+icon('arrow',15),'quiz-next'):button('Check answer','quiz-submit','btn',qz.selected.length===required?'':'disabled')}</div></section></div>`;
  }
  function submitAnswer(){const z=state.quiz,q=currentQuestion();if(!q||z.submitted||z.selected.length!==q.answers.length)return;const correct=q.answers.every(w=>z.selected.includes(w));z.submitted=true;if(correct)z.correct++;
    if(!correct)q.answers.forEach(addWeak);z.results.push({id:q.id,correct});const st=dayStats(z.day);st.answered++;if(correct)st.correct++;
    if(!correct){const missed=[...new Set([...q.answers,...z.selected])];for(const w of missed)if(!state.mistakeBank.includes(w))state.mistakeBank.push(w);if(q.kind!=='recall'&&!state.questionMistakes.includes(q.id))state.questionMistakes.push(q.id);}
    else if(q.kind!=='recall')state.questionMistakes=state.questionMistakes.filter(id=>id!==q.id);
    C.recordActivity(state);save();render();}
  function startBlitz(){const pool=D.vocab.filter(w=>w.day<=state.currentDay&&['+','-','=','?'].includes(w.polarity));blitz={pool,order:C.shuffle(pool),index:0,score:0,attempts:0,remaining:60,end:Date.now()+60000,running:true,feedback:''};navigate('blitz');}
  function stopBlitz(){if(blitz)blitz.running=false;}
  function blitzView(){if(!blitz)return drillsView();const w=blitz.order[blitz.index%blitz.order.length];return heading('A minute of quick recall.','Default tone is a memory cue. A real sentence can change how a word feels.',button('Practice hub','open-drills','btn secondary'))+`<div class="card-stage"><section class="study-card"><div class="session-bar"><span id="blitz-countdown">${blitz.remaining}s remaining</span><span>${blitz.score} / ${blitz.attempts} correct</span></div>${blitz.running?`<div class="word-display"><h2>${w.word}</h2><p>${esc(w.gregmat_meaning)}</p></div><p class="muted small" style="text-align:center">Which is its default tone in the curated study sense?</p><div class="rating-grid">${[['+','Positive'],['-','Negative'],['=','Neutral'],['?','Context matters']].map(([v,l])=>button(l,'blitz-answer','rating',`data-tone="${v}"`)).join('')}</div>`:`<div class="empty"><h2>${blitz.score} / ${blitz.attempts} correct</h2><p>That is enough for one minute. Take the meanings back to real contexts.</p>${button('Play again','start-blitz')}</div>`}<p class="small muted mt" aria-live="polite">${esc(blitz.feedback)}</p></section></div>`;}
  function settingsView(){const boxes=[1,2,3,4,5].map(n=>Object.values(state.boxData).filter(w=>w.box===n).length);return heading('A workspace that stays yours.',window.AndroidApp?'Your progress is saved on this phone. Export a backup to carry it elsewhere.':'Your progress lives in this browser. A backup lets you carry it somewhere else.')+`<div class="settings-grid"><section class="panel"><h2>Study preferences</h2><div class="setting-row"><div><h3>Word minimization</h3><p>Include connected words in a ten-word round. Every word has its own mnemonic and quiz check. Successfully recalled partners do not repeat as new cards in later groups; scheduled reviews remain individual.</p></div><input type="checkbox" class="switch" id="minimization-toggle" aria-label="Enable word minimization" ${state.minimizationMode?'checked':''}></div><div class="setting-row"><div><h3>Color theme</h3><p>Choose a quieter background for your next session.</p></div>${button(state.theme==='dark'?'Use light theme':'Use dark theme','theme','btn secondary')}</div><div class="setting-row"><div><h3>Export your progress</h3><p>Includes boxes, due dates, sessions, mistakes, saved words and personal mnemonics.</p></div>${button('Export backup','export','btn secondary')}</div><div class="setting-row"><div><h3>Restore a backup</h3><p>Preview an imported backup before replacing progress. Download your current backup first if you want to keep both.</p></div>${button('Import backup','import','btn secondary')}</div><div class="setting-row"><div><h3>Start over</h3><p>Reset v5 progress in this browser. The original v4 storage is preserved. Export a backup first.</p></div>${button('Reset progress','reset-confirm','btn secondary')}</div><p class="source-note">${storageBroken?'Saving is unavailable; keep a downloaded backup.':state.lastSaved?`Last saved: ${esc(new Date(state.lastSaved).toLocaleString())}`:'Progress saves after your first action.'}</p></section><div><section class="panel"><h2>Five boxes. Better timing.</h2><p class="small muted mt">“Got it” promotes one box. “Almost” keeps the box and reviews tomorrow. “Not yet” returns the word to Box 1 and adds it to mistakes.</p><div class="box-chart">${boxes.map((n,i)=>`<div class="box-column"><small>BOX ${i+1}</small><strong>${n}</strong><small>${C.BOX_DAYS[i+1]}d</small></div>`).join('')}</div><p class="source-note">Review intervals use calendar dates, independently of your selected sprint day. Box 4+ counts as strong recall; it is not a guarantee of permanent mastery.</p></section><section class="panel mt"><h3>From the supplied sources</h3><p class="small muted mt">Group membership: ${esc(D.sources.workbook)}.<br>Definitions: ${esc(D.sources.markdown)}.</p><p class="small muted mt">959 unique words · 960 group placements. “Cumbersome” occurs twice. “Stinting” uses the markdown lemma “stint”.</p>${button('Read the study guide','help','btn link')}</section></div></div>`;}
  function render(){
    const previous=document.activeElement,wasMain=$('main').contains(previous),action=previous?.dataset?.action,word=previous?.dataset?.word,rating=previous?.dataset?.rating;
    nav();const renderers={today:todayView,cards:cardsView,round:roundView,'round-quiz':roundQuizView,library:libraryView,mistakes:mistakesView,trail:trailView,drills:drillsView,quiz:quizView,matcher:matcherView,blitz:blitzView,settings:settingsView,journey:guidedView,'journey-review':guidedView};$('main').innerHTML=(renderers[view]||todayView)();if(view==='library')updateLibrary();
    if(wasMain&&action){const next=[...$('main').querySelectorAll('[data-action]')].find(b=>!b.disabled&&b.dataset.action===action&&(!word||b.dataset.word===word)&&(!rating||b.dataset.rating===rating))||$('main').querySelector(action==='rate'?'[data-action="reveal"]':action==='quiz-submit'?'[data-action="quiz-next"]':'[data-action="quiz-submit"]');if(next&&!next.disabled)next.focus({preventScroll:true});}
  }
  function modal(title,body){lastFocus=document.activeElement;$('modal-title').textContent=title;$('modal-body').innerHTML=body;if(!$('modal').open)$('modal').showModal();}
  function openSearch(){modal('Find a word.',`<input type="search" id="modal-search" aria-label="Search all vocabulary" placeholder="Word, meaning or memory scene…"><div id="search-results"><p class="muted small">Search all 959 words. Try “laconic”, “confused” or “quiet”.</p></div>`);$('modal-search').focus();}
  function searchModal(query){const q=query.trim().toLowerCase();if(!q){$('search-results').innerHTML='<p class="muted small">Start typing to find a word.</p>';return;}const found=D.vocab.filter(w=>matchesQuery(w,q)).sort((a,b)=>(a.word===q?-1:b.word===q?1:a.word.localeCompare(b.word)));$('search-results').innerHTML=`<p class="list-count" role="status">${found.length} matches${found.length>24?' · first 24 shown':''}</p><div class="word-list">${wordRows(found,24)}</div>${found.length?'':'<p class="small muted">No matches. Try a shorter spelling or another meaning.</p>'}`;}
  function help(){modal('Small rounds. Stronger recall.',`<div class="help-copy"><h3>Ten actual words per round</h3><p>Each round contains at most ten new words, including connected partners from later groups. Equal word nodes show their own meaning, mnemonic and tone. On a phone, swipe between nodes. Start with short English and Bengali meanings; Space or a card click reveals the full meaning, mnemonic, tone and example. Arrow keys browse backward and forward.</p><h3>Recall, then repair</h3><p>Meaning-only MCQs check each word in both directions: word to definition and definition to word. A wrong answer shows a memory cue and returns in another format after intervening questions when possible. After two repair attempts, a stubborn word remains in the weak-word queue. Up to three earlier missed words return in the next round.</p><h3>Exposure is different from recall</h3><p>Reading records exposure. A correct quiz answer records retrieval. The dashboard reports first-try answers separately from repair answers. Connected partners count toward later group coverage only after individual successful recall.</p><h3>Polarity</h3><p>Positive and negative describe the usual connotation in the supplied study sense. Neutral describes a quality without built-in praise or blame. Context matters marks words whose evaluation depends on the sense or subject. Negation and contrast can change the whole sentence's direction.</p><h3>Study time and weak words</h3><p>The timer starts in learning and practice, pauses on hidden tabs or manual pause, and stops after two minutes without interaction. The dashboard rotates weak-word mnemonics every ten seconds; Pause and Next are available.</p><h3>Your twenty-day plan</h3><p>Four learning days, then consolidation. Days 5, 10 and 15 review eight groups; day 20 covers all 32. Finish learning rounds and their quizzes, due reviews and bedtime recall before marking the day complete.</p><h3>Sources and backups</h3><p>Groups and definitions come from your workbook and GregMat markdown. Funny mnemonic scenes and sound hooks are invented associations, not etymology. TC/SE context practice uses only explicitly labeled adaptations of your supplied ETS and Manhattan questions. Meaning quizzes use your supplied GregMat definitions. Export progress from Settings to keep a copy.</p></div>`);}
  function showFamilies(){const available=D.families.map(f=>({...f,available:f.words.filter(w=>byWord[w].day<=state.currentDay)})).filter(f=>f.available.length>=2);modal('Connections worth noticing.',`<p class="small muted mb">Related families, not universal SE equivalents. Read each source definition before substituting a word.</p>${available.map(f=>`<section class="panel family-card"><h3>${esc(f.name)}</h3><p class="bengali" lang="bn">${esc(f.bengali)}</p><div class="twin-tags">${f.available.map(w=>button(`${w} · G${byWord[w].group}`,'single','tag',`data-word="${w}"`)).join('')}</div></section>`).join('')}`);}
  function download(filename,contents){if(window.AndroidApp?.saveFile){window.AndroidApp.saveFile(filename,contents);return;}const url=URL.createObjectURL(new Blob([contents],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function exportBackup(){download(`vocab-sprint-${C.localDate()}.json`,JSON.stringify({app:'Vocab Sprint',version:5,exportedAt:new Date().toISOString(),state},null,2));toast('Progress backup downloaded.');}
  function editMnemonic(word){modal(`Your memory scene · ${word}`,`<label class="small muted" for="mnemonic-input">Keep the meaning accurate. Make the story yours.</label><textarea id="mnemonic-input" maxlength="1200">${esc(state.customMnemonics[word]||byWord[word].mnemonic_bn)}</textarea><div class="modal-actions">${button('Use original','mnemonic-original','btn secondary',`data-word="${word}"`)}${button('Save scene','mnemonic-save','btn',`data-word="${word}"`)}</div>`);$('mnemonic-input').focus();}
  function jumpDay(day){if(!Number.isInteger(day)||day<1||day>20)return;state.currentDay=day;state.activeSessionKey=state.sessions[`daily:${day}`]?`daily:${day}`:'';save();navigate('today');}
  function tick(){if(blitz?.running){blitz.remaining=Math.max(0,Math.ceil((blitz.end-Date.now())/1000));if($('blitz-countdown'))$('blitz-countdown').textContent=blitz.remaining+'s remaining';if(!blitz.remaining){stopBlitz();if(view==='blitz')render();}}}
  const actions={
    'reveal-study':()=>revealStudy(),'reveal-study-word':b=>revealStudy(b.dataset.word),
    'round-back':roundBack,'card-back':()=>moveStudyCard(-1),'card-next':()=>moveStudyCard(1),
    'review-round':reviewRound,'resume-round-quiz':()=>navigate('round-quiz'),
    'review-day':()=>startStudy('daily',null,true),
    'round-next':exploreNext,'round-submit':submitRoundAnswer,'round-question-next':nextRoundQuestion,
    'round-option':b=>{const r=activeRound();if(!r||r.submitted)return;r.answer=b.dataset.value;save();render();},
    'study-clock-toggle':()=>{state.learning.paused=!state.learning.paused;lastInteraction=Date.now();save();render();},
    'weak-next':()=>{weakCursor++;weakRotationAt=Date.now();if($('weak-recall'))$('weak-recall').innerHTML=weakRecallCard();},
    'weak-pause':()=>{weakPaused=!weakPaused;if($('weak-recall'))$('weak-recall').innerHTML=weakRecallCard();},
    'weak-practice':b=>weakPractice(b.dataset.word),'weak-answer':answerWeak,
    'bedtime':()=>{const pool=recallWords();if(pool.length)weakPractice(pool[0]);else startStudy('bookmarks');},
    'open-today':()=>navigate('today'),'open-trail':()=>navigate('trail'),'open-drills':()=>navigate('drills'),'open-mistakes':()=>navigate('mistakes'),'open-settings':()=>navigate('settings'),
    'study-daily':()=>startStudy('daily'),'study-due':()=>startStudy('due'),'study-mistakes':()=>startStudy('mistakes'),'study-bookmarks':()=>startStudy('bookmarks'),
    'single':b=>startStudy('single',b.dataset.word),'jump-day':b=>jumpDay(Number(b.dataset.day)),
    'restart-deck':()=>{const s=session();s.index=0;s.layer=2;s.includeCovered=true;s.linked=0;s.again=0;s.hard=0;s.good=0;s.ratedIndices=[];resetStudyReveal();save();render();},
    'rate':b=>rateCurrentCard(Number(b.dataset.rating)),
    'bookmark':b=>{const w=b.dataset.word;state.bookmarks=state.bookmarks.includes(w)?state.bookmarks.filter(x=>x!==w):[...state.bookmarks,w];save();render();},
    'speak':b=>{if(window.AndroidApp?.speak){window.AndroidApp.speak(b.dataset.word);return;}if(!('speechSynthesis'in window)){toast('Speech is unavailable in this browser.');return;}const u=new SpeechSynthesisUtterance(b.dataset.word);u.lang='en-US';u.rate=.82;u.onerror=()=>toast('A local English voice is unavailable. Install one in your device settings.');speechSynthesis.cancel();speechSynthesis.speak(u);},
    'complete-day':()=>{if(!tasks().every(Boolean))return;if(!state.completedDays.includes(state.currentDay))state.completedDays.push(state.currentDay);C.recordActivity(state);save();modal('A day well spent.',`<p class="muted">Day ${state.currentDay} is complete. Your progress is saved. ${state.currentDay<20?'Continue when you are ready.':'You have reached the final day. Keep using due review to maintain recall.'}</p><div class="modal-actions">${button('Stay here','close-modal','btn secondary')}${state.currentDay<20?button('Go to the next day','next-day'):button('Open review','study-due')}</div>`);},
    'next-day':()=>jumpDay(state.currentDay+1),'theme':()=>{state.theme=state.theme==='dark'?'light':'dark';save();render();},
    'search':openSearch,'close-modal':()=>$('modal').close(),'help':help,'families':showFamilies,'edit-mnemonic':b=>editMnemonic(b.dataset.word),
    'mnemonic-save':b=>{const note=$('mnemonic-input').value.trim();if(!note){toast('Write a memory scene, or choose Use original.');return;}state.customMnemonics[b.dataset.word]=note;save();$('modal').close();render();},
    'mnemonic-original':b=>{delete state.customMnemonics[b.dataset.word];save();$('modal').close();render();},
    'show-more':()=>{listLimit+=48;updateLibrary();},'start-quiz':()=>startQuiz(),'new-quiz':()=>startQuiz('daily',true),'retry-quiz':()=>startQuiz('mistakes',true),'summit-quiz':()=>startQuiz('summit',true),
    'quiz-option':b=>{const z=state.quiz,q=currentQuestion(),w=b.dataset.word;if(!q||z.submitted)return;z.selected=z.selected.includes(w)?z.selected.filter(x=>x!==w):z.selected.length<q.answers.length?[...z.selected,w]:q.answers.length===1?[w]:z.selected;save();render();},
    'quiz-submit':submitAnswer,'quiz-next':()=>{const z=state.quiz;if(!z?.submitted)return;z.index++;z.selected=[];z.submitted=false;save();render();},
    'start-matcher':startMatcher,'match-tile':b=>matchTile(b.dataset.word),'matcher-continue':()=>{matcher.selected=[];matcher.checked=false;matcher.feedback='';render();},
    'start-blitz':startBlitz,'blitz-answer':b=>{if(!blitz?.running||Date.now()>=blitz.end){tick();return;}const w=blitz.order[blitz.index%blitz.order.length],correct=b.dataset.tone===w.polarity;blitz.attempts++;if(correct)blitz.score++;blitz.feedback=`${w.word}: ${toneNames[w.polarity]}. ${toneCopy(w)}`;if(!correct){addWeak(w.word);if(!state.mistakeBank.includes(w.word))state.mistakeBank.push(w.word);}blitz.index++;C.recordActivity(state);save();render();},
    'export':exportBackup,'export-corrupt':()=>download('vocab-sprint-unreadable-original.json',corruptRaw),'import':()=>$('import-file').click(),
    'import-apply':()=>{if(!pendingImport)return;state=pendingImport;pendingImport=null;storageBroken=false;corruptRaw='';$('storage-warning').hidden=true;save();$('modal').close();navigate('settings');toast('Progress restored from the validated backup.');},
    'reset-confirm':()=>modal('Reset this browser’s progress?',`<p class="muted">This clears v5 study progress, mistakes, saved words and custom memory scenes. Download a backup first if you want to recover them.</p><div class="modal-actions">${button('Export first','export','btn secondary')}${button('Cancel','close-modal','btn secondary')}${button('Reset v5 progress','reset-apply','btn danger')}</div>`),
    'reset-apply':()=>{state=C.normalize(C.freshState(),words);storageBroken=false;corruptRaw='';$('storage-warning').hidden=true;save();$('modal').close();navigate('today');toast('V5 progress reset. The old v4 state was preserved.');}
  };
  document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b&&!b.disabled){try{actions[b.dataset.action]?.(b);}catch(error){console.error(error);toast('That action could not finish. Your saved progress has been kept.');}}const a=e.target.closest('a[href^="#"]');if(a&&a.getAttribute('href')!=='#main'){e.preventDefault();navigate(a.getAttribute('href').slice(1));}});
  document.addEventListener('change',e=>{const t=e.target;if(t.id==='day-select')jumpDay(Number(t.value));if(t.id==='group-filter'){listGroup=t.value;listLimit=48;updateLibrary();}if(t.id==='status-filter'){listStatus=t.value;listLimit=48;updateLibrary();}if(t.id==='minimization-toggle'){state.minimizationMode=t.checked;save();}if(t.id==='bundle-toggle'){state.minimizationMode=t.checked;save();render();}if(t.id==='reflection'){state.routineChecks[state.currentDay]||={};state.routineChecks[state.currentDay].reflect=t.checked;if(t.checked)C.recordActivity(state);save();render();}});
  document.addEventListener('input',e=>{if(e.target.id==='round-answer'){const r=activeRound();if(r&&!r.submitted){r.answer=e.target.value;const b=document.querySelector('[data-action="round-submit"]');if(b)b.disabled=!r.answer.trim();save();}}if(e.target.id==='library-search'){listQuery=e.target.value;listLimit=48;updateLibrary();}if(e.target.id==='modal-search')searchModal(e.target.value);});
  $('import-file').addEventListener('change',async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>8*1024*1024){toast('Choose a progress backup smaller than 8 MB.');return;}try{const raw=JSON.parse(await file.text()),incoming=importableProgress(raw);pendingImport=C.normalize(incoming,words,true);sanitizePracticeQuiz(pendingImport);modal('Restore this progress?',`<p class="muted">${Object.keys(pendingImport.boxData).length} studied words · ${pendingImport.mistakeBank.length} mistakes · ${pendingImport.completedDays.length} completed days.</p><p class="small muted mt">Restoring replaces this browser’s current guided progress. Export the current progress first to keep a copy.</p><div class="modal-actions">${button('Export current','export','btn secondary')}${button('Cancel','close-modal','btn secondary')}${button('Restore backup','import-apply')}</div>`);}catch(error){pendingImport=null;toast('This file is not a valid Vocab Sprint progress backup. Nothing was changed.');}});
  /* INLINE_JOURNEY */
  /* INLINE_SANDBOX */
  $('modal').addEventListener('close',()=>{if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});});
  document.addEventListener('keydown',e=>{
    if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.target.isContentEditable||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||$('modal').open||e.repeat)return;
    if(e.key==='/'){e.preventDefault();openSearch();return;}
    if(['round','cards'].includes(view)){
      if(e.key===' '||e.key==='Spacebar'){e.preventDefault();revealStudy();return;}
      if(e.key==='ArrowLeft'){e.preventDefault();view==='round'?roundBack():moveStudyCard(-1);return;}
      if(e.key==='ArrowRight'){e.preventDefault();view==='round'?exploreNext():moveStudyCard(1);return;}
      if(view==='cards'&&['1','2','3'].includes(e.key)){e.preventDefault();rateCurrentCard(Number(e.key));return;}
    }
    if(view==='round-quiz'&&activeRound()?.phase==='quiz'){
      const r=activeRound();
      if(e.key==='ArrowLeft'){e.preventDefault();reviewRound();return;}
      if(e.key==='ArrowRight'&&r.submitted){e.preventDefault();nextRoundQuestion();return;}
      if(e.key==='Enter'){if(e.target.tagName==='BUTTON'&&!['round-option','round-submit','round-question-next'].includes(e.target.dataset?.action))return;e.preventDefault();r.submitted?nextRoundQuestion():submitRoundAnswer();return;}
      const choice='1234'.indexOf(e.key.toLowerCase())>=0?'1234'.indexOf(e.key):'abcd'.indexOf(e.key.toLowerCase());
      if(choice>=0&&!r.submitted){e.preventDefault();const q=r.queue[r.index];r.answer=q.options[choice]||'';save();render();}
    }
  });
  window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)||'today',false));
  window.addEventListener('pagehide',save);
  document.addEventListener('visibilitychange',()=>{lastStudyTick=Date.now();tick();if(document.visibilityState==='hidden')save();});
  initStorage();
  // Only trust quiz identifiers from the bundled bank after loading a backup.
  sanitizePracticeQuiz(state);
  const route=location.hash.slice(1);view=['today','cards','round','round-quiz','drills','trail','library','mistakes','settings','quiz','journey','journey-review'].includes(route)?route:'today';
  if(SANDBOX&&previewScreens.some(([key])=>key===route)&&route!=='today')openSandboxScreen(route);
  for(const event of ['pointerdown','keydown','scroll','input'])document.addEventListener(event,()=>{lastInteraction=Date.now();},{passive:true});
  document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='round-answer'){e.preventDefault();submitRoundAnswer();}});
  setInterval(learningTick,1000);setInterval(()=>{if(isStudying())save();},10000);
  render();tick();setInterval(tick,250);
  Object.defineProperty(window,'SprintNativeBack',{value:()=>{
    if($('modal').open){$('modal').close();return true;}
    if(view==='round-quiz'&&activeRound()?.phase==='quiz'){reviewRound();return true;}
    if(view==='round'&&activeRound()?.cursor>0){roundBack();return true;}
    if(view==='cards'&&session()?.index>0){moveStudyCard(-1);return true;}
    if(view!=='today'){save();navigate('today');return true;}
    save();return false;
  },writable:false});
  // A deliberately read-only diagnostics surface for packaged regression tests.
  Object.defineProperty(window,'SprintDiagnostics',{value:Object.freeze({snapshot:()=>JSON.parse(JSON.stringify(state)),data:()=>D}),writable:false});
})();
