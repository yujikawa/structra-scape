// Changes since a git revision (build/dev --compare). Shown only when the model carries a baseline.
const changesButton = document.createElement('button');
changesButton.id = 'mode-changes';
changesButton.setAttribute('aria-controls', 'changes-workspace');
modeBar.append(changesButton);
const changesRoot = document.createElement('section');
changesRoot.id = 'changes-workspace';
changesRoot.hidden = true;
changesRoot.setAttribute('aria-labelledby', 'changes-title');
document.body.append(changesRoot);
let changesMode = false;
const changeKindLabels = { model: 'モデル', concept: 'ことば', attribute: '属性', property: 'つながり', restriction: '分類条件', process: '業務フロー', step: '作業', flow: '流れ' };
const changeTypeLabels = { added: '追加', removed: '削除', changed: '変更' };
function changeValue(value) {
  if (value === undefined || value === null || value === '') return '<span class="hint">（なし）</span>';
  if (typeof value === 'string') return esc(value);
  if (Array.isArray(value) && value.every(v => typeof v === 'string')) return esc(value.join('、'));
  return `<code>${esc(JSON.stringify(value, null, 1))}</code>`;
}
function renderChanges() {
  const entry = entries[Number(entryIndex)];
  changesButton.hidden = !entry?.changes;
  if (!entry?.changes) { if (changesMode) setProcessMode(false); return; }
  const changes = entry.changes.list, agreed = changes.filter(c => c.agreed);
  changesButton.innerHTML = uiIcon('diff') + `変更点<span class="unconfirmed-count"${changes.length ? '' : ' data-empty'}>${changes.length}</span>`;
  const owner = c => c.entity === 'attribute' ? `${esc(c.conceptName)} › ` : ['step', 'flow'].includes(c.entity) ? `${esc(c.processName)} › ` : '';
  // Removed items and entries without an id (rules, flows) have nothing to open in the current model.
  const target = c => ({ concept: c.id, attribute: c.concept, property: c.id, process: c.id, step: c.id })[c.entity];
  const openable = c => target(c) !== undefined && (c.entity === 'attribute' ? entry.model.concepts.some(x => x.id === c.concept) : c.change !== 'removed');
  changesRoot.innerHTML = `<div class="completion-content"><h2 id="changes-title">変更点</h2><p><span>比較元</span> <code class="term-id">${esc(entry.changes.ref)}</code> · <span>${changes.length ? `${changes.length}件の変更` : '意味の変更はありません。'}</span></p>${entry.changes.newFile ? '<p class="hint">比較元のコミットにこのファイルはありません。すべて新規として表示します。</p>' : ''}${agreed.length ? `<p class="question-banner">${uiIcon('chat')}合意済みの定義に関わる変更が${agreed.length}件あります。業務担当者と内容を確認してください。</p>` : ''}<p class="hint">図の配置（position）の変更は含みません。</p>${changes.map((c, i) => `<article class="completion-group change-entry${c.agreed ? ' agreed' : ''}"><h3><small class="change-type ${c.change}">${changeTypeLabels[c.change]}</small><span class="kind-tag">${changeKindLabels[c.entity]}</span>${openable(c) ? `<button data-change="${i}">${owner(c)}${esc(c.name)} ↗</button>` : `<span>${owner(c)}${esc(c.name)}</span>`}${c.id ? `<code class="term-id">${esc(c.id)}</code>` : ''}${c.agreed ? '<span class="review-badge agreed">合意済み</span>' : ''}</h3>${(c.fields || []).map(f => `<div class="change-field"><small>${esc(changeFieldLabels[f.field] || f.field)}</small><div class="change-before">${changeValue(f.before)}</div><div class="change-after">${changeValue(f.after)}</div></div>`).join('')}</article>`).join('')}</div>`;
  changesRoot.querySelectorAll('[data-change]').forEach(button => button.onclick = () => {
    const c = changes[Number(button.dataset.change)];
    if (c.entity === 'process' || c.entity === 'step') {
      activeProcess = c.entity === 'step' ? c.process : c.id;
      activeStep = c.entity === 'step' ? c.id : null;
      setProcessMode(true);
      if (activeStep) pickStep(activeStep);
      return;
    }
    setProcessMode(false);
    selected = { kind: c.entity === 'property' ? 'property' : 'concept', id: target(c) };
    $('search').value = '';
    refresh();
    focusSelection();
  });
}
const changesSetProcessMode = setProcessMode;
setProcessMode = function(enabled) {
  changesMode = false;
  changesRoot.hidden = true;
  changesButton.classList.remove('active');
  changesButton.setAttribute('aria-pressed', 'false');
  changesSetProcessMode(enabled);
};
changesButton.onclick = () => {
  setProcessMode(false);
  changesMode = true;
  document.querySelector('.workspace').hidden = true;
  processRoot.hidden = true;
  changesRoot.hidden = false;
  for (const button of modeBar.querySelectorAll('button')) {
    button.classList.toggle('active', button === changesButton);
    button.setAttribute('aria-pressed', String(button === changesButton));
  }
  renderChanges();
};
const changesRefresh = refresh;
refresh = function(...args) {
  changesRefresh(...args);
  renderChanges();
  if (changesMode) {
    document.querySelector('.workspace').hidden = true;
    processRoot.hidden = true;
  }
};
renderChanges();
