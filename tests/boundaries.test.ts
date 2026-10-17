import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Graph} from 'falkordb';
import {ClaimSchema,ImportSchema,currentEvidence,validateEvidence,type Evidence,type PromiseRecord} from '../shared/schema';
import {DeepSeek} from '../server/deepseek';
import {Store} from '../server/store';
import {createApp} from '../server/app';
import {examples} from '../server/fixtures';

const promise:PromiseRecord={id:'promise-acme',title:'CSV export',customer:'Acme',owner:'Mira',due_at:'2026-10-16',feature:'CSV export',status:'at_risk',tasks:[{id:'task-reporting',title:'Reporting release',owner:'Dev',due_at:'2026-10-19'}]};
const evidence=(id:string,claim:unknown):Evidence=>({id,kind:(claim as {kind:string}).kind,source_id:`src-${id}`,quote:'Exact quote.',payload:JSON.stringify(claim)});

test('current evidence excludes superseded schedules, old commitments and unrelated claims',()=>{
 const current=evidence('current',{kind:'schedule',task:' Reporting   release ',due:'2026-10-19',confirmed:true,quote:'Exact quote.'});
 const old=evidence('old',{kind:'schedule',task:'Reporting release',due:'2026-10-15',confirmed:true,quote:'Exact quote.'});
 const unrelated=evidence('other',{kind:'schedule',task:'Billing release',due:'2026-10-19',confirmed:true,quote:'Exact quote.'});
 const tentative=evidence('tentative',{kind:'schedule',task:'Reporting release',due:'2026-10-19',confirmed:false,quote:'Exact quote.'});
 const oldPromise=evidence('old-promise',{kind:'promise',customer:'Acme',title:'CSV export',feature:'CSV export',owner:'Mira',due:'2026-10-12',quote:'Exact quote.'});
 const supported=evidence('promise',{kind:'promise',customer:'Acme',title:'CSV export',feature:'CSV export',owner:'Mira',due:'2026-10-16',quote:'Exact quote.'});
 assert.deepEqual(currentEvidence(promise,[old,current,unrelated,tentative,oldPromise,supported]).map(e=>e.id),['current','promise']);
 assert.deepEqual(currentEvidence(promise,[old]),[]);
 assert.deepEqual(currentEvidence(promise,[current]),[current],'positive control: current evidence must remain available');
});

test('validation rejects fabricated excerpts, impossible dates and oversized original sources',()=>{
 const valid=ClaimSchema.parse(examples[0].claims[0]);
 assert.doesNotThrow(()=>validateEvidence(valid,examples[0].source.text));
 assert.throws(()=>validateEvidence({...valid,quote:'Fabricated source excerpt.'},examples[0].source.text));
 assert.throws(()=>ClaimSchema.parse({...valid,due:'2026-02-30'}));
 assert.throws(()=>ClaimSchema.parse({...valid,quote:' \n\t '}));
 assert.throws(()=>ClaimSchema.parse({kind:'note',memory:'   ',importance:'normal',quote:'Exact quote.'}));
 assert.throws(()=>ImportSchema.parse({...examples[0].source,text:'x'.repeat(60001)}));
 assert.equal(ImportSchema.parse(examples[0].source).text,examples[0].source.text);
});

test('HTTP boundaries reject hostile origins, missing tokens, remote unauthenticated hosts and malformed input without a database',async()=>{
 // No database substitute: these requests must fail before a graph operation can be attempted.
 const unavailable=new Store({} as Graph,async()=>{},'not-connected');
 const local=createApp(unavailable,new DeepSeek(''));
 const secured=createApp(unavailable,new DeepSeek(''),{token:'boundary-access-token'});
 assert.equal((await local.request('http://localhost/api/health',{headers:{Origin:'https://unrelated.example'}})).status,403);
 assert.equal((await secured.request('http://localhost/api/health')).status,401);
 assert.equal((await secured.request('http://localhost/api/health',{headers:{Authorization:'Bearer wrong-token'}})).status,401);
 assert.equal((await local.request('https://remote.example/api/health')).status,403);
 const malformed=await local.request('http://localhost/api/sources',{method:'POST',headers:{'Content-Type':'application/json'},body:'{invalid'});
 assert.equal(malformed.status,400);assert.equal((await malformed.json()).error.code,'INVALID_JSON');
 const invalid=await local.request('http://localhost/api/sources',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'x',kind:'note',text:'tiny'})});
 assert.equal(invalid.status,400);assert.equal((await invalid.json()).error.code,'INVALID_INPUT');
});

function transport(content:string|null,inspect?:(body:Record<string,unknown>)=>void,finish='stop'):typeof fetch{
 return async(_input,init)=>{
  const body=JSON.parse(String(init?.body));inspect?.(body);
  return Response.json({id:'offline-contract-fixture',object:'chat.completion',created:0,model:'deepseek-flash',choices:[{index:0,finish_reason:finish,message:{role:'assistant',content}}]});
 };
}

