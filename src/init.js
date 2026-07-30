import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createModel(file, { codex = false } = {}) {
  const destination = path.resolve(process.cwd(), file);
  if (fs.existsSync(destination)) throw new Error(`${file} already exists`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(here, 'templates', 'starter-model.yaml'), destination);
  if (codex) {
    const skillDir = path.join(process.cwd(), '.codex', 'skills', 'structra-modeling');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.copyFileSync(path.join(here, 'templates', 'codex', 'structra-modeling', 'SKILL.md'), path.join(skillDir, 'SKILL.md'));
    console.log('  ✓ Added .codex/skills/structra-modeling');
  }
  console.log(`  ✓ Created ${file}`);
  console.log(`  Next: strscape build ${file}`);
}
