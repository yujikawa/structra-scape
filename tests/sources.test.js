import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseDelimited, readSchema, sourceIdentifier, checkMappings, glossaryPatch } from '../src/sources.js';
import { updateDocument, readDocument } from '../src/mutate.js';
import { validateFile } from '../src/validate.js';

function folder(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structra-sources-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('CSV and TSV parsing keeps quoted commas, quotes, line breaks and a BOM', () => {
  assert.deepEqual(parseDelimited('﻿a,b\r\n"x, ""y""","1\n2"\n\n'), { columns: ['a', 'b'], records: [{ a: 'x, "y"', b: '1\n2' }] });
  assert.deepEqual(parseDelimited('a\tb\nx,1\t2\n').records, [{ a: 'x,1', b: '2' }]);
  assert.deepEqual(sourceIdentifier('dwh.contracts.start_date（架空）'), ['dwh', 'contracts', 'start_date']);
  assert.deepEqual(sourceIdentifier('"DWH"."Contracts"'), ['dwh', 'contracts']);
  assert.equal(sourceIdentifier('契約管理システムの画面'), null);
});

test('data mappings are checked against dbt manifests, catalogs and information_schema exports', t => {
  const dir = folder(t);
  const manifest = path.join(dir, 'manifest.json'), catalog = path.join(dir, 'catalog.json'), columns = path.join(dir, 'columns.csv');
  fs.writeFileSync(manifest, JSON.stringify({ metadata: { dbt_schema_version: 'https://schemas.getdbt.com/dbt/manifest/v12.json' }, nodes: {
    'model.p.contracts': { resource_type: 'model', database: 'analytics', schema: 'example_warehouse', name: 'contracts', columns: { contract_no: {}, start_date: {} } },
    'model.p.orders': { resource_type: 'model', database: 'analytics', schema: 'example_warehouse', name: 'orders', columns: {} },
    'test.p.x': { resource_type: 'test', schema: 's', name: 'not_a_table' },
  }, sources: { 'source.p.crm.accounts': { resource_type: 'source', schema: 'crm', name: 'accounts', identifier: 'ACCOUNTS', columns: {} } } }));
  fs.writeFileSync(catalog, JSON.stringify({ metadata: { dbt_schema_version: 'https://schemas.getdbt.com/dbt/catalog/v1.json' }, nodes: { 'model.p.contracts': { metadata: { database: 'analytics', schema: 'example_warehouse', name: 'contracts' }, columns: { CONTRACT_NO: {}, STATUS: {} } } } }));
  fs.writeFileSync(columns, 'table_schema,table_name,column_name\nexample_warehouse,contracts,contract_no\nexample_warehouse,contracts,start_date\n');
  assert.deepEqual(readSchema(manifest).map(t => [t.parts.join('.'), t.columns && [...t.columns]]), [['analytics.example_warehouse.contracts', ['contract_no', 'start_date']], ['analytics.example_warehouse.orders', null], ['crm.accounts', null]]);
  assert.deepEqual([...readSchema(catalog)[0].columns], ['contract_no', 'status']);
  // The sample records example_warehouse.contracts and two of its columns.
  const byManifest = checkMappings('samples/customer-contract.yaml', [manifest]);
  assert.deepEqual(byManifest.results.map(r => [r.target.id, r.status]), [['organizationId', 'table-missing'], ['industry', 'table-missing'], ['Customer', 'found'], ['contractNo', 'found'], ['startDate', 'found']]);
  assert.equal(byManifest.missing, 2);
  const byCatalog = checkMappings('samples', [catalog]);
  assert.deepEqual(byCatalog.results.map(r => [r.target.id, r.status]), [['organizationId', 'table-missing'], ['industry', 'table-missing'], ['Customer', 'found'], ['contractNo', 'found'], ['startDate', 'column-missing']]);
  // Imported definitions are checked in the file that owns them, not again in billing.yaml.
  assert.ok(byCatalog.results.every(r => r.file === 'customer-contract.yaml'));
  const model = path.join(dir, 'm.yaml');
  fs.writeFileSync(model, 'kind: ontology\nname: m\nbase: https://e.com/m#\nconcepts:\n  - id: Order\n    name: 注文\n    data_mapping: { source: example_warehouse.orders, status: proposed }\n    attributes:\n      - { id: total, name: 合計, data_mapping: { source: example_warehouse.orders.total, status: verified } }\n  - id: Lead\n    name: 見込み客\n    data_mapping: { source: crm.leads, status: proposed }\n  - id: Memo\n    name: メモ\n    data_mapping: { source: 営業の手書きメモ, status: proposed }\nproperties: []\nrestrictions: []\n');
  assert.deepEqual(checkMappings(model, [manifest]).results.map(r => [r.target.id, r.status, r.recorded]), [['Order', 'found', 'proposed'], ['total', 'columns-unknown', 'verified'], ['Lead', 'table-missing', 'proposed'], ['Memo', 'unparsed', 'proposed']]);
  const cli = spawnSync(process.execPath, ['src/index.js', 'check-mapping', model, '--schema', manifest, columns, '--format', 'md'], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stdout, /\| テーブルなし \| 見込み客 \(m.yaml\) \| crm.leads \| 対応案 \| crm.leads はスキーマにありません。 \|/);
  assert.match(JSON.parse(spawnSync(process.execPath, ['src/index.js', 'check-mapping', model, '--schema', path.join(dir, 'none.csv')], { encoding: 'utf8' }).stdout).errors[0], /ENOENT/);
});

test('a glossary spreadsheet becomes a patch that applies, never marked agreed', t => {
  const dir = folder(t), csv = path.join(dir, 'glossary.csv'), model = path.join(dir, 'terms.yaml');
  fs.writeFileSync(csv, 'ID,用語,定義,同義語,上位語,承認状態\nCustomer,顧客,"契約を持つ法人。個人は含まない",取引先、得意先、顧客,法人,承認済\nOrganization,法人,契約の当事者,,,\nPartner,協力会社,,,存在しない分類,\n');
  const patch = glossaryPatch(csv);
  assert.equal(patch.terms, 3);
  assert.deepEqual(patch.operations[0], { op: 'upsert', entity: 'concept', id: 'Customer', value: { name: '顧客', description: '契約を持つ法人。個人は含まない', aliases: ['取引先', '得意先'], parent: 'Organization', evidence: 'glossary.csv から取り込み' } });
  assert.ok(patch.warnings.some(w => w.includes('承認状態')));
  assert.ok(patch.warnings.some(w => w.startsWith('row 4: parent "存在しない分類"')));
  fs.writeFileSync(model, 'kind: ontology\nname: 用語\nbase: https://e.com/t#\nconcepts: []\nproperties: []\nrestrictions: []\n');
  updateDocument(model, patch);
  assert.deepEqual(validateFile(model), []);
  assert.ok(readDocument(model).model.concepts.every(c => c.review_state === undefined));
  // The CLI output is itself a patch for apply.
  const cli = spawnSync(process.execPath, ['src/index.js', 'import-glossary', csv], { encoding: 'utf8' });
  const applied = spawnSync(process.execPath, ['src/index.js', 'apply', model, '--patch', '-', '--dry-run'], { input: cli.stdout, encoding: 'utf8' });
  assert.equal(JSON.parse(applied.stdout).ok, true, applied.stdout);
  // IDs are never made up: rows without one, or with a duplicate, are refused.
  fs.writeFileSync(csv, '用語,定義\n顧客,x\n');
  assert.throws(() => glossaryPatch(csv), { code: 'ID_REQUIRED' });
  fs.writeFileSync(csv, 'id,name\nA,一\nA,二\n1x,三\nB,\n');
  assert.throws(() => glossaryPatch(csv), e => e.code === 'ROWS' && e.errors.join('|') === 'row 3: duplicate id A (also row 2)|row 4: invalid id "1x"|row 5: the term is empty');
});
