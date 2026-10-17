import {config} from 'dotenv';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,mkdtemp,readFile,writeFile,appendFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import getPort from 'get-port';
import {serve} from '@hono/node-server';
import {serveStatic} from '@hono/node-server/serve-static';
import {Store} from '../server/store';
import {createApp} from '../server/app';
import {DeepSeek} from '../server/deepseek';
import {examples,delayed,delayClaim} from '../server/fixtures';
import {validateEvidence,type SourceRecord,type Candidate,type PromiseRecord} from '../shared/schema';

const controlled=process.argv.includes('--controlled');
const aiOnly=process.argv.includes('--ai-only');
if(controlled&&aiOnly)throw new Error('Choose controlled checks or live AI checks.');
if(!controlled)config({path:'.env.local',quiet:true});
type Result={id:string;status:'passed'|'failed'|'blocked';detail:string;milliseconds:number};
class Blocked extends Error{}
const results:Result[]=[];
const secrets=[process.env.DEEPSEEK_API_KEY,process.env.APP_ACCESS_TOKEN,process.env.FALKORDB_PASSWORD].filter((value):value is string=>Boolean(value));
function safe(value:unknown){let text=String(value);for(const secret of secrets)text=text.replaceAll(secret,'[redacted]');return text.replace(/sk-[A-Za-z0-9_-]{12,}/g,'[redacted]').slice(-4000);}
async function check(id:string,action:()=>Promise<string>){
 const started=Date.now();
 try{results.push({id,status:'passed',detail:safe(await action()),milliseconds:Date.now()-started});}
 catch(error){results.push({id,status:error instanceof Blocked?'blocked':'failed',detail:safe(error instanceof Error?error.message:error),milliseconds:Date.now()-started});}
 const result=results.at(-1)!;console.log(`${result.status.toUpperCase()} ${id}: ${result.detail}`);
}
function command(executable:string,args:string[],timeout=120000){return new Promise<string>((resolve,reject)=>{
 let output='';const env={...process.env};delete env.DEEPSEEK_API_KEY;delete env.APP_ACCESS_TOKEN;delete env.FALKORDB_PASSWORD;
 const child=spawn(executable,args,{stdio:['ignore','pipe','pipe'],env});
 const timer=setTimeout(()=>{child.kill('SIGTERM');reject(new Error('Verification command timed out.'));},timeout);
 child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.length>1000000)child.kill('SIGTERM');});
 child.stderr.on('data',chunk=>{output+=chunk.toString();if(output.length>1000000)child.kill('SIGTERM');});
 child.once('error',error=>{clearTimeout(timer);reject(error);});
 child.once('close',code=>{clearTimeout(timer);if(code===0)resolve(output.trim());else reject(new Error(safe(output)||`Command exited ${code}.`));});
 });}
