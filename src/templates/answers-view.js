// Business users answer open questions here and hand the answers to the data team as a file
// (the dev server saves it under answers/ instead). Answers are kept in this browser until
// their question disappears from the model, which means the AI has recorded them.
const answerEntry = () => entries[Number(entryIndex)];
const answerStoreKey = () => `structra-answers:${model.base}${answerEntry().file || answerEntry().slug}`;
function readAnswerStore() {
  try {
    const stored = JSON.parse(localStorage.getItem(answerStoreKey()));
    if (stored && typeof stored === 'object' && stored.answers && typeof stored.answers === 'object') return stored;
  } catch {}
  return { answered_by: '', answers: {} };
}
function writeAnswerStore(store) {
  try { localStorage.setItem(answerStoreKey(), JSON.stringify(store)); } catch { /* Answers then last until the page closes. */ }
}
let answerStore = readAnswerStore();
const answersRenderUnconfirmed = renderUnconfirmed;
renderUnconfirmed = function() {
  answersRenderUnconfirmed();
  answerStore = readAnswerStore();
  const open = new Map(assessCompletion(model).issues.filter(issue => issue.category !== 'データ対応').map(issue => [issue.key, issue]));
  // A question that is no longer asked has been recorded in the model: drop its answer.
  const stale = Object.keys(answerStore.answers).filter(key => !open.has(key));
  for (const key of stale) delete answerStore.answers[key];
  if (stale.length) writeAnswerStore(answerStore);
  if (!open.size) return;
  const content = completionRoot.querySelector('.completion-content');
  const bar = document.createElement('section');
  bar.className = 'answer-bar';
  bar.innerHTML = `<label><span>回答者</span><input id="answer-name" placeholder="例：営業部 山田"></label><p class="answer-summary"></p><button id="answer-export" class="answer-export">回答を書き出す</button><p class="hint answer-note">モデルに反映された質問は一覧から消え、その回答もこの画面から消えます。</p>`;
  content.querySelector(':scope > .hint').after(bar);
  const name = bar.querySelector('#answer-name');
  name.value = answerStore.answered_by || '';
  name.oninput = () => { answerStore.answered_by = name.value; writeAnswerStore(answerStore); };
  const summary = () => {
    const count = Object.keys(answerStore.answers).length;
    bar.querySelector('.answer-summary').textContent = count ? `${count}件の回答を入力済み` : 'まだ回答はありません。';
  };
  summary();
  for (const element of content.querySelectorAll('.completion-issue[data-issue-key]')) {
    const key = element.dataset.issueKey, issue = open.get(key);
    if (!issue) continue;
    const field = document.createElement('div');
    field.className = 'answer-field';
    field.innerHTML = '<textarea rows="2" aria-label="回答" placeholder="回答を入力"></textarea><small class="answer-exported" hidden>書き出し済み</small>';
    const input = field.querySelector('textarea'), exported = field.querySelector('.answer-exported');
    input.value = answerStore.answers[key]?.answer || '';
    exported.hidden = !answerStore.answers[key]?.exported;
    input.oninput = () => {
      if (input.value.trim()) answerStore.answers[key] = { answer: input.value, exported: false };
      else delete answerStore.answers[key];
      exported.hidden = true;
      writeAnswerStore(answerStore);
      summary();
    };
    element.append(field);
  }
  bar.querySelector('#answer-export').onclick = () => exportAnswers(open);
};
async function exportAnswers(open) {
  const entry = answerEntry();
  const answers = Object.entries(answerStore.answers).filter(([key, value]) => open.has(key) && value.answer.trim()).map(([key, value]) => {
    const issue = open.get(key);
    const target = issue.id ? { kind: issue.kind, id: issue.id, name: issue.name, ...(issue.process ? { process: issue.process, processName: issue.processName } : {}) } : { kind: 'model' };
    return { key, category: issue.category, target, question: issue.ask || issue.message, answer: value.answer.trim() };
  });
  if (!answers.length) { status('回答を書き出すには、回答欄に入力してください。', true); return; }
  const payload = { kind: 'strscape-answers', model: entry.file || `${entry.slug}.yaml`, model_name: model.name, revision: entry.revision, answered_by: (answerStore.answered_by || '').trim(), exported_at: new Date().toISOString(), answers };
  let saved = '';
  if (window.__STRUCTRA_DEV__) {
    try {
      const response = await fetch('/answers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (result.ok) saved = result.file;
    } catch { /* Fall back to a download. */ }
  }
  if (saved) status(`回答を保存しました：${saved}`);
  else {
    const filename = `answers-${entry.slug}-${payload.exported_at.replace(/[-:]/g, '').slice(0, 13)}.json`;
    download(filename, JSON.stringify(payload, null, 2) + '\n', 'application/json');
    status(`回答を書き出しました：${filename}`);
  }
  for (const { key } of answers) answerStore.answers[key].exported = true;
  writeAnswerStore(answerStore);
  renderUnconfirmed();
}
