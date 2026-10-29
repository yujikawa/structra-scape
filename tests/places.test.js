// Work places: where each step is done, and so where its data is, and how data gets around.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadModel, validateModel } from '../src/validate.js';
import { assessCompletion } from '../src/completion.js';
import { placeUses, dataMoves, completionContext, workspaceOverview, overviewMarkdown, workPlaces } from '../src/workspace.js';
import { loadWorkspace } from '../src/build.js';
import { diffModels } from '../src/diff.js';
import { updateDocument, promoteDefinitions, readDocument } from '../src/mutate.js';
import { openQuestions } from '../src/answers.js';
import { publicationMarkdown } from '../src/publication.js';
import { translateUI } from '../src/i18n.js';

const billing = () => loadModel('samples/billing.yaml');
const folder = t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structra-places-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const f of ['customer-contract.yaml', 'billing.yaml', 'places.yaml']) fs.copyFileSync(path.join('samples', f), path.join(dir, f));
  return dir;
};
const asks = issues => issues.filter(i => /渡って|入ってき|受け取って|いつ行って/.test(i.ask || '')).map(i => i.ask);

test('places are imported like terms; steps name their place and timing; receives is a role', () => {
  const m = billing();
  assert.deepEqual(m.places.map(s => [s.id, s.imported_from]), [['SalesSystem', 'places.yaml'], ['BillingSystem', 'places.yaml'], ['BillingCheckSheet', 'places.yaml'], ['Accounting', 'places.yaml']]);
  const broken = (edit, pattern) => { const x = billing(); edit(x); assert.ok(validateModel(x).some(e => pattern.test(e)), String(pattern)); };
  broken(x => { x.processes[0].steps[1].place = 'Nowhere'; }, /Aggregate.place: 作業場所が見つかりません/);
  broken(x => { x.processes[0].steps[1].timing = 3; }, /timing は文字列/);
  broken(x => { x.places.push({ id: 'BillingSystem', name: '二重' }); }, /重複した作業場所のID/);
  broken(x => { x.processes[0].steps[1].items = [{ concept: 'Contract', role: 'sends' }]; }, /関わり方が無効/);
  assert.deepEqual(validateModel(loadModel('tests/fixtures/legacy-customer-contract.yaml')), []);
});

test('across the folder, open questions ask how data gets to every place it is used on', () => {
  const entries = loadWorkspace('samples');
  const check = file => assessCompletion(entries.find(e => e.file === file).model, completionContext(entries, file)).issues;
  // 法人 is read on 販売管理システム, but no step there creates or receives it.
  assert.deepEqual(asks(check('customer-contract.yaml')), ['「法人」は、どうやって「販売管理システム」に入ってきますか？']);
  // 契約 is received by the import step; 契約顧客 is received but made nowhere; 売上を計上する has no timing.
  assert.deepEqual(asks(check('billing.yaml')).sort(), ['「売上を計上する」は、いつ行っていますか？（毎日、月末、その都度など）', '「契約顧客」は、どこから「請求システム」に受け取っていますか？'].sort());
  // Without the import step, the gap names where 契約 is made — found in another domain's steps.
  const m = structuredClone(entries.find(e => e.file === 'billing.yaml').model);
  m.processes = m.processes.filter(p => p.id !== 'ImportContracts');
  const others = entries.map(e => e.file === 'billing.yaml' ? { ...e, model: m } : e);
  assert.ok(asks(assessCompletion(m, completionContext(others, 'billing.yaml')).issues).includes('「契約」は「販売管理システム」で作られています。「請求システム」へは、どうやって渡っていますか？'));
  // The CLI asks the same questions as the viewer built from the folder.
  assert.deepEqual(asks(openQuestions('samples/billing.yaml').questions.map(q => ({ ask: q.question }))).sort(), asks(check('billing.yaml')).sort());
  for (const i of [...check('billing.yaml'), ...check('customer-contract.yaml'), ...assessCompletion(loadModel('samples/places.yaml')).issues].filter(i => i.ask)) assert.notEqual(translateUI(i.ask, 'en'), i.ask, i.ask);
});

