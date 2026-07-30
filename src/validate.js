import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const nodeTypes = new Set(['goal', 'kpi', 'causal_variable', 'process', 'event']);
const layers = new Set(['business', 'causal', 'process', 'event']);

export function loadModel(file) {
  const absolute = path.resolve(process.cwd(), file);
  if (!fs.existsSync(absolute)) throw new Error(`File not found: ${file}`);
  return yaml.load(fs.readFileSync(absolute, 'utf8')) || {};
}

export function validateModel(model) {
  const errors = [];
  if (!model.name) errors.push('name is required');
  if (!Array.isArray(model.nodes)) errors.push('nodes must be an array');
  if (!Array.isArray(model.edges)) errors.push('edges must be an array');
  const ids = new Set();
  for (const node of model.nodes || []) {
    if (!node.id) errors.push('every node needs an id');
    else if (ids.has(node.id)) errors.push(`duplicate node id: ${node.id}`);
    else ids.add(node.id);
    if (!node.name) errors.push(`node ${node.id || '(unknown)'} needs a name`);
    if (!nodeTypes.has(node.type)) errors.push(`node ${node.id || '(unknown)'} has invalid type: ${node.type}`);
    if (!layers.has(node.layer)) errors.push(`node ${node.id || '(unknown)'} has invalid layer: ${node.layer}`);
    if (node.type === 'process' && node.layer !== 'process') errors.push(`process node ${node.id} must be in process layer`);
  }
  for (const edge of model.edges || []) {
    if (!edge.source || !edge.target) errors.push('every edge needs source and target');
    if (edge.source && !ids.has(edge.source)) errors.push(`edge source not found: ${edge.source}`);
    if (edge.target && !ids.has(edge.target)) errors.push(`edge target not found: ${edge.target}`);
    if (edge.kind && !['causal', 'flow', 'link'].includes(edge.kind)) errors.push(`invalid edge kind: ${edge.kind}`);
    if (edge.kind === 'causal' && !['+', '-'].includes(edge.polarity)) errors.push(`causal edge ${edge.source} → ${edge.target} needs polarity + or -`);
  }
  return errors;
}

export function validateFile(file) {
  try { return validateModel(loadModel(file)); }
  catch (error) { return [error.message]; }
}
