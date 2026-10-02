import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { installSkills } from '../src/skills.js';
const cli=path.resolve('src/index.js');
test('init scaffolds both agents in working folder and protects existing files',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'structra-skills-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const run=(args)=>spawnSync(process.execPath,[cli,...args],{cwd:dir,encoding:'utf8'});
 const initialized=run(['init']);assert.equal(initialized.status,0);
 assert.ok(fs.existsSync(path.join(dir,'models/business.yaml')));
 assert.match(initialized.stdout,/strscape dev "models\/"/);
 // The models folder carries the reading guide; a README already there is left alone.
 const readme=path.join(dir,'models/README.md'),reading=fs.readFileSync('src/templates/reading.md','utf8');
 assert.equal(fs.readFileSync(readme,'utf8'),reading);
 assert.equal(run(['guide','--read']).stdout,reading);
 assert.match(run(['guide']).stdout,/^# AI authoring guide/);
 fs.writeFileSync(readme,'custom');
 assert.equal(run(['init','models/contracts.yaml','--no-skills']).status,0);
 assert.equal(fs.readFileSync(readme,'utf8'),'custom');
 assert.equal(run(['build','models/','--output','dist']).status,0);
 assert.ok(fs.readFileSync(path.join(dir,'dist/index.html'),'utf8').includes('"slug":"contracts"'));
 fs.renameSync(path.join(dir,'models/business.yaml'),path.join(dir,'models/initial.yaml'));
 assert.equal(run(['init','models/business.yaml']).status,0);
 for(const folder of ['.agents','.claude']){
  const skill=path.join(dir,folder,'skills/strscape-modeling');
  assert.ok(fs.readFileSync(path.join(skill,'SKILL.md'),'utf8').includes('expect-revision'));
  for(const reference of ['modeling.md','workspace.md','cli-recipes.md','review.md','answers.md'])assert.ok(fs.existsSync(path.join(skill,'references',reference)),reference);
 }
 // The variants differ where the agents differ: invocation, arguments and the preview server.
 const claudeSkill=fs.readFileSync(path.join(dir,'.claude/skills/strscape-modeling/SKILL.md'),'utf8'),codexSkill=fs.readFileSync(path.join(dir,'.agents/skills/strscape-modeling/SKILL.md'),'utf8');
 assert.match(claudeSkill,/\$ARGUMENTS/);assert.match(claudeSkill,/allowed-tools: Bash\(strscape:\*\)/);assert.match(claudeSkill,/run_in_background/);
 assert.doesNotMatch(codexSkill,/\$ARGUMENTS|allowed-tools/);assert.match(codexSkill,/Do not start `strscape dev` yourself/);
 assert.equal(run(['validate','models/business.yaml','--json']).status,0);
 assert.equal(run(['init','models/business.yaml']).status,1);
 const target=path.join(dir,'.claude/skills/strscape-modeling/references/modeling.md');fs.writeFileSync(target,'custom');
 const codexSkillFile=path.join(dir,'.agents/skills/strscape-modeling/SKILL.md');fs.rmSync(codexSkillFile);
 assert.throws(()=>installSkills({directory:dir}),/Existing skill differs/);
 assert.equal(fs.readFileSync(target,'utf8'),'custom');
 // A refusal writes nothing, not even the files that were missing.
 assert.equal(fs.existsSync(codexSkillFile),false);
 assert.equal(run(['init','other.yaml']).status,1);assert.equal(fs.existsSync(path.join(dir,'other.yaml')),false);
 assert.equal(run(['init','plain.yaml','--no-skills']).status,0);
 assert.equal(fs.existsSync(path.join(dir,'README.md')),false);
 installSkills({directory:dir,force:true});assert.notEqual(fs.readFileSync(target,'utf8'),'custom');assert.ok(fs.existsSync(codexSkillFile));
});

test('every recipe in the skill applies, in order, to a freshly initialized model',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'structra-recipes-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const run=(args,input)=>spawnSync(process.execPath,[cli,...args],{cwd:dir,encoding:'utf8',input});
 assert.equal(run(['init','models/contracts.yaml','--no-skills']).status,0);
 fs.writeFileSync(path.join(dir,'models/common.yaml'),'kind: ontology\nname: 共通の用語\nbase: https://example.org/common#\nconcepts: []\nproperties: []\nrestrictions: []\n');
 const recipes=fs.readFileSync('src/templates/skills/shared/references/cli-recipes.md','utf8');
 const blocks=[...recipes.matchAll(/```json\n([\s\S]*?)```/g)].map(m=>m[1]);
 assert.ok(blocks.length>=7);
 for(const [i,block] of blocks.entries()){const result=run(['apply','models/contracts.yaml','--patch','-'],block);assert.equal(result.status,0,`recipe ${i+1}: ${result.stdout}`)}
 assert.equal(run(['validate','models/contracts.yaml','--json']).status,0);
});
