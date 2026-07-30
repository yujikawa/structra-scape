import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const nodeTypes = new Set(['goal', 'kpi', 'causal_variable', 'process', 'event']);
const relationTypes = new Set(['affects', 'occurs_in', 'derived_from', 'produces', 'consumes']);
const validationStates = new Set(['hypothesis', 'observed', 'validated', 'rejected']);

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
    if (node.layer) errors.push(`node ${node.id || '(unknown)'} uses deprecated layer; type determines the view`);
    if (node.duration) errors.push(`node ${node.id || '(unknown)'} uses deprecated duration; use expected_duration`);
    if (node.metrics && (node.type !== 'process' || typeof node.metrics !== 'object' || Array.isArray(node.metrics))) errors.push(`metrics on ${node.id} must be an object on a process node`);
    if (node.bottleneck !== undefined && (node.type !== 'process' || typeof node.bottleneck !== 'boolean')) errors.push(`bottleneck on ${node.id} must be a boolean on a process node`);
    if (node.confidence) errors.push(`node ${node.id} uses deprecated confidence; use validation`);
    if (node.validation && !validationStates.has(node.validation)) errors.push(`node ${node.id} has invalid validation: ${node.validation}`);
    for (const relation of node.relations || []) {
      if (!relation.target) errors.push(`relation on ${node.id} needs a target`);
      if (!relationTypes.has(relation.type)) errors.push(`relation on ${node.id} has invalid type: ${relation.type}`);
    }
  }
  for (const edge of model.edges || []) {
    if (!edge.source || !edge.target) errors.push('every edge needs source and target');
    if (edge.source && !ids.has(edge.source)) errors.push(`edge source not found: ${edge.source}`);
    if (edge.target && !ids.has(edge.target)) errors.push(`edge target not found: ${edge.target}`);
    if (edge.kind && !['causal', 'flow'].includes(edge.kind)) errors.push(`invalid edge kind: ${edge.kind}`);
    if (edge.kind === 'causal' && !['+', '-'].includes(edge.polarity)) errors.push(`causal edge ${edge.source} → ${edge.target} needs polarity + or -`);
    if (edge.delay !== undefined && typeof edge.delay !== 'boolean' && typeof edge.delay !== 'string') errors.push(`edge ${edge.source} → ${edge.target} delay must be boolean or a duration string`);
    if (edge.confidence) errors.push(`edge ${edge.source} → ${edge.target} uses deprecated confidence; use validation`);
    if (edge.validation && !validationStates.has(edge.validation)) errors.push(`edge ${edge.source} → ${edge.target} has invalid validation: ${edge.validation}`);
  }
  for (const node of model.nodes || []) {
    for (const relation of node.relations || []) if (relation.target && !ids.has(relation.target)) errors.push(`relation target not found: ${relation.target}`);
    for (const target of node.traces || []) if (!ids.has(target)) errors.push(`trace target not found: ${target}`);
  }
  return errors;
}

export function validateFile(file) {
  try { return validateModel(loadModel(file)); }
  catch (error) { return [error.message]; }
}
