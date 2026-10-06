#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { build, loadWorkspace } from './build.js';
import { workspaceOverview, overviewMarkdown } from './workspace.js';
import { createModel, installWorkflow } from './init.js';
import { loadModel, validateFile, modelFiles } from './validate.js';
import { dev } from './dev.js';
import { exportOntology, exportSkos } from './ontology.js';
import { registerAuthoringCommands, jsonAction } from './mutate.js';
import { registerAnswerCommands } from './answers.js';
import { registerSourceCommands } from './sources.js';
import { installSkills } from './skills.js';
import { publicationMarkdown, publicationSvg } from './publication.js';
import { changesMarkdown, changesByFileMarkdown } from './diff.js';
import { diffTarget } from './baseline.js';

const { version } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
// Commands for people print plain text; failures go to stderr with exit code 1.
const human = fn => (...args) => { try { fn(...args); } catch (e) { console.error(`  ✗ ${e.message}`); process.exitCode = 1; } };

const program = new Command();
program
  .name('strscape')
  .description('Business processes and the meaning of business terms, written as YAML by AI agents and read in a self-contained HTML viewer')
  .version(version);

program.command('init [file]')
  .description('Create a model (default models/business.yaml) and install the AI skills')
  .option('--codex', 'install the Codex skill only (combine with --claude for both)')
  .option('--claude', 'install the Claude Code skill only')
  .option('--no-skills', 'create the YAML without installing skills')
  .action(human((file = 'models/business.yaml', options) => createModel(file, options)));

program.command('dev <path>')
  .description('Preview a model or a directory of models; reloads when the YAML changes')
  .option('-p, --port <port>', 'port', Number, 4173)
  .option('--host <host>', 'interface to listen on (0.0.0.0 shares it on the network)', '127.0.0.1')
  .option('--compare <ref>', 'show changes since this git revision', 'HEAD')
  .option('--no-compare', 'hide the changes view')
  .action(human((file, options) => dev(file, options)));

program.command('build <path>')
  .description('Write a model or a directory of models as one self-contained HTML file')
  .option('-o, --output <directory>', 'output directory', 'dist')
  .option('--compare <ref>', 'include changes since this git revision (e.g. HEAD, main)')
  .action(human((file, options) => build(file, options.output, { compare: options.compare })));

program.command('validate <path>')
  .description('Validate a model, or every model in a folder (including the files they import)')
  .option('--json', 'print {valid, files: [{file, errors}]} as JSON')
  .action((target, options) => {
    let files;
    try { files = modelFiles(target).map(file => ({ file: path.relative(process.cwd(), file) || file, errors: validateFile(file) })); }
    catch (error) { files = [{ file: target, errors: [error.message] }]; }
    const valid = files.every(f => !f.errors.length);
    process.exitCode = valid ? 0 : 1;
    if (options.json) return console.log(JSON.stringify({ valid, files }));
    for (const { file, errors } of files) {
      if (errors.length) { console.error(`  ✗ ${file}`); errors.forEach(error => console.error(`    - ${error}`)); }
      else console.log(`  ✓ ${file}`);
    }
  });

const exporters = { svg: publicationSvg, md: publicationMarkdown, ttl: model => exportOntology(model), skos: model => exportSkos(model) };
program.command('export <file>')
  .description('Export a diagram (svg), definitions (md), OWL Turtle (ttl) or a SKOS thesaurus in Turtle (skos)')
  .requiredOption('--format <format>', 'svg, md, ttl or skos')
  .requiredOption('-o, --output <file>', 'destination (must not exist)')
  .option('--process <id>', 'process flow to draw (svg; default: the term diagram)')
  .option('--concept <id>', 'single term to write (md; default: all terms)')
  .action(human((file, options) => {
    if (!Object.hasOwn(exporters, options.format)) throw new Error('format must be svg, md, ttl or skos');
    if (options.process && options.format !== 'svg' || options.concept && options.format !== 'md') throw new Error('--process requires svg; --concept requires md');
    if (fs.existsSync(options.output)) throw new Error(`${options.output} already exists; choose another --output`);
    const errors = validateFile(file);
    if (errors.length) throw new Error(errors.join('\n'));
    fs.writeFileSync(options.output, exporters[options.format](loadModel(file), options), { flag: 'wx' });
    console.log(`  ✓ Exported ${options.output}`);
  }));

program.command('diff <path>')
  .description('Show changes in meaning since a git revision or another YAML file (a folder: every model in it)')
  .option('--base <ref-or-file>', 'git revision or YAML file to compare with', 'HEAD')
  .option('--format <format>', 'json or md', 'json')
  .option('--fail-on-agreed', 'exit with code 1 when an agreed definition changed (for CI)')
  .action((target, options) => {
    try {
      if (!['json', 'md'].includes(options.format)) throw new Error('format must be json or md');
      const results = diffTarget(target, options.base), folder = fs.statSync(target).isDirectory();
      const base = results[0].ref, agreed = results.reduce((n, r) => n + r.changes.filter(c => c.agreed).length, 0);
      if (options.format === 'md') process.stdout.write(folder ? changesByFileMarkdown(results, { base }) : changesMarkdown(results[0].changes, { base }));
      else if (folder) console.log(JSON.stringify({ ok: true, base, agreed, files: results.map(({ file, changes }) => ({ file, agreed: changes.filter(c => c.agreed).length, changes })) }));
      else console.log(JSON.stringify({ ok: true, base, agreed, changes: results[0].changes }));
      if (options.failOnAgreed && agreed) process.exitCode = 1;
    } catch (e) { console.log(JSON.stringify({ ok: false, errors: [e.message] })); process.exitCode = 1; }
  });

program.command('overview <path>')
  .description('Show how the domain models in a folder connect: hand-overs, shared definitions and overlapping terms')
  .option('--format <format>', 'json or md', 'json')
  .action((target, options) => {
    try {
      if (!['json', 'md'].includes(options.format)) throw new Error('format must be json or md');
      const overview = workspaceOverview(loadWorkspace(target));
      if (options.format === 'md') process.stdout.write(overviewMarkdown(overview));
      else console.log(JSON.stringify({ ok: true, ...overview }));
    } catch (e) { console.log(JSON.stringify({ ok: false, errors: [e.message] })); process.exitCode = 1; }
  });

program.command('skills')
  .description('Install the strscape-modeling skill for Codex and Claude Code')
  .option('--agent <agent>', 'codex, claude or both', 'both')
  .option('--directory <directory>', 'project directory', '.')
  .option('--force', 'replace skill files that were edited')
  .action(human(options => { for (const file of installSkills(options)) console.log(`  ✓ Skill: ${file}`); }));

program.command('ci')
  .description('Write a GitHub Actions workflow that validates the models and comments their changes on pull requests')
  .option('--models <folder>', 'models folder, relative to the repository root', 'models')
  .option('--directory <directory>', 'repository root', '.')
  .option('--force', 'replace an existing workflow')
  .action(human(options => console.log(`  ✓ Workflow: ${path.relative(process.cwd(), installWorkflow(options))}`)));

program.command('guide').description('Print the YAML authoring guide for AI agents; --read prints the guide for reading a model')
  .option('--read', 'how to read a model (for AIs that are given the YAML, not editing it)')
  .action(options => process.stdout.write(fs.readFileSync(fileURLToPath(new URL(`./templates/${options.read ? 'reading' : 'authoring'}.md`, import.meta.url)), 'utf8')));

// AI-facing commands: JSON in, JSON out.
registerAuthoringCommands(program);
registerAnswerCommands(program, jsonAction);
registerSourceCommands(program, jsonAction);
program.parse();
