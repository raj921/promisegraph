import test from 'node:test';
import assert from 'node:assert/strict';
import {api,ApiError,type Health} from '../src/api';

const health:Health={database:{connected:true,engine:'FalkorDB',mode:'embedded'},deepseek:{configured:false,model:'deepseek-flash'},revision:'7',scope:'single-owner workspace'};

test('frontend API validates a connected server before exposing health data',async t=>{
 const fetch=t.mock.method(globalThis,'fetch',async()=>Response.json(health));
 assert.deepEqual(await api<Health>('http://localhost:4174/','','/health'),health);
 for(const payload of [null,[],{status:'ok'},{...health,deepseek:null},{...health,database:{connected:'yes'}}]){
  fetch.mock.mockImplementation(async()=>Response.json(payload));
  await assert.rejects(()=>api('http://localhost:4174','','/health'),error=>error instanceof ApiError&&error.code==='API_NOT_FOUND');
 }
});

test('frontend API handles network, HTML and malformed error replies without leaking runtime errors',async t=>{
 const fetch=t.mock.method(globalThis,'fetch',async()=>{throw new TypeError('Fixture connection refused');});
 await assert.rejects(()=>api('','','/workspace'),{code:'CONNECTION_FAILED'});
 fetch.mock.mockImplementation(async()=>new Response('<html>Wrong server</html>'));
 await assert.rejects(()=>api('','','/workspace'),{code:'API_NOT_FOUND'});
 for(const payload of [null,42,{error:{message:{unexpected:'object'},code:7,details:'invalid'}}]){
  fetch.mock.mockImplementation(async()=>Response.json(payload,{status:502}));
  await assert.rejects(()=>api('','','/workspace'),error=>error instanceof ApiError&&error.message==='The request failed.'&&error.code==='REQUEST_FAILED');
 }
 fetch.mock.mockImplementation(async()=>Response.json({error:{message:'Refresh current evidence.',code:'STALE_EVIDENCE',details:[{field:'revision',message:'Out of date'}]}},{status:409}));
 await assert.rejects(()=>api('','','/workspace'),error=>error instanceof ApiError&&error.code==='STALE_EVIDENCE'&&error.details?.[0].field==='revision');
});

test('frontend API preserves reviewed request bodies, access tokens and successful receipts',async t=>{
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  assert.equal(input,'https://workspace.example/api/promises/commitment/drafts');
  assert.equal(init?.method,'POST');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer fixture-access-token');
  assert.deepEqual(JSON.parse(String(init?.body)),{text:'Reviewed wording.',revision:'7'});
  return Response.json({id:'saved-draft',receipt:'Draft saved. Nothing was sent.'});
 });
 assert.equal((await api<{id:string}>('https://workspace.example/','fixture-access-token','/promises/commitment/drafts',{text:'Reviewed wording.',revision:'7'})).id,'saved-draft');
});
