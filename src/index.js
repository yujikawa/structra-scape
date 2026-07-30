#!/usr/bin/env node
import { Command } from 'commander';
import { build } from './build.js';
import { createModel } from './init.js';
import { validateFile } from './validate.js';
import { dev } from './dev.js';

const program = new Command();
program
  .name('strscape')
  .description('YAML-driven systems thinking and process modeling visualizer')
  .version('0.1.0');

program.command('init [file]')
  .description('Create a starter structra-scape YAML model')
  .option('--codex', 'add the Codex modeling skill to .codex/skills')
  .action((file = 'structra.yaml', options) => createModel(file, options));

program.command('validate <file>')
  .description('Validate a structra-scape YAML model')
  .action((file) => {
    const errors = validateFile(file);
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

program.parse();
