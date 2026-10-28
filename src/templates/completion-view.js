const completionButton = document.createElement('button');
completionButton.id = 'mode-unconfirmed';
completionButton.setAttribute('aria-controls', 'unconfirmed-workspace');
modeBar.append(completionButton);
const completionRoot = document.createElement('section');
completionRoot.id = 'unconfirmed-workspace';
completionRoot.hidden = true;
completionRoot.setAttribute('aria-labelledby', 'completion-title');
document.body.append(completionRoot);
let unconfirmedMode = false;
// Stable keys for styling each category; the labels themselves come from assessCompletion.
const categoryKeys = { '未決定': 'undecided', '不足': 'missing', '未合意': 'unagreed', '不整合': 'conflict', 'データ対応': 'data', 'フロー': 'flow' };
// Open items read as questions people can answer; the recording task stays underneath.
const categoryLabels = { '未決定': '決めたいこと', '不足': '教えてほしいこと', '未合意': '合意の確認', '不整合': '食い違い', 'フロー': '業務の流れ' };
const categoryLabel = category => categoryLabels[category] || category;
// Large models have hundreds of open items: narrow them by kind (the count tiles) or by name.
const completionFilter = { category: '', query: '', owner: '', entry: null };
// Departments come from the owners of process steps. A department's questions are those about
// its steps and the terms (and metrics) those steps use: an estimate, said so on screen.
const stepOwners = () => [...new Set((model.processes || []).flatMap(p => p.steps.map(s => s.owner).filter(Boolean)))].sort();
function ownerScope(owner) {
  const steps = (model.processes || []).flatMap(p => p.steps.filter(s => s.owner === owner).map(s => ({ process: p.id, step: s })));
  const concepts = new Set(steps.flatMap(({ step }) => (step.items || []).map(i => i.concept)));
  return issue => issue.kind === 'step' ? steps.some(x => x.process === issue.process && x.step.id === issue.id)
    : issue.kind === 'process' ? steps.some(x => x.process === issue.id)
      : issue.kind === 'concept' ? concepts.has(issue.id)
        : issue.kind === 'property' ? [model.properties.find(p => p.id === issue.id)].some(p => p && (concepts.has(p.domain) || concepts.has(p.range)))
          : issue.kind === 'metric' ? concepts.has((model.metrics || []).find(m => m.id === issue.id)?.concept) : false;
}
// What the question is about, as recorded now, so people can answer without leaving the list.
function issueContext(group) {
  const item = group.kind === 'step' ? (model.processes || []).find(p => p.id === group.process)?.steps.find(s => s.id === group.id)
    : group.kind === 'process' ? (model.processes || []).find(p => p.id === group.id)
      : ({ concept: model.concepts, property: model.properties, metric: model.metrics || [] })[group.kind]?.find(x => x.id === group.id);
  if (!item) return '';
  const owner = group.kind === 'step' && item.owner ? `<span class="issue-context-owner"><span>担当</span><span>${esc(item.owner)}</span></span>` : '';
  return `<p class="issue-context"><span class="issue-context-label">いまの記録</span>${item.description ? `<span>${esc(item.description)}</span>` : '<span class="hint">説明はまだありません。</span>'}${owner}</p>`;
}
const issueMatches = (issue, query) => !query || [issue.name, issue.processName, issue.id, issue.ask, issue.message].some(value => String(value || '').toLowerCase().includes(query));
const issueText = issue => `<p>${esc(issue.ask || issue.message)}</p>${issue.ask ? `<p class="issue-task">${esc(issue.message)}</p>` : ''}`;
function renderUnconfirmed() {
  const report = assessCompletion(model);
  if (completionFilter.entry !== entryIndex) Object.assign(completionFilter, { category: '', query: '', owner: '', entry: entryIndex });
  const owners = stepOwners();
  if (!owners.includes(completionFilter.owner)) completionFilter.owner = '';
  const query = completionFilter.query.trim().toLowerCase(), inScope = completionFilter.owner ? ownerScope(completionFilter.owner) : () => true;
  const shown = report.issues.filter(issue => (!completionFilter.category || issue.category === completionFilter.category) && issueMatches(issue, query) && inScope(issue));
  // Business users answer the questions; data-mapping work belongs to the data team and comes last.
  const isData = issue => issue.category === 'データ対応';
  const questions = report.issues.filter(issue => !isData(issue));
  completionButton.innerHTML = uiIcon('chat') + `未確認事項<span class="unconfirmed-count"${questions.length ? '' : ' data-empty'}>${questions.length}</span>`;
  const groupsOf = list => {
    const groups = new Map();
    list.forEach(issue => {
      const index = report.issues.indexOf(issue);
      const key = issue.id ? `${issue.kind}:${issue.process || ''}:${issue.id}` : 'model';
      if (!groups.has(key)) groups.set(key, { ...issue, index, issues: [] });
      groups.get(key).issues.push(issue);
    });
    return [...groups.values()];
  };
  const affected = new Set(report.issues.filter(issue => issue.id).map(issue => `${issue.kind}:${issue.process || ''}:${issue.id}`)).size;
  const groupTitle = group => group.kind === 'step' ? `${esc(group.processName)} › ${esc(group.name)}` : esc(group.name);
  const kindLabel = { concept: 'ことば', property: 'つながり', process: '業務フロー', step: '作業', metric: '指標' };
  const groupHtml = group => `<article class="completion-group"><h3>${group.id ? `<button data-completion-target="${group.index}">${groupTitle(group)} ↗</button><span class="kind-tag">${kindLabel[group.kind]}</span><code class="term-id">${esc(group.id)}</code>` : 'モデル全体'}<small>${group.issues.length}件</small></h3>${group.id ? issueContext(group) : ''}${group.issues.map(issue => `<div class="completion-issue" data-issue-key="${issue.key}"><small data-category="${categoryKeys[issue.category] || ''}">${esc(categoryLabel(issue.category))}</small>${issueText(issue)}</div>`).join('')}</article>`;
  const shownQuestions = shown.filter(issue => !isData(issue)), shownData = shown.filter(isData);
  const dataSection = shownData.length ? `<section class="completion-section"><h3 class="completion-section-title"><span>データ担当者の作業</span><small>${shownData.length}件</small></h3><p class="hint">データの所在と業務の定義との差を確かめる作業です。回答欄はありません。</p>${groupsOf(shownData).map(groupHtml).join('')}</section>` : '';
  completionRoot.innerHTML = `<div class="completion-content"><h2 id="completion-title">未確認事項</h2><p>${esc(model.name)} · ${affected ? `${affected}つの用語・関係・作業に、確認が必要な項目があります。` : report.issues.length ? 'モデルに確認が必要な項目があります。' : '記録上の未確認事項はありません。'}</p><div class="completion-counts" role="group" aria-label="種類で絞り込む">${Object.keys(categoryKeys).map(category => { const count = report.issues.filter(issue => issue.category === category).length; return `<button type="button" data-category-filter="${esc(category)}" aria-pressed="${completionFilter.category === category}"${count ? '' : ' data-zero disabled'}><b>${count}</b><span>${categoryLabel(category)}</span></button>`; }).join('')}</div><div class="completion-filter"><input id="completion-search" type="search" aria-label="名前や質問で絞り込む" placeholder="名前や質問で絞り込む">${owners.length ? `<select id="completion-owner" aria-label="担当で絞り込む"><option value="">すべての担当</option>${owners.map(o => `<option value="${esc(o)}"${o === completionFilter.owner ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>` : ''}<p class="hint"${completionFilter.category || query || completionFilter.owner ? '' : ' hidden'}><span>${report.issues.length}件中${shown.length}件を表示</span>${completionFilter.owner ? '<span class="owner-note">担当の作業と、その作業に登場することばの質問です（業務フローの担当から推定）。</span>' : ''}<button type="button" id="completion-clear" class="icon-only" title="絞り込みを解除" aria-label="絞り込みを解除">${uiIcon('close')}</button></p></div>${groupsOf(shownQuestions).map(groupHtml).join('')}${dataSection}<details class="completion-policy"><summary>確認対象について</summary><p>用語・関係の説明、含む例、含まない例、根拠、合意状態、未決定のケース、属性の説明と値の種類を確認します。データ対応は登録されている場合に確認します。</p><p>業務フローでは、作業の担当、分岐・並行・合流の矢印を確認します。開始・終了を置いたフローでは、開始からたどり着けない作業と行き止まりも確認します。</p><p>指標と時間の意味は、記録されている場合に確認します。</p><p>上位概念の循環と直接指定した個数条件の矛盾も確認しますが、すべての論理矛盾や業務上の抜けを検出するものではありません。未確認事項がなくなった後も、対象業務の範囲と定義の妥当性は業務担当者と確認してください。</p><p>回答がモデルに反映されると、その質問と回答はこの画面から消えます。</p></details></div>`;
  const search = completionRoot.querySelector('#completion-search');
  search.value = completionFilter.query;
  search.oninput = () => {
    completionFilter.query = search.value;
    const caret = search.selectionStart;
    renderUnconfirmed();
    const next = completionRoot.querySelector('#completion-search');
    next.focus();
    next.setSelectionRange(caret, caret);
  };
  completionRoot.querySelectorAll('[data-category-filter]').forEach(button => button.onclick = () => {
    completionFilter.category = completionFilter.category === button.dataset.categoryFilter ? '' : button.dataset.categoryFilter;
    renderUnconfirmed();
  });
  completionRoot.querySelector('#completion-clear').onclick = () => { Object.assign(completionFilter, { category: '', query: '', owner: '' }); renderUnconfirmed(); };
  const ownerSelect = completionRoot.querySelector('#completion-owner');
  if (ownerSelect) ownerSelect.onchange = () => { completionFilter.owner = ownerSelect.value; renderUnconfirmed(); };
  completionRoot.querySelectorAll('[data-completion-target]').forEach(button => button.onclick = () => {
    const issue = report.issues[Number(button.dataset.completionTarget)];
    if (issue.kind === 'step' || issue.kind === 'process') {
      activeProcess = issue.kind === 'step' ? issue.process : issue.id;
      activeStep = issue.kind === 'step' ? issue.id : null;
      setProcessMode(true);
      if (activeStep) pickStep(activeStep);
      return;
    }
    setProcessMode(false);
    selected = { kind: issue.kind, id: issue.id };
    $('search').value = '';
    refresh();
    focusSelection();
  });
}
const completionSetProcessMode = setProcessMode;
setProcessMode = function(enabled) {
  unconfirmedMode = false;
  completionRoot.hidden = true;
  completionButton.classList.remove('active');
  completionButton.setAttribute('aria-pressed', 'false');
  completionSetProcessMode(enabled);
  $('mode-ontology').setAttribute('aria-pressed', String(!enabled));
  $('mode-process').setAttribute('aria-pressed', String(enabled));
};
completionButton.onclick = () => {
  setProcessMode(false);
  unconfirmedMode = true;
  document.querySelector('.workspace').hidden = true;
  processRoot.hidden = true;
  completionRoot.hidden = false;
  for (const button of modeBar.querySelectorAll('button')) {
    button.classList.toggle('active', button === completionButton);
    button.setAttribute('aria-pressed', String(button === completionButton));
  }
  renderUnconfirmed();
};
const completionRefresh = refresh;
refresh = function(...args) {
  completionRefresh(...args);
  renderUnconfirmed();
  if (unconfirmedMode) {
    document.querySelector('.workspace').hidden = true;
    processRoot.hidden = true;
  }
};
renderUnconfirmed();
