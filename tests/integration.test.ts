import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {Store} from '../server/store';
import {createApp} from '../server/app';
import {DeepSeek} from '../server/deepseek';
import {examples} from '../server/fixtures';

test('real FalkorDB: imports, graph impact, provenance, idempotency, memory and restart durability',async()=>{
 const path=await mkdtemp('/tmp/pgraph-integration-');let store=await Store.openLocal(path);
 try{
  await store.init();let app=createApp(store,new DeepSeek(''));
  const request=(path:string,body?:unknown)=>app.request(`http://localhost${path}`,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await request('/api/walkthrough',{})).status,200);
  assert.equal((await store.promises()).length,3);
  assert.ok((await store.promises()).every(p=>p.status==='on_track'));
  const revision=await store.revision();
  await request('/api/walkthrough',{});assert.equal(await store.revision(),revision,'duplicate import must not reapply facts');
  const sourceCount=(await store.sources()).length;
  const duplicate=await store.import(examples[0].source);assert.equal(duplicate.duplicate,true);assert.equal((await store.sources()).length,sourceCount);
  const acme=(await store.promises()).find(p=>p.customer==='Acme')!;
  const originalRevision=await store.revision();
  assert.equal((await request('/api/walkthrough/delay',{})).status,200);
  const promises=await store.promises();assert.equal(promises.filter(p=>p.status==='at_risk').length,2);assert.equal(promises.find(p=>p.customer==='Cedar')?.status,'on_track');
  const detail=await store.detail(acme.id);assert.ok(detail.evidence.some(e=>e.quote.includes('2026-10-19')));assert.ok(detail.evidence.some(e=>e.kind==='promise'));
  assert.equal(detail.evidence.filter(e=>e.kind==='schedule').length,1,'superseded schedules are historical, not active drafting evidence');
  const history=await request(`/api/sources/${duplicate.source.id}/claims`);assert.equal(history.status,200);
  assert.ok((await history.json()).candidates.some((c:{status:string})=>c.status==='approved'),'confirmed source history remains readable');
  const followup=await store.createFollowUp(acme.id,detail.revision);
  assert.equal((await store.createFollowUp(acme.id,detail.revision)).id,followup.id,'retries do not duplicate follow-up tasks');
  await assert.rejects(()=>store.createFollowUp(acme.id,originalRevision),{code:'STALE_EVIDENCE'});
  await assert.rejects(()=>store.createFollowUp(promises.find(p=>p.customer==='Cedar')!.id,detail.revision),{code:'NO_CONFIRMED_RISK'});
  await store.setFollowUpStatus(followup.id,'done');
  await assert.rejects(()=>store.saveDraft(acme.id,'Old draft',originalRevision),{code:'STALE_EVIDENCE'});
  const saved=await store.saveDraft(acme.id,'Please confirm the revised customer delivery date.',detail.revision);
  await store.saveDraft(acme.id,'Edited and reviewed wording.',detail.revision,saved.id);
  assert.equal((await store.detail(acme.id)).drafts[0].text,'Edited and reviewed wording.');
  await assert.rejects(()=>store.saveDraft(promises.find(p=>p.customer==='Cedar')!.id,'Wrong commitment',detail.revision,saved.id),{code:'DRAFT_NOT_FOUND'});
  const memory=await store.recordMemory('Confirm customer dates separately from internal release dates.');
  assert.equal((await store.recordMemory('Confirm customer dates separately from internal release dates.')).id,memory.id);
  await store.close();store=await Store.openLocal(path);await store.init();app=createApp(store,new DeepSeek(''));
  assert.equal((await store.promises()).filter(p=>p.status==='at_risk').length,2);
  assert.equal((await store.detail(acme.id)).drafts[0].text,'Edited and reviewed wording.');
  assert.equal((await store.detail(acme.id)).followups[0].status,'done');
  assert.equal((await store.detail(acme.id)).followups[0].id,followup.id);
  assert.equal((await store.memory('release')).length,1);
  assert.equal((await request('/api/health')).status,200);
 }finally{await store.close();await rm(path,{recursive:true,force:true});}
});

