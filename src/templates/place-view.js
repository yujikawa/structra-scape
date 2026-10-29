// Work places: listed under the flows and read in the flow's detail pane. A place is where a step
// is done, and so where its data is. What people know about it (what it holds, who owns it, what
// they call it) is recorded on the place itself, not as a term.
let activePlace=null;
const placeSection=document.createElement('section');placeSection.className='place-list';placeSection.hidden=true;
placeSection.innerHTML='<h2>作業場所</h2><div id="place-list"></div>';
$('process-list').after(placeSection);
pc.style().selector('node.on-place').style({'border-color':'#0b6b64','border-width':3,'background-color':'#e1f1ee'}).update();
// Places are keyed like terms in the workspace: the file that owns them and their ID.
const placeKey=place=>`${place.imported_from||entries[Number(entryIndex)]?.file}#${place.id}`;
const stepsOnPlace=id=>(model.processes||[]).flatMap(p=>p.steps.filter(s=>s.place===id));
// This model's own places, and the shared ones its steps are done on.
const listedPlaces=()=>(model.places||[]).filter(s=>!s.imported_from||stepsOnPlace(s.id).length);
function renderPlaceList(){
  const list=listedPlaces();
  placeSection.hidden=!list.length;
  $('place-list').innerHTML=list.map(s=>`<button data-place="${esc(s.id)}" class="${s.id===activePlace?'active':''}"><span>${esc(s.name)}</span>${s.owner?`<small>${esc(s.owner)}</small>`:''}</button>`).join('');
  $('place-list').querySelectorAll('[data-place]').forEach(b=>b.onclick=()=>openPlace(b.dataset.place));
}
function markPlace(){
  pc.nodes().removeClass('on-place');
  if(activePlace)pc.nodes().filter(n=>process()?.steps.find(s=>s.id===n.id())?.place===activePlace).addClass('on-place');
}
function openPlace(id){
  if(!(model.places||[]).some(s=>s.id===id))return;
  if(!processMode)setProcessMode(true);
  activePlace=id;activeStep=null;
  // Show a flow with steps on the place, unless the open one already has some.
  const on=p=>p.steps.some(s=>s.place===id);
  if(!process()||!on(process())){const p=(model.processes||[]).find(on);if(p)activeProcess=p.id}
  renderProcess();
  document.querySelector('.process-detail').scrollTop=0;
}
function placeDetail(place){
  const key=placeKey(place), steps=workPlaces(entries).find(x=>x.key===key)?.steps||[];
  const uses=placeUses(entries).filter(u=>u.place===key), moves=dataMoves(placeUses(entries)).filter(m=>m.from===key||m.to===key);
  const domains=new Set(steps.map(s=>s.domain)), roleNames={creates:'生まれる',receives:'受け取る',updates:'更新する',reads:'使う'};
  const stepsHtml=`<section class="reader-section"><h3>ここで行う作業 · ${steps.length}件</h3><div class="reader-links">${steps.map((s,i)=>`<button data-place-step="${i}">${esc(s.stepName)} ↗<small>${domains.size>1?`${esc(s.domainName)} · `:''}${esc(s.processName)}${s.timing?` · ${esc(s.timing)}`:''}</small></button>`).join('')||'<p class="hint">この作業場所で行う作業は、まだ記録されていません。</p>'}</div></section>`;
  const termsHtml=uses.length?`<section class="reader-section"><h3>ここにあることば</h3><ol class="place-trail place-terms">${['creates','receives','updates','reads'].flatMap(role=>uses.filter(u=>u.role===role).map(u=>`<li class="${role}"><span class="kind-tag">${roleNames[role]}</span><button data-place-term="${uses.indexOf(u)}">${esc(u.conceptName)} ↗<small>${esc(u.processName)} › ${esc(u.stepName)}</small></button></li>`)).join('')}</ol></section>`:'';
  const movesHtml=moves.length?`<section class="reader-section"><h3>データの受け渡し</h3><ul class="place-moves">${moves.map(m=>`<li><b>${esc(m.conceptName)}</b><span class="${m.from===key?'here':''}">${esc(m.fromName)}</span><span class="overview-arrow" aria-hidden="true">→</span><span class="${m.to===key?'here':''}">${esc(m.toName)}</span>${m.gap?'<span class="move-gap">経路が未記録</span>':''}</li>`).join('')}</ul><p class="hint">作業に書かれた作業場所から読み取っています。渡し方（手渡し・ファイル・APIなど）は区別していません。</p></section>`:'';
  const question=place.question?`<p class="question-banner">${uiIcon('chat')}<span><span>相談したいこと：</span><span>${esc(place.question)}</span></span></p>`:'';
  $('process-detail').innerHTML=`${headword(place)}<p class="kind-line"><span class="kind-tag">作業場所</span></p>${question}${place.description?`<p class="reader-text">${esc(place.description)}</p>`:'<p class="hint">説明はまだ記録されていません。</p>'}${place.owner?factsHtml([['担当',place.owner]]):''}<p class="hint">作業をする場所です。そこで作られたり受け取ったりしたデータは、そこにあります。</p>${stepsHtml}${termsHtml}${movesHtml}${recordSection(place)}`;
  const openStep=s=>openFromOverview(s.domain,()=>{activeProcess=s.process;activeStep=s.step;setProcessMode(true);pickStep(s.step)});
  $('process-detail').querySelectorAll('[data-place-step]').forEach(b=>b.onclick=()=>openStep(steps[Number(b.dataset.placeStep)]));
  $('process-detail').querySelectorAll('[data-place-term]').forEach(b=>b.onclick=()=>{const u=uses[Number(b.dataset.placeTerm)];openFromOverview(u.domain,()=>openConcept(u.conceptId))});
}
const placeDetailBase=processDetail;
processDetail=function(){
  const place=!activeStep&&activePlace&&(model.places||[]).find(s=>s.id===activePlace);
  if(place)placeDetail(place);else placeDetailBase();
};
const placeRenderBase=renderProcess;
renderProcess=function(){
  if(!(model.places||[]).some(s=>s.id===activePlace))activePlace=null;
  placeRenderBase();
  renderPlaceList();
  markPlace();
};
// Choosing a step or another flow leaves the place.
const placePickStep=pickStep;
pickStep=function(id){activePlace=null;placePickStep(id);renderPlaceList();markPlace()};
const placeNavigate=navigateHierarchy;
navigateHierarchy=function(...args){activePlace=null;placeNavigate(...args)};
const placeModelChange=$('model-choice').onchange;
$('model-choice').onchange=()=>{activePlace=null;placeModelChange()};
// Searching the terms also finds work places by name or alias; they open in the flow view.
const placeHits=document.createElement('section');placeHits.className='catalog';placeHits.id='place-hits';placeHits.hidden=true;
placeHits.innerHTML='<div class="catalog-head"><h3>作業場所</h3></div><div id="place-hits-list" class="list"></div>';
$('metric-section').after(placeHits);
const placeRenderLists=renderLists;
renderLists=function(){
  placeRenderLists();
  const query=$('search').value.trim().toLowerCase();
  const hits=query?(model.places||[]).filter(s=>`${s.name} ${s.id} ${(s.aliases||[]).join(' ')}`.toLowerCase().includes(query)):[];
  placeHits.hidden=!hits.length;
  $('place-hits-list').innerHTML=hits.map(s=>`<button data-place="${esc(s.id)}">${esc(s.name)} ↗<code class="term-id">${esc(s.id)}</code></button>`).join('');
  $('place-hits-list').querySelectorAll('[data-place]').forEach(b=>b.onclick=()=>openPlace(b.dataset.place));
};
