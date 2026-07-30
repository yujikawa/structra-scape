import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModel, validateModel } from './validate.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function build(file, outputDir) {
  const model = loadModel(file);
  const errors = validateModel(model);
  if (errors.length) throw new Error(`Cannot build invalid model:\n${errors.map((e) => `- ${e}`).join('\n')}`);
  const template = fs.readFileSync(path.join(here, 'templates', 'viewer.html'), 'utf8');
  const data = JSON.stringify(model).replace(/</g, '\\u003c');
  const cytoscape = fs.readFileSync(path.join(here, '..', 'node_modules', 'cytoscape', 'dist', 'cytoscape.min.js'), 'utf8');
  const html = template
    // Use replacement callbacks: Cytoscape's minified source contains `$&` and
    // other sequences with a special meaning in String#replace replacement text.
    .replace('<!-- STRUCTRA_CYTOSCAPE_BUNDLE -->', () => cytoscape)
    .replace('<!-- STRUCTRA_MODEL_DATA -->', () => `window.__STRUCTRA_MODEL__ = ${data};`);
  const destination = path.resolve(process.cwd(), outputDir);
  fs.mkdirSync(destination, { recursive: true });
  const output = path.join(destination, 'index.html');
  fs.writeFileSync(output, html, 'utf8');
  console.log(`  ✓ Built ${path.relative(process.cwd(), output)}`);
}
