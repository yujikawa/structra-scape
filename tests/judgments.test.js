// Judging examples: how each department judged a case, and where they differ.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadModel, validateModel } from '../src/validate.js';
import { assessCompletion } from '../src/completion.js';
import { updateDocument } from '../src/mutate.js';
import { openQuestions, validateAnswers, listAnswers, answersPatch } from '../src/answers.js';
import { publicationMarkdown } from '../src/publication.js';
import { translateUI } from '../src/i18n.js';

const sample = () => loadModel('samples/customer-contract.yaml');
const customerCases = m => m.concepts.find(c => c.id === 'Customer').cases;

test('judgments are validated', () => {
  const broken = (edit, pattern) => { const m = sample(); edit(m); assert.ok(validateModel(m).some(e => pattern.test(e)), String(pattern)); };
  broken(m => { customerCases(m)[3].judgments[0].result = 'maybe'; }, /judgments\[0\]: by（部署・役割）と result/);
  broken(m => { customerCases(m)[3].judgments[1].by = '営業部'; }, /同じ判定者が重複/);
  broken(m => { customerCases(m)[3].judgments[0].at = '2026/10/01'; }, /at: YYYY-MM-DD/);
  broken(m => { customerCases(m)[3].judgments = {}; }, /judgments: 配列/);
});

test('open items ask to judge, to settle agreeing judgments, and to reconcile differing ones', () => {
  const issues = assessCompletion(sample()).issues;
  const find = text => issues.find(i => i.message.includes(text));
  assert.equal(find('契約開始日が来月の法人').case, '契約開始日が来月の法人');
  assert.deepEqual(find('契約開始日が来月の法人').choices.map(c => c.value), ['included', 'excluded', 'unsure']);
  assert.equal(find('停止中の契約だけを持つ法人').category, '不整合');
  assert.match(find('停止中の契約だけを持つ法人').message, /営業部: 含む、経理部: 含まない/);
  assert.equal(find('停止中の契約だけを持つ法人').field, 'case');
  assert.match(find('解約を申し出ていて').ask, /そろって「含む」としています。この扱いで決めてよいですか？/);
  assert.equal(find('解約を申し出ていて').case, '解約を申し出ていて、契約終了日がまだ来ていない法人');
  assert.match(find('基準日時ちょうどに終了する契約').message, /決定: 含まない、カスタマーサクセス: 含む/);
  for (const i of issues.filter(i => /判定/.test(i.message) && i.ask)) {
    assert.notEqual(translateUI(i.ask, 'en'), i.ask, i.ask);
    assert.notEqual(translateUI(i.message, 'en'), i.message, i.message);
  }
  // A model without judgments asks exactly what it asked before.
  const legacy = assessCompletion(loadModel('tests/fixtures/legacy-customer-contract.yaml')).issues;
  assert.ok(legacy.every(i => i.category !== '不整合' || !/判定/.test(i.message)));
});

test('recording judgments on an agreed definition is not an agreed change; deciding is', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structra-judgments-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const f of ['customer-contract.yaml', 'billing.yaml']) fs.copyFileSync(path.join('samples', f), path.join(dir, f));
  const file = path.join(dir, 'customer-contract.yaml');
  updateDocument(file, { operations: [{ op: 'upsert', entity: 'concept', id: 'ActiveContract', value: { review_state: 'agreed', agreed_by: '営業部', agreed_at: '2026-10-20' } }] });
  const cases = structuredClone(loadModel(file, { resolve: false }).concepts.find(c => c.id === 'ActiveContract').cases);
  cases[0].judgments = [{ by: '経理部', result: 'included' }];
  const recorded = updateDocument(file, { operations: [{ op: 'upsert', entity: 'concept', id: 'ActiveContract', value: { cases } }] });
  assert.equal(recorded.changes[0].agreed, undefined);
  cases[1].result = 'included';
  assert.throws(() => updateDocument(file, { operations: [{ op: 'upsert', entity: 'concept', id: 'ActiveContract', value: { cases } }] }), e => e.code === 'AGREED_CHANGE');
});

