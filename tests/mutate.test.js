import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { readDocument, updateDocument } from '../src/mutate.js';

function fixture(t) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'structra-cli-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'model.yaml');
 fs.copyFileSync('src/templates/starter-ontology.yaml',file);
 return file;
}
test('transaction adds concept and reference together, rejects dangling deletes unchanged',t=>{
 const file=fixture(t), initial=readDocument(file);
 const patch={revision:initial.revision,operations:[{op:'upsert',entity:'concept',id:'Customer',value:{name:'顧客'}},{op:'upsert',entity:'step',process:'Intake',id:'Receive',value:{items:[{concept:'Customer',role:'reads'}]}}]};
 assert.equal(updateDocument(file,patch,{dryRun:true}).saved,false);
 assert.equal(readDocument(file).revision,initial.revision);
 assert.equal(updateDocument(file,patch).saved,true);
 const updated=fs.readFileSync(file,'utf8');
 assert.throws(()=>updateDocument(file,{operations:[{op:'remove',entity:'concept',id:'Customer'}]}),{code:'VALIDATION'});
 assert.equal(fs.readFileSync(file,'utf8'),updated);
 assert.throws(()=>updateDocument(file,patch),{code:'CONFLICT'});
 assert.equal(fs.existsSync(file+'.lock'),false);
});
test('partial updates preserve fields and explicit unset removes optional data',t=>{
 const file=fixture(t);
 updateDocument(file,{operations:[{op:'upsert',entity:'concept',id:'Application',value:{name:'受付申込'},unset:['description']}]});
 const item=readDocument(file).model.concepts[0];
 assert.equal(item.name,'受付申込');assert.equal(item.description,undefined);
 assert.throws(()=>updateDocument(file,{operations:[{op:'upsert',entity:'concept',id:'Application',value:{id:'Other'}}]}),{code:'VALUE'});
});
test('CLI supports stdin, inspection and JSON failures with nonzero exit status',t=>{
 const file=fixture(t);
 const result=JSON.parse(execFileSync(process.execPath,['src/index.js','concept','upsert',file,'Customer','--input','-'],{input:JSON.stringify({name:'顧客'}),encoding:'utf8'}));
 assert.equal(result.ok,true);
 const read=JSON.parse(execFileSync(process.execPath,['src/index.js','inspect',file],{encoding:'utf8'}));
 assert.equal(read.model.concepts.length,2);
 const error=spawnSync(process.execPath,['src/index.js','apply',file,'--patch','-'],{input:'{broken',encoding:'utf8'});
 assert.equal(error.status,1);assert.equal(JSON.parse(error.stdout).ok,false);
});
