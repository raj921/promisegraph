import {readFile,rename,appendFile,unlink,readdir} from 'node:fs/promises';
import {resolve,dirname,basename,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {config} from 'dotenv';
import {z} from 'zod';

type Options={file?:string;base?:string;token?:string;fetcher?:typeof fetch};
export async function flushMemory(options:Options={}){
 const file=resolve(options.file||process.env.PROMISEGRAPH_QUEUE_FILE||'.memory-queue.jsonl');
 const batch=`${file}.${randomUUID()}.processing`;
 try{await rename(file,batch);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 // Replay immutable batches left behind by a crash. Graph content IDs make duplicate delivery safe.
 let names:string[];
 try{names=await readdir(dirname(file));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {saved:0,retained:0};throw e;}
 const prefix=`${basename(file)}.`;
 const batches=names.filter(name=>name.startsWith(prefix)&&/^[0-9a-f-]{36}\.processing$/.test(name.slice(prefix.length))).sort();
 let saved=0,retained=0;
 for(const name of batches){
  const path=join(dirname(file),name);let text:string;
  try{text=await readFile(path,'utf8');}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')continue;throw e;}
  const failed:string[]=[];
  for(const line of text.split('\n').filter(Boolean)){
   try{
    const item=z.object({memory:z.string().min(1),background:z.string().default(''),importance:z.enum(['normal','high']).default('normal')}).parse(JSON.parse(line));
    const token=options.token??process.env.APP_ACCESS_TOKEN;
    const response=await (options.fetcher||fetch)(`${(options.base||process.env.PROMISEGRAPH_SERVER||'http://127.0.0.1:4174').replace(/\/$/,'')}/api/memory`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({memory:item.memory+(item.background?`\nContext: ${item.background}`:''),importance:item.importance}),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Not acknowledged');
    z.object({id:z.string().min(1)}).parse(await response.json());saved++;
   }catch{failed.push(line);}
  }
  // Append before removing a batch: a crash can cause a safe replay, never loss.
  if(failed.length)await appendFile(file,failed.join('\n')+'\n',{mode:0o600});
  retained+=failed.length;
  try{await unlink(path);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 }
 return {saved,retained};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 config({path:'.env.local',quiet:true});
 const result=await flushMemory();
 console.log(`${result.saved} memory records acknowledged; ${result.retained} retained for retry.`);
 if(result.retained)process.exitCode=1;
}
