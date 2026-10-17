import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {bodyLimit} from 'hono/body-limit';
import {secureHeaders} from 'hono/secure-headers';
import {rateLimiter} from 'hono-rate-limiter';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import OpenAI from 'openai';
import {ImportSchema,ClaimSchema,validateEvidence,EvidenceError} from '../shared/schema';
import {Store} from './store';
import {DeepSeek} from './deepseek';
import {AppError} from './errors';
import {examples,delayed,delayClaim} from './fixtures';

type Options={token?:string;origins?:string[]};
export function createApp(store:Store,ai:DeepSeek,options:Options={}){
 const app=new Hono();
 const port=process.env.PORT||'4174';
 const origins=options.origins||[`http://127.0.0.1:${port}`,`http://localhost:${port}`,'http://127.0.0.1:5173','http://localhost:5173','https://promisegraph-raj-graph-hacks.racingcabin2.chatgpt.site'];
 app.use('/api/*',secureHeaders());
 app.use('/api/*',cors({origin:origin=>origins.includes(origin)?origin:undefined,allowHeaders:['Content-Type','Authorization'],allowMethods:['GET','POST','OPTIONS']}));
 app.use('/api/*',bodyLimit({maxSize:256000,onError:c=>{c.header('Connection','close');return c.json({error:{code:'BODY_TOO_LARGE',message:'Use a text source below 60,000 characters.'}},413);}}));
 app.use('/api/*',async(c,next)=>{
   const origin=c.req.header('Origin');if(origin&&!origins.includes(origin))throw new AppError(403,'ORIGIN_DENIED','This origin is not allowed.');
   const host=new URL(c.req.url).hostname;
   if(!options.token&&!['localhost','127.0.0.1','::1'].includes(host))throw new AppError(403,'LOCAL_ONLY','Remote hosting requires an application access token.');
   if(options.token){const header=c.req.header('Authorization')||'';const token=header.startsWith('Bearer ')?header.slice(7):'';const a=Buffer.from(token),b=Buffer.from(options.token);if(a.length!==b.length||!timingSafeEqual(a,b))throw new AppError(401,'UNAUTHORIZED','Enter the application access token in connection settings.');}
   await next();
 });
 app.onError((error,c)=>{
   if(error instanceof EvidenceError)return c.json({error:{code:'INVALID_EVIDENCE',message:error.message}},400);
   if(error instanceof SyntaxError)return c.json({error:{code:'INVALID_JSON',message:'The request must contain valid JSON.'}},400);
   if(error instanceof z.ZodError)return c.json({error:{code:'INVALID_INPUT',message:'Check the highlighted fields.',details:error.issues.map(i=>({field:i.path.join('.'),message:i.message}))}},400);
   if(error instanceof AppError)return c.json({error:{code:error.code,message:error.message}},error.status as 400);
   if(error instanceof OpenAI.APIError)return c.json({error:{code:'DEEPSEEK_ERROR',message:error.status===402?'DeepSeek credits are exhausted. Add credits or use manual source review.':error.status===401?'DeepSeek rejected the API key. Reconnect in Settings.':'DeepSeek could not complete the request. Your saved source is unchanged; retry when the service is available.'}},502);
   console.error(JSON.stringify({event:'request_failed',path:c.req.path,error:error.name}));
   return c.json({error:{code:'INTERNAL_ERROR',message:'The operation failed. Retry; no success receipt was issued.'}},500);
 });
 const limitAI=rateLimiter({windowMs:60000,limit:12,keyGenerator:()=> 'workspace-owner',message:{error:{code:'RATE_LIMITED',message:'Twelve AI operations per minute are available. Wait a moment and retry.'}}});
 app.use('/api/sources/:id/extract',limitAI);
 app.use('/api/promises/:id/draft',limitAI);
 app.use('/api/settings/deepseek',limitAI);
 app.get('/api/health',async c=>{await store.query('RETURN 1');return c.json({database:{connected:true,engine:'FalkorDB',mode:store.mode},deepseek:{configured:ai.configured,model:ai.model},revision:await store.revision(),scope:'single-owner workspace'});});
 app.get('/api/workspace',async c=>{const revision=await store.revision();const [promises,sources,candidates,memory,graph]=await Promise.all([store.promises(),store.sources(),store.candidates(),store.memory(),store.graphData()]);if(revision!==await store.revision())throw new AppError(409,'STALE_EVIDENCE','The graph changed while the workspace was loading. Refresh and try again.');return c.json({promises,sources,candidates,memory,graph,revision});});
 app.post('/api/sources',async c=>c.json(await store.import(ImportSchema.parse(await c.req.json())),201));
 app.get('/api/sources/:id/claims',async c=>{await store.source(c.req.param('id'));return c.json({candidates:await store.candidates(c.req.param('id'))});});
 app.post('/api/sources/:id/extract',async c=>{
   const id=c.req.param('id');
   if(!ai.configured)throw new AppError(503,'DEEPSEEK_NOT_CONFIGURED','Connect DeepSeek in Settings, or add facts manually.');
   const source=await store.beginExtraction(id);
   try{const claims=await ai.extract(source,(await store.graphData()).nodes);for(const claim of claims)validateEvidence(claim,source.text);const candidates=await store.propose(id,claims);return c.json({candidates,receipt:`${candidates.length} proposed facts saved for review.`});}
   catch(error){await store.setSourceStatus(id,'extraction_failed','Extraction failed. Retry or add facts manually.');if(error instanceof EvidenceError)throw new AppError(502,'EXTRACTION_UNGROUNDED','The model returned evidence that does not match the source. No facts were confirmed. Retry or add them manually.');throw error;}
 });
 app.post('/api/sources/:id/claims',async c=>{const body=z.object({claims:z.array(ClaimSchema).min(1).max(40)}).parse(await c.req.json());return c.json({candidates:await store.propose(c.req.param('id'),body.claims)},201);});
 app.post('/api/claims/:id/decision',async c=>{const input=z.object({decision:z.enum(['approve','reject']),claim:ClaimSchema.optional()}).parse(await c.req.json());return c.json(await store.decide(c.req.param('id'),input.decision,input.claim));});
 app.get('/api/promises/:id',async c=>c.json(await store.detail(c.req.param('id'))));
 app.post('/api/promises/:id/draft',async c=>{const detail=await store.detail(c.req.param('id'));if(detail.promise.status!=='at_risk')throw new AppError(409,'NO_CONFIRMED_RISK','A draft needs a confirmed dependency risk.');const text=await ai.draft(detail.promise,detail.sources,detail.evidence);if(detail.revision!==await store.revision())throw new AppError(409,'STALE_EVIDENCE','The graph changed during generation. Generate again with current evidence.');return c.json({text,revision:detail.revision,receipt:'Draft generated. Review before saving. Nothing was sent.'});});
 app.post('/api/promises/:id/drafts',async c=>{const input=z.object({text:z.string().trim().min(1).max(12000),revision:z.string().max(30),id:z.string().max(100).optional()}).parse(await c.req.json());return c.json(await store.saveDraft(c.req.param('id'),input.text,input.revision,input.id));});
 app.post('/api/promises/:id/followups',async c=>{const {revision}=z.object({revision:z.string().min(1).max(30)}).parse(await c.req.json());return c.json(await store.createFollowUp(c.req.param('id'),revision),201);});
 app.post('/api/followups/:id/status',async c=>{const {status}=z.object({status:z.enum(['open','done'])}).parse(await c.req.json());return c.json(await store.setFollowUpStatus(c.req.param('id'),status));});
 app.get('/api/memory',async c=>c.json({memories:await store.memory((c.req.query('q')||'').slice(0,300)),revision:await store.revision(),receipt:'Recalled persisted FalkorDB state.'}));
 app.post('/api/memory',async c=>{const input=z.object({memory:z.string().trim().min(1).max(3000),importance:z.enum(['normal','high']).default('normal'),source_id:z.string().max(100).default('')}).parse(await c.req.json());return c.json(await store.recordMemory(input.memory,input.importance,input.source_id),201);});
 // Session-only credential: never returned, logged, written to browser storage, or persisted to disk.
 app.post('/api/settings/deepseek',async c=>{const {key}=z.object({key:z.string().min(12).max(300)}).parse(await c.req.json());await ai.verifyKey(key);return c.json({connected:true,receipt:'DeepSeek connected for this server session.'});});
 app.post('/api/walkthrough',async c=>{
   for(const example of examples){const imported=await store.import(example.source);const candidates=await store.propose(imported.source.id,example.claims);for(const item of candidates)await store.decide(item.id,'approve');}
   return c.json({receipt:'Fictional walkthrough sources and confirmed facts imported into FalkorDB.'});
 });
 app.post('/api/walkthrough/delay',async c=>{const imported=await store.import(delayed);const candidates=await store.propose(imported.source.id,[delayClaim]);for(const item of candidates)await store.decide(item.id,'approve');return c.json({receipt:'Confirmed sample release change persisted. Impact recomputed from graph paths.'});});
 return app;
}
