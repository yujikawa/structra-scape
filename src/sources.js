import fs from 'node:fs';
import path from 'node:path';
import { loadModel, modelFiles } from './validate.js';

// Material that already exists before a model does: a glossary kept as a spreadsheet, and the
// schema of the data warehouse. Both are read as data and turned into checks or a proposed
// patch; nothing here writes a model or marks a definition as agreed or a mapping as verified.
const fail = (code, message, extra = {}) => { throw Object.assign(new Error(message), { code, ...extra }); };

// CSV or TSV (chosen by the header line), with quoted fields, doubled quotes and line breaks.
export function parseDelimited(text) {
  text = text.replace(/^﻿/, '');
  const header = text.slice(0, text.search(/\r?\n|$/));
  const delimiter = header.split('\t').length > header.split(',').length ? '\t' : ',';
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === '') quoted = true;
    else if (char === delimiter) { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += char;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [names = [], ...records] = rows.filter(r => r.some(cell => cell.trim() !== ''));
  return { columns: names.map(n => n.trim()), records: records.map(r => Object.fromEntries(names.map((n, i) => [n.trim(), (r[i] ?? '').trim()]))) };
}
// The first column whose header is one of `names` (case-insensitive).
const column = (columns, names) => columns.find(c => names.includes(c.toLowerCase()));

// --- Data mappings against a schema -------------------------------------------------------

// Tables (as [database?, schema?, name] parts) with their columns, or null when the columns are
// not known (a dbt model without documented columns). Accepts dbt manifest.json / catalog.json
// and CSV exports of information_schema.columns (table_schema, table_name, column_name).
export function readSchema(file) {
  const tables = [];
  const add = (parts, columns) => tables.push({ parts: parts.filter(Boolean).map(p => String(p).toLowerCase()), columns: columns ? new Set(columns.map(c => String(c).toLowerCase())) : null });
  const text = fs.readFileSync(file, 'utf8');
  if (/\.json$/i.test(file)) {
    let data;
    try { data = JSON.parse(text); } catch (e) { fail('SCHEMA', `${file}: ${e.message}`); }
    const catalog = String(data?.metadata?.dbt_schema_version || '').includes('catalog');
    for (const node of [...Object.values(data?.nodes || {}), ...Object.values(data?.sources || {})]) {
      if (catalog) { const m = node.metadata || {}; add([m.database, m.schema, m.name], Object.keys(node.columns || {})); continue; }
      if (!['model', 'seed', 'snapshot', 'source'].includes(node.resource_type)) continue;
      const columns = Object.keys(node.columns || {});
      add([node.database, node.schema, node.resource_type === 'source' ? node.identifier || node.name : node.alias || node.name], columns.length ? columns : null);
    }
    if (!tables.length) fail('SCHEMA', `${file}: no tables found (expected a dbt manifest.json or catalog.json)`);
    return tables;
  }
  const { columns, records } = parseDelimited(text);
  const table = column(columns, ['table_name', 'table']), name = column(columns, ['column_name', 'column']);
  const schema = column(columns, ['table_schema', 'schema']), database = column(columns, ['table_catalog', 'database']);
  if (!table) fail('SCHEMA', `${file}: needs a table_name (or table) column, and column_name for columns`);
  const byTable = new Map();
  for (const r of records) {
    const key = [database && r[database], schema && r[schema], r[table]].join('\u0000');
    if (!byTable.has(key)) byTable.set(key, { parts: [database && r[database], schema && r[schema], r[table]], columns: [] });
    if (name && r[name]) byTable.get(key).columns.push(r[name]);
  }
  for (const t of byTable.values()) add(t.parts, name ? t.columns : null);
  return tables;
}

