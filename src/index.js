#!/usr/bin/env node
import { Command } from 'commander';
import { build } from './build.js';
import { createModel } from './init.js';
import { validateFile } from './validate.js';
import { dev } from './dev.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadModel } from './validate.js';
import { exportOntology } from './ontology.js';
import { registerAuthoringCommands } from './mutate.js';
import { installSkills } from './skills.js';
import { publicationMarkdown, publicationSvg } from './publication.js';

const program = new Command();
program
  .name('strscape')
  .description('YAML-driven systems thinking and process modeling visualizer')
  .version('0.1.0');

program.command('init [file]')
  .description('Create a starter structra-scape YAML model')
  .option('--codex', 'install the Codex skill only (combine with --claude for both)')
  .option('--claude', 'install the Claude Code skill only')
  .option('--no-skills', 'create YAML without installing skills')
  .option('--exploration', 'create a legacy exploration model without ontology skills')
  .option('--ontology', 'create a business process and ontology model')
  .action((file = 'models/business.yaml', options) => {try{createModel(file, options)}catch(e){console.error(e.message);process.exitCode=1}});

program.command('validate <file>')
  .description('Validate a structra-scape YAML model')
  .option('--json', 'emit machine-readable validation results')
  .action((file, options) => {
    let errors;
    try { errors = validateFile(file); } catch (error) { errors = [error.message]; }
    if(options.json){console.log(JSON.stringify({valid:!errors.length,errors}));process.exitCode=errors.length?1:0;return;}
    if (errors.length) {
      errors.forEach((error) => console.error(`  ✗ ${error}`));
      process.exitCode = 1;
    } else {
      console.log('  ✓ Model is valid');
    }
  });

program.command('build <file>')
  .description('Build a YAML model or a directory of YAML models into a self-contained HTML viewer')
  .option('-o, --output <directory>', 'output directory', 'dist')
  .action((file, options) => build(file, options.output));

program.command('dev <file>')
  .description('Preview a YAML model or a directory of models and reload on changes')
  .option('-p, --port <port>', 'port', Number, 4173)
  .action((file, options) => dev(file, options.port));

program.command('owl <file>')
  .description('Export the supported ontology model to OWL Turtle')
  .option('-o, --output <file>', 'Turtle destination', 'ontology.ttl')
  .action((file, options) => {
    try { fs.writeFileSync(options.output, exportOntology(loadModel(file)), 'utf8'); console.log(`  ✓ Exported ${options.output}`); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  });

program.command('guide').description('Print the YAML authoring contract for AI agents').action(()=>console.log(fs.readFileSync(fileURLToPath(new URL('./templates/authoring.md',import.meta.url)),'utf8')));
registerAuthoringCommands(program);
program.command('skills').description('Install the modeling skill for Codex and Claude Code')
 .option('--agent <agent>','codex, claude or both','both')
 .option('--directory <directory>','target project directory','.')
 .option('--force','replace an existing customized skill')
 .action(options=>{try{console.log(JSON.stringify({ok:true,files:installSkills(options)}));}catch(e){console.error(JSON.stringify({ok:false,error:e.message}));process.exitCode=1}});
program.command('export <file>').description('Export publication SVG or Markdown')
 .requiredOption('--format <format>','svg or md').requiredOption('-o, --output <file>','destination (must not exist)')
 .option('--process <id>','process diagram for SVG').option('--concept <id>','concept for Markdown')
 .action((file,options)=>{try{const errors=validateFile(file);if(errors.length)throw new Error(errors.join('\n'));if(!['svg','md'].includes(options.format))throw new Error('format must be svg or md');if(options.process&&options.format!=='svg'||options.concept&&options.format!=='md')throw new Error('process requires svg; concept requires md');const model=loadModel(file);if(model.kind!=='ontology')throw new Error('Expected ontology model');const output=options.format==='svg'?publicationSvg(model,options):publicationMarkdown(model,options);fs.writeFileSync(options.output,output,{flag:'wx'});console.log(JSON.stringify({ok:true,output:options.output}));}catch(e){console.error(JSON.stringify({ok:false,error:e.message}));process.exitCode=1}});
program.parse();
