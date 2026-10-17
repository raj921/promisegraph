import type {Candidate,Draft,Evidence,Memory,PromiseRecord,SourceRecord,FollowUp} from '../shared/schema';
import {z} from 'zod';
const HealthSchema=z.object({database:z.object({connected:z.boolean(),engine:z.string(),mode:z.string()}),deepseek:z.object({configured:z.boolean(),model:z.string()}),revision:z.string(),scope:z.string()});
const ErrorSchema=z.object({error:z.object({message:z.string().optional(),code:z.string().optional(),details:z.array(z.object({field:z.string(),message:z.string()})).optional()})});
export type Health=z.infer<typeof HealthSchema>;
export type Workspace={promises:PromiseRecord[];sources:SourceRecord[];candidates:Candidate[];memory:Memory[];graph:{nodes:{id:string;label:string;group:string}[];edges:{source:string;target:string;label:string}[]};revision:string};
export type Detail={promise:PromiseRecord;evidence:Evidence[];sources:SourceRecord[];drafts:Draft[];followups:FollowUp[];revision:string};
export class ApiError extends Error{constructor(message:string,readonly code:string,readonly details?:{field:string;message:string}[]){super(message);}}
export async function api<T>(base:string,token:string,path:string,body?:unknown):Promise<T>{
 let response:Response;try{response=await fetch(`${base.replace(/\/$/,'')}/api${path}`,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(100000)});}catch{throw new ApiError('Cannot reach the workspace server. Check its address in Settings.','CONNECTION_FAILED');}
 let value:unknown;try{value=await response.json();}catch{throw new ApiError('This address does not serve the PromiseGraph API. Connect your running workspace server.','API_NOT_FOUND');}
 if(!response.ok){const parsed=ErrorSchema.safeParse(value),error=parsed.success?parsed.data.error:undefined;throw new ApiError(error?.message||'The request failed.',error?.code||'REQUEST_FAILED',error?.details);}
 if(value===null||typeof value!=='object'||Array.isArray(value)||(path==='/health'&&!HealthSchema.safeParse(value).success))throw new ApiError('This address does not serve the PromiseGraph API. Connect your running workspace server.','API_NOT_FOUND');
 return value as T;
}
