import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadModel, validateModel } from '../src/validate.js';
import { exportOntology, conceptAttributes } from '../src/ontology.js';
import { renderModel } from '../src/build.js';
import { publicationMarkdown, publicationSvg } from '../src/publication.js';
import { assessCompletion } from '../src/completion.js';
import { translateUI } from '../src/i18n.js';

test('UI translations preserve model text in dynamic messages and default to Japanese', () => {
  assert.equal(translateUI('未確認事項', 'en'), 'Open questions');
  assert.equal(translateUI('未確認事項', 'ja'), '未確認事項');
  assert.equal(translateUI('契約顧客', 'en'), '契約顧客');
  assert.equal(translateUI('判定が未決定：契約開始日が来月の法人', 'en'), 'Undecided case: 契約開始日が来月の法人');
  assert.equal(translateUI('顧客と契約 · 5つの用語・関係・作業に、確認が必要な項目があります。', 'en'), '顧客と契約 · 5 terms, relationships or steps need review.');
  assert.equal(translateUI('属性「契約状態」：取りうる区分値を記録してください。', 'en'), 'Attribute “契約状態”: Record the allowed code values.');
  assert.equal(translateUI('6個の作業 · 5本の流れ', 'en'), '6 steps · 5 flows');
  assert.equal(translateUI('作業 · 営業担当', 'en'), 'Task · 営業担当');
  assert.equal(translateUI('「顧客」の条件：「契約」でつながる「有効契約」が、少なくとも1つある。', 'en'), 'Rule for “顧客”: at least one “契約” relationship to “有効契約”.');
  const html = renderModel('samples/customer-contract.yaml');
  assert.match(html, /structra-language/);
  assert.match(html, /modelTextValues/);
});

test('completion does not treat empty or merely agreed definitions as complete', () => {
  assert.equal(assessCompletion({ concepts: [], properties: [], restrictions: [] }).issues.length, 1);
  const m = sample();
  m.concepts.forEach(c => { c.review_state = 'agreed'; });
  const report = assessCompletion(m);
  assert.ok(report.issues.some(i => i.id === 'Customer' && i.category === '未決定'));
  assert.ok(report.issues.some(i => i.id === 'Contract' && i.category === '不足'));
  assert.ok(report.issues.some(i => i.id === 'hasContract' && i.category === '未合意'));
  assert.ok(report.issues.some(i => i.category === 'データ対応'));
});

test('open items carry a question for business users, except data-side items', () => {
  const issues = assessCompletion(sample()).issues;
  const contract = issues.filter(i => i.id === 'Contract');
  assert.ok(contract.some(i => i.message === '含む具体例を記録してください。' && i.ask === '具体的には、どんなものが含まれますか？'));
  assert.ok(issues.some(i => i.id === 'Customer' && i.ask === '「契約開始日が来月の法人」は含みますか、含みませんか？'));
  assert.ok(issues.filter(i => i.category === 'データ対応').every(i => !i.ask));
  // Every recording task (not already a question) has a business-facing question.
  assert.ok(issues.filter(i => i.category !== 'データ対応' && i.category !== '未決定').every(i => i.ask?.endsWith('？')));
  for (const i of issues.filter(i => i.ask)) assert.notEqual(translateUI(i.ask, 'en'), i.ask, i.ask);
  assert.equal(translateUI('「顧客」は、「契約顧客」「法人」のどれを指しますか？', 'en'), 'Which does “顧客” mean: “契約顧客”, “法人”?');
});

test('completion accepts recorded cases and optional mapping without mutating model', () => {
  const m = { concepts: [{ id: 'A', name: 'A', description: 'definition', evidence: 'meeting', review_state: 'agreed', cases: [{ description: 'yes', result: 'included' }, { description: 'no', result: 'excluded' }] }], properties: [], restrictions: [] };
  const before = structuredClone(m);
  assert.deepEqual(assessCompletion(m), { issues: [], ready: 1, total: 1 });
  assert.deepEqual(m, before);
  m.concepts[0].description = '  ';
  assert.equal(assessCompletion(m).ready, 0);
});

test('completion flags cycles and impossible direct counts but not universal existence', () => {
  const m = sample();
  m.concepts[0].parent = 'Customer';
  m.restrictions.push({ subject: 'Customer', property: 'hasContract', operator: 'maxCardinality', count: 0, mode: 'necessary' });
  assert.ok(assessCompletion(m).issues.some(i => i.message.includes('循環')));
  assert.ok(assessCompletion(m).issues.some(i => i.message.includes('個数条件')));
  m.restrictions[0].operator = 'allValuesFrom';
  assert.ok(!assessCompletion(m).issues.some(i => i.message.includes('個数条件')));
});

