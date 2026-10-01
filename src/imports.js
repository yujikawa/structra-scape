import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { validateOntology } from './ontology.js';

const slash = value => value.split(path.sep).join('/');

// Merge the concepts, properties and restrictions of shared definition files into a model.
// Imported entries are tagged with imported_from (relative to the importing file) and are
// read-only here: they are edited, validated and reviewed in the file that owns them.
// Processes are never imported. Imports are resolved transitively; cycles are rejected.
// `overrides` maps absolute paths to in-memory models, to check a change before it is saved.
export function resolveImports(model, file, stack = [], overrides = new Map()) {
  if (model?.kind !== 'ontology' || model.imports === undefined) return model;
  const absolute = path.resolve(file), dir = path.dirname(absolute);
  if (!Array.isArray(model.imports) || model.imports.some(p => typeof p !== 'string' || !p.trim())) throw new Error('imports は共通定義YAMLへの相対パスの配列にしてください');
  for (const key of ['concepts', 'properties', 'restrictions']) {
    if (Array.isArray(model[key]) && model[key].some(item => item?.imported_from !== undefined)) throw new Error('imported_from は読み込み時に付与されます。YAMLには書かないでください');
  }
  const merged = structuredClone(model), seen = new Set();
  for (const key of ['concepts', 'properties', 'restrictions']) if (!Array.isArray(merged[key])) return merged;
  merged.imported_models = [];
  for (const relative of model.imports) {
    const target = path.resolve(dir, relative);
    if (target === absolute || stack.includes(target)) throw new Error(`imports が循環しています: ${relative}`);
    if (!overrides.has(target) && !fs.existsSync(target)) throw new Error(`imports の参照先が見つかりません: ${relative}`);
    const raw = overrides.get(target) || yaml.load(fs.readFileSync(target, 'utf8')) || {};
    if (raw.kind !== 'ontology') throw new Error(`${relative}: kind: ontology のモデルだけを読み込めます`);
    const imported = resolveImports(raw, target, [...stack, absolute], overrides);
    const errors = validateOntology(imported);
    if (errors.length) throw new Error(`${relative} の検証に失敗しました:\n${errors.map(e => `- ${e}`).join('\n')}`);
    const rebase = inner => slash(path.relative(dir, path.resolve(path.dirname(target), inner)));
    for (const key of ['concepts', 'properties', 'restrictions']) {
      for (const item of imported[key]) {
        const tagged = { ...item, imported_from: item.imported_from ? rebase(item.imported_from) : slash(relative) };
        // The same file reached through two imports contributes its definitions once.
        const identity = key + '\0' + (key === 'restrictions' ? JSON.stringify(tagged) : `${tagged.imported_from}#${item.id}`);
        if (!seen.has(identity)) { seen.add(identity); merged[key].push(tagged); }
      }
    }
    for (const inner of [{ path: slash(relative), name: raw.name, base: raw.base }, ...(imported.imported_models || []).map(m => ({ ...m, path: rebase(m.path) }))]) {
      if (!merged.imported_models.some(m => m.path === inner.path)) merged.imported_models.push(inner);
    }
  }
  return merged;
}

// Absolute paths of every file a resolved model was assembled from.
export function importedFiles(model, file) {
  return (model?.imported_models || []).map(m => path.resolve(path.dirname(path.resolve(file)), m.path));
}

// Errors that saving `changes` (absolute path → new raw model) would newly cause in sibling models
// (same directory as a changed file) importing a changed file, directly or through another import.
// Problems those siblings already had are not reported.
export function dependentModels(changes) {
  const errors = [], changed = [...changes.keys()];
  const check = (raw, sibling, overrides) => {
    try {
      const resolved = resolveImports(raw, sibling, [], overrides);
      return { imports: importedFiles(resolved, sibling).some(f => changes.has(f)), errors: validateOntology(resolved) };
    } catch (e) { return { imports: true, errors: [e.message] }; }
  };
  const siblings = new Set(changed.flatMap(file => fs.readdirSync(path.dirname(file)).filter(n => /\.ya?ml$/i.test(n)).map(n => path.join(path.dirname(file), n))));
  for (const sibling of siblings) {
    if (changes.has(sibling)) continue;
    let raw;
    try { raw = yaml.load(fs.readFileSync(sibling, 'utf8')); } catch { continue; }
    if (raw?.kind !== 'ontology' || !Array.isArray(raw.imports)) continue;
    const before = check(raw, sibling, new Map()), after = check(raw, sibling, changes);
    if (!before.imports && !after.imports) continue;
    errors.push(...after.errors.filter(e => !before.errors.includes(e)).map(e => `${path.basename(sibling)}: ${e}`));
  }
  return errors;
}
