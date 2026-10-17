import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir,symlink,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {importFolder} from '../tools/import-folder';
import {flushMemory} from '../tools/flush-memory';

test('folder import preserves metadata, skips unchanged sources and separates destination checkpoints',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pgraph-folder-'));
 try{
  const folder=join(dir,'notes'),stateDirectory=join(dir,'state');await mkdir(folder);
  const text='---\ntitle: Confirmed plan\nauthor: Maya\n---\nThe team confirmed the release.';
  await writeFile(join(folder,'plan.md'),text);await symlink(folder,join(folder,'cycle'));
  const received:{title:string;author:string;text:string}[]=[];
  const fetcher:typeof fetch=async(_url,init)=>{received.push(JSON.parse(String(init?.body)));return Response.json({source:{id:'acknowledged'}});};
  const options={stateDirectory,fetcher,base:'https://workspace-a.example'};
  assert.deepEqual(await importFolder(folder,options),{saved:1,failures:[]});
  assert.deepEqual(received[0],{title:'Confirmed plan',author:'Maya',kind:'document',text});
  assert.deepEqual(await importFolder(folder,options),{saved:0,failures:[]});
  assert.equal((await importFolder(folder,{...options,base:'https://workspace-b.example'})).saved,1,'a new destination still needs its own import');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('an edit during upload is not marked as uploaded',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pgraph-changing-source-'));
 try{
  const folder=join(dir,'notes'),stateDirectory=join(dir,'state');await mkdir(folder);
  const file=join(folder,'plan.md');await writeFile(file,'The original confirmed plan.');
  const changed=await importFolder(folder,{stateDirectory,fetcher:async()=>{await writeFile(file,'The revised confirmed plan.');return Response.json({source:{id:'old-content'}});}});
  assert.equal(changed.saved,1);assert.equal(changed.failures.length,1);assert.match(changed.failures[0].reason,/changed during import/);
  let uploaded='';
  const retried=await importFolder(folder,{stateDirectory,fetcher:async(_url,init)=>{uploaded=JSON.parse(String(init?.body)).text;return Response.json({source:{id:'new-content'}});}});
  assert.deepEqual(retried,{saved:1,failures:[]});assert.equal(uploaded,'The revised confirmed plan.');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('failed and malformed imports remain retriable without a success checkpoint',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pgraph-failed-source-'));
 try{
  const folder=join(dir,'notes'),stateDirectory=join(dir,'state');await mkdir(folder);await writeFile(join(folder,'plan.md'),'The confirmed plan remains unchanged.');
  const failed=await importFolder(folder,{stateDirectory,fetcher:async()=>Response.json({error:'unavailable'},{status:503})});
  assert.equal(failed.saved,0);assert.equal(failed.failures.length,1);
  assert.equal((await importFolder(folder,{stateDirectory,fetcher:async()=>Response.json({source:{id:'ack'}})})).saved,1);
  await writeFile(join(folder,'invalid.md'),'---\ntitle: [unterminated\n---\nOriginal text.');
  let requests=0;
  const malformed=await importFolder(folder,{stateDirectory,fetcher:async()=>{requests++;return Response.json({});}});
  assert.equal(malformed.failures.length,1);assert.equal(requests,0,'bad metadata must be rejected before transmission');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('memory flush recovers a batch left by a crash and preserves newly queued records',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pgraph-queue-'));
 try{
  const file=join(dir,'memory.jsonl');
  await writeFile(`${file}.${randomUUID()}.processing`,JSON.stringify({memory:'Recovered confirmed decision.'})+'\n');
  const saved:string[]=[];
  const first=await flushMemory({file,fetcher:async(_url,init)=>{saved.push(JSON.parse(String(init?.body)).memory);await writeFile(file,JSON.stringify({memory:'New decision queued during processing.'})+'\n');return Response.json({id:'ack'});}});
  assert.deepEqual(first,{saved:1,retained:0});assert.deepEqual(saved,['Recovered confirmed decision.']);
  assert.match(await readFile(file,'utf8'),/New decision/);
  assert.deepEqual(await flushMemory({file,fetcher:async()=>Response.json({id:'ack'})}),{saved:1,retained:0});
  assert.deepEqual(await readdir(dir),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('failed memory deliveries and malformed records are retained instead of acknowledged',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pgraph-retained-memory-'));
 try{
  const file=join(dir,'memory.jsonl');await writeFile(file,JSON.stringify({memory:'Retry this confirmed decision.'})+'\n{invalid\n');
  assert.deepEqual(await flushMemory({file,fetcher:async()=>Response.json({},{status:503})}),{saved:0,retained:2});
  const retry=await flushMemory({file,fetcher:async()=>Response.json({id:'ack'})});
  assert.deepEqual(retry,{saved:1,retained:1});assert.equal((await readFile(file,'utf8')).trim(),'{invalid');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('capture helper preserves quotes, newlines, Unicode and control characters in valid JSON',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pgraph-capture-'));
 try{
  const file=join(dir,'memory.jsonl'),memory='Confirmed "plan"\nతెలుగు\twith backspace\b.';
  const result=spawnSync('bash',['tools/capture-memory.sh','--memory',memory,'--importance','high'],{encoding:'utf8',env:{...process.env,PROMISEGRAPH_QUEUE_FILE:file}});
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(await readFile(file,'utf8')).memory,memory);
  const invalid=spawnSync('bash',['tools/capture-memory.sh','--memory','Do not queue this.','--importance','unknown'],{encoding:'utf8',env:{...process.env,PROMISEGRAPH_QUEUE_FILE:file}});
  assert.notEqual(invalid.status,0);assert.equal((await readFile(file,'utf8')).trim().split('\n').length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('HTTP success without an API acknowledgement cannot discard queued memory or checkpoint sources',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pgraph-false-ack-'));
 try{
  const folder=join(dir,'notes'),stateDirectory=join(dir,'state'),file=join(dir,'memory.jsonl');await mkdir(folder);
  await writeFile(join(folder,'plan.md'),'The team confirmed the release plan.');
  const fetcher:typeof fetch=async()=>new Response('<html>Sign in</html>',{status:200});
  assert.equal((await importFolder(folder,{stateDirectory,fetcher})).saved,0);
  assert.equal((await importFolder(folder,{stateDirectory,fetcher:async()=>Response.json({source:{id:'ack'}})})).saved,1);
  await writeFile(file,JSON.stringify({memory:'Keep this confirmed decision.'})+'\n');
  assert.deepEqual(await flushMemory({file,fetcher}),{saved:0,retained:1});
  assert.match(await readFile(file,'utf8'),/Keep this confirmed decision/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