test('offline build includes grouped unconfirmed view and mode navigation', () => {
  const html = renderModel('samples/customer-contract.yaml');
  assert.match(html, /function assessCompletion/);
  assert.match(html, /data-completion-target/);
  assert.match(html, /modeBar.append\(completionButton\)/);
  assert.match(html, /completion-group/);
  assert.doesNotMatch(html, /completionDialog/);
});
test('publication exports definitions and selected process with escaped labels',()=>{
 const model=sample();model.name='<unsafe & title>';
 assert.match(publicationSvg(model),/&lt;unsafe &amp; title&gt;/);
 assert.match(publicationSvg(model,{process:'ContractProcess'}),/申込みから契約まで/);
 assert.match(publicationMarkdown(model,{concept:'Customer'}),/有効な契約/);
 assert.throws(()=>publicationSvg(model,{process:'missing'}));
 assert.throws(()=>publicationMarkdown(model,{concept:'missing'}));
});

const sample = () => loadModel('samples/customer-contract.yaml');
test('shared definitions validate mapping status and evidence without executing conditions', () => {
  const m = sample();
  assert.deepEqual(validateModel(m), []);
  const customer = m.concepts.find(c => c.id === 'Customer');
  customer.data_mapping.status = 'assumed';
  assert.ok(validateModel(m).some(e => e.includes('data_mapping.status')));
  customer.data_mapping = null;
  customer.evidence = 7;
  assert.ok(validateModel(m).some(e => e.includes('data_mapping')));
  assert.ok(validateModel(m).some(e => e.includes('evidence')));
});
test('customer definition includes organization AND existential restriction', () => {
  const model = sample();
  assert.deepEqual(validateModel(model), []);
  assert.match(exportOntology(model), /:Customer owl:equivalentClass \[ a owl:Class ; owl:intersectionOf \( :Organization .*owl:someValuesFrom :ActiveContract/);
});
test('multiple equivalent conditions produce one conjunction; all does not add existence', () => {
  const model = sample();
  model.restrictions = [{ subject: 'Customer', property: 'hasContract', operator: 'allValuesFrom', target: 'Contract', mode: 'equivalent' }, { subject: 'Customer', property: 'hasContract', operator: 'maxCardinality', count: 3, mode: 'equivalent' }];
  const ttl = exportOntology(model);
  assert.equal((ttl.match(/owl:equivalentClass/g) || []).length, 1);
  assert.match(ttl, /owl:maxCardinality "3"\^\^xsd:nonNegativeInteger/);
  assert.doesNotMatch(ttl, /owl:someValuesFrom/);
});
test('rejects unsupported rules, invalid counts, dangling references and unsafe identifiers', () => {
  for (const patch of [{ operator: 'madeUp' }, { operator: 'maxCardinality', count: -1 }, { operator: 'maxCardinality', count: 1.5 }, { target: 'Missing' }, { property: 'Missing' }]) {
    const m = sample(); Object.assign(m.restrictions[0], patch);
    assert.throws(() => exportOntology(m));
  }
  const m = sample(); m.concepts[0].id = 'bad> .'; assert.throws(() => exportOntology(m));
  m.base = 'https://example.com/> .'; assert.throws(() => exportOntology(m));
  assert.ok(validateModel({ kind: 'ontology', name: 'bad', concepts: {} }).length);
});
test('offline reader embeds compilable code and escapes user script endings', () => {
  const html = renderModel('samples/customer-contract.yaml');
  assert.doesNotMatch(html, /<!-- (ONTOLOGY_CORE|YAML_BUNDLE|STRUCTRA_)/);
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  assert.doesNotMatch(html, /id="owl"|id="turtle"|生成されるOWL/);
  // The reader is read-only: no in-browser authoring controls or YAML download.
  assert.doesNotMatch(html, /id="save"|id="add-concept"|id="new-step"|id="yaml-preview"/);
  assert.match(html, /id="review-toggle"/);
});

test('review notes and layout survive YAML serialization and reject invalid metadata', async () => {
  const { default: yaml } = await import('js-yaml');
  const model = sample();
  Object.assign(model.concepts[0], { example: 'A社', question: '名称変更時は？', review_state: 'agreed', position: { x: 100, y: 200 } });
  const restored = yaml.load(yaml.dump(model));
  assert.deepEqual(restored, model);
  assert.deepEqual(validateModel(restored), []);
  restored.concepts[0].review_state = 'unknown';
  restored.concepts[0].position.x = Infinity;
  assert.equal(validateModel(restored).length, 2);
});

test('process hierarchy validates references, ownership and cycles', () => {
  const m = loadModel('samples/process-hierarchy.yaml');
  assert.deepEqual(validateModel(m), []);
  const invalid = structuredClone(m);
  invalid.processes[0].steps[1].subprocess = 'Missing';
  assert.ok(validateModel(invalid).some(e => e.includes('参照先')));
  const cycle = structuredClone(m);
  cycle.processes[2].steps[0].subprocess = 'OrderToInvoice';
  assert.ok(validateModel(cycle).some(e => e.includes('循環')));
  const duplicate = structuredClone(m);
  duplicate.processes[0].steps[0].subprocess = 'ReviewDetails';
  assert.ok(validateModel(duplicate).some(e => e.includes('親は一つ')));
  const html = renderModel('samples/process-hierarchy.yaml');
  assert.match(html, /process-breadcrumbs/);
  for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
});

test('attributes and aliases validate, inherit, export and appear in open questions', () => {
  const m = sample();
  assert.deepEqual(validateModel(m), []);
  const contract = m.concepts.find(c => c.id === 'Contract');
  assert.deepEqual(conceptAttributes(m, 'ActiveContract').map(r => [r.attribute.id, r.inherited]), contract.attributes.map(a => [a.id, true]));
  const ttl = exportOntology(m);
  assert.match(ttl, /skos:altLabel "取引先"/);
  assert.match(ttl, /<https:\/\/example.com\/customer#Contract.startDate> a owl:DatatypeProperty ; rdfs:label "契約開始日" ; rdfs:domain :Contract ; rdfs:range xsd:date/);
  const issues = assessCompletion(m).issues.filter(i => i.id === 'Contract').map(i => i.message);
  assert.ok(issues.includes('属性「契約状態」：停止中の契約を有効契約に含める？'));
  assert.ok(issues.some(i => i.startsWith('属性「契約開始日」：申込日')));
  assert.match(publicationMarkdown(m, { concept: 'Contract' }), /\| 契約開始日 \| startDate \| date \| はい \|/);
  for (const [patch, pattern] of [[{ type: 'money' }, /type は/], [{ id: 'bad id' }, /無効な属性ID/], [{ values: [{ value: 'x' }] }, /type: code/], [{ required: 'yes' }, /required/]]) {
    const broken = sample();
    Object.assign(broken.concepts.find(c => c.id === 'Contract').attributes[2], patch);
    assert.ok(validateModel(broken).some(e => pattern.test(e)), String(pattern));
  }
  const duplicate = sample();
  duplicate.concepts[0].aliases = ['顧客'];
  assert.ok(assessCompletion(duplicate).issues.some(i => i.category === '不整合' && i.message.includes('別名「顧客」')));
  duplicate.concepts[0].aliases = ['x', 'x'];
  assert.ok(validateModel(duplicate).some(e => e.includes('aliases')));
});

test('flow checks report owners, decisions, gateways, reachability and dead ends', () => {
  const m = sample();
  assert.deepEqual(assessCompletion(m).issues.filter(i => i.kind === 'step' || i.kind === 'process'), []);
  const p = m.processes[0];
  p.steps.push({ id: 'Orphan', name: '孤立した作業', type: 'task', owner: '誰か' }, { id: 'Split', name: '並行', type: 'parallel' });
  p.flows.find(f => f.label === '審査NG').label = '';
  p.steps.find(s => s.id === 'Review').owner = undefined;
  const messages = assessCompletion(m).issues.filter(i => i.kind === 'step' || i.kind === 'process').map(i => `${i.id}:${i.message}`);
  for (const expected of ['Review:担当（owner）を記録してください。', 'Decision:分岐の矢印に進む条件（label）を記録してください。', 'Orphan:開始からたどり着けません。', 'Orphan:次へ進む流れがなく、終了につながっていません。', 'Split:並行開始の行き先が2つ以上ありません。', 'ContractProcess:並行開始と合流の対応を確認してください。']) assert.ok(messages.includes(expected), expected);
  // Sketches without a start or end are not checked for reachability.
  const sketch = loadModel('samples/process-hierarchy.yaml');
  assert.ok(!assessCompletion(sketch).issues.some(i => i.message.includes('たどり着けません')));
});
