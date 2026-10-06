import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { validateOntology } from './ontology.js';
import { resolveImports } from './imports.js';

// Models are returned with their imports merged in (see imports.js).
export function loadModel(file, { resolve = true } = {}) {
  const absolute = path.resolve(process.cwd(), file);
  if (!fs.existsSync(absolute)) throw new Error(`File not found: ${file}`);
  const model = yaml.load(fs.readFileSync(absolute, 'utf8'), { schema: yaml.CORE_SCHEMA }) || {};
  return resolve ? resolveImports(model, absolute) : model;
}

export function validateModel(model) {
  return validateOntology(model);
}

// One YAML file, or every YAML file directly inside a folder (sorted, so output is stable).
export function modelFiles(target) {
  const absolute = path.resolve(process.cwd(), target);
  if (!fs.existsSync(absolute)) throw new Error(`File not found: ${target}`);
  if (!fs.statSync(absolute).isDirectory()) return [absolute];
  const files = fs.readdirSync(absolute).filter(name => /\.ya?ml$/i.test(name)).sort().map(name => path.join(absolute, name));
  if (files.length === 0) throw new Error(`No YAML files found in ${target}`);
  return files;
}

export function validateFile(file) {
  try { return validateModel(loadModel(file)); }
  catch (error) { return [error.message]; }
}