test('a shared place is asked about in the models whose steps are done on it', () => {
  const entries = loadWorkspace('samples');
  const placeIssues = file => assessCompletion(entries.find(e => e.file === file).model, completionContext(entries, file)).issues.filter(i => i.kind === 'place');
  // 会計システム has no owner. places.yaml has no view of its own, so 請求 (whose steps are done there) asks too.
  const shared = placeIssues('places.yaml').find(i => i.id === 'Accounting'), here = placeIssues('billing.yaml').find(i => i.id === 'Accounting');
  assert.equal(here.ask, '「会計システム」は、どの部署が担当していますか？');
  assert.equal(here.imported_from, 'places.yaml');
  assert.equal(here.key, shared.key);
  // 顧客と契約 works only on 販売管理システム, which is fully described.
  assert.deepEqual(placeIssues('customer-contract.yaml'), []);
  assert.equal(openQuestions('samples/billing.yaml').questions.find(q => q.target.id === 'Accounting').target.imported_from, 'places.yaml');
  // A list of places is not a domain: it is not asked which terms it handles.
  assert.ok(!assessCompletion(loadModel('samples/places.yaml')).issues.some(i => !i.kind));
});

test('the work places of a folder list the steps done on each', () => {
  const places = workPlaces(loadWorkspace('samples'));
  assert.deepEqual(places.map(s => [s.key, s.steps.length]), [['places.yaml#SalesSystem', 2], ['places.yaml#BillingSystem', 3], ['places.yaml#BillingCheckSheet', 1], ['places.yaml#Accounting', 1]]);
  assert.deepEqual(places.find(s => s.id === 'BillingCheckSheet').steps.map(x => [x.domain, x.stepName, x.timing]), [['billing.yaml', '請求内容を確認する', '月末の締め日']]);
  assert.match(overviewMarkdown(workspaceOverview(loadWorkspace('samples'))), /## 作業場所\n\n- 販売管理システム（担当：営業部）：[^\n]* — 作業 2件（顧客と契約の定義）/);
});

test('where each term is, and how it moves, is read from the steps', () => {
  const entries = loadWorkspace('samples'), uses = placeUses(entries);
  const contract = uses.filter(u => u.conceptId === 'Contract').map(u => [u.placeId, u.role, u.stepName]);
  assert.deepEqual(contract, [['BillingSystem', 'reads', '請求額を集計する'], ['BillingSystem', 'receives', '契約を請求システムに取り込む'], ['SalesSystem', 'creates', '契約を締結する']]);
  const moves = dataMoves(uses).map(m => [m.conceptName, m.fromName, m.toName, m.gap, m.via.map(v => v.stepName)]);
  assert.ok(moves.some(m => JSON.stringify(m) === JSON.stringify(['契約', '販売管理システム', '請求システム', false, ['契約を請求システムに取り込む']])));
  // 売上を計上する follows 請求内容を確認する in its flow: the invoice comes from the check sheet.
  assert.deepEqual(moves.filter(m => m[0] === '請求書'), [['請求書', '請求システム', '請求確認シート', false, ['請求内容を確認する']], ['請求書', '請求確認シート', '会計システム', false, ['売上を計上する']]]);
  const md = overviewMarkdown(workspaceOverview(entries));
  assert.match(md, /## 作業場所とデータ[\s\S]*### 契約[\s\S]*- 販売管理システム：申込みから契約まで › 契約を締結する が作成/);
  assert.match(md, /- 移動：販売管理システム → 請求システム（契約を請求システムに取り込む）/);
  assert.ok(!workspaceOverview(entries).domains.some(d => d.file === 'places.yaml'));
});

test('places are edited, diffed, moved and exported', t => {
  const dir = folder(t), file = path.join(dir, 'billing.yaml');
  const result = updateDocument(file, { operations: [{ op: 'upsert', entity: 'step', process: 'Billing', id: 'Book', value: { timing: '月初3営業日まで', owner: '経理部' } }] });
  assert.deepEqual(result.changes.map(c => [c.entity, c.id, c.fields]), [['step', 'Book', ['timing', 'owner']]]);
  const before = loadModel(path.join(dir, 'places.yaml'), { resolve: false }), after = structuredClone(before);
  after.places[3].owner = '経理部';
  assert.deepEqual(diffModels(before, after).map(c => [c.entity, c.id]), [['place', 'Accounting']]);
  updateDocument(file, { operations: [{ op: 'upsert', entity: 'place', id: 'PartnerPortal', value: { name: '取引先ポータル' } }] });
  const moved = promoteDefinitions(file, ['PartnerPortal'], path.join(dir, 'places.yaml'));
  assert.deepEqual(moved.moved.places, ['PartnerPortal']);
  assert.ok(readDocument(path.join(dir, 'places.yaml')).model.places.some(s => s.id === 'PartnerPortal'));
  assert.deepEqual(validateModel(loadModel(file)), []);
  assert.match(publicationMarkdown(loadModel('samples/places.yaml')), /## 作業場所\n\n[\s\S]*- \*\*会計システム\*\*（Accounting） — 売上を仕訳として記録する。/);
});
