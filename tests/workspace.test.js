import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadWorkspace, renderModel } from '../src/build.js';
import { workspaceOverview, overviewMarkdown } from '../src/workspace.js';
import { translateUI } from '../src/i18n.js';

function workspace(t, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'structra-workspace-')), dir = path.join(root, 'models');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(dir);
  for (const name of ['customer-contract.yaml', 'billing.yaml', 'process-hierarchy.yaml']) fs.copyFileSync(path.join('samples', name), path.join(dir, name));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}

test('overview finds hand-overs and definitions used across domains', () => {
  const overview = workspaceOverview(loadWorkspace('samples'));
  assert.deepEqual(overview.domains.map(d => [d.file, d.concepts, d.processes]), [['billing.yaml', 1, 1], ['customer-contract.yaml', 4, 1], ['process-hierarchy.yaml', 0, 3]]);
  // The contract process creates 契約 and the billing process reads it.
  const handover = overview.links.find(l => l.from === 'customer-contract.yaml' && l.to === 'billing.yaml');
  assert.deepEqual(handover.handoffs.map(h => [h.conceptId, h.from.process, h.to.process, h.to.role]), [['Contract', 'ContractProcess', 'Billing', 'reads']]);
  // Billing points at terms the contract domain owns, through imports.
  const uses = overview.links.find(l => l.from === 'billing.yaml' && l.to === 'customer-contract.yaml');
  assert.equal(uses.imports, true);
  assert.deepEqual(uses.uses.map(u => `${u.kind}:${u.id}>${u.conceptId}`).sort(), ['property:basedOn>Contract', 'property:billedTo>Customer', 'step:Aggregate>Contract', 'step:Issue>Customer']);
  assert.ok(!overview.links.some(l => l.from === 'process-hierarchy.yaml' || l.to === 'process-hierarchy.yaml'));
  // Matrix rows are grouped by the owning domain and keep each role.
  assert.deepEqual(overview.matrix.map(r => r.id), ['Invoice', 'Contract', 'Customer', 'Organization']);
  assert.deepEqual(overview.matrix.find(r => r.id === 'Contract').cells['billing.yaml'].map(u => u.role), ['reads']);
  // Only what crosses a boundary is flagged for the diagram's default view.
  assert.deepEqual(overview.concepts.filter(c => c.cross).map(c => c.id).sort(), ['Contract', 'Customer', 'Invoice']);
  assert.deepEqual(overview.processes.filter(p => p.cross).map(p => p.id).sort(), ['Billing', 'ContractProcess']);
  assert.deepEqual(overview.relations.filter(r => r.cross).map(r => r.id).sort(), ['basedOn', 'billedTo']);
  // 契約顧客 is read by billing but no process records creating it.
  assert.deepEqual(overview.questions.map(q => q.ask), ['「契約顧客」は、どの業務で作られますか？']);
  for (const q of overview.questions) assert.notEqual(translateUI(q.ask, 'en'), q.ask);
});

test('overview flags a word defined separately in two domains, and shared files outside the folder', t => {
  const dir = workspace(t, {
    'sales.yaml': 'kind: ontology\nname: 営業\nbase: https://example.com/sales#\nimports: [../outside/common.yaml]\nconcepts:\n  - id: Client\n    name: 取引先\n    parent: Party\nproperties: []\nrestrictions: []\n',
  });
  const outside = path.join(dir, '..', 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'common.yaml'), 'kind: ontology\nname: 全社共通\nbase: https://example.com/common#\nconcepts:\n  - id: Party\n    name: 当事者\nproperties: []\nrestrictions: []\n');
  const overview = workspaceOverview(loadWorkspace(dir));
  const overlap = overview.questions.find(q => q.kind === 'overlap');
  assert.equal(overlap.ask, '「取引先」は、「顧客と契約の定義」の「契約顧客」と「営業」の「取引先」で同じものを指していますか？');
  assert.match(translateUI(overlap.ask, 'en'), /^Does “取引先” mean the same thing in “顧客と契約の定義”: “契約顧客” and “営業”: “取引先”\?$/);
  assert.match(translateUI(overlap.message, 'en'), /is defined separately in several domains/);
  const external = overview.domains.find(d => d.file === '../outside/common.yaml');
  assert.deepEqual([external.name, external.local, external.concepts], ['全社共通', false, 1]);
  assert.deepEqual(overview.links.find(l => l.from === 'sales.yaml').uses.map(u => [u.kind, u.conceptId]), [['parent', 'Party']]);
});

test('overview CLI prints JSON or Markdown, and the viewer carries the overview tab', () => {
  const run = (...args) => execFileSync(process.execPath, [path.resolve('src/index.js'), 'overview', 'samples', ...args], { encoding: 'utf8' });
  const json = JSON.parse(run());
  assert.equal(json.ok, true);
  assert.deepEqual(json.links, JSON.parse(JSON.stringify(workspaceOverview(loadWorkspace('samples')).links)));
  const md = run('--format', 'md');
  assert.equal(md, overviewMarkdown(workspaceOverview(loadWorkspace('samples'))));
  assert.match(md, /受け渡し：契約（申込みから契約まで › 契約を締結する が作成 → 月次請求 › 請求額を集計する が参照する）/);
  assert.match(md, /\| 契約 \| 顧客と契約の定義 \| 参照する \| 作成する \|/);
  const html = renderModel('samples');
  assert.match(html, /function workspaceOverview/);
  assert.match(html, /mode-overview/);
});
