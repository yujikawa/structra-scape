import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { validateOntology } from './ontology.js';
import { resolveImports } from './imports.js';

// Models are returned with their imports merged in (see imports.js).
export function loadModel(file, { resolve = true } = {}) {
  const absolute = path.resolve(process.cwd(), file);
  if (!fs.existsSync(absolute)) throw new Error(`File not found: ${file}`);
  const model = yaml.load(fs.readFileSync(absolute, 'utf8')) || {};
  return resolve ? resolveImports(model, absolute) : model;
}

export function validateModel(model) {
  return validateOntology(model);
}

export function validateFile(file) {
  try { return validateModel(loadModel(file)); }
  catch (error) { return [error.message]; }
}
