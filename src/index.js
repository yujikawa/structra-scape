#!/usr/bin/env node
import { Command } from 'commander';
import { build } from './build.js';
import { createModel } from './init.js';
import { validateFile } from './validate.js';

const program = new Command();
program
  .name('structra')
  .description('YAML-driven systems thinking and process modeling visualizer')
  .version('0.1.0');

program.command('init [file]')
  .description('Create a starter structra-scape YAML model')
  .action((file = 'structra.yaml') => createModel(file));

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
  .description('Build a self-contained HTML visualization')
  .option('-o, --output <directory>', 'output directory', 'dist')
  .action((file, options) => build(file, options.output));

program.parse();
