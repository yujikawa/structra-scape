import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadModel } from './validate.js';
import { assessCompletion } from './completion.js';

// Business users answer open questions in the viewer and hand the answers over as a JSON file
// (or the dev server saves it under answers/ next to the models). An AI agent turns them into
// model changes and then removes the answers it recorded. Answers are input, never model data.
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const ANSWERS_KIND = 'strscape-answers';

// The questions the viewer offers an answer box for: everything except data-mapping work.
export function openQuestions(file) {
  const absolute = path.resolve(process.cwd(), file);
  const source = fs.readFileSync(absolute, 'utf8');
  const model = loadModel(absolute);
  const questions = assessCompletion(model).issues.filter(issue => issue.category !== 'データ対応').map(issue => ({
    key: issue.key,
    category: issue.category,
    target: issue.id ? { kind: issue.kind, id: issue.id, name: issue.name, ...(issue.process ? { process: issue.process, processName: issue.processName } : {}) } : { kind: 'model' },
    question: issue.ask || issue.message,
    // Questions with known answers offer choices; the answer then carries `choice` (and `note`).
    ...(issue.choices ? { choices: issue.choices } : {}),
    ...(issue.case ? { case: issue.case } : {}),
  }));
  return { ok: true, model: path.basename(absolute), name: model.name, revision: createHash('sha256').update(source).digest('hex'), questions };
}

// Checks the shape of an answers file; the same check guards the dev server's save endpoint.
export function validateAnswers(data) {
  const errors = [];
  if (!object(data) || data.kind !== ANSWERS_KIND) return [`kind must be ${ANSWERS_KIND}`];
  if (!text(data.model, 200) || data.model !== path.basename(data.model) || !/\.ya?ml$/i.test(data.model)) errors.push('model must be a YAML file name');
  if (data.answered_by !== undefined && typeof data.answered_by !== 'string') errors.push('answered_by must be a string');
  if (!Array.isArray(data.answers) || !data.answers.length || data.answers.length > 1000) return [...errors, 'answers must list 1 to 1000 answers'];
  data.answers.forEach((answer, i) => {
    if (!object(answer) || !/^q[0-9a-f]{8}$/.test(answer.key)) errors.push(`answers[${i}].key is invalid`);
    else if (!text(answer.answer, 10000)) errors.push(`answers[${i}].answer must be nonempty text`);
    else if (!text(answer.question, 2000)) errors.push(`answers[${i}].question must be nonempty text`);
    else if (answer.choice !== undefined && !text(answer.choice, 200)) errors.push(`answers[${i}].choice must be a choice value`);
    else if (answer.note !== undefined && typeof answer.note !== 'string') errors.push(`answers[${i}].note must be text`);
  });
  return errors;
}

function readAnswers(file) {
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { fail('INVALID', `${file}: ${e.message}`); }
  const errors = validateAnswers(data);
  if (errors.length) fail('INVALID', `${file}: ${errors.join('; ')}`);
  return data;
}

// The model an answers file refers to: --model, the parent of answers/, the same folder, or models/.
function findModel(file, data, model) {
  if (model) return path.resolve(process.cwd(), model);
  const dir = path.dirname(file);
  return [path.join(dir, '..', data.model), path.join(dir, data.model), path.resolve(process.cwd(), 'models', data.model)].find(candidate => fs.existsSync(candidate));
}

