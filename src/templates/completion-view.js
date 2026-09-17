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
readerStyle.textContent += `#unconfirmed-workspace{flex:1;min-height:0;overflow:auto;background:#f5f8f6;padding:28px;box-sizing:border-box}#unconfirmed-workspace[hidden]{display:none}.completion-content{max-width:960px;margin:auto}.completion-content h2{margin:0 0 10px}.completion-content p{line-height:1.7}.completion-counts{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0}.completion-counts span{background:#e8f0eb;padding:7px 11px;border-radius:8px;font-size:13px}.completion-group{background:white;border:1px solid #dce6df;border-radius:12px;padding:20px;margin:16px 0}.completion-group h3{margin:0 0 12px}.completion-group h3 button{border:0;background:transparent;color:#126b5d;padding:0;font-size:18px;text-align:left}.completion-group h3 small{font-size:12px;font-weight:400;color:#61796f;margin-left:10px}.completion-issue{display:flex;gap:12px;border-top:1px solid #edf1ee;padding:12px 0}.completion-issue small{flex-shrink:0;color:#795718;padding-top:4px}.completion-issue p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.completion-policy{margin:20px 0;font-size:13px;color:#61796f}.completion-policy summary{cursor:pointer}.unconfirmed-count{margin-left:7px;background:#e5ece7;border-radius:12px;padding:1px 7px;font-size:12px}.mode-bar{flex-wrap:wrap}@media(max-width:800px){#unconfirmed-workspace{overflow:visible;padding:18px}.completion-group{padding:16px}}`;
function renderUnconfirmed() {
  const report = assessCompletion(model);
  completionButton.innerHTML = uiIcon('chat') + `未確認事項 <span class="unconfirmed-count">${report.issues.length}</span>`;
  const groups = new Map();
  report.issues.forEach((issue, index) => {
    const key = issue.id ? `${issue.kind}:${issue.id}` : 'model';
    if (!groups.has(key)) groups.set(key, { ...issue, index, issues: [] });
    groups.get(key).issues.push(issue);
  });
  const affected = [...groups.values()].filter(group => group.id).length;
  completionRoot.innerHTML = `<div class="completion-content"><h2 id="completion-title">未確認事項</h2><p>${esc(model.name)} · ${affected ? `${affected}つの用語・関係に、確認が必要な項目があります。` : report.issues.length ? 'モデルに確認が必要な項目があります。' : '記録上の未確認事項はありません。'}</p><div class="completion-counts">${['未決定', '不足', '未合意', '不整合', 'データ対応'].map(category => `<span>${category} ${report.issues.filter(issue => issue.category === category).length}</span>`).join('')}</div><p class="hint">用語名を押すと定義を確認できます。決まった内容は、根拠や具体例とともにAIへ反映を依頼してください。</p>${[...groups.values()].map(group => `<article class="completion-group"><h3>${group.id ? `<button data-completion-target="${group.index}">${esc(group.name)} ↗</button>` : 'モデル全体'}<small>${group.issues.length}件</small></h3>${group.issues.map(issue => `<div class="completion-issue"><small>${esc(issue.category)}</small><p>${esc(issue.message)}</p></div>`).join('')}</article>`).join('')}<details class="completion-policy"><summary>確認対象について</summary><p>用語・関係の説明、含む例、含まない例、根拠、合意状態、未決定のケースを確認します。データ対応は登録されている場合に確認します。</p><p>上位概念の循環と直接指定した個数条件の矛盾も確認しますが、すべての論理矛盾や業務上の抜けを検出するものではありません。未確認事項がなくなった後も、対象業務の範囲と定義の妥当性は業務担当者と確認してください。</p></details></div>`;
  completionRoot.querySelectorAll('[data-completion-target]').forEach(button => button.onclick = () => {
    const issue = report.issues[Number(button.dataset.completionTarget)];
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
