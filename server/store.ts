import {createHash,randomUUID} from 'node:crypto';
import {FalkorDB as RemoteDB} from 'falkordb';
import type {Graph} from 'falkordb';
import pLimit from 'p-limit';
import {openLocalDatabase} from './local-database';
import {AppError} from './errors';
import {currentEvidence,validateEvidence,type Claim,type SourceInput,type SourceRecord,type Candidate,type PromiseRecord,type Evidence,type Draft,type Memory,type FollowUp} from '../shared/schema';

export const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
export const entityId=(kind:string,...names:string[])=>`${kind}_${hash(names.map(s=>s.trim().toLocaleLowerCase().replace(/\s+/g,' ')).join('|')).slice(0,24)}`;
const serial=pLimit(1);
export class Store {
  constructor(readonly graph:Graph,private closeDb:()=>Promise<void>,readonly mode:string){}
  static async open(path=process.env.DATA_DIR||'.data/falkordb',graphName='promisegraph'){
    if(process.env.FALKORDB_HOST){
      const db=await RemoteDB.connect({socket:{host:process.env.FALKORDB_HOST,port:Number(process.env.FALKORDB_PORT||6379),...(process.env.FALKORDB_TLS==='true'?{tls:true}: {})},password:process.env.FALKORDB_PASSWORD,username:process.env.FALKORDB_USERNAME||'default'});
      return new Store(db.selectGraph(graphName),()=>db.close(),'remote');
    }
    return this.openLocal(path,graphName);
  }
  static async openLocal(path:string,graphName='promisegraph'){
    const local=await openLocalDatabase(path);return new Store(local.db.selectGraph(graphName),local.close,'embedded');
  }
  async close(){await this.closeDb();}
  async query<T>(query:string,params:Record<string,unknown>={}){
    // All external values pass through the official driver's parameter serializer.
    const result=await this.graph.query<T>(query,{params:params as never,TIMEOUT:10000});return result.data||[];
  }
  async init(){
    for(const label of ['Source','Claim','Promise','Customer','Feature','Task','Memory','Draft','Event','FollowUp']){
      try{await this.graph.createNodeRangeIndex(label,'id');}catch(e){if(!String(e).toLowerCase().includes('already indexed')&&!String(e).toLowerCase().includes('already exists'))throw e;}
    }
    await this.query("MERGE (w:Workspace {id:'main'}) ON CREATE SET w.revision=0 RETURN w.revision");
  }
  async revision(){return String((await this.query<{revision:number}>("MATCH(w:Workspace{id:'main'}) RETURN w.revision AS revision"))[0]?.revision||0);}
  async bump(){await this.query("MATCH(w:Workspace{id:'main'}) SET w.revision=w.revision+1");}
  async sources(){return this.query<SourceRecord>('MATCH(s:Source) RETURN s.id AS id,s.title AS title,s.kind AS kind,s.text AS text,s.author AS author,s.created_at AS created_at,s.status AS status,s.error AS error ORDER BY s.created_at DESC LIMIT 500');}
  async source(id:string){const s=(await this.query<SourceRecord>('MATCH(s:Source{id:$id}) RETURN s.id AS id,s.title AS title,s.kind AS kind,s.text AS text,s.author AS author,s.created_at AS created_at,s.status AS status,s.error AS error',{id}))[0];if(!s)throw new AppError(404,'SOURCE_NOT_FOUND','This source does not exist.');return s;}
  async import(input:SourceInput){return serial(async()=>{
    const id=`src_${hash(JSON.stringify([input.kind,input.title,input.text])).slice(0,32)}`;
    const existing=await this.query<{id:string}>('MATCH(s:Source{id:$id}) RETURN s.id AS id',{id});
    if(existing.length)return {source:await this.source(id),duplicate:true};
    const source={...input,author:input.author||'You',id,created_at:new Date().toISOString(),status:'saved'};
    await this.query('CREATE(s:Source{id:$id,title:$title,kind:$kind,text:$text,author:$author,created_at:$created_at,status:$status})',source);
    return {source,duplicate:false};
  });}
  async setSourceStatus(id:string,status:string,error=''){await this.query('MATCH(s:Source{id:$id}) SET s.status=$status,s.error=$error',{id,status,error});}
  async beginExtraction(id:string){return serial(async()=>{
    const source=await this.source(id);
    if(source.status==='extracting')throw new AppError(409,'EXTRACTION_RUNNING','This source is already being processed.');
    if((await this.candidates(id)).length)throw new AppError(409,'ALREADY_EXTRACTED','This source already has proposed facts. Review those first.');
    await this.setSourceStatus(id,'extracting');
    return source;
  });}
  async propose(sourceId:string,claims:Claim[]){return serial(async()=>{
    const source=await this.source(sourceId);for(const claim of claims)validateEvidence(claim,source.text);
    const rows=claims.map(claim=>({id:`cl_${hash(sourceId+JSON.stringify(claim)).slice(0,32)}`,kind:claim.kind,payload:JSON.stringify(claim),quote:claim.quote}));
    if(rows.length)await this.query('MATCH(s:Source{id:$sourceId}) UNWIND $rows AS row MERGE(c:Claim{id:row.id}) ON CREATE SET c.kind=row.kind,c.payload=row.payload,c.quote=row.quote,c.status="pending",c.source_id=$sourceId MERGE(s)-[:HAS_CLAIM]->(c)',{sourceId,rows});
    await this.setSourceStatus(sourceId,rows.length?'needs_review':'no_facts');
    return this.candidates(sourceId);
  });}
  async candidates(sourceId?:string){
    const rows=await this.query<{id:string;source_id:string;status:string;payload:string}>(`MATCH(c:Claim) WHERE ${sourceId?'c.source_id=$sourceId':'c.status="pending"'} RETURN c.id AS id,c.source_id AS source_id,c.status AS status,c.payload AS payload ORDER BY c.id LIMIT 1000`,sourceId?{sourceId}:{});
    return rows.map(r=>({...r,claim:JSON.parse(r.payload) as Claim}));
  }
  async decide(id:string,decision:'approve'|'reject',replacement?:Claim){return serial(async()=>{
    const row=(await this.query<{source_id:string;status:string;payload:string}>('MATCH(c:Claim{id:$id}) RETURN c.source_id AS source_id,c.status AS status,c.payload AS payload',{id}))[0];
    if(!row)throw new AppError(404,'CLAIM_NOT_FOUND','This proposed fact does not exist.');
    if(row.status!=='pending')return {id,status:row.status,duplicate:true};
    const source=await this.source(row.source_id);const claim=replacement||JSON.parse(row.payload) as Claim;validateEvidence(claim,source.text);
    if(decision==='approve'&&claim.kind==='schedule'&&!claim.confirmed)throw new AppError(409,'TENTATIVE_DATE','This date is tentative. Keep it pending until a source explicitly confirms it.');
    const common={id,sourceId:source.id,payload:JSON.stringify(claim),quote:claim.quote,now:new Date().toISOString()};
    if(decision==='reject')await this.query('MATCH(c:Claim{id:$id}) SET c.status="rejected"',common);
    else{
      const prefix='MATCH(c:Claim{id:$id}),(s:Source{id:$sourceId}) ';
      const suffix=' SET c.status="approved",c.kind=$kind,c.payload=$payload,c.quote=$quote,c.approved_at=$now MERGE(c)-[:SUPPORTED_BY]->(s) WITH c MATCH(w:Workspace{id:"main"}) SET w.revision=w.revision+1';
      switch(claim.kind){
        case 'promise': await this.query(prefix+'MERGE(customer:Customer{id:$customerId}) SET customer.name=$customer MERGE(p:Promise{id:$promiseId}) SET p.title=$title,p.customer=$customer,p.owner=$owner,p.due_at=$due MERGE(f:Feature{id:$featureId}) SET f.name=$feature MERGE(customer)-[:WAS_PROMISED]->(p) WITH c,s,p,f,customer OPTIONAL MATCH(p)-[old:REQUIRES]->() DELETE old WITH c,s,p,f,customer MERGE(p)-[r:REQUIRES{claim_id:$id}]->(f) MERGE(p)-[:SUPPORTED_BY{claim_id:$id}]->(s)'+suffix,{...common,...claim,customerId:entityId('customer',claim.customer),promiseId:entityId('promise',claim.customer,claim.title),featureId:entityId('feature',claim.feature)});break;
        case 'dependency': await this.query(prefix+'MERGE(f:Feature{id:$featureId}) SET f.name=$feature MERGE(t:Task{id:$taskId}) SET t.name=$task,t.owner=$owner MERGE(f)-[:DEPENDS_ON{claim_id:$id}]->(t) MERGE(f)-[:SUPPORTED_BY{claim_id:$id}]->(s) MERGE(t)-[:SUPPORTED_BY{claim_id:$id}]->(s)'+suffix,{...common,...claim,featureId:entityId('feature',claim.feature),taskId:entityId('task',claim.task)});break;
        case 'schedule': await this.query(prefix+'MERGE(t:Task{id:$taskId}) SET t.name=$task MERGE(e:Event{id:$id}) SET e.kind="schedule",e.old_date=t.due_at,e.new_date=$due,e.created_at=$now,e.source_id=$sourceId SET t.due_at=$due MERGE(t)-[:HAS_EVENT]->(e) MERGE(e)-[:SUPPORTED_BY]->(s) MERGE(t)-[:SUPPORTED_BY{claim_id:$id}]->(s)'+suffix,{...common,...claim,taskId:entityId('task',claim.task)});break;
        case 'note':await this.query(prefix+'MERGE(m:Memory{id:$id}) SET m.memory=$memory,m.importance=$importance,m.created_at=$now,m.source_id=$sourceId MERGE(m)-[:SUPPORTED_BY]->(s)'+suffix,{...common,...claim});break;
      }
    }
    const pending=await this.query<{n:number}>('MATCH(c:Claim{source_id:$sourceId,status:"pending"}) RETURN count(c) AS n',{sourceId:source.id});
    if(!pending[0]?.n)await this.setSourceStatus(source.id,'reviewed');
    return {id,status:decision==='approve'?'approved':'rejected',duplicate:false};
  });}
  async promises(){return this.query<PromiseRecord>(`MATCH(p:Promise) OPTIONAL MATCH(p)-[:REQUIRES]->(f:Feature) OPTIONAL MATCH(f)-[:DEPENDS_ON]->(t:Task)
    WITH p,collect(DISTINCT f.name) AS features,collect(DISTINCT t) AS tasks
    RETURN p.id AS id,p.title AS title,p.customer AS customer,p.owner AS owner,p.due_at AS due_at,features[0] AS feature,
    CASE WHEN any(t IN tasks WHERE t.due_at>p.due_at) THEN 'at_risk' WHEN size(tasks)=0 OR any(t IN tasks WHERE t.due_at IS NULL) THEN 'unverified' ELSE 'on_track' END AS status,
    [t IN tasks | {id:t.id,title:t.name,owner:coalesce(t.owner,'Unassigned'),due_at:t.due_at}] AS tasks ORDER BY p.due_at LIMIT 500`);}
  async detail(id:string){
    const revision=await this.revision();
    const promise=(await this.promises()).find(p=>p.id===id);if(!promise)throw new AppError(404,'PROMISE_NOT_FOUND','This commitment does not exist.');
    const evidence=await this.query<Evidence>(`MATCH(p:Promise{id:$id})-[:REQUIRES|DEPENDS_ON*0..2]->(n)-[:SUPPORTED_BY]->(s:Source)
      WITH DISTINCT s MATCH(s)-[:HAS_CLAIM]->(c:Claim{status:'approved'}) RETURN DISTINCT c.id AS id,c.kind AS kind,c.source_id AS source_id,c.quote AS quote,c.payload AS payload`,{id});
    // Evidence is scoped again by entity identity; another claim in a shared document is not automatically relevant.
    const relevant=currentEvidence(promise,evidence);
    const ids=[...new Set(relevant.map(e=>e.source_id))];const sources=await Promise.all(ids.map(s=>this.source(s)));
    const drafts=await this.query<Omit<Draft,'stale'>>('MATCH(d:Draft{promise_id:$id}) RETURN d.id AS id,d.promise_id AS promise_id,d.text AS text,d.revision AS revision,d.status AS status,d.created_at AS created_at ORDER BY d.created_at DESC',{id});
    const followups=await this.query<Omit<FollowUp,'stale'>>('MATCH(f:FollowUp{promise_id:$id}) RETURN f.id AS id,f.promise_id AS promise_id,f.title AS title,f.owner AS owner,f.revision AS revision,f.status AS status,f.created_at AS created_at ORDER BY f.created_at DESC',{id});
    // A revision read only at the end could give old evidence a current revision.
    if(revision!==await this.revision())throw new AppError(409,'STALE_EVIDENCE','The graph changed while evidence was loading. Refresh the commitment and try again.');
    return {promise,evidence:relevant,sources,drafts:drafts.map(d=>({...d,stale:d.revision!==revision})),followups:followups.map(f=>({...f,stale:f.revision!==revision})),revision};
  }
  async saveDraft(promiseId:string,text:string,revision:string,draftId?:string){return serial(async()=>{
    if(revision!==await this.revision())throw new AppError(409,'STALE_EVIDENCE','The graph changed while you were reviewing. Refresh the evidence and draft again.');
    const detail=await this.detail(promiseId);
    if(detail.revision!==revision)throw new AppError(409,'STALE_EVIDENCE','The graph changed while you were reviewing. Refresh the evidence and draft again.');
    const id=draftId||`draft_${randomUUID()}`;
    if(draftId){const existing=await this.query<{promise_id:string}>('MATCH(d:Draft{id:$id}) RETURN d.promise_id AS promise_id',{id});if(!existing.length||existing[0].promise_id!==promiseId)throw new AppError(404,'DRAFT_NOT_FOUND','This draft does not belong to this commitment.');}
    await this.query('MERGE(d:Draft{id:$id}) ON CREATE SET d.created_at=$now SET d.promise_id=$promiseId,d.text=$text,d.revision=$revision,d.status="reviewed"',{id,promiseId,text,revision,now:new Date().toISOString()});
    return {id,receipt:'Draft saved. Nothing was sent.'};
  });}
  async createFollowUp(promiseId:string,revision:string){return serial(async()=>{
    if(revision!==await this.revision())throw new AppError(409,'STALE_EVIDENCE','The graph changed. Refresh the commitment before creating a follow-up.');
    const {promise,revision:currentRevision}=await this.detail(promiseId);
    if(currentRevision!==revision)throw new AppError(409,'STALE_EVIDENCE','The graph changed. Refresh the commitment before creating a follow-up.');
    if(promise.status!=='at_risk')throw new AppError(409,'NO_CONFIRMED_RISK','A follow-up needs a confirmed dependency risk.');
    const id=entityId('followup',promiseId,revision),title=`Confirm revised delivery date for ${promise.customer}: ${promise.title}`;
    await this.query('MATCH(p:Promise{id:$promiseId}) MERGE(f:FollowUp{id:$id}) ON CREATE SET f.promise_id=$promiseId,f.title=$title,f.owner=$owner,f.revision=$revision,f.status="open",f.created_at=$now MERGE(f)-[:FOLLOWS_UP]->(p)',{id,promiseId,title,owner:promise.owner,revision,now:new Date().toISOString()});
    return {id,receipt:'Follow-up task saved in FalkorDB. Nothing was sent.'};
  });}
  async setFollowUpStatus(id:string,status:'open'|'done'){return serial(async()=>{
    const found=await this.query<{title:string}>('MATCH(f:FollowUp{id:$id}) SET f.status=$status RETURN f.title AS title',{id,status});
    if(!found.length)throw new AppError(404,'FOLLOWUP_NOT_FOUND','This follow-up task does not exist.');
    return {id,status,receipt:status==='done'?'Follow-up marked complete.':'Follow-up reopened.'};
  });}
  async memory(search=''){
    return this.query<Memory>('MATCH(m:Memory) WHERE toLower(m.memory) CONTAINS toLower($search) RETURN m.id AS id,m.memory AS memory,m.importance AS importance,m.created_at AS created_at,m.source_id AS source_id ORDER BY m.created_at DESC LIMIT 100',{search});
  }
  async recordMemory(memory:string,importance='normal',sourceId=''){
    const id=`mem_${hash(memory+sourceId).slice(0,32)}`;
    await this.query('MERGE(m:Memory{id:$id}) ON CREATE SET m.memory=$memory,m.importance=$importance,m.source_id=$sourceId,m.created_at=$now',{id,memory,importance,sourceId,now:new Date().toISOString()});return {id,receipt:'Memory persisted in FalkorDB.'};
  }
  async graphData(){
    const nodes=await this.query<{id:string;label:string;group:string}>("MATCH(n) WHERE n:Promise OR n:Customer OR n:Feature OR n:Task OR n:FollowUp RETURN n.id AS id,coalesce(n.name,n.title) AS label,labels(n)[0] AS group LIMIT 500");
    const edges=await this.query<{source:string;target:string;label:string}>("MATCH(a)-[r]->(b) WHERE type(r) IN ['WAS_PROMISED','REQUIRES','DEPENDS_ON','FOLLOWS_UP'] RETURN DISTINCT a.id AS source,b.id AS target,type(r) AS label LIMIT 1000");return {nodes,edges};
  }
}