// Each answer is marked `open` while its question is still asked by the current model.
export function listAnswers(target, { model } = {}) {
  const absolute = path.resolve(process.cwd(), target);
  if (!fs.existsSync(absolute)) fail('NOT_FOUND', `Not found: ${target}`);
  const files = fs.statSync(absolute).isDirectory()
    ? fs.readdirSync(absolute).filter(name => name.endsWith('.json')).sort().map(name => path.join(absolute, name))
    : [absolute];
  const listed = files.map(file => {
    const data = readAnswers(file), modelFile = findModel(file, data, model);
    const relative = value => path.relative(process.cwd(), value) || '.';
    const entry = { file: relative(file), model: data.model, answered_by: data.answered_by || '', exported_at: data.exported_at };
    if (!modelFile || !fs.existsSync(modelFile)) return { ...entry, error: `Model ${data.model} not found; pass --model`, answers: data.answers };
    const current = openQuestions(modelFile), open = new Set(current.questions.map(q => q.key));
    return { ...entry, model_file: relative(modelFile), revision_changed: data.revision !== current.revision, answers: data.answers.map(a => ({ ...a, open: open.has(a.key) })) };
  });
  // Several people may answer the same question. Each answer lists the others, and is marked as a
  // conflict when they say different things: such answers are settled with the user, not recorded.
  const byKey = new Map();
  for (const f of listed) for (const a of f.answers) {
    const id = `${f.model_file || f.model}\u0000${a.key}`;
    if (!byKey.has(id)) byKey.set(id, []);
    byKey.get(id).push({ file: f.file, answered_by: f.answered_by, answer: a });
  }
  // Answers with a choice differ when the choices differ; notes may be worded differently.
  const same = (a, b) => a.choice || b.choice ? a.choice === b.choice : a.answer.trim().replace(/\s+/g, ' ') === b.answer.trim().replace(/\s+/g, ' ');
  let conflicts = 0;
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const conflict = group.some(g => !same(g.answer, group[0].answer));
    if (conflict) conflicts++;
    for (const g of group) Object.assign(g.answer, { conflict, others: group.filter(o => o !== g).map(o => ({ file: o.file, answered_by: o.answered_by, answer: o.answer.answer, ...(o.answer.choice ? { choice: o.answer.choice } : {}) })) });
  }
  return { ok: true, conflicts, files: listed };
}

// A proposed transaction for the answers given by choice, for the AI to check and apply.
// Free-text answers, "分からない" and anything that needs a decision (agreement, aliases,
// replacements, differing answers) are listed in `notes` instead; nothing is written here.
export function answersPatch(target, { model } = {}) {
  const files = listAnswers(target, { model }).files.filter(f => !f.error);
  const modelFiles = [...new Set(files.map(f => f.model_file))];
  if (modelFiles.length !== 1) fail('VALUE', modelFiles.length ? 'The answers refer to several models; give one answers file or folder per model' : 'No answers for a model were found; pass --model');
  const modelFile = path.resolve(process.cwd(), modelFiles[0]);
  const raw = loadModel(modelFile, { resolve: false }), draft = structuredClone(raw);
  const issues = new Map(assessCompletion(loadModel(modelFile)).issues.map(issue => [issue.key, issue]));
  const lists = { concept: 'concepts', property: 'properties', metric: 'metrics' }, touched = new Set(), attributeOps = [], notes = [], recorded = [];
  const find = issue => (draft[lists[issue.kind]] || []).find(item => item.id === issue.id);
  for (const f of files) for (const a of f.answers) {
    const issue = issues.get(a.key), item = issue && find(issue);
    const note = message => notes.push({ file: f.file, key: a.key, answered_by: f.answered_by, question: a.question, answer: a.answer, note: message });
    if (!a.open || !issue) { note('この質問はもう出ていません。現在の定義を読んでから扱ってください。'); continue; }
    if (!a.choice || !issue.field || !item && issue.field !== 'review_state') { note('自由記述の回答です。内容を読んで反映してください。'); continue; }
    const take = () => { touched.add(`${issue.kind}:${issue.id}`); recorded.push({ file: f.file, key: a.key }); if (a.note?.trim()) note('補足があります。必要なら evidence や reason にも反映してください。'); };
    if (issue.field === 'case') {
      // Every department's judgment is kept, "分からない" included; it never decides the case.
      const c = item.cases?.find(x => x.description === issue.case);
      if (!c || !['included', 'excluded', 'unsure'].includes(a.choice)) { note('対応するケースが見つかりません。'); continue; }
      const by = (f.answered_by || '').trim() || '回答者未記入';
      c.judgments = [...(c.judgments || []).filter(j => j.by !== by), { by, result: a.choice, ...(a.note?.trim() ? { reason: a.note.trim() } : {}) }];
      take();
      note(`judgments.by に回答者「${by}」を入れました。部署・役割の名前に直してから apply してください。`);
      continue;
    }
    if (a.choice === 'unsure') { note('「分からない」という回答です。ほかの人に聞いてください。'); continue; }
    if (a.conflict) { note('ほかの回答と分かれています。ユーザーに確認してください。'); continue; }
    const yes = a.choice === 'yes';
    if (issue.field === 'review_state') { note(yes ? '定義に同意しています。合意として記録するのは、ユーザーに確認してから（review_state・agreed_by・agreed_at）。' : '定義に同意していません。補足を読んで定義を見直してください。'); continue; }
    if (issue.field === 'alias') { note(`別名「${issue.alias}」は ${a.choice} を指すという回答です。別名を付け替えるか、ユーザーに確認してください。`); continue; }
    if (issue.field === 'replaced_by') { note(yes ? `置き換え先 ${issue.replacement} で合っているという回答です。参照を置き換えてください。` : '置き換え先ではないという回答です。補足を読んでください。'); continue; }
    if (issue.field === 'temporal.basis') item.temporal = { ...item.temporal, basis: a.choice };
    else if (issue.field.startsWith('temporal.period.')) item.temporal.period[issue.field.split('.').pop()] = yes;
    else if (issue.field === 'aggregation') item.aggregation = a.choice;
    else if (issue.field === 'dimension.additive') { const d = item.dimensions?.find(x => x.name === issue.dimension); if (!d) { note('対応する軸が見つかりません。'); continue; } d.additive = yes; }
    else if (issue.field === 'attribute.type') {
      attributeOps.push({ op: 'upsert', entity: 'attribute', concept: issue.id, id: issue.attribute, value: { type: a.choice } });
      recorded.push({ file: f.file, key: a.key });
      continue;
    }
    else { note('自動では反映できない回答です。'); continue; }
    take();
  }
  const operations = [...touched].map(entry => {
    const [kind, id] = entry.split(':'), list = lists[kind];
    const before = raw[list].find(x => x.id === id), after = draft[list].find(x => x.id === id);
    const value = Object.fromEntries(Object.keys(after).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map(key => [key, after[key]]));
    return { op: 'upsert', entity: kind, id, value };
  }).filter(op => Object.keys(op.value).length);
  return { ok: true, model: path.relative(process.cwd(), modelFile) || modelFile, patch: { operations: [...operations, ...attributeOps] }, recorded, notes };
}

