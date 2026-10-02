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
const issueText = issue => `<p>${esc(issue.ask || issue.message)}</p>${issue.ask ? `<p class="issue-task">${esc(issue.message)}</p>` : ''}`;
function renderUnconfirmed() {
  const report = assessCompletion(model);
  completionButton.innerHTML = uiIcon('chat') + `未確認事項<span class="unconfirmed-count"${report.issues.length ? '' : ' data-empty'}>${report.issues.length}</span>`;
  const groups = new Map();
  report.issues.forEach((issue, index) => {
    const key = issue.id ? `${issue.kind}:${issue.process || ''}:${issue.id}` : 'model';
    if (!groups.has(key)) groups.set(key, { ...issue, index, issues: [] });
    groups.get(key).issues.push(issue);
  });
  const affected = [...groups.values()].filter(group => group.id).length;
  const groupTitle = group => group.kind === 'step' ? `${esc(group.processName)} › ${esc(group.name)}` : esc(group.name);
  const kindLabel = { concept: 'ことば', property: 'つながり', process: '業務フロー', step: '作業' };
  completionRoot.innerHTML = `<div class="completion-content"><h2 id="completion-title">未確認事項</h2><p>${esc(model.name)} · ${affected ? `${affected}つの用語・関係・作業に、確認が必要な項目があります。` : report.issues.length ? 'モデルに確認が必要な項目があります。' : '記録上の未確認事項はありません。'}</p><div class="completion-counts">${Object.keys(categoryKeys).map(category => { const count = report.issues.filter(issue => issue.category === category).length; return `<span${count ? '' : ' data-zero'}><b>${count}</b>${categoryLabel(category)}</span>`; }).join('')}</div><p class="hint">分かることを回答欄に書き、「回答を書き出す」でモデルの担当者に渡してください。データ対応はデータ担当者の作業なので、回答欄はありません。名前を押すと定義を確認できます。</p>${[...groups.values()].map(group => `<article class="completion-group"><h3>${group.id ? `<button data-completion-target="${group.index}">${groupTitle(group)} ↗</button><span class="kind-tag">${kindLabel[group.kind]}</span><code class="term-id">${esc(group.id)}</code>` : 'モデル全体'}<small>${group.issues.length}件</small></h3>${group.issues.map(issue => `<div class="completion-issue" data-issue-key="${issue.key}"><small data-category="${categoryKeys[issue.category] || ''}">${esc(categoryLabel(issue.category))}</small>${issueText(issue)}</div>`).join('')}</article>`).join('')}<details class="completion-policy"><summary>確認対象について</summary><p>用語・関係の説明、含む例、含まない例、根拠、合意状態、未決定のケース、属性の説明と値の種類を確認します。データ対応は登録されている場合に確認します。</p><p>業務フローでは、作業の担当、分岐・並行・合流の矢印を確認します。開始・終了を置いたフローでは、開始からたどり着けない作業と行き止まりも確認します。</p><p>上位概念の循環と直接指定した個数条件の矛盾も確認しますが、すべての論理矛盾や業務上の抜けを検出するものではありません。未確認事項がなくなった後も、対象業務の範囲と定義の妥当性は業務担当者と確認してください。</p></details></div>`;
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
