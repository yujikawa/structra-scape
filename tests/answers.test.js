import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { assessCompletion } from '../src/completion.js';
import { loadModel } from '../src/validate.js';
import { openQuestions, listAnswers, resolveAnswers, validateAnswers } from '../src/answers.js';
import { updateDocument } from '../src/mutate.js';
import { renderBundle } from '../src/build.js';
import { dev } from '../src/dev.js';

function workspace(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structra-answers-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const name of ['customer-contract.yaml', 'billing.yaml']) fs.copyFileSync(path.join('samples', name), path.join(dir, name));
  return dir;
}
const answersFor = (questions, picks, extra = {}) => ({
  kind: 'strscape-answers', model: questions.model, revision: questions.revision, answered_by: '営業部 山田', exported_at: '2026-10-02T00:00:00.000Z',
  answers: picks.map(([q, answer]) => ({ key: q.key, category: q.category, target: q.target, question: q.question, answer })), ...extra,
});

test('open item keys are stable and change with the question', () => {
  const model = loadModel('samples/customer-contract.yaml');
  const keys = assessCompletion(model).issues.map(i => i.key);
  assert.ok(keys.every(key => /^q[0-9a-f]{8}$/.test(key)));
  assert.deepEqual(assessCompletion(loadModel('samples/customer-contract.yaml')).issues.map(i => i.key), keys);
  const customer = model.concepts.find(c => c.id === 'Customer');
  const before = assessCompletion(model).issues.filter(i => i.id === 'Customer' && i.category === '未決定').map(i => i.key);
  customer.cases = customer.cases.map(c => ({ ...c, description: c.description + '（改）' }));
  const after = assessCompletion(model).issues.filter(i => i.id === 'Customer' && i.category === '未決定').map(i => i.key);
  assert.notDeepEqual(after, before);
});

test('questions list the business view items; answers track whether each is still asked', t => {
  const dir = workspace(t), file = path.join(dir, 'customer-contract.yaml');
  const questions = openQuestions(file);
  assert.equal(questions.model, 'customer-contract.yaml');
  assert.ok(questions.questions.length > 0);
  assert.ok(questions.questions.every(q => q.question && q.category !== 'データ対応'));
  // The CLI prints the same list.
  const cli = JSON.parse(execFileSync(process.execPath, [path.resolve('src/index.js'), 'questions', file], { encoding: 'utf8' }));
  assert.deepEqual(cli, questions);

  const example = questions.questions.find(q => q.target.id === 'Organization' && q.question === '具体的には、どんなものが含まれますか？');
  const owner = questions.questions.find(q => q.target.kind === 'step') || questions.questions.at(-1);
  fs.mkdirSync(path.join(dir, 'answers'));
  const answersFile = path.join(dir, 'answers', 'customer-contract-1.json');
  fs.writeFileSync(answersFile, JSON.stringify(answersFor(questions, [[example, '株式会社や合同会社'], [owner, '営業部']])));
  let listed = listAnswers(path.join(dir, 'answers')).files[0];
  assert.equal(listed.model_file, path.relative(process.cwd(), file));
  assert.equal(listed.revision_changed, false);
  assert.deepEqual(listed.answers.map(a => a.open), [true, true]);

  // Once the model records the answer, its question is no longer asked.
  updateDocument(file, { operations: [{ op: 'upsert', entity: 'concept', id: 'Organization', value: { example: '株式会社や合同会社' } }] });
  listed = listAnswers(answersFile).files[0];
  assert.equal(listed.revision_changed, true);
  assert.deepEqual(listed.answers.map(a => a.open), [false, true]);

  assert.deepEqual(resolveAnswers(answersFile, [example.key]), { ok: true, removed: 1, remaining: 1, deleted: false });
  assert.throws(() => resolveAnswers(answersFile, ['q00000000']), { code: 'NOT_FOUND' });
  assert.deepEqual(resolveAnswers(answersFile, [owner.key]), { ok: true, removed: 1, remaining: 0, deleted: true });
  assert.equal(fs.existsSync(answersFile), false);
});

test('answers files are validated and found next to the model or through --model', t => {
  const dir = workspace(t), file = path.join(dir, 'customer-contract.yaml');
  const questions = openQuestions(file), first = questions.questions[0];
  assert.deepEqual(validateAnswers(answersFor(questions, [[first, 'はい']])), []);
  assert.match(validateAnswers({ kind: 'other' }).join(), /kind/);
  assert.match(validateAnswers(answersFor(questions, [[first, 'はい']], { model: '../secret.yaml' })).join(), /model/);
  assert.match(validateAnswers(answersFor(questions, [[first, '  ']])).join(), /answer/);
  assert.match(validateAnswers(answersFor(questions, [])).join(), /answers/);

  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'structra-downloads-'));
  t.after(() => fs.rmSync(downloads, { recursive: true, force: true }));
  const downloaded = path.join(downloads, 'answers.json');
  fs.writeFileSync(downloaded, JSON.stringify(answersFor(questions, [[first, 'はい']])));
  assert.match(listAnswers(downloaded).files[0].error, /--model/);
  assert.equal(listAnswers(downloaded, { model: file }).files[0].answers[0].open, true);
  fs.writeFileSync(downloaded, '{');
  assert.throws(() => listAnswers(downloaded), { code: 'INVALID' });
});

test('the build embeds the file name and revision that exported answers refer to', () => {
  const { html } = renderBundle('samples/customer-contract.yaml');
  const questions = openQuestions('samples/customer-contract.yaml');
  assert.ok(html.includes(`"file":"customer-contract.yaml","revision":"${questions.revision}"`));
});

test('dev saves answers posted by its own page under answers/', async t => {
  const dir = workspace(t), file = path.join(dir, 'customer-contract.yaml');
  const server = dev(dir, { port: 0, compare: false });
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port, host = `localhost:${port}`;
  const post = (body, headers) => new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, path: '/answers', method: 'POST', headers: { host, 'content-type': 'application/json', ...headers } }, res => {
      let data = ''; res.on('data', chunk => data += chunk); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    }).on('error', reject);
    request.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
  // Listen to the reload stream: saving answers must not reload the page.
  const messages = [];
  const events = http.get({ host: '127.0.0.1', port, path: '/events', headers: { host } }, res => res.on('data', chunk => messages.push(String(chunk))));
  t.after(() => events.destroy());
  const questions = openQuestions(file), payload = answersFor(questions, [[questions.questions[0], 'はい']]);
  assert.equal((await post(payload, { origin: 'http://attacker.example' })).status, 403);
  assert.equal((await post(payload, {})).status, 403);
  assert.equal((await post({ kind: 'strscape-answers' }, { origin: `http://${host}` })).status, 400);
  const saved = await post(payload, { origin: `http://${host}` });
  assert.equal(saved.status, 200);
  const files = fs.readdirSync(path.join(dir, 'answers'));
  assert.equal(files.length, 1);
  assert.match(files[0], /^customer-contract-\d{8}T\d{6}\.json$/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'answers', files[0]), 'utf8')), payload);
  assert.equal(listAnswers(path.join(dir, 'answers')).files[0].answers[0].open, true);
  await new Promise(resolve => setTimeout(resolve, 1200));
  assert.ok(messages.length > 0);
  assert.ok(messages.every(m => !m.includes('reload')), messages.join());
});
