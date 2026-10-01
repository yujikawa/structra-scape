let processMode=false, activeProcess=null, activeStep=null, flowSource=null;
const processRoot=document.createElement('section');processRoot.id='process-workspace';processRoot.hidden=true;
processRoot.innerHTML=`<aside class="process-list"><h2>業務フロー</h2><div id="process-list"></div><button id="new-process">＋ 業務フロー</button><p class="hint">作業を並べ、矢印でつなぎます。作業が扱うことばは、共通の定義から選べます。</p><div id="process-steps"></div><div class="legend"><div class="pane-title">図の見方</div><ul><li><i class="shape terminal"></i>開始・終了</li><li><i class="shape"></i>作業</li><li><i class="shape gate"></i>分岐・並行・合流</li><li><i class="shape detail"></i>詳細フローあり</li></ul></div></aside><section class="process-canvas"><div class="process-toolbar"><button id="new-step">＋ 作業</button><button id="flow-connect">順番をつなぐ</button><button id="flow-arrange">整列</button><button id="flow-fit">全体を表示</button><button id="flow-cancel" hidden>キャンセル</button></div><div id="flow-hint" role="status"></div><div id="process-cy"></div></section><aside class="process-detail"><div id="process-detail"></div></aside>`;
document.body.append(processRoot);
// Label the two editing modes with domain-standard names.
const modeBar=document.createElement('nav');modeBar.className='mode-bar';modeBar.setAttribute('aria-label','編集モード');modeBar.innerHTML='<button id="mode-ontology" class="active">ことばと関係</button><button id="mode-process">業務プロセス</button>';
modeBar.querySelector('#mode-ontology').textContent='オントロジー';
// Primary navigation lives in the header, next to the model selector.
$('model-choice').after(modeBar);
// Shapes follow the legend in the process list: pill = start/end, diamond = gateway, double border = has a detail flow.
const pc=cytoscape({container:$('process-cy'),elements:[],style:[{selector:'node',style:{width:180,shape:'round-rectangle','background-color':'#fff','border-color':'#5b6b80','border-width':1.5,'font-family':graphFont,'text-valign':'center','text-wrap':'wrap',color:'#18263a',...labelStyle({width:156,size:16,maxLines:3,minHeight:68})}},{selector:'node[type="start"],node[type="end"]',style:{shape:'round-rectangle','corner-radius':30,width:170,'background-color':'#e2f2e8','border-color':'#3c7d55',...labelStyle({width:140,size:16,maxLines:3,minHeight:64})}},{selector:'node[type="end"]',style:{'background-color':'#eef1f5','border-color':'#738095'}},{selector:'node[type="decision"],node[type="parallel"],node[type="join"]',style:{shape:'diamond',width:190,'background-color':'#fff2d6','border-color':'#b07a14',...labelStyle({width:106,size:15,maxLines:2,minHeight:112,diamond:true})}},{selector:'node[type="parallel"],node[type="join"]',style:{'background-color':'#efeaf8','border-color':'#5a3e9e'}},{selector:'node.has-detail',style:{'border-style':'double','border-width':5,'border-color':'#24498a'}},{selector:'edge',style:{label:ele=>fitLabel(ele.data('label'),{width:76,size:12,weight:600,maxLines:2}).text,'text-wrap':'wrap','text-max-width':92,'curve-style':'bezier',width:1.6,'target-arrow-shape':'triangle','line-color':'#4a576b','target-arrow-color':'#4a576b','font-family':graphFont,'font-size':12,'font-weight':600,color:'#2c3a4f','text-background-color':'#f3f5f8','text-background-opacity':1,'text-background-padding':4,'text-background-shape':'round-rectangle'}},{selector:'node:selected',style:{'border-color':'#24498a','border-width':3,'background-color':'#e7edf7'}},{selector:'node.has-detail:selected',style:{'border-width':6}},{selector:':selected',style:{'overlay-opacity':0}},{selector:'.flow-source',style:{'border-color':'#d69a27','border-width':5}}]});
const process=()=> (model.processes||[]).find(p=>p.id===activeProcess);
function processStatus(text){$('flow-hint').textContent=text}
function frameProcess(readable=true){
  pc.resize();
  if(!pc.nodes().length)return;
  pc.fit(pc.elements(),32);
  if(readable){
    pc.zoom(Math.max(.75,Math.min(1.2,pc.zoom())));
    pc.center();
    const bounds=pc.elements().renderedBoundingBox();
    // Keep the start visible on wide flows; avoid a tiny diagram in empty space.
    if(bounds.w>pc.width()-64)pc.panBy({x:32-bounds.x1,y:0});
  }
}
function setProcessMode(enabled){processMode=enabled;setReview(false);document.querySelector('.workspace').hidden=enabled;processRoot.hidden=!enabled;$('review-toggle').hidden=enabled;$('mode-process').classList.toggle('active',enabled);$('mode-ontology').classList.toggle('active',!enabled);cancelFlow();if(enabled)renderProcess();else cy.resize()}
$('mode-process').onclick=()=>setProcessMode(true);$('mode-ontology').onclick=()=>setProcessMode(false);
function unique(items,prefix){let n=1;while(items.some(x=>x.id===prefix+n))n++;return prefix+n}
function commitProcess(mutator){const draft=structuredClone(model);mutator(draft);const errors=validateOntology(draft);if(errors.length){status(errors.join('\n'),true);return false}model=draft;mark();updateReview();renderProcess();return true}
function renderProcess(){
  const all=model.processes||[];if(!all.some(p=>p.id===activeProcess)){activeProcess=all[0]?.id;activeStep=null}
  $('process-list').innerHTML=all.map(p=>`<button data-process="${esc(p.id)}" class="${p.id===activeProcess?'active':''}">${esc(p.name)}</button>`).join('');
  $('process-list').querySelectorAll('button').forEach(b=>b.onclick=()=>{activeProcess=b.dataset.process;activeStep=null;cancelFlow();renderProcess()});
  const p=process();$('new-step').disabled=!p;$('flow-connect').disabled=!p;
  pc.elements().remove();
  if(!p){$('process-detail').innerHTML='<h2>最初の業務を作る</h2><p>例：申込みから契約まで</p>'; $('process-steps').innerHTML='';processStatus('左の「＋ 業務フロー」から始めましょう。');return}
  pc.add([...p.steps.map((s,i)=>({data:{id:s.id,type:s.type,label:s.name+'\n'+stepTypes[s.type]},position:s.position||{x:130+(i%3)*240,y:150+Math.floor(i/3)*170}})),...p.flows.map((f,i)=>({data:{id:'flow:'+i,source:f.source,target:f.target,label:f.label||''}}))]);
  frameProcess();
  $('process-steps').innerHTML='<h3>作業を選ぶ</h3>'+p.steps.map(s=>`<button data-step="${esc(s.id)}">${esc(s.name)}<small>${esc(stepTypes[s.type])}</small></button>`).join('');
  $('process-steps').querySelectorAll('button').forEach(b=>b.onclick=()=>pickStep(b.dataset.step));
  if(activeStep&&!p.steps.some(s=>s.id===activeStep))activeStep=null;
  processDetail();if(!flowSource)processStatus('作業を選ぶと、登場することばと流れを確認できます。');
}
function pickStep(id){if(flowSource!==null){if(flowSource===''){flowSource=id;pc.$id(id).addClass('flow-source');processStatus('次の作業を選んでください。');return}flowForm(flowSource,id);cancelFlow();return}activeStep=id;pc.elements().unselect();pc.$id(id).select();processDetail();document.querySelector('.process-detail').scrollTop=0}
function processDetail(){
  const p=process();if(!p)return;const s=p.steps.find(s=>s.id===activeStep);
  if(!s){$('process-detail').innerHTML=`<h2>${esc(p.name)}</h2><label for="process-name">業務の名前</label><input id="process-name" value="${esc(p.name)}"><button id="rename-process">名前を反映</button><p class="hint">${p.steps.length}個の作業・${p.flows.length}本の矢印。分岐は一つの経路を選び、並行開始はすべての経路へ進みます。合流はすべての経路を待つ意味です。ここでは実行せず、業務の構造を整理します。</p>`;$('rename-process').onclick=()=>{const name=$('process-name').value;commitProcess(d=>d.processes.find(x=>x.id===p.id).name=name)};return}
  $('process-detail').innerHTML=`<h2>${esc(s.name)}</h2><label for="step-name">作業の名前</label><input id="step-name" value="${esc(s.name)}"><label for="step-type">流れの中での役割</label><select id="step-type">${Object.entries(stepTypes).map(([k,v])=>option(k,v,s.type)).join('')}</select><label for="step-owner">担当</label><input id="step-owner" value="${esc(s.owner||'')}"><label for="step-description">何をする？</label><textarea id="step-description">${esc(s.description||'')}</textarea><button id="apply-step">作業を反映</button><h3>登場することば</h3><p class="hint">ことばを押すと、共通の定義を開きます。</p><div id="step-items">${(s.items||[]).map((item,i)=>`<div class="usage-row"><button data-concept="${esc(item.concept)}">${esc(term(item.concept))} ↗<small>${usageRoles[item.role]}</small></button><button data-remove-item="${i}" aria-label="${esc(term(item.concept))}の参照を外す">×</button></div>`).join('')||'<p class="hint">まだ選ばれていません。</p>'}</div><label for="item-concept">ことばを選ぶ</label><select id="item-concept">${conceptOptions(model.concepts[0]?.id)}</select><label for="item-role">この作業でどう扱う？</label><select id="item-role">${Object.entries(usageRoles).map(([k,v])=>option(k,v,'reads')).join('')}</select><button id="add-usage" ${model.concepts.length?'':'disabled'}>作業に紐づける</button><h3>次へ進む流れ</h3><div id="outgoing">${p.flows.map((f,i)=>f.source===s.id?`<button data-flow="${i}">${esc(f.label||'次へ')} → ${esc(p.steps.find(x=>x.id===f.target)?.name)}</button>`:'').join('')}</div><button id="from-step">この作業から矢印を引く</button><button class="danger" id="delete-step">作業を削除</button>`;
  $('apply-step').onclick=()=>{const values={name:$('step-name').value,type:$('step-type').value,owner:$('step-owner').value,description:$('step-description').value};commitProcess(d=>Object.assign(d.processes.find(x=>x.id===p.id).steps.find(x=>x.id===s.id),values))};
  $('step-items').querySelectorAll('[data-concept]').forEach(b=>b.onclick=()=>openConcept(b.dataset.concept));
  $('step-items').querySelectorAll('[data-remove-item]').forEach(b=>b.onclick=()=>commitProcess(d=>d.processes.find(x=>x.id===p.id).steps.find(x=>x.id===s.id).items.splice(Number(b.dataset.removeItem),1)));
  $('add-usage').onclick=()=>{const item={concept:$('item-concept').value,role:$('item-role').value};commitProcess(d=>{const step=d.processes.find(x=>x.id===p.id).steps.find(x=>x.id===s.id);(step.items??=[]).push(item)})};
  $('outgoing').querySelectorAll('button').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.flow),f=p.flows[i];flowForm(f.source,f.target,i)});
  $('from-step').onclick=()=>{flowSource=s.id;$('flow-cancel').hidden=false;pc.$id(s.id).addClass('flow-source');processStatus('次の作業を選んでください。')};
  $('delete-step').onclick=()=>{if(p.flows.some(f=>f.source===s.id||f.target===s.id))return status('先に、この作業につながる矢印を削除してください。',true);commitProcess(d=>{const pr=d.processes.find(x=>x.id===p.id);pr.steps=pr.steps.filter(x=>x.id!==s.id)})};
}
function openConcept(id){setProcessMode(false);selected={kind:'concept',id};$('search').value='';refresh();focusSelection();status('業務で使われていることばの定義です。「登場する業務」から作業へ戻れます。')}
function showUsages(item){const section=document.createElement('section');section.id='concept-usages';const usages=conceptUsages(model,item.id);section.innerHTML='<h3>登場する業務</h3>'+(usages.length?usages.map((u,i)=>`<button data-usage="${i}">${esc(u.processName)} → ${esc(u.stepName)}<small>${esc(usageRoles[u.role])} · 作業を開く ↗</small></button>`).join(''):'<p class="hint">このことばを扱う作業はまだありません。</p>');$('detail').append(section);section.querySelectorAll('button').forEach(b=>b.onclick=()=>{const u=usages[Number(b.dataset.usage)];activeProcess=u.process;activeStep=u.step;setProcessMode(true);pickStep(u.step)})}
function showUsages(item){const section=document.createElement('section');section.id='concept-usages';const usages=conceptUsages(model,item.id);section.innerHTML='<h3>登場する業務</h3>'+(usages.length?usages.map((u,i)=>`<button data-usage="${i}">${esc(u.processName)} → ${esc(u.stepName)}<small>${esc(usageRoles[u.role])} · 作業を開く ↗</small></button>`).join(''):'<p class="hint">このことばを扱う作業はまだありません。</p>');$('detail').append(section);section.querySelectorAll('button').forEach(b=>b.onclick=()=>{const u=usages[Number(b.dataset.usage)];activeProcess=u.process;activeStep=u.step;setProcessMode(true);pickStep(u.step)})}
function cancelFlow(){flowSource=null;$('flow-cancel').hidden=true;pc.nodes().removeClass('flow-source')}
function flowForm(source,target,index){const p=process();$('process-detail').innerHTML=`<h2>順番をつなぐ</h2><p>${esc(p.steps.find(s=>s.id===source)?.name)} → ${esc(p.steps.find(s=>s.id===target)?.name)}</p><label for="flow-label">進む条件・説明（任意）</label><input id="flow-label" value="${esc(index===undefined?'':p.flows[index].label||'')}" placeholder="例：審査OK"><div class="actions"><button id="save-flow">矢印を反映</button><button id="discard-flow">キャンセル</button></div>${index===undefined?'':'<button id="delete-flow" class="danger">矢印を削除</button>'}`;$('discard-flow').onclick=processDetail;$('save-flow').onclick=()=>{const f={source,target,label:$('flow-label').value};commitProcess(d=>{const pr=d.processes.find(x=>x.id===p.id);if(index===undefined)pr.flows.push(f);else pr.flows[index]=f})};if(index!==undefined)$('delete-flow').onclick=()=>commitProcess(d=>d.processes.find(x=>x.id===p.id).flows.splice(index,1))}
$('flow-connect').onclick=()=>{flowSource='';$('flow-cancel').hidden=false;processStatus('矢印の始点となる作業を選んでください。')};$('flow-cancel').onclick=()=>{cancelFlow();processStatus('接続をキャンセルしました。')};
$('new-process').onclick=()=>{const id=unique(model.processes||[],'Process');activeProcess=id;activeStep=null;commitProcess(d=>(d.processes??=[]).push({id,name:'新しい業務フロー',steps:[],flows:[]}))};
$('new-step').onclick=()=>{const p=process(),id=unique(p.steps,'Step');activeStep=id;commitProcess(d=>d.processes.find(x=>x.id===p.id).steps.push({id,name:'新しい作業',type:'task',items:[]}));$('step-name')?.focus();$('step-name')?.select()};
$('flow-fit').onclick=()=>frameProcess(false);
$('flow-arrange').onclick=()=>{pc.layout({name:'breadthfirst',directed:true,padding:65,spacingFactor:1.3}).run();const p=process();if(p)commitProcess(d=>d.processes.find(x=>x.id===p.id).steps.forEach(s=>s.position={...pc.$id(s.id).position()}))};
pc.on('tap','node',e=>pickStep(e.target.id()));pc.on('tap','edge',e=>{const i=Number(e.target.id().slice(5)),f=process().flows[i];cancelFlow();flowForm(f.source,f.target,i)});
pc.on('dragfree','node',e=>{const p=process(),s=p.steps.find(x=>x.id===e.target.id());s.position={...e.target.position()};mark();updateReview()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')cancelFlow()});

