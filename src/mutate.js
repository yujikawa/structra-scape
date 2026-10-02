import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import yaml from 'js-yaml';
import { validateOntology } from './ontology.js';
import { diffModels, describeChange } from './diff.js';
import { resolveImports, dependentModels } from './imports.js';
import { updateYamlText } from './yaml-document.js';

const collections = { concept: 'concepts', property: 'properties', attribute: 'attributes', process: 'processes', step: 'steps', flow: 'flows', restriction: 'restrictions' };
// Nested entities and the field naming their parent.
const parents = { step: ['process', 'processes'], flow: ['process', 'processes'], attribute: ['concept', 'concepts'] };
const modelFields = ['name', 'base', 'imports'];
const hash = text => createHash('sha256').update(text).digest('hex');
function fail(code, message) { throw Object.assign(new Error(message), { code }); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function load(file) {
  const text = fs.readFileSync(file, 'utf8');
  const model = yaml.load(text);
  if (model?.kind !== 'ontology') fail('MODEL_TYPE', 'Expected kind: ontology');
  return { text, model, revision: hash(text) };
}
export function readDocument(file) {
  const { model, revision } = load(file);
  return { model, revision };
}
// Read-only definitions available to references through imports.
function importedSummary(model, file) {
  if (model.imports === undefined) return undefined;
  const resolved = resolveImports(model, file);
  const pick = key => resolved[key].filter(item => item.imported_from).map(({ id, name, imported_from, ...rest }) => ({ id, name, imported_from, ...(key === 'properties' ? { domain: rest.domain, range: rest.range } : {}) }));
  return { concepts: pick('concepts'), properties: pick('properties') };
}
export function inspectDocument(file) {
  const doc = readDocument(file), imported = importedSummary(doc.model, file);
  return { ok: true, ...doc, ...(imported ? { imported } : {}) };
}
export function applyOperations(model, operations, { file } = {}) {
  const draft = structuredClone(model);
  if (!Array.isArray(operations) || !operations.length) fail('PATCH', 'operations must be a nonempty array');
  for (const [index, op] of operations.entries()) {
    // Root fields of the model itself (name, base, imports); the lists are edited through their entities.
    if (object(op) && op.entity === 'model') {
      if (op.op !== 'upsert' || !object(op.value)) fail('OPERATION', `operations[${index}]: model supports upsert with an object value`);
      const fields = [...Object.keys(op.value), ...(Array.isArray(op.unset) ? op.unset : [])];
      const bad = fields.find(key => !modelFields.includes(key));
      if (bad !== undefined || (op.unset !== undefined && !Array.isArray(op.unset))) fail('VALUE', `model accepts only ${modelFields.join(', ')}${bad !== undefined ? `; got ${bad}` : ''}`);
      Object.assign(draft, structuredClone(op.value));
      for (const field of op.unset || []) delete draft[field];
      continue;
    }
    if (!object(op) || !Object.hasOwn(collections, op.entity) || !['upsert', 'remove', 'replace'].includes(op.op)) fail('OPERATION', `operations[${index}]: invalid operation or entity`);
    let owner = draft;
    if (parents[op.entity]) {
      const [field, list] = parents[op.entity];
      owner = draft[list]?.find(p => p.id === op[field]);
      if (!owner) fail('NOT_FOUND', `operations[${index}]: ${field} not found: ${op[field]}`);
    }
    const key = collections[op.entity];
    const items = owner[key] ??= [];
    if (!Array.isArray(items)) fail('MODEL', `${key} must be an array`);
    // Flows and restrictions have no stable IDs: replace the whole scoped list.
    if (['flow', 'restriction'].includes(op.entity)) {
      if (op.op !== 'replace' || !Array.isArray(op.value)) fail('OPERATION', `${op.entity} requires replace with an array`);
      owner[key] = structuredClone(op.value);
      continue;
    }
    if (op.op === 'replace') fail('OPERATION', `${op.entity} supports upsert or remove`);
    if (typeof op.id !== 'string' || !op.id) fail('ID', 'An id is required');
    const at = items.findIndex(item => item.id === op.id);
    if (op.op === 'remove') {
      if (at < 0) fail('NOT_FOUND', `${op.entity} not found: ${op.id}`);
      items.splice(at, 1);
    } else {
      if (!object(op.value) || (op.value.id !== undefined && op.value.id !== op.id)) fail('VALUE', 'value must be an object; id cannot change');
      for (const key of Object.keys(op.value)) if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('VALUE', `Forbidden key: ${key}`);
      const next = at < 0 ? { id: op.id, ...op.value } : { ...items[at], ...op.value, id: op.id };
      if (op.unset !== undefined && (!Array.isArray(op.unset) || op.unset.some(k => typeof k !== 'string' || k === 'id'))) fail('VALUE', 'unset must be a list of field names other than id');
      for (const field of op.unset || []) delete next[field];
      if (at < 0) items.push(next); else items[at] = next;
    }
  }
  let resolved;
  try { resolved = file ? resolveImports(draft, file) : draft; } catch (e) { throw Object.assign(new Error('Model validation failed'), { code: 'VALIDATION', errors: [e.message] }); }
  const errors = validateOntology(resolved);
  if (errors.length) throw Object.assign(new Error('Model validation failed'), { code: 'VALIDATION', errors });
  return draft;
}
// Changes that touch a definition already agreed with business owners need explicit confirmation.
function guardAgreed(before, after, allowed) {
  const changes = diffModels(before, after), agreed = changes.filter(c => c.agreed);
  if (agreed.length && !allowed) throw Object.assign(new Error('Agreed definitions would change. Confirm with the user, then retry with --allow-agreed-change'), { code: 'AGREED_CHANGE', errors: agreed.map(describeChange) });
  return changes.map(c => ({ entity: c.entity, change: c.change, id: c.id, name: c.name, ...(c.process ? { process: c.process } : {}), ...(c.concept ? { concept: c.concept } : {}), ...(c.fields ? { fields: c.fields.map(f => f.field) } : {}), ...(c.agreed ? { agreed: true } : {}) }));
}
// A lock records "<host> <pid>". It is stale when that process on this host no longer runs, or
// when it is empty (the writer died before recording itself) and older than a few seconds.
function staleLock(lock) {
  let text, stat;
  try { text = fs.readFileSync(lock, 'utf8').trim(); stat = fs.statSync(lock); } catch { return false; }
  if (!text) return Date.now() - stat.mtimeMs > 5000;
  const [host, pid] = text.split(' ');
  if (host !== os.hostname() || !/^\d+$/.test(pid)) return false;
  try { process.kill(Number(pid), 0); return false; } catch (e) { return e.code === 'ESRCH'; }
}
function acquire(lock) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(lock, 'wx');
      fs.writeSync(fd, `${os.hostname()} ${process.pid}`);
      return fd;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // Take over a lock left by a crashed writer; another live writer keeps it.
      if (attempt === 0 && staleLock(lock)) { fs.rmSync(lock, { force: true }); continue; }
      fail('LOCKED', `Another CLI writer holds ${lock}; retry after it finishes`);
    }
  }
}
// Hold the CLI lock of every file for the duration of fn. Locks are taken in a fixed order.
function withLocks(files, fn) {
  const held = [];
  try {
    for (const file of [...new Set(files)].sort()) {
      const lock = file + '.lock';
      held.push([acquire(lock), lock]);
    }
    return fn();
  } finally {
    for (const [fd, lock] of held) { fs.closeSync(fd); fs.unlinkSync(lock); }
  }
}
// Replace a file atomically, failing if it changed since it was read (revision null: must not exist).
function writeAtomic(file, text, revision) {
  const temp = path.join(path.dirname(file), '.' + path.basename(file) + '.' + randomUUID() + '.tmp');
  try {
    fs.writeFileSync(temp, text, { encoding: 'utf8', mode: fs.existsSync(file) ? fs.statSync(file).mode : 0o644 });
    const current = fs.existsSync(file) ? hash(fs.readFileSync(file, 'utf8')) : null;
    if (current !== revision) fail('CONFLICT', `File changed during update: ${file}`);
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
// Edit the YAML in place to keep comments and formatting; re-dump only if that is impossible.
const serialize = (text, model) => (text && updateYamlText(text, model)) ?? yaml.dump(model, { noRefs: true, lineWidth: -1 });
const rejectBroken = changes => {
  const broken = dependentModels(changes);
  if (broken.length) throw Object.assign(new Error('A model importing this file would become invalid'), { code: 'VALIDATION', errors: broken });
};

export function updateDocument(file, patch, { dryRun = false, expectRevision, allowAgreedChange = false } = {}) {
  if (!object(patch)) fail('PATCH', 'Expected an object with operations');
  const absolute = path.resolve(file);
  return withLocks([absolute], () => {
    const before = load(absolute);
    const expected = expectRevision || patch.revision;
    if (expected && expected !== before.revision) fail('CONFLICT', 'Revision changed; read the model again');
    const model = applyOperations(before.model, patch.operations, { file: absolute });
    const changed = JSON.stringify(model) !== JSON.stringify(before.model);
    const changes = guardAgreed(before.model, model, allowAgreedChange);
    // Files that import this one must stay valid with the new definitions.
    if (changed) rejectBroken(new Map([[absolute, model]]));
    const serialized = changed ? serialize(before.text, model) : before.text;
    if (!dryRun && changed) writeAtomic(absolute, serialized, before.revision);
    return { ok: true, changed, saved: !dryRun && changed, revision: !dryRun && changed ? hash(serialized) : before.revision, changes, model };
  });
}

// Move concepts/properties (with their attributes and the restrictions on moved concepts) into a
// shared definitions file, and make the source import it. Both files are validated together, so a
// definition can move to common.yaml even while other models already import that file.
// Moving does not change meaning, so the agreed-definition guard does not apply.
export function promoteDefinitions(file, ids, to, { dryRun = false, expectRevision, name = '共通の用語', base } = {}) {
  const source = path.resolve(file), target = path.resolve(to);
  if (source === target) fail('VALUE', 'The target must be a different file');
  if (!ids.length) fail('VALUE', 'Name at least one concept or property ID');
  const folder = path.dirname(target), madeFolder = !fs.existsSync(folder);
  if (madeFolder) fs.mkdirSync(folder, { recursive: true });
  try {
    return promoteLocked(source, target, ids, to, file, { dryRun, expectRevision, name, base });
  } finally {
    if (madeFolder && !fs.readdirSync(folder).length) fs.rmdirSync(folder);
  }
}
function promoteLocked(source, target, ids, to, file, { dryRun, expectRevision, name, base }) {
  return withLocks([source, target], () => {
    const src = load(source);
    if (expectRevision && expectRevision !== src.revision) fail('CONFLICT', 'Revision changed; read the model again');
    const exists = fs.existsSync(target), tgt = exists ? load(target) : null;
    const created = { kind: 'ontology', name, base: base || new URL('common#', src.model.base).href, concepts: [], properties: [], restrictions: [] };
    const sourceNext = structuredClone(src.model), targetNext = structuredClone(tgt?.model || created);
    const moved = { concepts: [], properties: [], restrictions: 0 };
    for (const id of new Set(ids)) {
      const key = sourceNext.concepts.some(c => c.id === id) ? 'concepts' : sourceNext.properties.some(p => p.id === id) ? 'properties' : null;
      if (!key) fail('NOT_FOUND', `No local concept or property ${id} in ${file} (imported definitions move from the file that owns them)`);
      if (targetNext.concepts.some(c => c.id === id) || targetNext.properties.some(p => p.id === id)) fail('VALUE', `${to} already defines ${id}`);
      targetNext[key].push(sourceNext[key].find(item => item.id === id));
      sourceNext[key] = sourceNext[key].filter(item => item.id !== id);
      moved[key].push(id);
    }
    const restrictions = sourceNext.restrictions.filter(r => moved.concepts.includes(r.subject));
    targetNext.restrictions.push(...restrictions);
    sourceNext.restrictions = sourceNext.restrictions.filter(r => !restrictions.includes(r));
    moved.restrictions = restrictions.length;
    // The shared file cannot refer back into the source: everything moved definitions use must move too.
    const remaining = new Set([...sourceNext.concepts, ...sourceNext.properties].map(item => item.id)), needs = new Map();
    const need = (from, id, why) => { if (remaining.has(id)) needs.set(id, [...(needs.get(id) || []), `${from}（${why}）`]); };
    for (const c of targetNext.concepts.filter(c => moved.concepts.includes(c.id))) need(c.id, c.parent, '上位概念');
    for (const p of targetNext.properties.filter(p => moved.properties.includes(p.id))) { need(p.id, p.domain, 'domain'); need(p.id, p.range, 'range'); }
    for (const r of restrictions) { need(r.subject, r.property, '分類条件'); need(r.subject, r.target, '分類条件'); }
    if (needs.size) throw Object.assign(new Error(`Also move ${[...needs.keys()].join(' ')}: the moved definitions depend on them`), { code: 'DEPENDENCY', missing: [...needs.keys()], errors: [...needs].map(([id, from]) => `${id} ← ${from.join('、')}`) });
    // References to definitions the source imports become imports of the shared file.
    let resolvedSource;
    try { resolvedSource = resolveImports(src.model, source); } catch { resolvedSource = src.model; }
    const owners = new Map([...resolvedSource.concepts, ...resolvedSource.properties].filter(x => x.imported_from).map(x => [x.id, path.resolve(path.dirname(source), x.imported_from)]));
    const used = [...targetNext.concepts.filter(c => moved.concepts.includes(c.id)).map(c => c.parent), ...targetNext.properties.filter(p => moved.properties.includes(p.id)).flatMap(p => [p.domain, p.range]), ...restrictions.flatMap(r => [r.property, r.target])];
    for (const owner of new Set(used.map(id => owners.get(id)).filter(Boolean))) {
      if (owner === target || (targetNext.imports || []).some(p => path.resolve(path.dirname(target), p) === owner)) continue;
      targetNext.imports = [...(targetNext.imports || []), path.relative(path.dirname(target), owner).split(path.sep).join('/')];
    }
    const relative = path.relative(path.dirname(source), target).split(path.sep).join('/');
    if (!(sourceNext.imports || []).some(p => path.resolve(path.dirname(source), p) === target)) sourceNext.imports = [...(sourceNext.imports || []), relative];
    const pending = new Map([[source, sourceNext], [target, targetNext]]);
    for (const [changedFile, model] of pending) {
      let errors;
      try { errors = validateOntology(resolveImports(model, changedFile, [], pending)); } catch (e) { errors = [e.message]; }
      if (errors.length) throw Object.assign(new Error(`Moving would leave ${path.basename(changedFile)} invalid (move the definitions it depends on too)`), { code: 'VALIDATION', errors });
    }
    rejectBroken(pending);
    if (!dryRun) {
      writeAtomic(target, serialize(tgt?.text, targetNext), tgt?.revision ?? null);
      writeAtomic(source, serialize(src.text, sourceNext), src.revision);
    }
    return { ok: true, saved: !dryRun, moved, imports: relative, ...(targetNext.imports?.length ? { targetImports: targetNext.imports } : {}), created: !exists, revision: dryRun ? src.revision : hash(fs.readFileSync(source, 'utf8')) };
  });
}

// Wraps a command for agents: prints its result as JSON, or {ok: false, code, errors} with exit code 1.
export const jsonAction = fn => (...args) => { try { console.log(JSON.stringify(fn(...args))); } catch (e) { console.log(JSON.stringify({ ok: false, code: e.code || 'ERROR', ...(e.errors ? { message: e.message } : {}), ...(e.missing ? { missing: e.missing } : {}), errors: e.errors || [e.message] })); process.exitCode = 1; } };

export function registerAuthoringCommands(program) {
  const run = jsonAction;
  const input = file => JSON.parse(fs.readFileSync(file === '-' ? 0 : file, 'utf8'));
  program.command('inspect <file>').description('Read model and revision as JSON').action(run(file => inspectDocument(file)));
  program.command('apply <file>').description('Apply a JSON transaction; input - reads stdin')
    .requiredOption('--patch <file>', 'JSON patch file or -')
    .option('--dry-run', 'validate without saving').option('--expect-revision <sha256>', 'require revision')
    .option('--allow-agreed-change', 'confirm changes to definitions with review_state: agreed')
    .action(run((file, options) => updateDocument(file, input(options.patch), options)));
  program.command('promote <file> <ids...>').description('Move concepts/properties into a shared definitions file and import it')
    .requiredOption('--to <file>', 'shared definitions YAML (created if missing)')
    .option('--name <name>', 'model name when the target is created').option('--base <iri>', 'base IRI when the target is created')
    .option('--dry-run', 'validate without saving').option('--expect-revision <sha256>', 'require revision of <file>')
    .action(run((file, ids, options) => promoteDefinitions(file, ids, options.to, options)));
  for (const entity of ['concept', 'property', 'attribute', 'process', 'step']) {
    const group = program.command(entity).description(`Read and mutate ${entity}`);
    group.command('get <file> [id]').option('--process <id>', 'parent process for steps').option('--concept <id>', 'parent concept for attributes').action(run((file, id, options) => {
      const doc = readDocument(file);
      const [field, list] = parents[entity] || [];
      const owner = field ? doc.model[list]?.find(p => p.id === options[field]) : doc.model;
      if (!owner) fail('NOT_FOUND', `Parent ${field} not found`);
      const values = owner[collections[entity]] || [];
      const data = id ? values.find(v => v.id === id) : values;
      if (data === undefined) fail('NOT_FOUND', `${entity} not found: ${id}`);
      return { ok: true, revision: doc.revision, data };
    }));
    for (const action of ['upsert', 'remove']) {
      const command = group.command(`${action} <file> <id>`).option('--process <id>', 'parent process for steps').option('--concept <id>', 'parent concept for attributes')
        .option('--dry-run', 'validate without saving').option('--expect-revision <sha256>', 'require revision')
        .option('--allow-agreed-change', 'confirm changes to definitions with review_state: agreed');
      if (action === 'upsert') command.requiredOption('--input <file>', 'JSON value file or -');
      command.action(run((file, id, options) => updateDocument(file, { operations: [{ op: action, entity, id, process: options.process, concept: options.concept, ...(action === 'upsert' ? { value: input(options.input) } : {}) }] }, options)));
    }
  }
}
