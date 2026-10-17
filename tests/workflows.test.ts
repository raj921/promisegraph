import test from 'node:test';
import assert from 'node:assert/strict';
import type {Graph} from 'falkordb';
import {Store} from '../server/store';
import {createApp} from '../server/app';
import {DeepSeek} from '../server/deepseek';
import {examples,delayClaim} from '../server/fixtures';
import type {Claim,PromiseRecord} from '../shared/schema';

// Controlled query replies exercise the real handlers and Store guards. They do
// not execute Cypher, emulate a graph, or establish persistence after restart.
class WorkflowStore extends Store{
 replies:unknown[][]=[];
 queries:{text:string;params:Record<string,unknown>}[]=[];
 currentRevision='7';detailRevision='7';
 commitment:PromiseRecord={id:'commitment',title:'CSV export',customer:'Acme',owner:'Maya',feature:'Export',due_at:'2026-10-16',status:'at_risk',tasks:[]};
 constructor(){super({} as Graph,async()=>{},'controlled-workflow-boundary');}
 override async query<T>(text:string,params:Record<string,unknown>={}):Promise<T[]>{this.queries.push({text,params});return (this.replies.shift()||[]) as T[];}
 override async revision(){return this.currentRevision;}
 override async source(_id:string){return {...examples[0].source,id:'source',status:'needs_review',created_at:'2026-10-16'};}
 override async detail(_id:string){return {promise:this.commitment,sources:[],evidence:[],drafts:[],followups:[],revision:this.detailRevision};}
}
const request=(store:WorkflowStore,path:string,body?:unknown)=>createApp(store,new DeepSeek('')).request(`http://localhost/api${path}`,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const candidate=(claim:Claim=examples[0].claims[0],status='pending')=>({source_id:'source',status,payload:JSON.stringify(claim)});

test('review validates explicit decisions and evidence before changing a proposed fact',async()=>{
 for(const scenario of ['invalid','forged','tentative','missing','duplicate']){
  const store=new WorkflowStore();
  const tentative:Claim={kind:'schedule',task:'Reporting release',due:'2026-10-19',confirmed:false,quote:delayClaim.quote};
  store.replies=scenario==='missing'?[[]]:[[candidate(scenario==='tentative'?tentative:examples[0].claims[0],scenario==='duplicate'?'approved':'pending')]];
  const body=scenario==='invalid'?{decision:'accept'}:scenario==='forged'?{decision:'approve',claim:{...examples[0].claims[0],quote:'This quote does not exist.'}}:{decision:'approve'};
  // Tentative approval needs a genuine excerpt before the confirmation guard.
  if(scenario==='tentative')store.source=async()=>({...examples[0].source,id:'source',text:delayClaim.quote,status:'needs_review',created_at:'2026-10-16'});
  const response=await request(store,'/claims/proposal/decision',body),result=await response.json();
  const expected=scenario==='invalid'||scenario==='forged'?400:scenario==='tentative'?409:scenario==='missing'?404:200;
  assert.equal(response.status,expected,scenario);
  assert.equal(store.queries.length,scenario==='invalid'?0:1,'Rejected or duplicate review must not issue a mutation.');
  if(scenario==='duplicate')assert.equal(result.duplicate,true);
 }
});

test('approval preserves a reviewed correction and rejection remains an explicit decision',async()=>{
 for(const decision of ['approve','reject'] as const){
  const store=new WorkflowStore();store.replies=[[candidate()],[],[{n:1}]];
  const correction={...examples[0].claims[0],owner:'Reviewed owner'};
  const response=await request(store,'/claims/proposal/decision',{decision,claim:correction});
  assert.equal(response.status,200);assert.equal((await response.json()).status,decision==='approve'?'approved':'rejected');
  assert.deepEqual(JSON.parse(String(store.queries[1].params.payload)),correction);
  assert.equal(store.queries[1].params.quote,correction.quote);
  assert.ok(!store.queries[1].text.includes(correction.quote),'Source content must remain a query parameter.');
 }
});

test('reviewed draft saves reject stale evidence, foreign draft IDs and invalid text',async()=>{
 for(const scenario of ['stale','changed-during-read','foreign','empty','oversized']){
  const store=new WorkflowStore();
  if(scenario==='stale')store.currentRevision='8';
  if(scenario==='changed-during-read'){store.detailRevision='8';store.replies=[[{promise_id:'commitment'}],[]];}
  if(scenario==='foreign')store.replies=[[{promise_id:'other-commitment'}]];
  const response=await request(store,'/promises/commitment/drafts',{id:'existing-draft',revision:'7',text:scenario==='empty'?'   ':scenario==='oversized'?'x'.repeat(12001):'Reviewed message.'});
  assert.equal(response.status,scenario==='foreign'?404:scenario==='empty'||scenario==='oversized'?400:409,scenario);
  assert.equal(store.queries.length,scenario==='foreign'?1:0,'An invalid save must not reach a write.');
 }
 const store=new WorkflowStore();store.replies=[[{promise_id:'commitment'}],[]];
 const response=await request(store,'/promises/commitment/drafts',{id:'existing-draft',revision:'7',text:'  My reviewed wording.  '});
 assert.equal(response.status,200);assert.equal((await response.json()).id,'existing-draft');
 assert.equal(store.queries[1].params.text,'My reviewed wording.');
 assert.equal(store.queries[1].params.promiseId,'commitment');
});

test('follow-ups require current confirmed risk and retry with the same task identity',async()=>{
 for(const scenario of ['stale','changed-during-read','on_track','unverified']){
  const store=new WorkflowStore();
  if(scenario==='stale')store.currentRevision='8';
  else if(scenario==='changed-during-read')store.detailRevision='8';
  else store.commitment.status=scenario as 'on_track'|'unverified';
  const response=await request(store,'/promises/commitment/followups',{revision:'7'});
  assert.equal(response.status,409,scenario);assert.equal(store.queries.length,0);
 }
 const store=new WorkflowStore();
 const first=await request(store,'/promises/commitment/followups',{revision:'7'}),second=await request(store,'/promises/commitment/followups',{revision:'7'});
 assert.equal(first.status,201);assert.equal(second.status,201);
 assert.equal((await first.json()).id,(await second.json()).id);
 assert.equal(store.queries[0].params.owner,'Maya');
});

test('task completion and reopening validate status and report missing tasks',async()=>{
 const store=new WorkflowStore();
 assert.equal((await request(store,'/followups/task/status',{status:'sent'})).status,400);
 assert.equal(store.queries.length,0);
 assert.equal((await request(store,'/followups/task/status',{status:'done'})).status,404);
 for(const status of ['done','open']){
  store.replies=[[{title:'Confirm revised date'}]];
  const response=await request(store,'/followups/task/status',{status});
  assert.equal(response.status,200);assert.equal((await response.json()).status,status);
  assert.equal(store.queries.at(-1)?.params.status,status);
 }
});

test('memory save and recall preserve text as data, clamp search and expose the current revision',async()=>{
 const store=new WorkflowStore(),memory="Confirmed decision: 'quoted' content is data.";
 assert.equal((await request(store,'/memory',{memory:'   '})).status,400);assert.equal(store.queries.length,0);
 const first=await request(store,'/memory',{memory:`  ${memory}  `}),second=await request(store,'/memory',{memory});
 assert.equal(first.status,201);assert.equal((await first.json()).id,(await second.json()).id);
 assert.equal(store.queries[0].params.memory,memory);assert.equal(store.queries[0].params.importance,'normal');
 assert.ok(!store.queries[0].text.includes(memory));
 const recalled={id:'saved-memory',memory,importance:'normal',source_id:'',created_at:'2026-10-16'};store.replies=[[recalled]];
 const response=await request(store,`/memory?q=${'x'.repeat(400)}`),result=await response.json();
 assert.equal(response.status,200);assert.deepEqual(result.memories,[recalled]);assert.equal(result.revision,'7');
 assert.equal(String(store.queries.at(-1)?.params.search).length,300);
});
