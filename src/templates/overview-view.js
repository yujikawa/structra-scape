// 全体マップ: how the domain files of a workspace connect. Shown when more than one model is built
// together. Each domain is a box holding its processes and terms; lines that leave a box cross
// a domain boundary. Everything comes from workspaceOverview (workspace.js).
const overviewButton = document.createElement('button');
overviewButton.id = 'mode-overview';
overviewButton.setAttribute('aria-controls', 'overview-workspace');
overviewButton.innerHTML = uiIcon('map') + '全体マップ';
overviewButton.hidden = entries.length < 2;
modeBar.prepend(overviewButton);
const overviewRoot = document.createElement('section');
overviewRoot.id = 'overview-workspace';
overviewRoot.hidden = true;
overviewRoot.setAttribute('aria-labelledby', 'overview-title');
overviewRoot.innerHTML = `<div class="completion-content"><h2 id="overview-title">全体マップ</h2><p id="overview-summary"></p><div class="overview-toolbar"><label><input type="checkbox" id="overview-cross" checked><span>ドメインをまたぐものだけ表示</span></label><ul class="overview-legend"><li><i class="swatch domain"></i>ドメイン</li><li><i class="swatch process"></i>業務フロー</li><li><i class="swatch concept"></i>ことば</li><li><i class="line usage"></i>作成・参照・更新</li><li><i class="line property"></i>つながり</li><li><i class="line parent"></i>〜の一種</li></ul></div><div class="overview-graph"><div id="overview-cy" aria-label="ドメインの全体図"></div><button id="overview-fit">全体</button></div><p class="hint">ドメイン・業務フロー・ことばを押すと、そのモデルの該当箇所を開きます。</p><div id="overview-details"></div></div>`;
document.body.append(overviewRoot);
let overviewMode = false, overviewData = null;
const overviewRoleShort = { creates: '作成', reads: '参照', updates: '更新', participates: '参加' };
const overviewLanguage = () => document.documentElement.lang === 'en' ? 'en' : 'ja';
const overviewGraph = cytoscape({ container: $('overview-cy'), elements: [], style: [
  { selector: 'node', style: { shape: 'round-rectangle', width: 156, 'background-color': '#fff', 'border-width': 1.5, 'border-color': '#8593a8', color: '#18263a', 'font-family': graphFont, 'text-valign': 'center', 'text-wrap': 'wrap', ...labelStyle({ width: 132, size: 14, weight: 600, minHeight: 50 }) } },
  { selector: 'node[kind="process"]', style: { 'background-color': '#e7edf7', 'border-color': '#24498a', color: '#1b3a70', 'corner-radius': 24 } },
  { selector: ':parent', style: { shape: 'round-rectangle', 'background-color': '#f7f9fc', 'border-color': '#c3ccd8', 'border-width': 1.5, padding: 22, label: 'data(label)', 'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': -8, 'font-size': 15, 'font-weight': 700, color: '#18263a', 'text-max-width': 400 } },
  { selector: 'node[kind="domain"][!local]', style: { 'border-style': 'dashed', color: '#4a576b' } },
  { selector: 'node[kind="domain"][?empty]', style: { width: 220, height: 64, 'text-valign': 'center' } },
  { selector: 'edge', style: { label: 'data(label)', 'curve-style': 'bezier', width: 1.4, 'target-arrow-shape': 'triangle', 'line-color': '#8593a8', 'target-arrow-color': '#8593a8', 'font-family': graphFont, 'font-size': 11, color: '#4a576b', 'text-background-color': '#f3f5f8', 'text-background-opacity': 1, 'text-background-padding': 3, 'text-background-shape': 'round-rectangle', opacity: .75 } },
  { selector: 'edge[kind="usage"]', style: { 'line-color': '#24498a', 'target-arrow-color': '#24498a', color: '#1b3a70' } },
  { selector: 'edge[kind="usage"][role="participates"]', style: { 'line-style': 'dotted', 'target-arrow-shape': 'none' } },
  { selector: 'edge[kind="parent"]', style: { 'line-style': 'dashed', 'target-arrow-fill': 'hollow', 'arrow-scale': 1.3 } },
  // Lines that cross a domain boundary arc over the boxes in between instead of running through them.
  { selector: 'edge[?cross]', style: { width: 2.6, opacity: 1, 'curve-style': 'unbundled-bezier', 'control-point-weights': .5, 'control-point-distances': edge => {
    const a = edge.source().position(), b = edge.target().position();
    return -Math.min(160, Math.hypot(b.x - a.x, b.y - a.y) * .22);
  } } },
  { selector: ':selected', style: { 'overlay-opacity': 0 } },
] });
// Inside each domain box, processes take the left column and terms the columns to their right, so
// lines from work to terms run sideways instead of through other boxes. Domains wrap after four.
function overviewElements(data, crossOnly) {
  const show = item => !crossOnly || item.cross;
  const nodes = [], edges = [], cellW = 186, cellH = 92;
  let x = 0, y = 0, rowHeight = 0;
  data.domains.forEach((d, i) => {
    const processes = data.processes.filter(p => p.domain === d.file && show(p)).map(p => ({ id: 'process:' + p.key, label: p.name, kind: 'process' }));
    const terms = data.concepts.filter(c => c.owner === d.file && show(c)).map(c => ({ id: 'concept:' + c.key, label: c.name, kind: 'concept' }));
    if (i && i % 4 === 0) { x = 0; y += rowHeight + 120; rowHeight = 0; }
    const termCols = terms.length > 6 ? 2 : terms.length ? 1 : 0, offset = processes.length ? 1 : 0;
    const rows = Math.max(processes.length, Math.ceil(terms.length / (termCols || 1)), 1);
    nodes.push({ data: { id: 'domain:' + d.file, label: d.name, kind: 'domain', file: d.file, local: d.local, empty: !processes.length && !terms.length }, ...(processes.length || terms.length ? {} : { position: { x: x + cellW / 2, y: y + cellH / 2 } }) });
    processes.forEach((child, n) => nodes.push({ data: { ...child, parent: 'domain:' + d.file }, position: { x: x + cellW / 2, y: y + n * cellH + cellH / 2 } }));
    terms.forEach((child, n) => nodes.push({ data: { ...child, parent: 'domain:' + d.file }, position: { x: x + (offset + n % termCols) * (cellW + 40) + cellW / 2, y: y + Math.floor(n / termCols) * cellH + cellH / 2 } }));
    x += Math.max(1, offset + termCols) * (cellW + 40) + 80;
    rowHeight = Math.max(rowHeight, rows * cellH);
  });
  const ids = new Set(nodes.map(n => n.data.id));
  const lang = overviewLanguage();
  for (const r of data.relations.filter(show)) {
    const source = 'concept:' + r.from, target = 'concept:' + r.to;
    if (ids.has(source) && ids.has(target)) edges.push({ data: { id: `relation:${r.kind}:${r.owner}#${r.id || r.from}`, source, target, kind: r.kind, cross: r.cross, label: r.kind === 'parent' ? translateUI('〜の一種', lang) : r.name } });
  }
  const seen = new Set();
  for (const c of data.concepts.filter(show)) for (const u of c.usages) {
    const process = `process:${u.domain}#${u.process}`, concept = 'concept:' + c.key, id = `usage:${process}:${concept}:${u.role}`;
    if (seen.has(id) || !ids.has(process) || !ids.has(concept)) continue;
    seen.add(id);
    // Arrows follow the hand-over: work creates or updates a term, and a term is read by work.
    const [source, target] = u.role === 'reads' ? [concept, process] : [process, concept];
    edges.push({ data: { id, source, target, kind: 'usage', role: u.role, cross: u.domain !== c.owner, label: translateUI(overviewRoleShort[u.role], lang) } });
  }
  // Dragging is a view adjustment only: keep where boxes and nodes were moved while the page is open.
  for (const node of nodes) if (overviewDragged.has(node.data.id) && node.position) node.position = overviewDragged.get(node.data.id);
  return [...nodes, ...edges];
}
const overviewDragged = new Map();
// Dragging a domain box moves its contents, so record every node after any drag.
overviewGraph.on('dragfree', 'node', () => overviewGraph.nodes().forEach(node => { if (!node.isParent()) overviewDragged.set(node.id(), { ...node.position() }); }));
function drawOverview() {
  if (!overviewData) return;
  overviewGraph.elements().remove();
  overviewGraph.add(overviewElements(overviewData, $('overview-cross').checked));
  overviewGraph.layout({ name: 'preset', fit: false }).run();
  overviewGraph.resize();
  overviewGraph.fit(overviewGraph.elements(), 28);
  if (overviewGraph.zoom() > 1.1) { overviewGraph.zoom(1.1); overviewGraph.center(); }
}
// Open a domain, process or term in its own model.
function openFromOverview(file, open) {
  const index = entries.findIndex(e => e.file === file);
  if (index < 0) return;
  if (String(index) !== entryIndex) { $('model-choice').value = String(index); $('model-choice').onchange(); }
  open();
}
overviewGraph.on('tap', 'node', event => {
  const data = event.target.data(), [kind, key] = [data.kind, data.id.slice(data.id.indexOf(':') + 1)];
  if (kind === 'domain') return openFromOverview(data.file, () => openTerms());
  const [file, id] = [key.slice(0, key.lastIndexOf('#')), key.slice(key.lastIndexOf('#') + 1)];
  if (kind === 'process') openFromOverview(file, () => { activeProcess = id; activeStep = null; setProcessMode(true); });
  else openFromOverview(overviewData.concepts.find(c => c.key === key)?.owner || file, () => openConcept(id));
});
$('overview-fit').onclick = () => overviewGraph.fit(overviewGraph.elements(), 28);
$('overview-cross').onchange = drawOverview;
// Canvas labels are not DOM text: redraw them when the language changes.
new MutationObserver(() => { if (overviewMode) drawOverview(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
function renderOverviewDetails(data) {
  const name = file => data.domains.find(d => d.file === file)?.name || file;
  const at = (processName, stepName) => `<span>${esc(processName)}</span> › <span>${esc(stepName)}</span>`;
  const role = r => `<span class="overview-role" data-role="${r}">${esc(usageRoles[r])}</span>`;
  const linkHtml = l => `<article class="completion-group"><h3><span>${esc(name(l.from))}</span><span class="overview-arrow">→</span><span>${esc(name(l.to))}</span><small>${l.handoffs.length + l.uses.length}件</small></h3>${l.handoffs.map(h => `<div class="completion-issue"><small data-category="handoff">業務の受け渡し</small><p><b>${esc(h.concept)}</b><code class="term-id">${esc(h.conceptId)}</code><br>${at(h.from.processName, h.from.stepName)} ${role('creates')} <span class="overview-arrow">→</span> ${at(h.to.processName, h.to.stepName)} ${role(h.to.role)}</p></div>`).join('')}${l.uses.map(u => `<div class="completion-issue"><small data-category="uses">定義を使う</small><p>${u.kind === 'property' ? `<span class="kind-tag">つながり</span> <span>${esc(u.name)}</span>` : u.kind === 'parent' ? `<span>${esc(u.name)}</span> <span class="kind-tag">〜の一種</span>` : `${at(u.processName, u.name)} ${role(u.role)}`} <span class="overview-arrow">→</span> <b>${esc(u.concept)}</b><code class="term-id">${esc(u.conceptId)}</code></p></div>`).join('')}${l.imports && !l.uses.length && !l.handoffs.length ? '<div class="completion-issue"><small data-category="uses">定義を使う</small><p>読み込んでいますが、使っている箇所はありません。</p></div>' : ''}</article>`;
  const used = data.domains.filter(d => data.matrix.some(row => row.cells[d.file]));
  const owners = [...new Set(data.matrix.map(row => row.owner))];
  const roleTags = list => [...new Set(list.map(u => u.role))].map(role => `<span class="overview-role" data-role="${role}" title="${esc(list.filter(u => u.role === role).map(u => `${u.processName} › ${u.stepName}`).join('\n'))}">${esc(overviewRoleShort[role])}</span>`).join('');
  const matrix = data.matrix.length ? `<div class="overview-table-wrap"><table class="overview-table"><thead><tr><th scope="col">ことば</th>${used.map(d => `<th scope="col">${esc(d.name)}</th>`).join('')}</tr></thead>${owners.map(owner => `<tbody><tr class="overview-group"><th colspan="${used.length + 1}" scope="rowgroup"><span>定義元</span>：<span>${esc(name(owner))}</span></th></tr>${data.matrix.filter(row => row.owner === owner).map(row => `<tr><th scope="row">${esc(row.name)}<code class="term-id">${esc(row.id)}</code></th>${used.map(d => `<td${d.file === owner ? ' class="owner"' : ''}>${roleTags(row.cells[d.file] || [])}</td>`).join('')}</tr>`).join('')}</tbody>`).join('')}</table></div><p class="hint">業務フローの作業が、どのことばを作成・参照・更新するかの一覧です。濃い列はことばの定義元です。</p>` : '<p class="hint">業務フローで使われていることばはありません。</p>';
  const questions = data.questions.length ? `<article class="completion-group">${data.questions.map(q => `<div class="completion-issue"><small data-category="${q.kind === 'overlap' ? 'conflict' : 'missing'}">${q.kind === 'overlap' ? '食い違い' : '教えてほしいこと'}</small><p>${esc(q.ask)}</p><p class="issue-task">${esc(q.message)}</p></div>`).join('')}</article>` : '<p class="hint">確認したいことはありません。</p>';
  $('overview-details').innerHTML = `<h3 class="overview-heading">ドメインをまたぐ関係</h3>${data.links.length ? data.links.map(linkHtml).join('') : '<p class="hint">ドメインをまたぐ関係はまだありません。</p>'}<h3 class="overview-heading">ことばと業務の対応表</h3>${matrix}<h3 class="overview-heading">ドメインをまたいで確認したいこと</h3>${questions}`;
}
function renderOverview() {
  overviewData = workspaceOverview(entries);
  const crossing = overviewData.links.reduce((n, l) => n + l.handoffs.length + l.uses.length, 0);
  $('overview-summary').textContent = `${overviewData.domains.length}つのドメイン · ドメインをまたぐ関係 ${crossing}件`;
  renderOverviewDetails(overviewData);
  drawOverview();
}
const overviewSetProcessMode = setProcessMode;
setProcessMode = function(enabled) {
  overviewMode = false;
  overviewRoot.hidden = true;
  overviewButton.classList.remove('active');
  overviewButton.setAttribute('aria-pressed', 'false');
  overviewSetProcessMode(enabled);
};
overviewButton.onclick = () => {
  setProcessMode(false);
  overviewMode = true;
  document.querySelector('.workspace').hidden = true;
  processRoot.hidden = true;
  overviewRoot.hidden = false;
  for (const button of modeBar.querySelectorAll('button')) {
    button.classList.toggle('active', button === overviewButton);
    button.setAttribute('aria-pressed', String(button === overviewButton));
  }
  renderOverview();
};
const overviewRefresh = refresh;
refresh = function(...args) {
  overviewRefresh(...args);
  if (overviewMode) {
    document.querySelector('.workspace').hidden = true;
    processRoot.hidden = true;
  }
};