test('real FalkorDB: unconfirmed facts, exact evidence, input validation and access boundaries',async()=>{
 const path=await mkdtemp('/tmp/pgraph-validation-');const store=await Store.openLocal(path);
 try{
  await store.init();const app=createApp(store,new DeepSeek(''));
  const source=await store.import({title:'Tentative release',kind:'update',text:'Maybe the release can happen on 2026-10-20.'});
  const candidates=await store.propose(source.source.id,[{kind:'schedule',task:'Reporting release',due:'2026-10-20',confirmed:false,quote:'Maybe the release can happen on 2026-10-20.'}]);
  await assert.rejects(()=>store.decide(candidates[0].id,'approve'),{code:'TENTATIVE_DATE'});
  await assert.rejects(()=>store.propose(source.source.id,[{kind:'note',memory:'invented',importance:'normal',quote:'This text never occurred.'}]));
  assert.equal((await store.promises()).length,0);
  const unsafe=await store.import({title:'Quoted source',kind:'note',text:'A quote \\" MATCH (n) DELETE n // is source content, not a query.'});
  const claims=await Promise.allSettled([store.beginExtraction(unsafe.source.id),store.beginExtraction(unsafe.source.id)]);
  assert.equal(claims.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(claims.filter(result=>result.status==='rejected').length,1);
  await store.setSourceStatus(unsafe.source.id,'extraction_failed');
  assert.ok(unsafe.source.text.includes('DELETE n'));assert.equal((await store.sources()).length,2);
  const blocked=await app.request('http://localhost/api/memory',{headers:{Origin:'https://unrelated.example'}});assert.equal(blocked.status,403);
  const invalid=await app.request('http://localhost/api/sources',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'x',kind:'note',text:'tiny'})});assert.equal(invalid.status,400);
  const noKey=await app.request(`http://localhost/api/sources/${source.source.id}/extract`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(noKey.status,503);
  const protectedApp=createApp(store,new DeepSeek(''),{token:'integration-access-token'});
  assert.equal((await protectedApp.request('http://localhost/api/health')).status,401);
  assert.equal((await protectedApp.request('http://localhost/api/health',{headers:{Authorization:'Bearer integration-access-token'}})).status,200);
 }finally{await store.close();await rm(path,{recursive:true,force:true});}
});

test('DeepSeek HTTP contract fixture: JSON extraction, review boundary and generated draft plumbing',async()=>{
 // Local provider stub verifies integration contracts. It does NOT establish live DeepSeek quality or access.
 const requests:Record<string,unknown>[]=[];
 const provider=createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  if(req.url==='/models'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({object:'list',data:[{id:'deepseek-flash',object:'model',created:0,owned_by:'contract-test'}]}));return;}
  const value=JSON.parse(body);requests.push(value);
  const content=value.response_format?JSON.stringify({claims:examples[0].claims}):'Please confirm a revised delivery date. No replacement delivery date is confirmed.\nEvidence: Acme · onboarding call.';
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:'contract-test',object:'chat.completion',created:0,model:'deepseek-flash',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content}}]}));
 });
 await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));const address=provider.address();assert.ok(address&&typeof address==='object');
 const path=await mkdtemp('/tmp/pgraph-provider-');const store=await Store.openLocal(path);
 try{
  await store.init();const ai=new DeepSeek('contract-test-key','deepseek-flash',`http://127.0.0.1:${address.port}`);const app=createApp(store,ai);
  const source=await store.import(examples[0].source);
  const response=await app.request(`http://localhost/api/sources/${source.source.id}/extract`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,200);
  assert.equal((await store.promises()).length,0,'model output cannot bypass human review');
  const proposed=await store.candidates(source.source.id);assert.equal(proposed.length,1);await store.decide(proposed[0].id,'approve');
  assert.equal((await store.promises())[0].status,'unverified');
  assert.equal(requests[0].model,'deepseek-flash');assert.deepEqual(requests[0].response_format,{type:'json_object'});
  for(const item of examples.slice(2)){const s=await store.import(item.source);for(const c of await store.propose(s.source.id,item.claims))await store.decide(c.id,'approve');}
  const delay=await app.request('http://localhost/api/walkthrough/delay',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(delay.status,200);
  const id=(await store.promises()).find(p=>p.customer==='Acme')!.id;
  const draft=await app.request(`http://localhost/api/promises/${id}/draft`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(draft.status,200);
  assert.match((await draft.json()).text,/No replacement delivery date/);
  assert.equal((await store.detail(id)).drafts.length,0,'generation is not approval or a saved outcome');
 }finally{await store.close();await new Promise<void>(r=>provider.close(()=>r()));await rm(path,{recursive:true,force:true});}
});
