// Persist navigation only. The YAML remains the source of model content.
const viewStateKey = 'structra-view:' + location.pathname;
function saveViewState() {
  const ancestors = [], parents = hierarchyParents();
  let id = activeProcess;
  while (id && !ancestors.includes(id)) { ancestors.push(id); id = parents.get(id)?.process; }
  const scroll = {};
  for (const selector of ['.process-list','.process-detail','.inspector','.catalog','#unconfirmed-workspace','#changes-workspace','#overview-workspace','#review-board']) {
    const element = document.querySelector(selector);
    if (element) scroll[selector] = element.scrollTop;
  }
  try {
    sessionStorage.setItem(viewStateKey, JSON.stringify({
      slug: entries[Number(entryIndex)]?.slug, selected, activeProcess, activeStep, ancestors,
      mode: overviewMode ? 'overview' : changesMode ? 'changes' : unconfirmedMode ? 'unconfirmed' : processMode ? 'process' : document.body.classList.contains('reviewing') ? 'definitions' : 'ontology',
      search: $('search').value, zoom: cy.zoom(), pan: cy.pan(), pz: pc.zoom(), pp: pc.pan(),
      hierarchy: [...hierarchyViews], collapsedBranches: [...collapsedBranches], scroll,
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
  // A workspace of several domains opens on its overview.
  if (!state || typeof state !== 'object') { if(!overviewButton.hidden)overviewButton.click(); else if(model.processes?.length)setProcessMode(true); else openTerms(); return; }
  const index = entries.findIndex(e=>e.slug===state.slug);
  if (state.slug && index < 0) { if(model.processes?.length)setProcessMode(true); else openTerms(); return; }
  if (index >= 0) {
    entryIndex=String(index); $('model-choice').value=entryIndex; modelChoiceTitle();
    model=structuredClone(entries[index].model);
    cy.elements().remove();
  }
  const collection = selectionCollection(state.selected?.kind);
  selected = collection.some(x=>x.id===state.selected?.id) ? state.selected : {kind:'concept',id:model.concepts[0]?.id};
  const candidates = Array.isArray(state.ancestors) ? state.ancestors : [state.activeProcess];
  activeProcess=candidates.find(id=>model.processes?.some(p=>p.id===id)) || model.processes?.[0]?.id;
  activeStep=activeProcess===state.activeProcess ? state.activeStep : null;
  $('search').value=typeof state.search==='string' ? state.search : '';
  refresh(true);
  const mode=state.mode;
  setProcessMode(mode==='process');
  if(mode==='unconfirmed')completionButton.click();
  if(mode==='changes'&&!changesButton.hidden)changesButton.click();
  if(mode==='overview'&&!overviewButton.hidden)overviewButton.click();
  if(mode==='definitions')setReview(true);
  restoreGraphView(cy,state.zoom,state.pan);
  if(activeProcess===state.activeProcess)restoreGraphView(pc,state.pz,state.pp);
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
  if(Number.isInteger(state.detailTab)){ const tab=document.querySelectorAll('.reader-tabs button')[state.detailTab]; if(tab)tab.click(); }
  for(const [selector,top] of Object.entries(state.scroll || {})) {
    if(['.process-list','.process-detail','.inspector','.catalog','#unconfirmed-workspace','#changes-workspace','#overview-workspace','#review-board'].includes(selector)&&Number.isFinite(top)) {
      const element=document.querySelector(selector);if(element)element.scrollTop=top;
    }
  }
},0);
// Browser back and forward walk through the views and selections opened on this page (navigation
// only, like the state above). Every click or model change that lands somewhere new adds a step.
// True until the restored view has been recorded as the first step (restoring clicks the tabs).
let navApplying = true;
const navState = () => ({
  entry: entryIndex, selected: { ...selected }, activeProcess, activeStep,
  mode: overviewMode ? 'overview' : changesMode ? 'changes' : unconfirmedMode ? 'unconfirmed' : processMode ? 'process' : document.body.classList.contains('reviewing') ? 'definitions' : 'ontology',
});
function recordNav() {
  if (navApplying) return;
  const state = navState();
  if (JSON.stringify(history.state?.strscape) !== JSON.stringify(state)) history.pushState({ strscape: state }, '');
}
function applyNav(state) {
  navApplying = true;
  try {
    const modelChanged = state.entry !== entryIndex && entries[Number(state.entry)];
    if (modelChanged) {
      entryIndex = state.entry; $('model-choice').value = entryIndex; modelChoiceTitle();
      model = structuredClone(entries[Number(entryIndex)].model);
      cy.elements().remove();
    }
    const collection = selectionCollection(state.selected?.kind);
    if (collection.some(x => x.id === state.selected?.id)) selected = { ...state.selected };
    if (model.processes?.some(p => p.id === state.activeProcess)) { activeProcess = state.activeProcess; activeStep = state.activeStep; }
    refresh(Boolean(modelChanged));
    if (state.mode === 'overview' && !overviewButton.hidden) overviewButton.click();
    else if (state.mode === 'changes' && !changesButton.hidden) changesButton.click();
    else if (state.mode === 'unconfirmed') completionButton.click();
    else if (state.mode === 'process') { setProcessMode(true); if (activeStep) pickStep(activeStep); }
    else { setProcessMode(false); setReview(state.mode === 'definitions'); if (state.mode === 'ontology') focusSelection(); }
  } finally {
    navApplying = false;
    history.replaceState({ strscape: navState() }, '');
  }
}
// Element handlers have run by the time a click bubbles to the document (Cytoscape taps fire
// before the click), so the state recorded here is where the click led.
document.addEventListener('click', recordNav);
$('model-choice').addEventListener('change', recordNav);
window.addEventListener('popstate', event => { if (event.state?.strscape) applyNav(event.state.strscape); });
// The view restored above is the first step.
setTimeout(() => { navApplying = false; history.replaceState({ strscape: navState() }, ''); }, 0);
