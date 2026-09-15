import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import yaml from 'js-yaml';
import { validateOntology } from './ontology.js';

const collections = { concept: 'concepts', property: 'properties', process: 'processes', step: 'steps', flow: 'flows', restriction: 'restrictions' };
const hash = text => createHash('sha256').update(text).digest('hex');
function fail(code, message) { throw Object.assign(new Error(message), { code }); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
export function readDocument(file) {
  const text = fs.readFileSync(file, 'utf8');
  const model = yaml.load(text);
  if (model?.kind !== 'ontology') fail('MODEL_TYPE', 'Expected kind: ontology');
  return { model, revision: hash(text) };
}
export function applyOperations(model, operations) {
  const draft = structuredClone(model);
  if (!Array.isArray(operations) || !operations.length) fail('PATCH', 'operations must be a nonempty array');
  for (const [index, op] of operations.entries()) {
    if (!object(op) || !Object.hasOwn(collections, op.entity) || !['upsert', 'remove', 'replace'].includes(op.op)) fail('OPERATION', `operations[${index}]: invalid operation or entity`);
    let owner = draft;
    if (['step', 'flow'].includes(op.entity)) {
      owner = draft.processes?.find(p => p.id === op.process);
      if (!owner) fail('NOT_FOUND', `operations[${index}]: process not found: ${op.process}`);
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
      const next = { ...(at < 0 ? {} : items[at]), ...op.value, id: op.id };
      if (op.unset !== undefined && (!Array.isArray(op.unset) || op.unset.some(k => typeof k !== 'string' || k === 'id'))) fail('VALUE', 'unset must be a list of field names other than id');
      for (const field of op.unset || []) delete next[field];
      if (at < 0) items.push(next); else items[at] = next;
    }
  }
  const errors = validateOntology(draft);
  if (errors.length) throw Object.assign(new Error('Model validation failed'), { code: 'VALIDATION', errors });
  return draft;
}
export function updateDocument(file, patch, { dryRun = false, expectRevision } = {}) {
  if (!object(patch)) fail('PATCH', 'Expected an object with operations');
  const absolute = path.resolve(file), lock = absolute + '.lock';
  let fd;
  try { fd = fs.openSync(lock, 'wx'); } catch (e) { if (e.code === 'EEXIST') fail('LOCKED', `Another CLI writer holds ${lock}; retry after it finishes`); throw e; }
  const temp = path.join(path.dirname(absolute), '.' + path.basename(absolute) + '.' + randomUUID() + '.tmp');
  try {
    const before = readDocument(absolute);
    const expected = expectRevision || patch.revision;
    if (expected && expected !== before.revision) fail('CONFLICT', 'Revision changed; read the model again');
    const model = applyOperations(before.model, patch.operations);
    const changed = JSON.stringify(model) !== JSON.stringify(before.model);
    const serialized = yaml.dump(model, { noRefs: true, lineWidth: -1 });
    if (!dryRun && changed) {
      fs.writeFileSync(temp, serialized, { encoding: 'utf8', mode: fs.statSync(absolute).mode });
      if (hash(fs.readFileSync(absolute, 'utf8')) !== before.revision) fail('CONFLICT', 'File changed during update');
      fs.renameSync(temp, absolute);
    }
    return { ok: true, changed, saved: !dryRun && changed, revision: !dryRun && changed ? hash(serialized) : before.revision, model };
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
    fs.closeSync(fd); fs.unlinkSync(lock);
  }
}

export function registerAuthoringCommands(program) {
  const run = fn => (...args) => { try { console.log(JSON.stringify(fn(...args))); } catch (e) { console.log(JSON.stringify({ ok: false, code: e.code || 'ERROR', errors: e.errors || [e.message] })); process.exitCode = 1; } };
  const input = file => JSON.parse(fs.readFileSync(file === '-' ? 0 : file, 'utf8'));
  program.command('inspect <file>').description('Read model and revision as JSON').action(run(file => ({ ok: true, ...readDocument(file) })));
  program.command('apply <file>').description('Apply a JSON transaction; input - reads stdin')
    .requiredOption('--patch <file>', 'JSON patch file or -')
    .option('--dry-run', 'validate without saving').option('--expect-revision <sha256>', 'require revision')
    .action(run((file, options) => updateDocument(file, input(options.patch), options)));
  for (const entity of ['concept', 'property', 'process', 'step']) {
    const group = program.command(entity).description(`Read and mutate ${entity}`);
    group.command('get <file> [id]').option('--process <id>', 'parent process for steps').action(run((file, id, options) => {
      const doc = readDocument(file);
      const owner = entity === 'step' ? doc.model.processes?.find(p => p.id === options.process) : doc.model;
      if (!owner) fail('NOT_FOUND', 'Parent process not found');
      const values = owner[collections[entity]] || [];
      const data = id ? values.find(v => v.id === id) : values;
      if (data === undefined) fail('NOT_FOUND', `${entity} not found: ${id}`);
      return { ok: true, revision: doc.revision, data };
    }));
    for (const action of ['upsert', 'remove']) {
      const command = group.command(`${action} <file> <id>`).option('--process <id>', 'parent process for steps')
        .option('--dry-run', 'validate without saving').option('--expect-revision <sha256>', 'require revision');
      if (action === 'upsert') command.requiredOption('--input <file>', 'JSON value file or -');
      command.action(run((file, id, options) => updateDocument(file, { operations: [{ op: action, entity, id, process: options.process, ...(action === 'upsert' ? { value: input(options.input) } : {}) }] }, options)));
    }
  }
}
