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
  bar.innerHTML = `<label><span>回答者</span><input id="answer-name" placeholder="例：営業部 山田"></label><p class="answer-summary"></p><button id="answer-export" class="answer-export">${uiIcon('download')}回答を書き出す</button><p class="hint answer-note">分かる質問に回答を書き、「回答を書き出す」でモデルの担当者に渡してください。</p>`;
  content.querySelector('.completion-filter').after(bar);
  const name = bar.querySelector('#answer-name');
  name.value = answerStore.answered_by || '';
  name.oninput = () => { answerStore.answered_by = name.value; writeAnswerStore(answerStore); };
  // The export button sits at the top; a bar follows the reader at the bottom while answers
  // have not been exported yet, so they are not left in this browser by mistake.
  const pending = document.createElement('div');
  pending.className = 'answer-pending';
  pending.innerHTML = `<p><span>書き出していない回答が</span><b></b><span>件あります。</span></p><button type="button" class="answer-export">${uiIcon('download')}回答を書き出す</button>`;
  content.append(pending);
  pending.querySelector('button').onclick = () => exportAnswers(open);
  const summary = () => {
    const count = Object.keys(answerStore.answers).length;
    bar.querySelector('.answer-summary').textContent = count ? `${count}件の回答を入力済み` : 'まだ回答はありません。';
    const unsent = Object.values(answerStore.answers).filter(a => !a.exported).length;
    pending.hidden = !unsent;
    pending.querySelector('b').textContent = String(unsent);
  };
  summary();
  for (const element of content.querySelectorAll('.completion-issue[data-issue-key]')) {
    const key = element.dataset.issueKey, issue = open.get(key);
    if (!issue) continue;
    const field = document.createElement('div');
    field.className = 'answer-field';
    // Questions with known answers offer choices; free text can always be added (a note when a
    // choice is picked, the answer itself otherwise).
    const choices = issue.choices ? `<div class="answer-choices" role="group" aria-label="選択肢">${issue.choices.map(c => `<button type="button" data-choice="${esc(c.value)}" aria-pressed="false">${esc(c.label)}</button>`).join('')}</div>` : '';
    const hint = issue.choices ? '補足（任意）' : '回答を入力';
    field.innerHTML = `${choices}<textarea rows="2" aria-label="${hint}" placeholder="${hint}"></textarea><small class="answer-exported" hidden>書き出し済み</small>`;
    const input = field.querySelector('textarea'), exported = field.querySelector('.answer-exported');
    const stored = answerStore.answers[key];
    let choice = issue.choices?.some(c => c.value === stored?.choice) ? stored.choice : '';
    input.value = stored ? (stored.choice ? stored.note || '' : stored.answer || '') : '';
    exported.hidden = !stored?.exported;
    const showChoice = () => field.querySelectorAll('[data-choice]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.choice === choice)));
    const save = () => {
      const note = input.value.trim(), label = issue.choices?.find(c => c.value === choice)?.label;
      if (label) answerStore.answers[key] = { choice, note, answer: label + (note ? '：' + note : ''), exported: false };
      else if (note) answerStore.answers[key] = { answer: input.value, exported: false };
      else delete answerStore.answers[key];
      exported.hidden = true;
      writeAnswerStore(answerStore);
      summary();
    };
    field.querySelectorAll('[data-choice]').forEach(b => b.onclick = () => { choice = choice === b.dataset.choice ? '' : b.dataset.choice; showChoice(); save(); });
    showChoice();
    input.oninput = save;
    element.append(field);
  }
  bar.querySelector('#answer-export').onclick = () => exportAnswers(open);
  oneByOne(content, bar);
};
// One question at a time: the same answer fields, shown one by one with the progress.
// Moving on without answering skips; "分からない" is an answer and is exported.
const answerFocus = { on: false, key: null };
function oneByOne(content, bar) {
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.id = 'answer-focus'; toggle.className = 'answer-focus-toggle';
  toggle.setAttribute('aria-pressed', String(answerFocus.on));
  toggle.textContent = '1問ずつ答える';
  bar.querySelector('.answer-summary').after(toggle);
  toggle.onclick = () => { answerFocus.on = !answerFocus.on; renderUnconfirmed(); };
  const items = [...content.querySelectorAll(':scope > .completion-group .completion-issue')].filter(item => item.querySelector('.answer-field'));
  completionRoot.classList.toggle('one-by-one', answerFocus.on && items.length > 0);
  if (!answerFocus.on || !items.length) return;
  let index = Math.max(0, items.findIndex(item => item.dataset.issueKey === answerFocus.key));
  const step = document.createElement('div');
  step.className = 'answer-step';
  step.innerHTML = `<button type="button" id="answer-prev">前へ</button><span class="answer-progress"><b></b><span> / ${items.length}</span></span><button type="button" id="answer-next">次へ</button>`;
  bar.after(step);
  const show = () => {
    answerFocus.key = items[index].dataset.issueKey;
    content.querySelectorAll('.completion-group, .completion-issue').forEach(element => element.classList.remove('current'));
    items[index].classList.add('current');
    items[index].closest('.completion-group').classList.add('current');
    step.querySelector('b').textContent = String(index + 1);
    step.querySelector('#answer-prev').disabled = index === 0;
    step.querySelector('#answer-next').textContent = index === items.length - 1 ? '最後の質問です' : answerStore.answers[answerFocus.key] ? '次へ' : 'スキップして次へ';
    step.querySelector('#answer-next').disabled = index === items.length - 1;
    items[index].querySelector('.answer-choices button, textarea')?.focus({ preventScroll: true });
  };
  step.querySelector('#answer-prev').onclick = () => { index--; show(); };
  step.querySelector('#answer-next').onclick = () => { index++; show(); };
  items.forEach(item => item.addEventListener('input', () => { if (item.classList.contains('current')) show(); }));
  items.forEach(item => item.querySelectorAll('[data-choice]').forEach(b => b.addEventListener('click', () => show())));
  show();
}
async function exportAnswers(open) {
  const entry = answerEntry();
  const answers = Object.entries(answerStore.answers).filter(([key, value]) => open.has(key) && value.answer?.trim()).map(([key, value]) => {
    const issue = open.get(key);
    const target = issue.id ? { kind: issue.kind, id: issue.id, name: issue.name, ...(issue.process ? { process: issue.process, processName: issue.processName } : {}) } : { kind: 'model' };
    return { key, category: issue.category, target, question: issue.ask || issue.message, answer: value.answer.trim(), ...(value.choice && issue.choices?.some(c => c.value === value.choice) ? { choice: value.choice, ...(value.note ? { note: value.note } : {}) } : {}) };
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
// Answers already given: saved on the dev server (answers/), or opened from exported files. They
// are shown under each question so nobody answers twice and differing answers stand out.
const sharedAnswers = { loadedFor: null, dev: [], files: [] };
const answerModelFile = () => answerEntry().file || `${answerEntry().slug}.yaml`;
function loadDevAnswers() {
  const model = answerModelFile();
  if (!window.__STRUCTRA_DEV__ || sharedAnswers.loadedFor === model) return;
  sharedAnswers.loadedFor = model;
  fetch('/answers?model=' + encodeURIComponent(model)).then(response => response.json()).then(result => {
    if (!result.ok || sharedAnswers.loadedFor !== model) return;
    sharedAnswers.dev = result.answers.map(a => ({ ...a, model }));
    if (unconfirmedMode) renderUnconfirmed();
  }).catch(() => { /* The questions still work without the saved answers. */ });
}
const sharedRenderUnconfirmed = renderUnconfirmed;
renderUnconfirmed = function() {
  sharedRenderUnconfirmed();
  loadDevAnswers();
  const bar = completionRoot.querySelector('.answer-bar');
  if (!bar) return;
  // A button (reachable by keyboard) that opens the hidden file input.
  const open = document.createElement('span');
  open.className = 'answer-open';
  open.innerHTML = '<input type="file" accept=".json,application/json" multiple hidden><button type="button"></button>';
  iconOnly(open.querySelector('button'), 'folder', '回答ファイルを開く');
  open.querySelector('button').onclick = () => open.querySelector('input').click();
  bar.querySelector('.answer-export').before(open);
  open.querySelector('input').onchange = async event => {
    let added = 0, skipped = 0;
    for (const file of event.target.files) {
      try {
        const data = JSON.parse(await file.text());
        if (data?.kind !== 'strscape-answers' || !Array.isArray(data.answers)) { skipped++; continue; }
        if (data.model !== answerModelFile()) { skipped++; continue; }
        for (const a of data.answers) if (typeof a?.key === 'string' && typeof a.answer === 'string') { sharedAnswers.files.push({ key: a.key, answer: a.answer, choice: typeof a.choice === 'string' ? a.choice : undefined, answered_by: String(data.answered_by || ''), exported_at: String(data.exported_at || ''), file: file.name, model: data.model }); added++; }
      } catch { skipped++; }
    }
    status(skipped ? `${added}件の回答を読み込みました。このモデルの回答ではないファイルが${skipped}件ありました。` : `${added}件の回答を読み込みました。`, !added);
    renderUnconfirmed();
  };
  const model = answerModelFile(), normalize = text => text.trim().replace(/\s+/g, ' ');
  const known = [...sharedAnswers.dev, ...sharedAnswers.files].filter(a => a.model === model);
  for (const element of completionRoot.querySelectorAll('.completion-issue[data-issue-key]')) {
    const seen = new Set(), list = known.filter(a => a.key === element.dataset.issueKey && !seen.has(a.answered_by + '\u0000' + normalize(a.answer)) && seen.add(a.answered_by + '\u0000' + normalize(a.answer)));
    if (!list.length) continue;
    const box = document.createElement('div');
    box.className = 'answer-others';
    const conflict = new Set(list.map(a => a.choice || normalize(a.answer))).size > 1;
    box.innerHTML = `<p><small>これまでの回答</small>${conflict ? '<small class="answer-conflict">回答が分かれています</small>' : ''}</p><ul>${list.map(a => `<li><b>${esc(a.answered_by || '回答者未記入')}</b><span>${esc(a.answer)}</span></li>`).join('')}</ul>`;
    (element.querySelector('.answer-field') || element.lastElementChild).before(box);
  }
};
const sharedExportAnswers = exportAnswers;
exportAnswers = async function(open) {
  await sharedExportAnswers(open);
  sharedAnswers.loadedFor = null;
  loadDevAnswers();
};
