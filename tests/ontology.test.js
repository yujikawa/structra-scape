import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadModel, validateModel } from '../src/validate.js';
import { exportOntology } from '../src/ontology.js';
import { renderModel } from '../src/build.js';
import { publicationMarkdown, publicationSvg } from '../src/publication.js';
import { assessCompletion } from '../src/completion.js';

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
  const html = renderModel('samples/ontology/customer-contract.yaml');
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

const sample = () => loadModel('samples/ontology/customer-contract.yaml');
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
test('offline editor embeds compilable code and escapes user script endings', () => {
  const html = renderModel('samples/ontology/customer-contract.yaml');
  assert.doesNotMatch(html, /<!-- (ONTOLOGY_CORE|YAML_BUNDLE|STRUCTRA_)/);
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  assert.match(html, /YAMLを保存/);
  assert.doesNotMatch(html, /id="owl"|id="turtle"|生成されるOWL/);
  assert.match(html, /みんなで確認/);
  assert.match(renderModel('samples/support-backlog-loop.yaml'), /Causal guide/);
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
