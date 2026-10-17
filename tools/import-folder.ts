import {readFileSync,statSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {config} from 'dotenv';
import {parseDocument} from 'yaml';
import {z} from 'zod';
import {ImportSchema} from '../shared/schema';
import {loadState,saveState,getFilesToProcess,markFileAsProcessed,computeFileHash} from './rowboat-source-state';

type Options={base?:string;token?:string;stateDirectory?:string;fetcher?:typeof fetch};
export async function importFolder(folder:string,options:Options={}){
 const root=resolve(folder);
 if(!statSync(root).isDirectory())throw new Error('Choose a source folder.');
 const base=(options.base||process.env.PROMISEGRAPH_SERVER||'http://127.0.0.1:4174').replace(/\/$/,'');
 const destination=createHash('sha256').update(base).digest('hex').slice(0,16);
 const stateDirectory=join(options.stateDirectory||process.env.PROMISEGRAPH_IMPORT_STATE_DIR||'.data','imports',destination);
 const state=loadState(stateDirectory),failures:{file:string;reason:string}[]=[];let saved=0;
 for(const path of getFilesToProcess(root,state)){
  const name=relative(root,path);
  try{
   const stats=statSync(path);if(stats.size>120000)throw new Error('Source exceeds 120 KB.');
   const text=readFileSync(path,'utf8'),hash=createHash('sha256').update(text).digest('hex');
   const header=text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
   const document=header?parseDocument(header[1]):null;
   if(document?.errors.length)throw new Error('Invalid YAML metadata.');
   const metadata:unknown=document?.toJSON();
   const fields=metadata&&typeof metadata==='object'?metadata as Record<string,unknown>:{};
   const input=ImportSchema.parse({title:typeof fields.title==='string'?fields.title:name,kind:'document',text,...(typeof fields.author==='string'?{author:fields.author}:{})});
   const token=options.token??process.env.APP_ACCESS_TOKEN;
   const response=await (options.fetcher||fetch)(`${base}/api/sources`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(input),signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error(`Server rejected the import (${response.status}).`);
   z.object({source:z.object({id:z.string().min(1)})}).parse(await response.json());
   saved++;
   // Checkpoint the acknowledged content, never an edit made during the request.
   if(computeFileHash(path)!==hash)throw new Error('The file changed during import; it will be retried.');
   markFileAsProcessed(path,state,{hash,mtime:stats.mtime.toISOString()});saveState(state,stateDirectory);
  }catch(error){failures.push({file:name,reason:error instanceof Error?error.message:'Import failed.'});}
 }
 return {saved,failures};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 config({path:'.env.local',quiet:true});
 const folder=process.argv[2];if(!folder)throw new Error('Usage: npm run import:folder -- /absolute/path/to/notes');
 const result=await importFolder(folder);
 console.log(`${result.saved} sources acknowledged; ${result.failures.length} require retry.`);
 for(const failure of result.failures)console.error(`${failure.file}: ${failure.reason}`);
 if(result.failures.length)process.exitCode=1;
}
