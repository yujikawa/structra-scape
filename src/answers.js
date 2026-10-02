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

// The questions shown in the viewer's business view: everything except data-mapping work.
export function openQuestions(file) {
  const absolute = path.resolve(process.cwd(), file);
  const source = fs.readFileSync(absolute, 'utf8');
  const model = loadModel(absolute);
  const questions = assessCompletion(model).issues.filter(issue => issue.category !== 'データ対応').map(issue => ({
    key: issue.key,
    category: issue.category,
    target: issue.id ? { kind: issue.kind, id: issue.id, name: issue.name, ...(issue.process ? { process: issue.process, processName: issue.processName } : {}) } : { kind: 'model' },
    question: issue.ask || issue.message,
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
  return { ok: true, files: files.map(file => {
    const data = readAnswers(file), modelFile = findModel(file, data, model);
    const relative = value => path.relative(process.cwd(), value) || '.';
    const entry = { file: relative(file), model: data.model, answered_by: data.answered_by || '', exported_at: data.exported_at };
    if (!modelFile || !fs.existsSync(modelFile)) return { ...entry, error: `Model ${data.model} not found; pass --model`, answers: data.answers };
    const current = openQuestions(modelFile), open = new Set(current.questions.map(q => q.key));
    return { ...entry, model_file: relative(modelFile), revision_changed: data.revision !== current.revision, answers: data.answers.map(a => ({ ...a, open: open.has(a.key) })) };
  }) };
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
    .action(run((target, options) => options.resolve ? resolveAnswers(target, options.resolve) : listAnswers(target, options)));
}
