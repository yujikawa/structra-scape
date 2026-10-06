import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installSkills } from './skills.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createModel(file, { codex = false, claude = false, skills = true } = {}) {
  const destination = path.resolve(process.cwd(), file);
  if (fs.existsSync(destination)) throw new Error(`${file} already exists`);
  if(skills){
    const agent=codex&&!claude?'codex':claude&&!codex?'claude':'both';
    for(const target of installSkills({agent}))console.log(`  ✓ Skill: ${target}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(here, 'templates', 'starter-ontology.yaml'), destination, fs.constants.COPYFILE_EXCL);
  console.log(`  ✓ Created ${file}`);
  // A folder of models carries its reading guide, so an AI handed the folder can interpret it.
  // Never in the project root, and never over an existing README.
  const readme = path.join(path.dirname(destination), 'README.md');
  if (path.dirname(destination) !== path.resolve(process.cwd()) && !fs.existsSync(readme)) {
    fs.copyFileSync(path.join(here, 'templates', 'reading.md'), readme, fs.constants.COPYFILE_EXCL);
    console.log(`  ✓ Created ${path.relative(process.cwd(), readme)} (how to read the models)`);
  }
  const preview = path.dirname(destination) === path.resolve('models') ? 'models/' : file;
  console.log(`  Next: strscape dev "${preview}"`);
  if(skills)console.log('  Codex: $strscape-modeling / Claude Code: /strscape-modeling');
}

// A GitHub Actions workflow that validates the models, comments the changes in meaning on each
// pull request and attaches the viewer. `models` is the folder relative to the repository root.
export function installWorkflow({ directory = '.', models = 'models', force = false } = {}) {
  const folder = models.replace(/\\/g, '/').replace(/^\.\/|\/+$/g, '');
  if (!folder || folder.startsWith('/') || folder.split('/').includes('..') || /['"\s$`]/.test(folder)) throw new Error('--models must be a folder inside the repository, without spaces or quotes');
  const target = path.resolve(directory, '.github', 'workflows', 'strscape.yml');
  if (fs.existsSync(target) && !force) throw new Error(`${path.relative(process.cwd(), target)} already exists. Use --force to replace it.`);
  const content = fs.readFileSync(path.join(here, 'templates', 'github-workflow.yml'), 'utf8').replaceAll('__MODELS__', folder);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return target;
}
