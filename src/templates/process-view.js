let processMode=false, activeProcess=null, activeStep=null;
const processRoot=document.createElement('section');processRoot.id='process-workspace';processRoot.hidden=true;
processRoot.innerHTML=`<aside class="process-list"><h2>業務フロー</h2><div id="process-list"></div><div class="legend"><div class="pane-title">図の見方</div><ul><li><i class="shape terminal"></i>開始・終了</li><li><i class="shape"></i>作業</li><li><i class="shape gate"></i>分岐・並行・合流</li><li><i class="shape detail"></i>詳細フローあり</li></ul></div></aside><section class="process-canvas"><div id="process-cy"></div><button id="flow-fit">全体</button></section><aside class="process-detail"><div id="process-detail"></div></aside>`;
document.body.append(processRoot);
// Primary navigation lives in the header, next to the model selector.
const modeBar=document.createElement('nav');modeBar.className='mode-bar';modeBar.setAttribute('aria-label','表示を切り替え');modeBar.innerHTML='<button id="mode-ontology" class="active">ことばと関係</button><button id="mode-process">業務プロセス</button>';
$('model-choice').after(modeBar);
// Shapes follow the legend in the process list: pill = start/end, diamond = gateway, double border = has a detail flow.
const pc=cytoscape({container:$('process-cy'),elements:[],autoungrabify:true,style:[{selector:'node',style:{width:180,shape:'round-rectangle','background-color':'#fff','border-color':'#5b6b80','border-width':1.5,'font-family':graphFont,'text-valign':'center','text-wrap':'wrap',color:'#18263a',...labelStyle({width:156,size:16,maxLines:3,minHeight:68})}},{selector:'node[type="start"],node[type="end"]',style:{shape:'round-rectangle','corner-radius':30,width:170,'background-color':'#e2f2e8','border-color':'#3c7d55',...labelStyle({width:140,size:16,maxLines:3,minHeight:64})}},{selector:'node[type="end"]',style:{'background-color':'#eef1f5','border-color':'#738095'}},{selector:'node[type="decision"],node[type="parallel"],node[type="join"]',style:{shape:'diamond',width:190,'background-color':'#fff2d6','border-color':'#b07a14',...labelStyle({width:106,size:15,maxLines:2,minHeight:112,diamond:true})}},{selector:'node[type="parallel"],node[type="join"]',style:{'background-color':'#efeaf8','border-color':'#5a3e9e'}},{selector:'node.has-detail',style:{'border-style':'double','border-width':5,'border-color':'#24498a'}},{selector:'edge',style:{label:ele=>fitLabel(ele.data('label'),{width:76,size:12,weight:600,maxLines:2}).text,'text-wrap':'wrap','text-max-width':92,'curve-style':'bezier',width:1.6,'target-arrow-shape':'triangle','line-color':'#4a576b','target-arrow-color':'#4a576b','font-family':graphFont,'font-size':12,'font-weight':600,color:'#2c3a4f','text-background-color':'#f3f5f8','text-background-opacity':1,'text-background-padding':4,'text-background-shape':'round-rectangle'}},{selector:'node:selected',style:{'border-color':'#24498a','border-width':3,'background-color':'#e7edf7'}},{selector:'node.has-detail:selected',style:{'border-width':6}},{selector:':selected',style:{'overlay-opacity':0}}]});
const process=()=> (model.processes||[]).find(p=>p.id===activeProcess);
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
function setProcessMode(enabled){processMode=enabled;setReview(false);document.querySelector('.workspace').hidden=enabled;processRoot.hidden=!enabled;$('mode-process').classList.toggle('active',enabled);$('mode-ontology').classList.toggle('active',!enabled);if(enabled)renderProcess();else cy.resize()}
$('mode-process').onclick=()=>setProcessMode(true);$('mode-ontology').onclick=()=>setProcessMode(false);
function renderProcess(){
  const all=model.processes||[];if(!all.some(p=>p.id===activeProcess)){activeProcess=all[0]?.id;activeStep=null}
  const p=process();
  pc.elements().remove();
  if(!p){processDetail();return}
  pc.add([...p.steps.map((s,i)=>({data:{id:s.id,type:s.type,label:s.name+'\n'+stepTypes[s.type]},position:s.position||{x:130+(i%3)*240,y:150+Math.floor(i/3)*170}})),...p.flows.map((f,i)=>({data:{id:'flow:'+i,source:f.source,target:f.target,label:f.label||''}}))]);
  frameProcess();
  if(activeStep&&!p.steps.some(s=>s.id===activeStep))activeStep=null;
  processDetail();
}
function pickStep(id){activeStep=id;pc.elements().unselect();pc.$id(id).select();processDetail();document.querySelector('.process-detail').scrollTop=0}
function openConcept(id){setProcessMode(false);selected={kind:'concept',id};$('search').value='';refresh();focusSelection()}
$('flow-fit').onclick=()=>frameProcess(false);
