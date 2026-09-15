import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function installSkills({ agent = 'both', directory = '.', force = false } = {}) {
  if (!['codex','claude','both'].includes(agent)) throw new Error('agent must be codex, claude or both');
  const root = path.resolve(directory);
  const folders = agent === 'both' ? ['.agents','.claude'] : [agent === 'codex' ? '.agents' : '.claude'];
  const source = fs.readFileSync(fileURLToPath(new URL('./templates/skills/strscape-modeling/SKILL.md',import.meta.url)),'utf8');
  const targets = folders.map(folder => path.join(root,folder,'skills','strscape-modeling','SKILL.md'));
  for(const target of targets)if(fs.existsSync(target)&&fs.readFileSync(target,'utf8')!==source&&!force)throw new Error(`Existing skill differs: ${target}. Use --force to replace it.`);
  for(const target of targets){fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source,'utf8');}
  return targets;
}
