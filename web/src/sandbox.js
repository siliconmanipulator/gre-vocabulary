/* A separate, labelled UI review save. Never open or promote real progress here. */
const previewScreens=[['today','Today / Resume'],['revision','Morning spelling'],['learn','Connected-word cards'],['meaning','Meaning quiz'],['meaning-result','Meaning results'],['context','Original TC/SE'],['context-review','TC/SE review'],['summary','Session summary'],['trail','Mountain progress'],['library','Word library'],['mistakes','Mistake recovery'],['drills','Optional practice'],['settings','Settings']];
const PREVIEW_NOTES='vocab_sprint_preview_notes_v1',RESET_RECOVERY='vocab_sprint_before_reset_v6';
let annotationMode=false,pendingAnnotation=null,previewNotes=[],previewNotesWritable=true;
const previewClone=value=>JSON.parse(JSON.stringify(value));
function importableProgress(raw){
  if(!raw||typeof raw!=='object'||raw.previewOnly===true||raw.state?.previewOnly===true||(raw.app&&raw.app!=='Vocab Sprint'))throw new Error('Preview data cannot replace real learning progress.');
  return raw.app==='Vocab Sprint'?raw.state:raw;
}

function createSandboxState(){
  const sample=C.normalize(C.freshState(),words),j=sample.journey,date=J.today();
  sample.learning.paused=true;
  const names=['candid','lucid','opaque','dubious','verbose','laconic','placid','intransigent','equivocal'].filter(w=>byWord[w]);
  names.forEach((word,i)=>{
    J.assess(j,word,true,true,J.plus(date,-4),'preview-a:'+word);
    if(i<3)J.assess(j,word,false,false,J.plus(date,-2),'preview-miss:'+word);
    else if(i<6)J.assess(j,word,true,false,J.plus(date,-2),'preview-b:'+word);
    j.evidence[word].due=date;
  });
  J.begin(j,D,date);
  return sample;
}
function previewScreen(){
  if(view==='journey')return currentGuided()?.stage||'today';
  if(view==='journey-review')return 'revision';
  if(['cards','round'].includes(view))return 'learn';
  if(view==='round-quiz')return 'meaning';
  if(['quiz','matcher','blitz'].includes(view))return 'context';
  return previewScreens.some(([key])=>key===view)?view:'today';
}
function adjacentPreview(delta=1){const i=previewScreens.findIndex(([key])=>key===previewScreen());return previewScreens[(Math.max(0,i)+delta+previewScreens.length)%previewScreens.length][0];}
function openSandboxScreen(key){
  if(!SANDBOX||!previewScreens.some(([id])=>id===key))return;
  annotationMode=false;
  if(['today','trail','library','mistakes','drills','settings'].includes(key)){save();navigate(key);return;}
  const j=journey(),d=J.ensureDay(j,D),s=d.sessions.find(x=>x.stage!=='done')||d.sessions[0];
  // Screen previews can reopen a sample session without completing prior blocks.
  for(const session of d.sessions)if(session!==s&&session.number<s.number)session.stage='done';
  s.browsing=false;state.learning.paused=true;
  if(key==='revision')s.revision=J.assessment(J.revision(j).filter(w=>!s.words.includes(w)).slice(0,10),true);
  if(['meaning','meaning-result','context','context-review','summary'].includes(key)){
    s.words.forEach(word=>J.introduce(j,word));s.page=s.groups.length;s.cursor=0;
    s.meaning||=J.assessment(s.words);
  }
  if(key==='meaning'&&s.meaning.done)s.meaning=J.assessment(s.words);
  if(key==='meaning-result'){
    s.meaning=J.assessment(s.words);
    s.meaning.results=s.meaning.queue.map((q,i)=>({...q,correct:i%5!==0,couldnt:false}));
    for(const r of s.meaning.results)J.assess(j,r.word,r.correct,r.kind==='typed',J.today(),'preview-result:'+ ++j.serial+':'+r.word);
    s.meaning.index=s.meaning.queue.length;s.meaning.done=true;
  }
  if(['context','context-review','summary'].includes(key)){
    const c=J.chooseContext(j,D,s);
    if(key==='context'&&c.submitted){s.context=null;J.chooseContext(j,D,s);}
    if(key==='context-review'){
      c.answers=c.ids.map((id,i)=>({selected:trustedOriginals[id].answers.map(group=>[...group]),couldnt:i===0,declaredFailure:i===0}));
      c.submitted=true;c.reviewIndex=0;c.diagnoses={};c.applied=[];
    }
    if(key==='summary')s.reviewDone=true;
  }
  if(key==='learn'){s.cursor=0;resetStudyReveal();}
  s.stage=key;save();navigate('journey');
}
function reviewToolbar(){
  const next=adjacentPreview();
  if(!SANDBOX)return `<div class="review-controls-inner"><span class="review-label">UI open for feedback</span><div class="review-buttons">${window.AndroidApp?'':`<a class="btn secondary" href="sandbox.html#today">Open sandbox ↗</a><a class="btn secondary" href="sandbox.html#${next}">Skip / explore →</a>`}${button('Reset progress','reset-confirm','text-button')}</div></div>`;
  return `<div class="review-controls-inner"><div class="review-status"><b>PREVIEW SANDBOX</b><span>Sample progress · your real learning stays untouched</span></div><div class="review-buttons"><label class="screen-picker">Screen<select id="preview-screen" aria-label="Jump to any preview screen">${previewScreens.map(([key,label])=>`<option value="${key}" ${key===previewScreen()?'selected':''}>${label}</option>`).join('')}</select></label>${button('← Previous','preview-back','btn secondary')}${button('Skip →','preview-skip','btn')}${button(annotationMode?'Cancel annotation':'Annotate','preview-annotate','btn secondary',`aria-pressed="${annotationMode}"`)}${button('Notes · '+previewNotes.length,'preview-notes','text-button')}${button('Reset sandbox','reset-confirm','text-button')}<a class="text-button" href="index.html#today">Return to real app ↗</a></div>${annotationMode?'<p class="annotation-instruction" role="status">Click an element below to leave a note. Escape cancels. Keyboard: focus an element, then press Alt+N.</p>':''}</div>`;
}
function loadPreviewNotes(){
  try{const raw=JSON.parse(localStorage.getItem(PREVIEW_NOTES)||'[]');if(!Array.isArray(raw))throw new Error('Invalid notes shape');previewNotes=raw.filter(n=>n&&typeof n.comment==='string'&&typeof n.screen==='string').slice(-500).map(n=>({id:String(n.id||''),screen:n.screen.slice(0,60),quote:String(n.quote||'').slice(0,500),selector:String(n.selector||'').slice(0,600),comment:n.comment.slice(0,4000),createdAt:String(n.createdAt||''),question:String(n.question||'').slice(0,80),words:Array.isArray(n.words)?n.words.filter(w=>byWord[w]).slice(0,15):[]}));}
  catch(e){previewNotes=[];previewNotesWritable=false;toast('Saved notes could not be read. They were kept unchanged. Export new notes before closing.');}
}
function annotationSelector(node){
  const parts=[];let n=node;
  while(n&&n.id!=='main'&&parts.length<5){
    const tag=String(n.tagName||'').toLowerCase();if(!tag)break;
    if(n.id){parts.unshift('#'+n.id.replace(/[^a-zA-Z0-9_-]/g,''));break;}
    const siblings=n.parentElement?[...n.parentElement.children].filter(x=>x.tagName===n.tagName):[];
    parts.unshift(tag+(siblings.length>1?`:nth-of-type(${siblings.indexOf(n)+1})`:''));n=n.parentElement;
  }
  return '#main '+parts.join(' > ');
}
function beginAnnotation(target){
  if(!SANDBOX||!target||!$('main').contains(target))return;
  annotationMode=false;
  const s=currentGuided(),question=s?.context?.ids[s.stage==='context-review'?s.context.reviewIndex:s.context.index]||'';
  pendingAnnotation={screen:previewScreen(),quote:String(target.innerText||target.textContent||target.getAttribute?.('aria-label')||target.value||target.tagName).trim().slice(0,500),selector:annotationSelector(target),question,words:currentStudyNames().filter(w=>byWord[w]).slice(0,15)};
  render();
  modal('What would you change?',`<p class="source-note">${esc(previewScreens.find(([key])=>key===pendingAnnotation.screen)?.[1]||pendingAnnotation.screen)}</p><blockquote class="annotation-quote">${esc(pendingAnnotation.quote)}</blockquote><label class="fill-label" for="preview-note">Your feedback</label><textarea id="preview-note" class="annotation-input" maxlength="4000" rows="5" placeholder="Layout, wording, flow, spacing…"></textarea><p class="source-note">Saved locally in this sandbox. Export notes to share them.</p><div class="modal-actions">${button('Cancel','close-modal','btn secondary')}${button('Save note','preview-note-save')}</div>`);
  $('preview-note').focus();
}
function saveAnnotation(){
  const comment=$('preview-note').value.trim();if(!pendingAnnotation||!comment){toast('Write a note before saving.');return;}
  if(previewNotes.length>=500){toast('Export your notes before adding more than 500.');return;}
  const note={...pendingAnnotation,id:'note-'+Date.now()+'-'+(previewNotes.length+1),comment:comment.slice(0,4000),createdAt:new Date().toISOString()};
  previewNotes.push(note);
  try{if(!previewNotesWritable)throw new Error('Preserve unreadable original notes');localStorage.setItem(PREVIEW_NOTES,JSON.stringify(previewNotes));}catch(e){toast('Note is held in this tab only. Export notes before closing.');$('modal').close();render();return;}
  pendingAnnotation=null;$('modal').close();render();toast('Note '+previewNotes.length+' saved.');
}
function showPreviewNotes(){
  modal('Your UI notes · '+previewNotes.length,`<p class="muted">Screen, selected element and current word/question references are included in the export. Nothing is sent automatically.</p><div class="annotation-notes">${previewNotes.length?previewNotes.map((n,i)=>`<article><h3>${i+1}. ${esc(previewScreens.find(([key])=>key===n.screen)?.[1]||n.screen)}</h3><blockquote>${esc(n.quote)}</blockquote><p>${esc(n.comment)}</p></article>`).join(''):'<p class="mt">Choose Annotate, then click an element on any screen.</p>'}</div><div class="modal-actions">${button('Close','close-modal','btn secondary')}${button('Export notes','preview-notes-export','btn',previewNotes.length?'':'disabled')}</div>`);
}
function resetPreview(){
  state=createSandboxState();matcher=null;blitz=null;pendingImport=null;pendingAnnotation=null;annotationMode=false;storageBroken=false;corruptRaw='';guidedNotice='';$('storage-warning').hidden=true;$('modal').close();resetStudyReveal();save();navigate('today');toast('Sandbox restarted. Your notes and real progress are kept.');
}
const actualResetConfirm=actions['reset-confirm'],actualReset=actions['reset-apply'],actualExport=exportBackup;
actions['reset-confirm']=()=>SANDBOX?modal('Reset sandbox progress?',`<p>Restart the sample learning state. Your annotations and real learning progress are kept.</p><div class="modal-actions">${button('Cancel','close-modal','btn secondary')}${button('Reset sandbox','reset-apply')}</div>`):actualResetConfirm();
actions['reset-apply']=()=>{
  if(SANDBOX){resetPreview();return;}
  try{localStorage.setItem(RESET_RECOVERY,JSON.stringify(state));}
  catch(e){toast('Reset stopped because its recovery copy could not be saved. Export your progress first.');return;}
  actualReset();
};
exportBackup=function(){
  if(!SANDBOX){actualExport();return;}
  download(`vocab-preview-${C.localDate()}.json`,JSON.stringify({app:'Vocab Sprint Preview',previewOnly:true,version:6,state},null,2));toast('Sandbox backup exported. It cannot be imported as real learning.');
};
actions.export=exportBackup;
Object.assign(actions,{
  'preview-back':()=>openSandboxScreen(adjacentPreview(-1)),
  'preview-skip':()=>openSandboxScreen(adjacentPreview(1)),
  'preview-annotate':()=>{if(SANDBOX){annotationMode=!annotationMode;render();}},
  'preview-notes':showPreviewNotes,
  'preview-note-save':saveAnnotation,
  'preview-notes-export':()=>{if(SANDBOX)download(`vocab-ui-feedback-${C.localDate()}.json`,JSON.stringify({app:'Vocab Sprint UI feedback',previewOnly:true,notes:previewNotes},null,2));}
});
if(SANDBOX){
  loadPreviewNotes();
  actions.import=()=>toast('Import real learning backups in the real app. This sandbox uses sample progress.');
  actions['guided-export-original']=()=>toast('Real recovery copies are available only in the real app.');
  document.addEventListener('click',e=>{
    if(!annotationMode||$('modal').open||!$('main').contains(e.target))return;
    e.preventDefault();e.stopImmediatePropagation();beginAnnotation(e.target.closest?.('button,a,label,input,textarea,select,h1,h2,h3,h4,p,article,section')||e.target);
  },true);
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&annotationMode){annotationMode=false;render();return;}
    if(e.altKey&&e.key.toLowerCase()==='n'&&!$('modal').open&&$('main').contains(document.activeElement)){e.preventDefault();beginAnnotation(document.activeElement);}
  });
  document.addEventListener('change',e=>{if(e.target.id==='preview-screen')openSandboxScreen(e.target.value);});
}
const renderWithGuided=render;
render=function(){
  renderWithGuided();$('review-controls').innerHTML=reviewToolbar();document.body.dataset.sandbox=String(SANDBOX);document.body.dataset.annotating=String(SANDBOX&&annotationMode);
  if(SANDBOX)$('header-day').textContent='UI PREVIEW · SAMPLE PROGRESS';
};