test('answers to a case carry the judgment, and differ only when the judgments differ', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structra-judgment-answers-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const f of ['customer-contract.yaml', 'billing.yaml']) fs.copyFileSync(path.join('samples', f), path.join(dir, f));
  const question = openQuestions(path.join(dir, 'customer-contract.yaml')).questions.find(q => q.case === '契約開始日が来月の法人');
  assert.deepEqual(question.choices.map(c => c.value), ['included', 'excluded', 'unsure']);
  const answer = (by, choice, text) => ({ kind: 'strscape-answers', model: 'customer-contract.yaml', answered_by: by, answers: [{ key: question.key, question: question.question, answer: text, choice }] });
  assert.deepEqual(validateAnswers(answer('x', 3, '含む')), ['answers[0].choice must be a choice value']);
  fs.mkdirSync(path.join(dir, 'answers'));
  const write = (name, data) => fs.writeFileSync(path.join(dir, 'answers', name), JSON.stringify(data));
  write('a.json', answer('営業部', 'included', '含む：署名済みなので'));
  write('b.json', answer('経理部', 'included', '含む：請求予定があるので'));
  assert.equal(listAnswers(path.join(dir, 'answers')).conflicts, 0);
  write('c.json', answer('CS', 'excluded', '含まない'));
  assert.equal(listAnswers(path.join(dir, 'answers')).conflicts, 1);
});

test('Markdown lists each judgment under its case', () => {
  assert.match(publicationMarkdown(sample(), { concept: 'Customer' }), /- unresolved: 停止中の契約だけを持つ法人\n  - 営業部: 含む — 再開の見込みがあるので/);
});

test('answers given by choice become a proposed transaction; the rest become notes', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structra-answer-patch-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const f of ['customer-contract.yaml', 'billing.yaml']) fs.copyFileSync(path.join('samples', f), path.join(dir, f));
  const file = path.join(dir, 'customer-contract.yaml');
  // Leave two things open to answer by choice: a boundary and a dimension's additivity.
  const model = loadModel(file, { resolve: false });
  delete model.concepts.find(c => c.id === 'ActiveContract').temporal.period.end_inclusive;
  delete model.metrics[0].dimensions[0].additive;
  updateDocument(file, { operations: [
    { op: 'upsert', entity: 'concept', id: 'ActiveContract', value: { temporal: model.concepts.find(c => c.id === 'ActiveContract').temporal } },
    { op: 'upsert', entity: 'metric', id: 'ContractCustomerCount', value: { dimensions: model.metrics[0].dimensions } },
  ] });
  const questions = openQuestions(file).questions, q = text => questions.find(x => x.question.includes(text));
  const answers = [
    { key: q('終了日時ちょうど').key, question: q('終了日時ちょうど').question, answer: 'いいえ', choice: 'no' },
    { key: q('「基準日」ごとの値').key, question: q('「基準日」ごとの値').question, answer: 'いいえ', choice: 'no' },
    { key: q('契約開始日が来月の法人').key, question: q('契約開始日が来月の法人').question, answer: '含まない：請求前', choice: 'excluded', note: '請求前' },
    { key: q('この定義で合っていますか').key, question: q('この定義で合っていますか').question, answer: 'はい', choice: 'yes' },
    { key: q('契約が終了した会社').key, question: q('契約が終了した会社').question, answer: '解約顧客と呼んでいる' },
  ];
  fs.mkdirSync(path.join(dir, 'answers'));
  fs.writeFileSync(path.join(dir, 'answers', 'a.json'), JSON.stringify({ kind: 'strscape-answers', model: 'customer-contract.yaml', answered_by: '経理部', answers }));
  const result = answersPatch(path.join(dir, 'answers'));
  const ops = Object.fromEntries(result.patch.operations.map(op => [op.id, op.value]));
  assert.equal(ops.ActiveContract.temporal.period.end_inclusive, false);
  assert.equal(ops.ContractCustomerCount.dimensions[0].additive, false);
  assert.deepEqual(ops.Customer.cases.find(c => c.description === '契約開始日が来月の法人').judgments, [{ by: '経理部', result: 'excluded', reason: '請求前' }]);
  assert.equal(result.recorded.length, 3);
  assert.ok(result.notes.some(n => /合意として記録するのは、ユーザーに確認してから/.test(n.note)));
  assert.ok(result.notes.some(n => /自由記述/.test(n.note)));
  // The proposal applies as is.
  assert.equal(updateDocument(file, result.patch).changed, true);
});
