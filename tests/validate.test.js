import test from 'node:test';
import assert from 'node:assert/strict';
import { validateModel } from '../src/validate.js';

const node = (id, type, layer) => ({ id, name: id, type, layer });

test('accepts a linked causal and process model', () => {
  const errors = validateModel({
    name: 'Example',
    nodes: [
      { id: 'wait', name: 'wait', type: 'causal_variable', traces: ['approve'], relations: [{ target: 'approve', type: 'occurs_in' }], validation: 'hypothesis' },
      { id: 'approve', name: 'approve', type: 'process', bottleneck: true, metrics: { average_duration: '2 days' } },
    ],
    edges: [
      { source: 'wait', target: 'approve', kind: 'flow' },
      { source: 'wait', target: 'wait', kind: 'causal', polarity: '+' },
    ],
  });
  assert.deepEqual(errors, []);
});

test('rejects broken causal edges, deprecated layers, and invalid process fields', () => {
  const errors = validateModel({
    name: 'Broken',
    nodes: [{ ...node('approve', 'process'), layer: 'causal', bottleneck: 'yes', metrics: [] }],
    edges: [{ source: 'approve', target: 'missing', kind: 'causal' }],
  });
  assert.ok(errors.some((error) => error.includes('uses deprecated layer')));
  assert.ok(errors.some((error) => error.includes('bottleneck')));
  assert.ok(errors.some((error) => error.includes('target not found')));
  assert.ok(errors.some((error) => error.includes('needs polarity')));
});
