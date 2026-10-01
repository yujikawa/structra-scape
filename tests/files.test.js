import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadModel, validateFile } from '../src/validate.js';
import { exportOntology } from '../src/ontology.js';
import { readDocument, updateDocument, inspectDocument, promoteDefinitions } from '../src/mutate.js';
import { diffModels } from '../src/diff.js';
import { renderBundle } from '../src/build.js';

function workspace(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structra-files-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const name of ['customer-contract.yaml', 'billing.yaml']) fs.copyFileSync(path.join('samples/ontology', name), path.join(dir, name));
  return dir;
}

test('imports merge shared definitions read-only and export them by reference', t => {
  const dir = workspace(t), file = path.join(dir, 'billing.yaml');
  const model = loadModel(file);
  assert.equal(model.concepts.find(c => c.id === 'Customer').imported_from, 'customer-contract.yaml');
  assert.deepEqual(validateFile(file), []);
  const ttl = exportOntology(model);
  assert.match(ttl, /owl:imports <https:\/\/example.com\/customer#>/);
  assert.match(ttl, /rdfs:range <https:\/\/example.com\/customer#Customer>/);
  assert.doesNotMatch(ttl, /:Customer a owl:Class/);
  assert.equal(inspectDocument(file).imported.concepts.length, 4);
  // A missing file, a cycle and a duplicate ID are all reported.
  fs.writeFileSync(path.join(dir, 'cycle.yaml'), 'kind: ontology\nname: c\nbase: https://e.com/c#\nimports: [billing.yaml]\nconcepts: []\nproperties: []\nrestrictions: []\n');
  const billing = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, billing.replace('  - customer-contract.yaml', '  - customer-contract.yaml\n  - cycle.yaml'));
  assert.match(validateFile(file).join(), /循環/);
  fs.writeFileSync(file, billing.replace('customer-contract.yaml\n', 'missing.yaml\n'));
  assert.match(validateFile(file).join(), /見つかりません/);
  fs.writeFileSync(file, billing.replace('  - id: Invoice', '  - id: Contract\n    name: 重複\n  - id: Invoice'));
  assert.match(validateFile(file).join(), /重複ID: Contract/);
});

test('a change to a shared file is rejected when it breaks a model importing it', t => {
  const dir = workspace(t), shared = path.join(dir, 'customer-contract.yaml');
  const before = fs.readFileSync(shared, 'utf8');
  assert.throws(() => updateDocument(shared, { operations: [{ op: 'remove', entity: 'concept', id: 'Customer' }, { op: 'replace', entity: 'restriction', value: [] }] }), e => e.code === 'VALIDATION' && e.errors.some(m => m.startsWith('billing.yaml:')));
  assert.equal(fs.readFileSync(shared, 'utf8'), before);
  assert.throws(() => updateDocument(path.join(dir, 'billing.yaml'), { operations: [{ op: 'upsert', entity: 'concept', id: 'Customer', value: { name: '上書き' } }] }), { code: 'VALIDATION' });
});

test('CLI writes keep comments and inline styles, and guard agreed definitions', t => {
  const dir = workspace(t), file = path.join(dir, 'customer-contract.yaml');
  fs.writeFileSync(file, '# 先頭のコメント\n' + fs.readFileSync(file, 'utf8').replace('  - id: Contract\n', '  # 契約のコメント\n  - id: Contract\n'));
  updateDocument(file, { operations: [{ op: 'upsert', entity: 'attribute', concept: 'Contract', id: 'amount', value: { name: '契約金額', type: 'amount' } }, { op: 'upsert', entity: 'concept', id: 'Organization', value: { review_state: 'agreed' } }] });
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /^# 先頭のコメント\n/);
  assert.match(text, /  # 契約のコメント\n  - id: Contract\n/);
  assert.match(text, /- { source: Decision, target: Sign, label: 審査OK }/);
  assert.match(text, /      - id: amount\n        name: 契約金額\n        type: amount\n/);
  const agreed = readDocument(file).revision;
  assert.throws(() => updateDocument(file, { operations: [{ op: 'upsert', entity: 'concept', id: 'Organization', value: { description: '別の意味' } }] }), e => e.code === 'AGREED_CHANGE' && e.errors[0].includes('Organization'));
  assert.equal(readDocument(file).revision, agreed);
  const result = updateDocument(file, { operations: [{ op: 'upsert', entity: 'concept', id: 'Organization', value: { description: '別の意味' } }] }, { allowAgreedChange: true });
  assert.deepEqual(result.changes, [{ entity: 'concept', change: 'changed', id: 'Organization', name: '法人', fields: ['description'], agreed: true }]);
  const cli = spawnSync(process.execPath, ['src/index.js', 'attribute', 'get', file, 'amount', '--concept', 'Contract'], { encoding: 'utf8' });
  assert.equal(JSON.parse(cli.stdout).data.name, '契約金額');
});

test('semantic diff keys changes by id, ignores layout and flags agreed definitions', () => {
  const before = loadModel('samples/ontology/customer-contract.yaml', { resolve: false });
  const after = structuredClone(before);
  before.concepts[0].review_state = 'agreed';
  after.concepts[0].review_state = 'discussion';
  after.concepts.reverse();
  after.processes[0].steps[0].position = { x: 0, y: 0 };
  after.processes[0].flows.pop();
  after.concepts.find(c => c.id === 'Contract').attributes[0].name = '契約No';
  const changes = diffModels(before, after);
  assert.deepEqual(changes.map(c => [c.entity, c.change, c.id, Boolean(c.agreed)]), [['concept', 'changed', 'Organization', true], ['attribute', 'changed', 'contractNo', false], ['flow', 'removed', '', false]]);
  assert.deepEqual(diffModels(null, after)[0], { entity: 'model', change: 'added', id: '', name: after.name, agreed: false });
});

test('build compares each model with a git revision', t => {
  const dir = workspace(t), git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  git('init', '-q'); git('-c', 'user.name=t', '-c', 'user.email=t@e', 'commit', '-q', '--allow-empty', '-m', 'init');
  git('add', 'customer-contract.yaml'); git('-c', 'user.name=t', '-c', 'user.email=t@e', 'commit', '-q', '-m', 'model');
  updateDocument(path.join(dir, 'customer-contract.yaml'), { operations: [{ op: 'upsert', entity: 'concept', id: 'Contract', value: { example: '保守契約' } }] });
  const { html, files } = renderBundle(dir, { compare: 'HEAD' });
  const data = JSON.parse(html.match(/window.__STRUCTRA_DATA__ = (.*);/)[1]);
  const byName = Object.fromEntries(data.models.map(m => [m.slug, m]));
  assert.deepEqual(diffModels(byName['customer-contract'].baseline.model, byName['customer-contract'].model).map(c => c.id), ['Contract']);
  assert.equal(byName.billing.baseline.model, null);
  assert.ok(files.includes(path.join(dir, 'customer-contract.yaml')));
  const cli = spawnSync(process.execPath, [path.resolve('src/index.js'), 'diff', 'customer-contract.yaml', '--format', 'md'], { cwd: dir, encoding: 'utf8' });
  assert.match(cli.stdout, /変更・ことば：契約 \(Contract\)\n  - 具体例: （なし） → 保守契約/);
  assert.equal(renderBundle(path.join(dir, 'billing.yaml')).html.includes('"baseline"'), false);
});

test('promote moves definitions into a shared file that other models already import', t => {
  const dir = workspace(t), source = path.join(dir, 'customer-contract.yaml'), common = path.join(dir, 'common.yaml');
  fs.writeFileSync(common, 'kind: ontology\nname: 共通の用語\nbase: https://example.com/common#\nconcepts:\n  - id: Region\n    name: 地域\nproperties: []\nrestrictions: []\n');
  // billing.yaml already imports common.yaml, so adding Customer there first would duplicate the ID.
  updateDocument(path.join(dir, 'billing.yaml'), { operations: [{ op: 'upsert', entity: 'model', value: { imports: ['customer-contract.yaml', 'common.yaml'] } }] });
  assert.throws(() => updateDocument(common, { operations: [{ op: 'upsert', entity: 'concept', id: 'Customer', value: { name: '契約顧客' } }] }), { code: 'VALIDATION' });
  // A parent that stays behind would be a reference from common.yaml back into the source.
  assert.throws(() => promoteDefinitions(source, ['Customer'], common), e => e.code === 'DEPENDENCY' && e.missing.join() === 'Organization,hasContract,ActiveContract');
  const result = promoteDefinitions(source, ['Customer', 'Organization', 'hasContract', 'ActiveContract', 'Contract'], common);
  assert.deepEqual(result.moved, { concepts: ['Customer', 'Organization', 'ActiveContract', 'Contract'], properties: ['hasContract'], restrictions: 1 });
  assert.deepEqual(readDocument(source).model.imports, ['common.yaml']);
  assert.equal(readDocument(common).model.concepts.find(c => c.id === 'Contract').attributes.length, 4);
  for (const file of ['customer-contract.yaml', 'billing.yaml', 'common.yaml']) assert.deepEqual(validateFile(path.join(dir, file)), [], file);
  assert.equal(loadModel(path.join(dir, 'billing.yaml')).concepts.find(c => c.id === 'Customer').imported_from, 'common.yaml');
  // The target is created when missing, and model fields other than name/base/imports are refused.
  promoteDefinitions(path.join(dir, 'billing.yaml'), ['Invoice', 'billedTo'], path.join(dir, 'shared', 'billing-terms.yaml'));
  assert.deepEqual(validateFile(path.join(dir, 'billing.yaml')), []);
  assert.deepEqual(readDocument(path.join(dir, 'shared', 'billing-terms.yaml')).model.imports, ['../common.yaml']);
  assert.equal(readDocument(path.join(dir, 'shared', 'billing-terms.yaml')).model.base, 'https://example.com/common#');
  assert.throws(() => updateDocument(source, { operations: [{ op: 'upsert', entity: 'model', value: { concepts: [] } }] }), { code: 'VALUE' });
  assert.equal(fs.readdirSync(dir).some(n => n.endsWith('.lock')), false);
});
