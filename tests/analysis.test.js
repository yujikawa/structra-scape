// Time in definitions, metrics and what the data keeps: knowledge people hold, made visible.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadModel, validateModel } from '../src/validate.js';
import { assessCompletion } from '../src/completion.js';
import { metricReach, exportOntology, exportSkos } from '../src/ontology.js';
import { diffModels } from '../src/diff.js';
import { updateDocument } from '../src/mutate.js';
import { publicationMarkdown } from '../src/publication.js';
import { translateUI } from '../src/i18n.js';

const sample = () => loadModel('samples/customer-contract.yaml');

test('a model written before these features validates and gets no new open items', () => {
  const legacy = loadModel('tests/fixtures/legacy-customer-contract.yaml');
  assert.deepEqual(validateModel(legacy), []);
  const issues = assessCompletion(legacy).issues;
  assert.ok(issues.every(i => i.kind !== 'metric' && !/temporal|history|タイムゾーン/.test(i.message)));
  assert.equal(exportOntology(loadModel('samples/process-hierarchy.yaml')).startsWith('@prefix'), true);
});

test('broken references, periods, time zones and statuses are rejected', () => {
  const broken = (edit, pattern) => { const m = sample(); edit(m); assert.ok(validateModel(m).some(e => pattern.test(e)), String(pattern)); };
  broken(m => { m.concepts.find(c => c.id === 'ActiveContract').temporal.period.end = 'closeDate'; }, /period.end: 属性 closeDate が見つかりません/);
  broken(m => { m.concepts.find(c => c.id === 'ActiveContract').temporal.period.end_inclusive = 'no'; }, /end_inclusive/);
  broken(m => { m.concepts.find(c => c.id === 'Customer').temporal.timezone = 'Tokyo'; }, /timezone/);
  broken(m => { m.concepts.find(c => c.id === 'Customer').temporal.basis = 'latest'; }, /basis/);
  broken(m => { Object.assign(m.concepts.find(c => c.id === 'Customer'), { effective_from: '2026-05-01', effective_to: '2026-04-30' }); }, /effective_from が effective_to より後/);
  broken(m => { m.concepts.find(c => c.id === 'Customer').data_mapping.history = 'daily'; }, /history/);
  broken(m => { m.concepts.find(c => c.id === 'Customer').data_mapping.status = 'checked'; }, /proposed、verified、rejected/);
  broken(m => { m.metrics[0].attribute = 'contractNo'; }, /属性 contractNo が Customer とその上位概念にありません/);
  broken(m => { m.metrics[0].concept = 'Missing'; }, /対象の概念が見つかりません/);
  broken(m => { m.metrics[0].id = 'Customer'; }, /重複ID: Customer/);
  broken(m => { m.metrics[0].aggregation = 'custom'; }, /formula/);
  broken(m => { m.metrics[0].temporal.period = { start: 'startDate' }; }, /有効期間は概念に記録/);
  broken(m => { m.metrics[0].cases[0].expected = 1; }, /cases/);
});

test('open items appear only for what a definition uses, and ask business users in their words', () => {
  const m = sample();
  delete m.concepts.find(c => c.id === 'ActiveContract').temporal.period.end_inclusive;
  delete m.concepts.find(c => c.id === 'Customer').data_mapping.history;
  const issues = assessCompletion(m).issues;
  assert.ok(issues.some(i => i.id === 'ActiveContract' && i.ask === '終了日時ちょうどの時点では、まだ有効ですか？'));
  assert.ok(issues.some(i => i.id === 'Customer' && i.category === 'データ対応' && /history/.test(i.message) && !i.ask));
  assert.ok(issues.some(i => i.kind === 'metric' && i.ask === '「停止中の契約しかない法人」のとき、どう数えますか？'));
  // A mapping found wrong is reported differently from one nobody checked.
  const r = sample(); r.concepts.find(c => c.id === 'Customer').data_mapping.status = 'rejected';
  assert.ok(assessCompletion(r).issues.some(i => i.id === 'Customer' && /誤りと分かっています/.test(i.message)));
  for (const i of issues.filter(i => i.ask)) assert.notEqual(translateUI(i.ask, 'en'), i.ask, i.ask);
});

test('the records tell the current count from the count at the end of last month', () => {
  const m = sample(), metric = m.metrics[0];
  assert.deepEqual(metricReach(m, metric).rows.map(r => r.state), ['limited', 'no']);
  assert.match(metricReach(m, metric).rows[1].note, /現在の状態しか保持していません/);
  Object.assign(m.concepts.find(c => c.id === 'Customer').data_mapping, { status: 'verified', history: 'versioned' });
  assert.deepEqual(metricReach(m, metric).rows.map(r => r.state), ['ok', 'ok']);
  delete m.concepts.find(c => c.id === 'Customer').data_mapping.history;
  assert.equal(metricReach(m, metric).rows[1].state, 'unknown');
});

test('metrics are edited, diffed and guarded like definitions', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structra-analysis-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const f of ['customer-contract.yaml', 'billing.yaml']) fs.copyFileSync(path.join('samples', f), path.join(dir, f));
  const file = path.join(dir, 'customer-contract.yaml');
  const result = updateDocument(file, { operations: [{ op: 'upsert', entity: 'metric', id: 'ContractCustomerCount', value: { review_state: 'agreed', agreed_by: '営業部', agreed_at: '2026-10-20' } }] });
  assert.deepEqual(result.changes.map(c => [c.entity, c.id, c.fields]), [['metric', 'ContractCustomerCount', ['review_state', 'agreed_by', 'agreed_at']]]);
  assert.match(fs.readFileSync(file, 'utf8'), /# 指標：概念とは別に定義する「数」/);
  assert.throws(() => updateDocument(file, { operations: [{ op: 'upsert', entity: 'metric', id: 'ContractCustomerCount', value: { aggregation: 'count' } }] }), e => e.code === 'AGREED_CHANGE');
  assert.throws(() => updateDocument(file, { operations: [{ op: 'remove', entity: 'concept', id: 'Customer' }] }), e => e.code === 'VALIDATION');
  const before = loadModel(file, { resolve: false }), after = structuredClone(before);
  after.concepts.find(c => c.id === 'ActiveContract').temporal.period.end_inclusive = true;
  assert.deepEqual(diffModels(before, after).map(c => [c.entity, c.id, c.fields.map(f => f.field)]), [['concept', 'ActiveContract', ['temporal']]]);
});

test('exports state what OWL and SKOS leave out; Markdown carries metrics and time', () => {
  const m = sample();
  for (const ttl of [exportOntology(m), exportSkos(m)]) {
    assert.match(ttl, /^# 出力していない情報: 指標（metrics）、時間の意味/);
    assert.doesNotMatch(ttl, /ContractCustomerCount/);
  }
  const md = publicationMarkdown(m);
  for (const pattern of [/## 指標/, /### 契約顧客数/, /過去の基準日時点の値（例：先月末）: 答えられません/, /同じ法人に、有効な契約が2件ある → 1社と数える/, /停止中の契約しかない法人 → \*\*未決定\*\*/, /- 有効期間の終了: 契約終了日時 — ちょうどの時点を含まない/, /- 過去の状態: 現在の状態のみ/])
    assert.match(md, pattern);
});
