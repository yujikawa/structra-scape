import test from 'node:test';
import assert from 'node:assert/strict';
import { validateModel } from '../src/validate.js';

const node = (id, type, layer) => ({ id, name: id, type, layer });

test('accepts a linked causal and process model', () => {
  const errors = validateModel({
    name: 'Example',
    nodes: [node('wait', 'causal_variable', 'causal'), node('approve', 'process', 'process')],
    edges: [
      { source: 'wait', target: 'approve', kind: 'link' },
      { source: 'wait', target: 'wait', kind: 'causal', polarity: '+' },
    ],
  });
  assert.deepEqual(errors, []);
});

test('rejects broken causal edges and misplaced process nodes', () => {
  const errors = validateModel({
    name: 'Broken',
    nodes: [node('approve', 'process', 'causal')],
    edges: [{ source: 'approve', target: 'missing', kind: 'causal' }],
  });
  assert.ok(errors.some((error) => error.includes('must be in process layer')));
  assert.ok(errors.some((error) => error.includes('target not found')));
  assert.ok(errors.some((error) => error.includes('needs polarity')));
});
