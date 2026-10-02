import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { loadModel, validateModel } from './validate.js';
import { importedFiles } from './imports.js';
import { gitBaseline } from './baseline.js';
import { diffModels } from './diff.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Resolve dependencies through Node so hoisted installs (npm, pnpm) work too.
const dependency = createRequire(import.meta.url).resolve;
// Shared Node/browser modules are inlined as plain scripts: drop the `export` keywords.
const shared = name => fs.readFileSync(path.join(here, name), 'utf8').replace(/^export /gm, '');
const template = name => fs.readFileSync(path.join(here, 'templates', name), 'utf8');

export function renderModel(file, options) {
  return renderBundle(file, options).html;
}

// `compare` names a git revision; each model then carries its changes since that revision. Only the
// changes are embedded, not the old model, so a shared page does not carry the previous version.
// One YAML file, or every YAML file directly inside a folder, validated with imports resolved.
export function loadWorkspace(file) {
  const absolute = path.resolve(process.cwd(), file);
  if (!fs.existsSync(absolute)) throw new Error(`File not found: ${file}`);
  const modelFiles = fs.statSync(absolute).isDirectory()
    ? fs.readdirSync(absolute).filter(name => /\.ya?ml$/i.test(name)).map(name => path.join(absolute, name))
    : [absolute];
  if (modelFiles.length === 0) throw new Error(`No YAML files found in ${file}`);
  return modelFiles.map(modelFile => {
    let model, errors;
    try { model = loadModel(modelFile); errors = validateModel(model); } catch (error) { errors = [error.message]; }
    if (errors.length) throw new Error(`Invalid model ${path.basename(modelFile)}:\n${errors.map(e => `- ${e}`).join('\n')}`);
    return { path: modelFile, slug: path.basename(modelFile, path.extname(modelFile)), file: path.basename(modelFile), name: model.name || path.basename(modelFile), model };
  });
}

export function renderBundle(file, { compare } = {}) {
  const workspace = loadWorkspace(file);
  const sources = workspace.map(entry => entry.path);
  const models = workspace.map(({ path: modelFile, ...entry }) => {
    sources.push(...importedFiles(entry.model, modelFile));
    const baseline = compare ? gitBaseline(modelFile, compare) : null;
    const changes = baseline && { ref: baseline.ref, newFile: !baseline.model, list: diffModels(baseline.model, entry.model) };
    // file and revision identify the YAML an exported answers file refers to.
    const revision = createHash('sha256').update(fs.readFileSync(modelFile, 'utf8')).digest('hex');
    return { slug: entry.slug, file: entry.file, revision, name: entry.name, model: entry.model, ...(changes ? { changes } : {}) };
  });
  const page = template('ontology.html');
  const logo = template('structra-scape-mark.svg');
  const data = JSON.stringify({ models }).replace(/</g, '\\u003c');
  const cytoscape = fs.readFileSync(dependency('cytoscape/dist/cytoscape.min.js'), 'utf8');
  const html = page
    // Use replacement callbacks: Cytoscape's minified source contains `$&` and
    // other sequences with a special meaning in String#replace replacement text.
    .replace('<!-- STRUCTRA_CYTOSCAPE_BUNDLE -->', () => cytoscape)
    .replace('<!-- STRUCTRA_LOGO -->', () => logo)
    // Inline the logo as the tab icon so the single-file output stays self-contained.
    .replace('<!-- STRUCTRA_FAVICON -->', () => `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(logo)}">`)
    .replace('<!-- STRUCTRA_MODEL_DATA -->', () => `window.__STRUCTRA_DATA__ = ${data};`)
    .replace('<!-- ONTOLOGY_CORE -->', () => shared('ontology.js'))
    .replace('<!-- PROCESS_VIEW -->', () => template('process-view.js'))
    .replace('<!-- PROCESS_HIERARCHY -->', () => template('process-hierarchy.js'))
    .replace('<!-- VIEW_STATE -->', () => template('view-state.js'))
    .replace('<!-- READER -->', () => [shared('publication.js'), shared('completion.js'), shared('diff.js'), template('reader.js'), template('completion-view.js'), template('answers-view.js'), template('changes-view.js'), shared('workspace.js'), template('overview-view.js')].join('\n'))
    .replace('<!-- LANGUAGE_VIEW -->', () => shared('i18n.js') + '\n' + template('language-view.js'));
  return { html, files: [...new Set(sources)] };
}

export function build(file, outputDir, options) {
  const html = renderModel(file, options);
  const destination = path.resolve(process.cwd(), outputDir);
  fs.mkdirSync(destination, { recursive: true });
  const output = path.join(destination, 'index.html');
  fs.writeFileSync(output, html, 'utf8');
  console.log(`  ✓ Built ${path.relative(process.cwd(), output)}`);
}
