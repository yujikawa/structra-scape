// A step can be decomposed into one child process. Keep the whole map visible.
const hierarchyViews = new Map();
const collapsedBranches = new Set();
let treeProcess = null;
let hierarchyModel = model;
const crumbs = document.createElement('nav');
crumbs.id = 'process-breadcrumbs';
crumbs.setAttribute('aria-label', '業務の現在地');
document.querySelector('.process-canvas').prepend(crumbs);
function hierarchyParents() {
  const parents = new Map();
  for (const p of model.processes || []) for (const s of p.steps) if (s.subprocess) parents.set(s.subprocess, {process:p.id, step:s.id, name:s.name});
  return parents;
}
function updateBranchVisibility() {
  $('process-list').querySelectorAll('[data-toggle-branch]').forEach(button=>{
    const expanded=!collapsedBranches.has(button.dataset.toggleBranch);
    button.setAttribute('aria-expanded',String(expanded));
        button.closest('li').querySelector(':scope > ul').hidden=!expanded;
  });
}
function navigateHierarchy(id, step = null) {
  treeProcess=null;
  hierarchyViews.set(activeProcess, {step:activeStep, zoom:pc.zoom(), pan:{...pc.pan()}});
  const saved = hierarchyViews.get(id);
  activeProcess = id; activeStep = step || saved?.step || null;
  cancelFlow(); renderProcess();
  if (saved) { pc.zoom(saved.zoom); pc.pan(saved.pan); }
  if (activeStep) pickStep(activeStep);
}
const hierarchyRenderBase = renderProcess;
renderProcess = function() {
  if (hierarchyModel !== model) { hierarchyViews.clear(); collapsedBranches.clear(); treeProcess=null; hierarchyModel = model; }
  hierarchyRenderBase();
  const all = model.processes || [], parents = hierarchyParents();
  if(treeProcess!==activeProcess){
    let current=activeProcess;const seen=new Set();
    while(current&&!seen.has(current)){seen.add(current);collapsedBranches.delete(current);current=parents.get(current)?.process;}
    treeProcess=activeProcess;
  }
  const toggle=(p)=>`<button class="tree-toggle" data-toggle-branch="${esc(p.id)}" aria-label="${esc(p.name)}の子工程を開閉" aria-expanded="true"></button>`;
  function stepsTree(p, seen = new Set()) {
    if (seen.has(p.id)) return '';
    const next = new Set([...seen, p.id]);
    return `<ul>${p.steps.map(s => {
      const child = all.find(x => x.id === s.subprocess);
      return `<li><div class="tree-row">${child?toggle(child):''}<button data-parent="${esc(p.id)}" data-pick="${esc(s.id)}" ${child?`data-child="${esc(child.id)}"`:''} class="${activeProcess===p.id&&activeStep===s.id||activeProcess===child?.id?'active':''}">${esc(s.name)}${child?'<span class="branch-mark">詳細 ›</span>':''}</button></div>${child?stepsTree(child,next):''}</li>`;
    }).join('')}</ul>`;
  }
  $('process-list').innerHTML = `<ul class="process-tree">${all.filter(p=>!parents.has(p.id)).map(p=>`<li><div class="tree-row">${toggle(p)}<button data-root="${esc(p.id)}" class="${p.id===activeProcess&&!activeStep?'active':''}">${esc(p.name)}</button></div>${stepsTree(p)}</li>`).join('')}</ul>`;
  $('process-list').querySelectorAll('button').forEach(b=>b.onclick=()=> {
    if(b.dataset.toggleBranch){const id=b.dataset.toggleBranch;if(collapsedBranches.has(id))collapsedBranches.delete(id);else collapsedBranches.add(id);updateBranchVisibility();return;}
    if (b.dataset.root) navigateHierarchy(b.dataset.root);
    else if (b.dataset.child) navigateHierarchy(b.dataset.child);
    else navigateHierarchy(b.dataset.parent,b.dataset.pick);
  });
  updateBranchVisibility();
  const chain = [], seen = new Set();
  let id = activeProcess;
  while (id && !seen.has(id)) { seen.add(id); const p=all.find(x=>x.id===id); if(!p)break; chain.unshift(p); id=parents.get(id)?.process; }
  crumbs.innerHTML=chain.map(p=>`<button data-level="${esc(p.id)}" ${p.id===activeProcess?'aria-current="page"':''}>${esc(p.name)}</button>`).join('<span aria-hidden="true">›</span>');
  crumbs.querySelectorAll('button').forEach(b=>b.onclick=()=>navigateHierarchy(b.dataset.level));
  for(const s of process()?.steps || []) if(s.subprocess) pc.$id(s.id).data('label',s.name+'\n詳細を開く ›').addClass('has-detail');
  if(activeStep) pc.$id(activeStep).select();
};
const hierarchyDetailBase = processDetail;
processDetail = function() {
  hierarchyDetailBase();
  const s = process()?.steps.find(s=>s.id===activeStep);
  if (s?.subprocess) {
    const b=document.createElement('button');b.className='primary-action';b.textContent='詳細フローを開く';
    b.onclick=()=>navigateHierarchy(s.subprocess);$('process-detail').append(b);
  }
};
pc.off('tap','node');
pc.on('tap','node',e=> {
  const s=process()?.steps.find(s=>s.id===e.target.id());
  if(s?.subprocess) navigateHierarchy(s.subprocess); else {
    const view={zoom:pc.zoom(),pan:{...pc.pan()}};
    pickStep(e.target.id());renderProcess();pc.zoom(view.zoom);pc.pan(view.pan);
  }
});
