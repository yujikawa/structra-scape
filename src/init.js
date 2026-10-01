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
  const preview = path.dirname(destination) === path.resolve('models') ? 'models/' : file;
  console.log(`  Next: strscape dev "${preview}"`);
  if(skills)console.log('  Codex: $strscape-modeling / Claude Code: /strscape-modeling');
}
