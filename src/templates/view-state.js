// Persist navigation only. The YAML remains the source of model content.
const viewStateKey = 'structra-view:' + location.pathname;
function saveViewState() {
  const ancestors = [], parents = hierarchyParents();
  let id = activeProcess;
  while (id && !ancestors.includes(id)) { ancestors.push(id); id = parents.get(id)?.process; }
  const scroll = {};
  for (const selector of ['.process-list','.process-detail','.inspector','.catalog','#unconfirmed-workspace','#review-board']) {
    const element = document.querySelector(selector);
    if (element) scroll[selector] = element.scrollTop;
  }
  try {
    sessionStorage.setItem(viewStateKey, JSON.stringify({
      slug: entries[Number(entryIndex)]?.slug, selected, activeProcess, activeStep, ancestors,
      mode: unconfirmedMode ? 'unconfirmed' : processMode ? 'process' : document.body.classList.contains('reviewing') ? 'definitions' : 'ontology',
      search: $('search').value, zoom: cy.zoom(), pan: cy.pan(), pz: pc.zoom(), pp: pc.pan(),
      processFrameVersion: 2, hierarchy: [...hierarchyViews], collapsedBranches: [...collapsedBranches], scroll,
      detailTab: [...document.querySelectorAll('.reader-tabs button')].findIndex(b=>b.getAttribute('aria-pressed')==='true')
    }));
  } catch { /* Browsing still works when storage is unavailable. */ }
}
function restoreGraphView(graph, zoom, pan) {
  if (Number.isFinite(zoom) && zoom > 0 && Number.isFinite(pan?.x) && Number.isFinite(pan?.y)) {
    graph.resize(); graph.zoom(zoom); graph.pan(pan);
  }
}
window.addEventListener('pagehide', saveViewState);
setTimeout(() => {
  let state;
  try { state = JSON.parse(sessionStorage.getItem(viewStateKey)); } catch {}
  if (!state || typeof state !== 'object') { if(model.processes?.length)setProcessMode(true); return; }
  const index = entries.findIndex(e=>e.slug===state.slug);
  if (state.slug && index < 0) { if(model.processes?.length)setProcessMode(true); return; }
  if (index >= 0) {
    entryIndex=String(index); $('model-choice').value=entryIndex;
    model=structuredClone(entries[index].model);
    cy.elements().remove();
  }
  const collection = state.selected?.kind === 'property' ? model.properties : model.concepts;
  selected = collection.some(x=>x.id===state.selected?.id) ? state.selected : {kind:'concept',id:model.concepts[0]?.id};
  const candidates = Array.isArray(state.ancestors) ? state.ancestors : [state.activeProcess];
  activeProcess=candidates.find(id=>model.processes?.some(p=>p.id===id)) || model.processes?.[0]?.id;
  activeStep=activeProcess===state.activeProcess ? state.activeStep : null;
  $('search').value=typeof state.search==='string' ? state.search : '';
  refresh(true);
  const mode=state.mode || (state.processMode?'process':'ontology');
  setProcessMode(mode==='process');
  if(mode==='unconfirmed')completionButton.click();
  if(mode==='definitions')setReview(true);
  restoreGraphView(cy,state.zoom,state.pan);
  if(activeProcess===state.activeProcess && state.processFrameVersion===2)restoreGraphView(pc,state.pz,state.pp);
  hierarchyModel=model;
  collapsedBranches.clear();
  for(const id of Array.isArray(state.collapsedBranches)?state.collapsedBranches:[]) {
    if(model.processes?.some(p=>p.id===id))collapsedBranches.add(id);
  }
  updateBranchVisibility();
  hierarchyViews.clear();
  for(const entry of Array.isArray(state.hierarchy)?state.hierarchy:[]) {
    if(Array.isArray(entry)&&model.processes?.some(p=>p.id===entry[0])&&entry[1])hierarchyViews.set(entry[0],entry[1]);
  }
  if(Number.isInteger(state.detailTab))document.querySelectorAll('.reader-tabs button')[state.detailTab]?.click();
  for(const [selector,top] of Object.entries(state.scroll || {})) {
    if(['.process-list','.process-detail','.inspector','.catalog','#unconfirmed-workspace','#review-board'].includes(selector)&&Number.isFinite(top)) {
      const element=document.querySelector(selector);if(element)element.scrollTop=top;
    }
  }
},0);
