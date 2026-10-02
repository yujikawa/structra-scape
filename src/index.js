#!/usr/bin/env node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import yaml from 'js-yaml';
import { build } from './build.js';
import { createModel } from './init.js';
import { loadModel, validateFile } from './validate.js';
import { dev } from './dev.js';
import { exportOntology } from './ontology.js';
import { registerAuthoringCommands, jsonAction } from './mutate.js';
import { registerAnswerCommands } from './answers.js';
import { installSkills } from './skills.js';
import { publicationMarkdown, publicationSvg } from './publication.js';
import { diffModels, changesMarkdown } from './diff.js';
import { loadBaseline } from './baseline.js';

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

program.command('validate <file>')
  .description('Validate a model (including the files it imports)')
  .option('--json', 'print {valid, errors} as JSON')
  .action((file, options) => {
    const errors = validateFile(file);
    process.exitCode = errors.length ? 1 : 0;
    if (options.json) console.log(JSON.stringify({ valid: !errors.length, errors }));
    else if (errors.length) errors.forEach(error => console.error(`  ✗ ${error}`));
    else console.log('  ✓ Model is valid');
  });

const exporters = { svg: publicationSvg, md: publicationMarkdown, ttl: model => exportOntology(model) };
program.command('export <file>')
  .description('Export a diagram (svg), definitions (md) or OWL Turtle (ttl)')
  .requiredOption('--format <format>', 'svg, md or ttl')
  .requiredOption('-o, --output <file>', 'destination (must not exist)')
  .option('--process <id>', 'process flow to draw (svg; default: the term diagram)')
  .option('--concept <id>', 'single term to write (md; default: all terms)')
  .action(human((file, options) => {
    if (!Object.hasOwn(exporters, options.format)) throw new Error('format must be svg, md or ttl');
    if (options.process && options.format !== 'svg' || options.concept && options.format !== 'md') throw new Error('--process requires svg; --concept requires md');
    if (fs.existsSync(options.output)) throw new Error(`${options.output} already exists; choose another --output`);
    const errors = validateFile(file);
    if (errors.length) throw new Error(errors.join('\n'));
    fs.writeFileSync(options.output, exporters[options.format](loadModel(file), options), { flag: 'wx' });
    console.log(`  ✓ Exported ${options.output}`);
  }));

program.command('diff <file>')
  .description('Show changes in meaning since a git revision or another YAML file')
  .option('--base <ref-or-file>', 'git revision or YAML file to compare with', 'HEAD')
  .option('--format <format>', 'json or md', 'json')
  .action((file, options) => {
    try {
      if (!['json', 'md'].includes(options.format)) throw new Error('format must be json or md');
      const baseline = loadBaseline(file, options.base);
      const changes = diffModels(baseline.model, yaml.load(fs.readFileSync(file, 'utf8')));
      if (options.format === 'md') process.stdout.write(changesMarkdown(changes, { base: baseline.ref }));
      else console.log(JSON.stringify({ ok: true, base: baseline.ref, agreed: changes.filter(c => c.agreed).length, changes }));
    } catch (e) { console.log(JSON.stringify({ ok: false, errors: [e.message] })); process.exitCode = 1; }
  });

program.command('skills')
  .description('Install the strscape-modeling skill for Codex and Claude Code')
  .option('--agent <agent>', 'codex, claude or both', 'both')
  .option('--directory <directory>', 'project directory', '.')
  .option('--force', 'replace skill files that were edited')
  .action(human(options => { for (const file of installSkills(options)) console.log(`  ✓ Skill: ${file}`); }));

program.command('guide').description('Print the YAML authoring guide for AI agents')
  .action(() => process.stdout.write(fs.readFileSync(fileURLToPath(new URL('./templates/authoring.md', import.meta.url)), 'utf8')));

// AI-facing commands: JSON in, JSON out.
registerAuthoringCommands(program);
registerAnswerCommands(program, jsonAction);
program.parse();
