import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const templates = fileURLToPath(new URL('./templates/skills/', import.meta.url));
// Each agent gets its own SKILL.md (invocation, tools and preview differ) plus the shared references.
const agents = { codex: { folder: '.agents', template: 'codex' }, claude: { folder: '.claude', template: 'claude' } };

function listFiles(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? listFiles(path.join(dir, entry.name), path.join(prefix, entry.name))
    : [path.join(prefix, entry.name)]);
}

// Files to write for one agent: relative path inside the skill folder → content.
export function skillFiles(agent) {
  const files = new Map([['SKILL.md', fs.readFileSync(path.join(templates, agents[agent].template, 'SKILL.md'), 'utf8')]]);
  const shared = path.join(templates, 'shared');
  for (const file of listFiles(shared)) files.set(file, fs.readFileSync(path.join(shared, file), 'utf8'));
  return files;
}

export function installSkills({ agent = 'both', directory = '.', force = false } = {}) {
  if (!['codex', 'claude', 'both'].includes(agent)) throw new Error('agent must be codex, claude or both');
  const root = path.resolve(directory);
  const plan = (agent === 'both' ? ['codex', 'claude'] : [agent]).flatMap(name => {
    const skill = path.join(root, agents[name].folder, 'skills', 'strscape-modeling');
    return [...skillFiles(name)].map(([file, content]) => ({ target: path.join(skill, file), content }));
  });
  // Check every file before writing any, so a refusal leaves the installation untouched.
  for (const { target, content } of plan) {
    if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') !== content && !force) throw new Error(`Existing skill differs: ${target}. Use --force to replace it.`);
  }
  for (const { target, content } of plan) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content, 'utf8'); }
  return plan.filter(({ target }) => path.basename(target) === 'SKILL.md').map(({ target }) => target);
}
