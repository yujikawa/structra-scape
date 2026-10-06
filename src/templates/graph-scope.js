// Large models: the term diagram can show only the selected term and the terms around it.
// Selecting a neighbour walks the diagram. Models with many terms open this way.
const scopeControl=document.createElement('label');scopeControl.className='graph-scope';
scopeControl.innerHTML='<span>表示範囲</span><select id="graph-scope"><option value="0">すべてのことば</option><option value="1">選んだことばと隣</option><option value="2">2つ先まで</option></select><small id="graph-scope-count"></small>';
document.querySelector('.canvas').append(scopeControl);
cy.style().selector('.out-of-scope').style({display:'none'}).update();
const scopeLargeModel=40;
let scopeDepth=0, scopeEntry=null, scopeKey='', scopeSaved=null;
// The terms within `scopeDepth` steps of the selection (a relationship's two ends count as the selection).
function scopeDistances(){
  const center=selected.kind==='property'?cy.$id('property:'+selected.id).connectedNodes():cy.$id(selected.id);
  if(!center.length)return null;
  const distance=new Map(center.map(n=>[n.id(),0]));
  let frontier=center;
  for(let step=1;step<=scopeDepth;step++){
    frontier=frontier.neighborhood().nodes().filter(n=>!distance.has(n.id()));
    frontier.forEach(n=>distance.set(n.id(),step));
  }
  return distance;
}
function scopeVisible(){return cy.nodes().not('.out-of-scope')}
// The diagram may be hidden (another tab is open) when the selection changes: fit it once it shows.
let scopeFitPending=false;
function fitScope(){
  cy.resize();
  const visible=scopeVisible();if(!visible.length)return;
  if(!cy.width()||!cy.height()||document.body.classList.contains('reviewing')){scopeFitPending=true;return}
  scopeFitPending=false;cy.fit(visible,60);if(cy.zoom()>1.4){cy.zoom(1.4);cy.center(visible)}
}
new ResizeObserver(()=>{if(scopeFitPending&&scopeDepth)fitScope()}).observe($('cy'));
function applyScope(){
  const distance=scopeDepth?scopeDistances():null;
  cy.elements().removeClass('out-of-scope');
  $('graph-scope-count').textContent='';
  if(!distance)return;
  cy.elements().addClass('out-of-scope');
  const keep=cy.nodes().filter(n=>distance.has(n.id()));
  keep.removeClass('out-of-scope');
  keep.connectedEdges().filter(e=>distance.has(e.source().id())&&distance.has(e.target().id())).removeClass('out-of-scope');
  $('graph-scope-count').textContent=`${keep.length} / ${cy.nodes().length}個のことばを表示`;
  // Lay the neighbourhood out in rings around the selection only when the selection changes,
  // so dragged positions survive other redraws.
  const key=`${selected.kind}:${selected.id}:${scopeDepth}`;
  if(key===scopeKey)return;
  scopeKey=key;
  keep.layout({name:'concentric',concentric:n=>scopeDepth+1-distance.get(n.id()),levelWidth:()=>1,minNodeSpacing:36,avoidOverlap:true,animate:false,fit:false}).run();
  fitScope();
}
function setScope(depth){
  if(!scopeDepth&&depth)scopeSaved=new Map(cy.nodes().map(n=>[n.id(),{...n.position()}]));
  scopeDepth=depth;scopeKey='';$('graph-scope').value=String(depth);
  if(!depth){
    cy.elements().removeClass('out-of-scope');$('graph-scope-count').textContent='';
    if(scopeSaved)cy.nodes().forEach(n=>{if(scopeSaved.has(n.id()))n.position(scopeSaved.get(n.id()))});
    scopeSaved=null;cy.fit(undefined,50);return;
  }
  applyScope();
}
$('graph-scope').onchange=()=>setScope(Number($('graph-scope').value));
const scopeRefresh=refresh;
refresh=function(...args){
  scopeRefresh(...args);
  // Another model: start from its full layout, narrowed when it has many terms.
  if(scopeEntry!==entryIndex){scopeEntry=entryIndex;scopeDepth=0;scopeSaved=null;setScope(model.concepts.length>scopeLargeModel?1:0);return}
  applyScope();
};
const scopeFocusSelection=focusSelection;
focusSelection=function(){scopeFocusSelection();if(scopeDepth)fitScope()};
$('fit').onclick=()=>scopeDepth?fitScope():cy.fit(undefined,50);