// Answers saved under <dir>/answers/ for one model, flattened (the dev server shows them in the viewer).
export function savedAnswers(dir, model) {
  const folder = path.join(dir, 'answers');
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter(name => name.endsWith('.json')).sort().flatMap(name => {
    try {
      const data = readAnswers(path.join(folder, name));
      return data.model === model ? data.answers.map(a => ({ key: a.key, answer: a.answer, ...(a.choice ? { choice: a.choice } : {}), answered_by: data.answered_by || '', exported_at: data.exported_at || '', file: name })) : [];
    } catch { return []; }
  });
}

// Removes recorded answers from a file, and the file itself once it is empty.
export function resolveAnswers(target, keys) {
  const file = path.resolve(process.cwd(), target);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) fail('NOT_FOUND', `--resolve needs an answers file: ${target}`);
  const data = readAnswers(file);
  const unknown = keys.filter(key => !data.answers.some(a => a.key === key));
  if (unknown.length) fail('NOT_FOUND', `No answer with key: ${unknown.join(', ')}`);
  const remaining = data.answers.filter(a => !keys.includes(a.key));
  if (remaining.length) {
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ ...data, answers: remaining }, null, 2) + '\n');
    fs.renameSync(temporary, file);
  } else fs.unlinkSync(file);
  return { ok: true, removed: keys.length, remaining: remaining.length, deleted: !remaining.length };
}

// Saves answers posted by the viewer to <dir>/answers/<model>-<time>.json (dev server only).
export function saveAnswers(dir, data) {
  const errors = validateAnswers(data);
  if (errors.length) fail('INVALID', errors.join('; '));
  const folder = path.join(dir, 'answers');
  fs.mkdirSync(folder, { recursive: true });
  const stem = path.basename(data.model, path.extname(data.model)).replace(/[^\w-]/g, '_');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
  for (let n = 0; ; n++) {
    const file = path.join(folder, `${stem}-${stamp}${n ? `-${n}` : ''}.json`);
    try { fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' }); return file; }
    catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
}

export function registerAnswerCommands(program, run) {
  program.command('questions <file>').description('List the open questions for business users as JSON, with their keys')
    .action(run(file => openQuestions(file)));
  program.command('answers <path>').description('Read answers exported from the viewer (a file or a folder); --resolve removes recorded ones')
    .option('--model <file>', 'model the answers refer to (default: found next to the answers)')
    .option('--resolve <keys...>', 'remove these answers from the file; the file is deleted when empty')
    .option('--patch', 'propose an apply transaction for the answers given by choice (nothing is written)')
    .action(run((target, options) => options.resolve ? resolveAnswers(target, options.resolve) : options.patch ? answersPatch(target, options) : listAnswers(target, options)));
}
