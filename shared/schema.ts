import { z } from 'zod';
const text = z.string().trim().min(1).max(180);
const quote = z.string().min(1).max(3000).refine(value=>value.trim().length>0,'Use a meaningful source excerpt.');
const date = z.iso.date();
export const ClaimSchema = z.discriminatedUnion('kind', [
  z.object({kind:z.literal('promise'),customer:text,title:text,feature:text,owner:text,due:date,quote}),
  z.object({kind:z.literal('dependency'),feature:text,task:text,owner:text,quote}),
  z.object({kind:z.literal('schedule'),task:text,due:date,confirmed:z.boolean(),quote}),
  z.object({kind:z.literal('note'),memory:z.string().trim().min(1).max(2000),importance:z.enum(['normal','high']),quote}),
]);
export const ExtractionSchema=z.object({claims:z.array(ClaimSchema).max(40)});
export const ImportSchema=z.object({title:text,kind:z.enum(['call','ticket','update','note','document']),text:z.string().trim().min(5).max(60000),author:text.optional()});
export type Claim=z.infer<typeof ClaimSchema>;
export type SourceInput=z.infer<typeof ImportSchema>;
export type SourceRecord=SourceInput & {id:string;created_at:string;status:string;error?:string};
export type Candidate={id:string;source_id:string;status:string;claim:Claim};
export type PromiseRecord={id:string;title:string;customer:string;owner:string;due_at:string;feature:string|null;status:'at_risk'|'on_track'|'unverified';tasks:TaskRecord[]};
export type TaskRecord={id:string;title:string;owner:string;due_at:string|null};
export type Evidence={id:string;kind:string;source_id:string;quote:string;payload:string};
export type Draft={id:string;promise_id:string;text:string;revision:string;stale:boolean;status:string;created_at:string};
export type Memory={id:string;memory:string;importance:string;created_at:string;source_id:string};
export type FollowUp={id:string;promise_id:string;title:string;owner:string;revision:string;status:'open'|'done';created_at:string;stale:boolean};

export const normalizeName=(name:string|null|undefined)=>String(name??'').trim().toLocaleLowerCase().replace(/\s+/g,' ');

// A historical assertion remains stored, but must not ground an answer about the current plan.
export function currentEvidence(promise:PromiseRecord,evidence:Evidence[]){
  return evidence.filter(e=>{
    const claim=ClaimSchema.parse(JSON.parse(e.payload));
    if(claim.kind==='promise')return normalizeName(claim.customer)===normalizeName(promise.customer)&&normalizeName(claim.title)===normalizeName(promise.title)&&normalizeName(claim.feature)===normalizeName(promise.feature)&&claim.due===promise.due_at&&normalizeName(claim.owner)===normalizeName(promise.owner);
    if(claim.kind==='dependency')return normalizeName(claim.feature)===normalizeName(promise.feature)&&promise.tasks.some(t=>normalizeName(t.title)===normalizeName(claim.task));
    if(claim.kind==='schedule')return claim.confirmed&&promise.tasks.some(t=>normalizeName(t.title)===normalizeName(claim.task)&&t.due_at===claim.due);
    return false;
  });
}
export class EvidenceError extends Error {}
export function validateEvidence(claim:Claim,source:string){
  if(!source.includes(claim.quote)) throw new EvidenceError('Evidence must be an exact excerpt from this source.');
}
