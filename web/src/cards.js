function learningSet(word){return synonymSets[word.learning_set_id]||null;}
function visibleStudyNames(current){
  const name=current.words[current.index],pack=learningSet(byWord[name]);
  return ['due','mistakes'].includes(current.mode)?[name]:[name,...(pack?.words||[]).filter(w=>w!==name).slice(0,2)];
}
function rateCurrentCard(rating){
  const current=session();if(!current||current.index>=current.words.length||![1,2,3].includes(rating))return;
  current.ratedIndices||=[];
  if(current.ratedIndices.includes(current.index)){moveStudyCard(1);return;}
  const word=current.words[current.index];C.rate(state,word,rating,current.mode,current.day);
  if(rating<3)addWeak(word);
  else if(state.learning.weak[word])state.learning.weak[word].streak++;
  current.ratedIndices.push(current.index);
  current[rating===1?'again':rating===2?'hard':'good']++;current.index++;resetStudyReveal();save();render();window.scrollTo({top:0,behavior:'instant'});
}
function moveStudyCard(direction){const current=session();if(!current)return;const next=Math.max(0,Math.min(current.words.length,current.index+direction));if(next===current.index)return;current.index=next;resetStudyReveal();save();render();window.scrollTo({top:0,behavior:'instant'});}
function cardsView(){
  const current=session();
  if(!current||(current.mode==='daily'&&!current.includeCovered))return heading('A little learning. Then a little recall.','Ten words per round, with connected meanings and individual mnemonics.')+`<div class="grid3">${[
    ['Learn in tens','Connected words, then a meaning-only quiz.','study-daily'],
    ['Due for review',`${due().length} words ready for spaced recall.`,'study-due'],
    ['Revisit weak words',`${state.mistakeBank.length} words need another look.`,'study-mistakes']
  ].map(([t,p,a])=>`<section class="panel drill-card"><h3>${t}</h3><p>${p}</p>${button('Start',a)}</section>`).join('')}</div>`;
  if(current.index>=current.words.length)return heading('You reached the end.',`${current.good} recalled · ${current.hard+current.again} need another look.`)+`<section class="round-result"><h2>Keep the connection.</h2><p>Browse back whenever you want.</p><div class="flex wrap mt">${button('← Previous word','card-back','btn secondary')}${button('Back to today','open-today')}${button('Learn the next ten','study-daily','btn secondary')}</div></section>`;
  const names=visibleStudyNames(current),pack=packFor(names),word=byWord[current.words[current.index]],isReview=['due','mistakes'].includes(current.mode);
  return `<div class="learning-top"><div><span class="eyebrow">${isReview?'SPACED RECALL':'WORD CONNECTIONS'}</span><h1>${isReview?'Bring it back to mind.':'Learn the whole connection.'}</h1></div>${studyClock()}</div><div class="round-meter"><span>${current.index+1} / ${current.words.length}</span>${button('Learn in tens','study-daily','text-button')}</div>`+
    conceptMap(names,{label:pack?.sense||'Meaning → memory → recall',note:pack?.note||'',progress:isReview?'Recall the meaning aloud before choosing your rating.':'Each word has its own hook. The ten-word rounds check every word individually.'})+
    studyNavigation('card-back','card-next',current.index===0)+`<div class="review-actions"><span class="small muted">${current.ratedIndices?.includes(current.index)?'Already rated · browse freely':'Rate your recall of'} <b>${word.word}</b></span><div>${[[1,'Not yet'],[2,'Almost'],[3,'Got it']].map(([n,l])=>button(l,'rate',`btn ${n===3?'':'secondary'}`,`data-rating="${n}" ${current.ratedIndices?.includes(current.index)?'disabled':''}`)).join('')}</div></div>`;
}