test('DeepSeek SDK transport fixture validates structured extraction without spending credits',async()=>{
 const ai=new DeepSeek('fixture-only','deepseek-flash','https://api.deepseek.com',transport(JSON.stringify({claims:examples[0].claims}),body=>{
  assert.equal(body.model,'deepseek-flash');assert.equal(body.reasoning_effort,'none');assert.deepEqual(body.response_format,{type:'json_object'});
 }));
 assert.deepEqual(await ai.extract(examples[0].source,[]),examples[0].claims);
 const invalid=new DeepSeek('fixture-only','deepseek-flash','https://api.deepseek.com',transport('{invalid'));
 await assert.rejects(()=>invalid.extract(examples[0].source,[]),{code:'EXTRACTION_INVALID'});
 const truncated=new DeepSeek('fixture-only','deepseek-flash','https://api.deepseek.com',transport('{}',undefined,'length'));
 await assert.rejects(()=>truncated.extract(examples[0].source,[]),{code:'EXTRACTION_INCOMPLETE'});
 await assert.rejects(()=>new DeepSeek('').extract(examples[0].source,[]),{code:'DEEPSEEK_NOT_CONFIGURED'});
});

test('drafting sends current graph evidence and source titles without reintroducing historical source bodies',async()=>{
 const current=evidence('current',{kind:'schedule',task:'Reporting release',due:'2026-10-19',confirmed:true,quote:'Exact quote.'});
 const ai=new DeepSeek('fixture-only','deepseek-flash','https://api.deepseek.com',transport('Please confirm the revised customer delivery date.',body=>{
  const messages=body.messages as {role:string;content:string}[];
  const input=JSON.parse(messages.find(m=>m.role==='user')!.content);
  assert.equal(input.sources[0].title,'Release history');assert.equal(input.sources[0].text,undefined);
  assert.equal(input.evidence[0].id,'current');assert.equal(input.promise.tasks[0].due_at,'2026-10-19');
 }));
 const draft=await ai.draft(promise,[{id:'src-current',title:'Release history',kind:'update',author:'Dev',text:'Obsolete deadline: 2026-10-15.',status:'reviewed',created_at:'2026-10-15'}],[current]);
 assert.match(draft,/confirm/);
});

test('a graph change during evidence loading cannot be returned as a current evidence snapshot',async()=>{
 // This controlled store exercises interleaving, not database correctness or persistence.
 class SnapshotStore extends Store{
  current='1';changeDuringRead=false;
  constructor(){super({} as Graph,async()=>{},'controlled-interleaving');}
  override async revision(){return this.current;}
  override async promises(){return [promise];}
  override async query<T>(_query:string,_params:Record<string,unknown>={}):Promise<T[]>{
   if(this.changeDuringRead)this.current='2';
   return [];
  }
 }
 const store=new SnapshotStore();
 assert.equal((await store.detail(promise.id)).revision,'1','positive control: stable snapshots remain readable');
 store.changeDuringRead=true;
 await assert.rejects(()=>store.detail(promise.id),{code:'STALE_EVIDENCE'});
});

test('simultaneous extraction requests acquire one source slot',async()=>{
 // Controlled source state tests serialization; actual FalkorDB coverage remains in integration.test.ts.
 class ExtractionStore extends Store{
  sourceState={...examples[0].source,id:'source-slot',status:'saved',created_at:'2026-10-15'};
  constructor(){super({} as Graph,async()=>{},'controlled-interleaving');}
  override async source(_id:string){return {...this.sourceState};}
  override async candidates(_id?:string){return [];}
  override async setSourceStatus(_id:string,status:string){this.sourceState.status=status;}
 }
 const store=new ExtractionStore();
 const attempts=await Promise.allSettled([store.beginExtraction('source-slot'),store.beginExtraction('source-slot')]);
 assert.equal(attempts.filter(result=>result.status==='fulfilled').length,1);
 const rejection=attempts.find(result=>result.status==='rejected');
 assert.ok(rejection&&rejection.status==='rejected');assert.equal(rejection.reason.code,'EXTRACTION_RUNNING');
 await store.setSourceStatus('source-slot','extraction_failed');
 assert.equal((await store.beginExtraction('source-slot')).status,'extraction_failed','failed work remains retriable');
});

test('workspace recall rejects a mixed revision and accepts a stable snapshot on a custom local port',async()=>{
 class WorkspaceStore extends Store{
  current='1';changeDuringRead=false;
  constructor(){super({} as Graph,async()=>{},'controlled-interleaving');}
  override async revision(){return this.current;}
  override async promises(){if(this.changeDuringRead)this.current='2';return [promise];}
  override async sources(){return [];}
  override async candidates(){return [];}
  override async memory(){return [];}
  override async graphData(){return {nodes:[],edges:[]};}
 }
 const store=new WorkspaceStore(),previousPort=process.env.PORT;process.env.PORT='48174';
 try{
  const app=createApp(store,new DeepSeek(''));
  const request=()=>app.request('http://127.0.0.1:48174/api/workspace',{headers:{Origin:'http://127.0.0.1:48174'}});
  assert.equal((await request()).status,200);
  store.changeDuringRead=true;
  const response=await request();assert.equal(response.status,409);assert.equal((await response.json()).error.code,'STALE_EVIDENCE');
 }finally{if(previousPort===undefined)delete process.env.PORT;else process.env.PORT=previousPort;}
});
