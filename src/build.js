import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModel, validateModel } from './validate.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function renderModel(file) {
  const absolute = path.resolve(process.cwd(), file);
  const modelFiles = fs.statSync(absolute).isDirectory()
    ? fs.readdirSync(absolute).filter(name => /\.ya?ml$/i.test(name)).map(name => path.join(absolute, name))
    : [absolute];
  if (modelFiles.length === 0) throw new Error(`No YAML files found in ${file}`);
  const models = modelFiles.map(modelFile => {
    const model = loadModel(modelFile);
    const errors = validateModel(model);
    if (errors.length) throw new Error(`Cannot build invalid model ${path.basename(modelFile)}:\n${errors.map(e => `- ${e}`).join('\n')}`);
    return { slug: path.basename(modelFile, path.extname(modelFile)), name: model.name || path.basename(modelFile), model };
  });
  const isOntology = models.every(entry => entry.model.kind === 'ontology');
  if (!isOntology && models.some(entry => entry.model.kind === 'ontology')) throw new Error('Build ontology and exploration models separately.');
  const template = fs.readFileSync(path.join(here, 'templates', isOntology ? 'ontology.html' : 'viewer.html'), 'utf8');
  const logo = fs.readFileSync(path.join(here, 'templates', 'structra-scape-mark.svg'), 'utf8');
  const data = JSON.stringify({ models }).replace(/</g, '\\u003c');
  const cytoscape = fs.readFileSync(path.join(here, '..', 'node_modules', 'cytoscape', 'dist', 'cytoscape.min.js'), 'utf8');
  const html = template
    // Use replacement callbacks: Cytoscape's minified source contains `$&` and
    // other sequences with a special meaning in String#replace replacement text.
    .replace('<!-- STRUCTRA_CYTOSCAPE_BUNDLE -->', () => cytoscape)
    .replace('<!-- STRUCTRA_LOGO -->', () => logo)
    .replace('<!-- STRUCTRA_MODEL_DATA -->', () => `window.__STRUCTRA_DATA__ = ${data};`)
    .replace('<!-- ONTOLOGY_CORE -->', () => fs.readFileSync(path.join(here, 'ontology.js'), 'utf8').replace(/^export /gm, ''))
    .replace('<!-- PROCESS_EDITOR -->', () => fs.readFileSync(path.join(here, 'templates', 'process-editor.js'), 'utf8'))
    .replace('<!-- READER -->', () => fs.readFileSync(path.join(here, 'publication.js'), 'utf8').replace(/^export /gm, '')+'\n'+fs.readFileSync(path.join(here, 'completion.js'), 'utf8').replace(/^export /gm, '')+'\n'+fs.readFileSync(path.join(here, 'templates', 'reader.js'), 'utf8')+'\n'+fs.readFileSync(path.join(here, 'templates', 'completion-view.js'), 'utf8'))
    .replace('<!-- LANGUAGE_VIEW -->', () => fs.readFileSync(path.join(here, 'i18n.js'), 'utf8').replace(/^export /gm, '')+'\n'+fs.readFileSync(path.join(here, 'templates', 'language-view.js'), 'utf8'))
    .replace('<!-- YAML_BUNDLE -->', () => fs.readFileSync(path.join(here, '..', 'node_modules', 'js-yaml', 'dist', 'js-yaml.min.js'), 'utf8'));
  return html;
}

export function build(file, outputDir) {
  const html = renderModel(file);
  const destination = path.resolve(process.cwd(), outputDir);
  fs.mkdirSync(destination, { recursive: true });
  const output = path.join(destination, 'index.html');
  fs.writeFileSync(output, html, 'utf8');
  console.log(`  ✓ Built ${path.relative(process.cwd(), output)}`);
}