// The identifier at the start of a recorded source: `dwh.contracts.start_date（説明）` → dwh.contracts.start_date.
export function sourceIdentifier(source) {
  const match = String(source || '').replace(/[`"[\]]/g, '').trim().match(/^[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*/);
  return match ? match[0].toLowerCase().split('.') : null;
}
// A table matches when the identifier names its trailing parts (contracts, dwh.contracts, …).
const tablesNamed = (tables, parts) => tables.filter(t => parts.length <= t.parts.length && parts.every((p, i) => t.parts[t.parts.length - parts.length + i] === p));

function checkSource(tables, parts, attribute) {
  if (!parts) return { status: 'unparsed', message: 'テーブル名・カラム名として読めません。照合していません。' };
  // A concept usually maps to a table, an attribute to a column; either may name the other.
  const asTable = tablesNamed(tables, parts);
  if (asTable.length && !attribute) return { status: 'found', message: 'テーブルがあります。' };
  if (parts.length >= 2) {
    const owners = tablesNamed(tables, parts.slice(0, -1)), name = parts.at(-1);
    if (owners.some(t => t.columns?.has(name))) return { status: 'found', message: 'カラムがあります。' };
    if (owners.length && owners.every(t => !t.columns)) return { status: 'columns-unknown', message: 'テーブルはありますが、カラムの一覧がないため確認していません。' };
    if (owners.length && !asTable.length) return { status: 'column-missing', message: `テーブル ${parts.slice(0, -1).join('.')} に、カラム ${name} がありません。` };
  }
  if (asTable.length) return { status: 'found', message: 'テーブルがあります。' };
  return { status: 'table-missing', message: `${parts.join('.')} はスキーマにありません。` };
}

// Every data mapping recorded in the model (or every model in a folder), checked against the schema.
export function checkMappings(target, schemaFiles) {
  if (!schemaFiles?.length) fail('SCHEMA', 'Give at least one --schema file');
  const tables = schemaFiles.flatMap(file => readSchema(file));
  const results = [];
  for (const file of modelFiles(target)) {
    const model = loadModel(file);
    const check = (mapping, target, attribute) => {
      const parts = sourceIdentifier(mapping.source);
      results.push({ file: path.basename(file), target, source: mapping.source, identifier: parts?.join('.') || null, recorded: mapping.status, ...checkSource(tables, parts, attribute) });
    };
    for (const item of [...model.concepts, ...model.properties].filter(item => !item.imported_from)) {
      const kind = model.concepts.includes(item) ? 'concept' : 'property';
      if (item.data_mapping) check(item.data_mapping, { kind, id: item.id, name: item.name }, false);
      for (const a of item.attributes || []) if (a.data_mapping) check(a.data_mapping, { kind: 'attribute', concept: item.id, conceptName: item.name, id: a.id, name: a.name }, true);
    }
  }
  const missing = results.filter(r => r.status.endsWith('-missing'));
  return { ok: true, tables: tables.length, checked: results.length, missing: missing.length, results };
}

const statusLabels = { found: 'あり', 'table-missing': 'テーブルなし', 'column-missing': 'カラムなし', 'columns-unknown': 'カラム未確認', unparsed: '照合対象外' };
export function mappingMarkdown(report) {
  const lines = ['# データ対応の照合', '', `スキーマの ${report.tables} テーブルと、${report.checked} 件のデータ対応を照合しました。存在の確認だけで、意味が業務定義と合っているかは確認していません。`, ''];
  if (report.missing) lines.push(`> スキーマに見つからない対応が ${report.missing} 件あります。`, '');
  lines.push('| 結果 | 対象 | 記録された所在 | 状態 | 説明 |', '|---|---|---|---|---|');
  const cell = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  for (const r of report.results) {
    const target = r.target.kind === 'attribute' ? `${r.target.conceptName} › ${r.target.name}` : r.target.name;
    lines.push(`| ${statusLabels[r.status]} | ${cell(target)} (${cell(r.file)}) | ${cell(r.source)} | ${({ verified: '確認済み', rejected: '誤りと確認' })[r.recorded] || '対応案'} | ${cell(r.message)} |`);
  }
  return lines.join('\n') + '\n';
}

// --- A glossary spreadsheet as a patch ------------------------------------------------------

const glossaryColumns = {
  id: ['id', '識別子', 'key'],
  name: ['name', 'term', '用語', '用語名', '名称', '名前'],
  description: ['description', 'definition', '定義', '説明', '意味'],
  aliases: ['aliases', 'synonyms', '別名', '同義語', '類義語', '別称'],
  example: ['example', '例', '具体例'],
  exclusion: ['exclusion', '含まない例', '対象外'],
  evidence: ['evidence', 'source', '出典', '根拠'],
  parent: ['parent', '上位', '上位概念', '上位語'],
  question: ['question', '確認事項', '質問', '論点'],
};
// Turns a glossary (CSV/TSV exported from a spreadsheet) into concept upserts for `apply`.
// IDs are required: they are stable English keys an AI or a person chooses, never derived here.
// Nothing is marked agreed, whatever the spreadsheet says; evidence records where it came from.
export function glossaryPatch(file) {
  const { columns, records } = parseDelimited(fs.readFileSync(file, 'utf8'));
  const at = Object.fromEntries(Object.entries(glossaryColumns).map(([key, names]) => [key, column(columns, names)]));
  if (!at.name) fail('COLUMNS', `${path.basename(file)}: needs a term column (one of: ${glossaryColumns.name.join(', ')})`, { columns });
  if (!at.id) fail('ID_REQUIRED', `${path.basename(file)}: add an id column with a stable English ID for each term (letters, digits, _ or -, starting with a letter), then run again`, { columns });
  const errors = [], warnings = [], ids = new Map(), byName = new Map();
  records.forEach((r, i) => {
    const row = i + 2, id = r[at.id];
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) errors.push(`row ${row}: invalid id "${id}"`);
    else if (ids.has(id)) errors.push(`row ${row}: duplicate id ${id} (also row ${ids.get(id)})`);
    else ids.set(id, row);
    if (!r[at.name]) errors.push(`row ${row}: the term is empty`);
    else byName.set(r[at.name], id);
  });
  if (errors.length) fail('ROWS', `${path.basename(file)}: ${errors.length} rows need fixing`, { errors });
  const used = Object.values(at).filter(Boolean);
  const ignored = columns.filter(c => !used.includes(c));
  if (ignored.length) warnings.push(`Columns not imported: ${ignored.join(', ')}. Record what matters from them (for example as question or evidence) after checking with the user.`);
  const operations = records.map((r, i) => {
    const value = { name: r[at.name] };
    for (const key of ['description', 'example', 'exclusion', 'question']) if (at[key] && r[at[key]]) value[key] = r[at[key]];
    if (at.aliases && r[at.aliases]) {
      const aliases = [...new Set(r[at.aliases].split(/[、,;；／/|\n]/).map(a => a.trim()).filter(a => a && a !== value.name))];
      if (aliases.length) value.aliases = aliases;
    }
    if (at.parent && r[at.parent]) {
      const parent = byName.get(r[at.parent]) || (ids.has(r[at.parent]) ? r[at.parent] : null);
      if (parent && parent !== r[at.id]) value.parent = parent;
      else warnings.push(`row ${i + 2}: parent "${r[at.parent]}" is not a term in this file; left out`);
    }
    value.evidence = at.evidence && r[at.evidence] ? r[at.evidence] : `${path.basename(file)} から取り込み`;
    return { op: 'upsert', entity: 'concept', id: r[at.id], value };
  });
  return { ok: true, source: path.basename(file), terms: operations.length, warnings, operations };
}

export function registerSourceCommands(program, run) {
  program.command('check-mapping <path>')
    .description('Check that the tables and columns named in data mappings exist in a schema (dbt manifest/catalog JSON, or a CSV of information_schema.columns)')
    .requiredOption('--schema <files...>', 'schema files')
    .option('--format <format>', 'json or md', 'json')
    .action((target, options) => {
      try {
        if (!['json', 'md'].includes(options.format)) throw new Error('format must be json or md');
        const report = checkMappings(target, options.schema);
        if (options.format === 'md') process.stdout.write(mappingMarkdown(report));
        else console.log(JSON.stringify(report));
        if (report.missing) process.exitCode = 1;
      } catch (e) { console.log(JSON.stringify({ ok: false, code: e.code || 'ERROR', errors: [e.message] })); process.exitCode = 1; }
    });
  program.command('import-glossary <file>')
    .description('Turn a glossary exported as CSV/TSV into a patch of concept upserts for apply (needs an id column)')
    .action(run(file => glossaryPatch(file)));
}