async function canListen(){return new Promise<boolean>(resolve=>{const server=createServer();server.once('error',()=>resolve(false));server.listen(0,'127.0.0.1',()=>server.close(()=>resolve(true)));});}
const passed=(id:string)=>results.some(result=>result.id===id&&result.status==='passed');
const reportDirectory=resolve('.data');await mkdir(reportDirectory,{recursive:true});
if(!aiOnly){
await check('boundaries',async()=>{await command(process.execPath,['--import','tsx','--test','tests/boundaries.test.ts','tests/frontend.test.ts','tests/api.test.ts','tests/workflows.test.ts']);return 'Input, evidence, access, interleaving, frontend state and API response, review, draft save, follow-up and memory contract checks passed. Controlled query replies do not verify Cypher execution or persistence.';});
await check('ai_contracts',async()=>{await command(process.execPath,['--import','tsx','--test','tests/ai.test.ts']);return 'Controlled-provider AI request checks passed: extraction grounding, human-review boundary, provider errors, draft risk and revision guards, and verified credential replacement. This does not verify live model quality or database persistence.';});
await check('capture_tools',async()=>{await command(process.execPath,['--import','tsx','--test','tests/tools.test.ts']);return 'Import checkpoints, crash recovery, retries and capture serialization passed.';});
await check('build',async()=>{await command('npm',['run','build']);return 'TypeScript and the production frontend build passed.';});
}
if(!controlled){
const listenAllowed=aiOnly?false:await canListen();
if(!aiOnly)await check('database',async()=>{
 if(!listenAllowed)throw new Blocked('The environment prohibits local listeners; real FalkorDB tests cannot start.');
 await command(process.execPath,['--import','tsx','--test','tests/integration.test.ts']);
 return 'Real FalkorDB HTTP, provenance, actions and restart persistence passed.';
});
await check('deepseek_auth',async()=>{
 if(!process.env.DEEPSEEK_API_KEY)throw new Blocked('A DeepSeek key is not configured.');
 let response:Response;
 try{response=await fetch('https://api.deepseek.com/models',{headers:{Authorization:`Bearer ${process.env.DEEPSEEK_API_KEY}`},signal:AbortSignal.timeout(15000)});}
 catch(error){throw new Blocked(`DeepSeek is unreachable (${(error as {cause?:{code?:string}}).cause?.code||'network timeout'}).`);}
 assert.equal(response.status,200,`DeepSeek authentication returned HTTP ${response.status}.`);
 const models=await response.json() as {data:{id:string}[]};
 const model=process.env.DEEPSEEK_MODEL||'deepseek-flash';assert.ok(models.data.some(item=>item.id===model),'The configured model is not available to this account.');
 return 'The configured DeepSeek key and model were verified against the live API.';
});
await check('deepseek_generation',async()=>{
 if(!passed('deepseek_auth'))throw new Blocked('Requires live DeepSeek authentication. No fixture response is substituted.');
 // This is the production adapter with its real HTTPS transport, independent of
 // FalkorDB. Only the input is synthetic; both outputs come from the provider.
 const ai=new DeepSeek();
 const source:SourceRecord={id:'live-ai-verification',title:'Live AI verification · fictional commitment',kind:'document',author:'Synthetic test input',created_at:new Date().toISOString(),status:'reviewed',text:'Mira promised Lumen PDF reports by 2026-11-04. PDF reports requires Report builder. Report builder depends on the Renderer release task, owned by Dev. Confirmed: Renderer release is scheduled for 2026-11-06.'};
 const claims=await ai.extract(source,[]);
 for(const claim of claims)validateEvidence(claim,source.text);
 const commitment=claims.find(claim=>claim.kind==='promise');
 assert.ok(commitment?.kind==='promise','Live extraction did not return the explicit commitment.');
 assert.equal(commitment.customer,'Lumen');assert.equal(commitment.due,'2026-11-04');assert.equal(commitment.feature,'Report builder');
 assert.ok(claims.some(claim=>claim.kind==='dependency'&&claim.feature==='Report builder'&&claim.task==='Renderer release'));
 assert.ok(claims.some(claim=>claim.kind==='schedule'&&claim.task==='Renderer release'&&claim.due==='2026-11-06'&&claim.confirmed));
 const promise:PromiseRecord={id:'live-ai-commitment',customer:commitment.customer,title:commitment.title,feature:commitment.feature,owner:commitment.owner,due_at:commitment.due,status:'at_risk',tasks:[{id:'renderer',title:'Renderer release',owner:'Dev',due_at:'2026-11-06'}]};
 const evidence=claims.map((claim,index)=>({id:`live-ai-claim-${index}`,kind:claim.kind,source_id:source.id,quote:claim.quote,payload:JSON.stringify(claim)}));
 const text=await ai.draft(promise,[source],evidence);
 assert.ok(text.length>20,'Live drafting did not return a substantive response.');
 return `Real DeepSeek ${ai.model} generated ${claims.length} grounded proposals and a ${text.length}-character draft through the production adapter. No graph writes or customer messages were made. This is a focused smoke check, not a comprehensive model-quality evaluation.`;
});
if(!aiOnly){
await check('live_workflow',async()=>{
 if(!passed('database')||!passed('deepseek_auth'))throw new Blocked('Requires passing real-database and live-DeepSeek checks.');
 const path=await mkdtemp(join(tmpdir(),'pgraph-live-verification-'));let store=await Store.openLocal(path);
 try{
  await store.init();const app=createApp(store,new DeepSeek());
  const request=async<T,>(path:string,body?:unknown):Promise<T>=>{
   const response=await app.request(`http://localhost/api${path}`,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   assert.ok(response.ok,`Live workflow ${path} returned HTTP ${response.status}.`);return response.json() as Promise<T>;
  };
  const imported=await request<{source:SourceRecord}>('/sources',{title:'Verification · explicit customer commitment',kind:'document',author:'Synthetic verification fixture',text:examples[0].source.text+'\n'+examples[2].source.text});
  await request(`/sources/${imported.source.id}/extract`,{});
  assert.equal((await store.promises()).length,0,'unreviewed model facts must not change the active graph');
  const {candidates}=await request<{candidates:Candidate[]}>(`/sources/${imported.source.id}/claims`);
  assert.ok(candidates.some(c=>c.claim.kind==='promise'&&c.claim.customer==='Acme'));
  assert.ok(candidates.some(c=>c.claim.kind==='dependency'));
  assert.ok(candidates.some(c=>c.claim.kind==='schedule'));
  for(const candidate of candidates)await request(`/claims/${candidate.id}/decision`,{decision:'approve'});
  const promise=(await store.promises()).find(item=>item.customer==='Acme');assert.ok(promise);assert.equal(promise.status,'on_track');
  const update=await request<{source:SourceRecord}>('/sources',delayed);
  const proposals=await request<{candidates:Candidate[]}>(`/sources/${update.source.id}/claims`,{claims:[delayClaim]});
  await request(`/claims/${proposals.candidates[0].id}/decision`,{decision:'approve'});
  assert.equal((await store.detail(promise.id)).promise.status,'at_risk');
  const draft=await request<{text:string;revision:string}>(`/promises/${promise.id}/draft`,{});assert.ok(draft.text.trim().length>20);
  await request(`/promises/${promise.id}/drafts`,draft);
  const followup=await request<{id:string}>(`/promises/${promise.id}/followups`,{revision:draft.revision});
  await request(`/followups/${followup.id}/status`,{status:'done'});
  await request('/memory',{memory:'Verification confirmed the customer follow-up was reviewed in the isolated test workspace.'});
  await store.close();store=await Store.openLocal(path);await store.init();
  const recalled=await store.detail(promise.id);assert.equal(recalled.drafts[0].text,draft.text);assert.equal(recalled.followups[0].status,'done');assert.equal((await store.memory('Verification')).length,1);
  return 'Live DeepSeek extraction → human-review API → graph risk → draft → task → database restart recall passed with isolated fictional data.';
 }finally{await store.close();await rm(path,{recursive:true,force:true});}
});
await check('browser',async()=>{
 if(!listenAllowed||!passed('database')||!passed('build'))throw new Blocked('Requires the built app and a working local FalkorDB process.');
 const path=await mkdtemp(join(tmpdir(),'pgraph-browser-verification-'));const store=await Store.openLocal(path);let stop:()=>Promise<void>=async()=>{};
 try{
  await store.init();const port=await getPort({host:'127.0.0.1'}),url=`http://127.0.0.1:${port}`;
  const app=createApp(store,new DeepSeek(''),{origins:[url]});
  app.use('/*',serveStatic({root:'./dist'}));app.get('/*',serveStatic({path:'./dist/index.html'}));
  const server=serve({fetch:app.fetch,hostname:'127.0.0.1',port});
  stop=()=>new Promise<void>(resolve=>{server.close(()=>resolve());if('closeAllConnections' in server)server.closeAllConnections();});
  const screenshots=join(reportDirectory,'browser');await mkdir(screenshots,{recursive:true});
  const spaceFile=join(reportDirectory,'verification-browser-space.json');
  let spaceId:number|undefined;try{spaceId=JSON.parse(await readFile(spaceFile,'utf8')).spaceId;}catch{}
  const script=`
const fs=await import("node:fs/promises");
let task;try{task=await taskSpace(${spaceId===undefined?'"PromiseGraph full workflow verification"':JSON.stringify(spaceId)});}catch(error){if(${spaceId===undefined?'false':'true'})task=await taskSpace("PromiseGraph full workflow verification");else throw error;}
await fs.writeFile(${JSON.stringify(spaceFile)},JSON.stringify({spaceId:task.spaceId}),{mode:0o600});
console.log({spaceId:task.spaceId});
const page=task.page("p1");
try{
 await page.goto(${JSON.stringify(url)});
 await page.waitForSelector('text="Your first promise starts here."',{timeout:20000});
 await page.click('text="Load fictional walkthrough"');
 await page.waitForSelector('text="Your commitments"',{timeout:20000});
 const layout=[];
 let pixels=true;
 const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
 const settle=async(minimum)=>{
  let previous="",stable=0;
  for(let attempt=0;attempt<80;attempt++){
   const current=await page.evaluate(()=>{
    const box=document.querySelector(".circuit-scroll");
    return box?[box.clientWidth,box.scrollWidth,[...document.querySelectorAll(".circuit-node,.circuit-label")].filter(node=>node.getBoundingClientRect().width>0).length].join(":"):"none";
   });
   const visible=current==="none"?0:Number(current.split(":")[2]);
   stable=current!=="none"&&current===previous?stable+1:0;
   previous=current;
   if(stable>=6&&visible>=minimum)return current;
   await sleep(150);
  }
  throw new Error("The graph never settled with at least "+minimum+" visible elements: "+previous);
 };
 const sweep=async(surface,minimumNodes)=>{
  try{await page.cdp("Page.bringToFront",{});}catch{}
  for(const width of [1440,768,390]){
   await page.cdp("Emulation.setDeviceMetricsOverride",{width,height:1000,deviceScaleFactor:1,mobile:width<700});
   await page.waitForFunction(()=>document.fonts.status==="loaded");
   const size=await page.evaluate(()=>({viewport:innerWidth,content:document.documentElement.scrollWidth}));
   if(size.content>size.viewport+1)throw new Error("Horizontal overflow at "+width+" pixels on the "+surface);
   await settle(minimumNodes);
   const graph=await page.evaluate(()=>{
    const box=document.querySelector(".circuit-scroll");
    if(!box)return {unreachable:[],beyondEnd:[],scrollWidth:0,clientWidth:0,scrollable:false,nodes:0};
    const nodes=[...document.querySelectorAll(".circuit-node,.circuit-label")].filter(node=>node.getBoundingClientRect().width>0);
    const name=node=>node.textContent||node.getAttribute("aria-label")||"node";
    const scrollable=box.scrollWidth>box.clientWidth+1&&/auto|scroll/.test(getComputedStyle(box).overflowX);
    const bounds=box.getBoundingClientRect();
    const unreachable=nodes.filter(node=>{
     const rect=node.getBoundingClientRect();
     const contentRight=rect.right-bounds.left+box.scrollLeft;
     return scrollable?contentRight>box.scrollWidth+1:rect.right>bounds.right+1;
    }).map(name);
    box.style.scrollBehavior="auto";
    box.scrollLeft=box.scrollWidth;
    const beyondEnd=nodes.filter(node=>node.getBoundingClientRect().right>bounds.right+1).map(name);
    box.scrollLeft=0;
    box.style.scrollBehavior="";
    return {unreachable,beyondEnd,scrollWidth:box.scrollWidth,clientWidth:box.clientWidth,scrollable,nodes:nodes.length};
   });
   if(graph.nodes<minimumNodes)throw new Error("The "+surface+" showed only "+graph.nodes+" of at least "+minimumNodes+" expected graph elements at "+width+" pixels");
   if(graph.unreachable.length)throw new Error("Graph content is unreachable at "+width+" pixels on the "+surface+": "+graph.unreachable.join(", "));
   if(graph.beyondEnd.length)throw new Error("Graph content cannot be scrolled into view at "+width+" pixels on the "+surface+": "+graph.beyondEnd.join(", "));
   if(graph.scrollWidth>graph.clientWidth+1&&!graph.scrollable)throw new Error("Graph content is clipped and the container cannot scroll at "+width+" pixels on the "+surface);
   if(pixels){try{await page.screenshot({path:${JSON.stringify(screenshots)}+"/"+surface.replace(/[^a-z]+/gi,"-")+"-"+width+".png"});}catch{pixels=false;}}
   layout.push(surface+" "+width+"px viewport "+size.viewport+" content "+size.content+" graph "+graph.nodes+" nodes "+(graph.scrollable?"scrollable "+graph.scrollWidth+"/"+graph.clientWidth:"fits "+graph.clientWidth));
  }
 };
 await sweep("inbox path",6);
 await page.cdp("Emulation.clearDeviceMetricsOverride",{});
 await page.click('loc=role:link[name="Connected graph"]');
 await page.waitForSelector(".graph-search",{timeout:20000});
 await sweep("workspace graph",20);
 await page.cdp("Emulation.clearDeviceMetricsOverride",{});
 await page.click('loc=role:link[name="Commitment inbox"]');
 await page.waitForSelector('text="Your commitments"');
 await page.click('loc=role:link[name="Memory & activity"]');
 await page.fill('loc=role:textbox[name="Record a confirmed decision"]',"Browser verification saved a confirmed decision.");
 await page.click('loc=role:button[name="Record memory"]');
 const expectMemory=async(when)=>{const started=Date.now();for(;;){const found=await page.evaluate(()=>[...document.querySelectorAll(".memory-card p")].some(entry=>entry.textContent.indexOf("Browser verification saved a confirmed decision.")>=0));if(found)return;if(Date.now()-started>20000)throw new Error("The saved memory entry was not visible "+when);await new Promise(resolve=>setTimeout(resolve,250));}};
 await expectMemory("after saving it.");
 await page.reload();
 await page.waitForSelector('text="Your commitments"');
 await page.click('loc=role:link[name="Memory & activity"]');
 await expectMemory("after a full page reload.");
 console.log("LAYOUT "+layout.join(" | ")+" | pixels "+(pixels?"captured":"unavailable"));
 await task.finish({keep:[]});
 await fs.rm(${JSON.stringify(spaceFile)},{force:true});
 console.log("BROWSER_WORKFLOW_VERIFIED");
}catch(error){try{await page.cdp("Emulation.clearDeviceMetricsOverride",{});}catch{}try{await task.finish({keep:[]});}catch{}throw error;}
`;
  let output:string;try{output=await command('ego-browser',['nodejs','-e',script],240000);}catch(error){if(String(error).includes('ego_cli bootstrap'))throw new Blocked('The Ego CLI bootstrap is unavailable to this process. Browser QA can still be performed through the connected Ego browser UI.');throw error;}assert.ok(output.includes('BROWSER_WORKFLOW_VERIFIED'));
  const layout=output.split('\n').find(line=>line.startsWith('LAYOUT '))??'';
  const captured=layout.includes('pixels captured');
  return `Ego drove the built application against an isolated real graph: walkthrough import, memory saved and still present after reload, no horizontal overflow and no clipped graph content. ${layout}`
   +(captured?'':' Pixel captures were unavailable: this browser runtime produced no compositor frames, so layout evidence is DOM geometry rather than images. Visual review of screenshots is still outstanding.');
 }finally{await stop();await store.close();await rm(path,{recursive:true,force:true});}
});
}
}
const reportName=controlled?'verification-controlled':aiOnly?'verification-ai':'verification';
let previous:{passed?:number}|null=null;try{previous=JSON.parse(await readFile(join(reportDirectory,`${reportName}.json`),'utf8'));}catch{}
const passedCount=results.filter(result=>result.status==='passed').length;
const report={at:new Date().toISOString(),scope:controlled?'controlled':aiOnly?'live-ai':'full',complete:results.every(result=>result.status==='passed'),passed:passedCount,failed:results.filter(result=>result.status==='failed').length,blocked:results.filter(result=>result.status==='blocked').length,total:results.length,verifiedFraction:passedCount/results.length,previousPassed:previous?.passed??null,checks:results,nextActions:results.filter(result=>result.status!=='passed').map(({id,status,detail})=>({id,status,detail}))};
await writeFile(join(reportDirectory,`${reportName}.json`),JSON.stringify(report,null,2)+'\n',{mode:0o600});
await appendFile(join(reportDirectory,`${reportName}-history.jsonl`),JSON.stringify(report)+'\n',{mode:0o600});
console.log(`${controlled?'CONTROLLED':aiOnly?'LIVE AI':'FULL'} VERIFICATION: ${report.passed}/${report.total} layers passed; ${report.failed} failed; ${report.blocked} blocked.`);
if(!report.complete)process.exitCode=1;
