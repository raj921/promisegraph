// Local user-run capture driver. Each take uses its own isolated real graph.
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import getPort from 'get-port';
const demo=dirname(fileURLToPath(import.meta.url)),app=resolve(demo,'..');
const output=resolve(app,'.data/demo',new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(output,{recursive:true});
const children=new Set();let stopping=false;
function cleanup(){for(const child of children)child.kill('SIGTERM');}
process.on('SIGINT',()=>{stopping=true;cleanup();});process.on('SIGTERM',()=>{stopping=true;cleanup();});
async function capture(scale){
 const port=await getPort({host:'127.0.0.1'}),name=scale===2?'4k':'1080p';
 const take=resolve(output,name);await mkdir(take,{recursive:true});
 const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:app,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:resolve(take,'graph'),FALKORDB_HOST:'',APP_ACCESS_TOKEN:'',ALLOWED_ORIGINS:`http://127.0.0.1:${port}`},stdio:'inherit'});children.add(server);
 try{
  const url=`http://127.0.0.1:${port}`;let ready=false;
  for(let attempt=0;attempt<120;attempt++){
   if(stopping)throw new Error('Recording cancelled.');
   if(server.exitCode!==null||server.signalCode)throw new Error('The isolated application server stopped.');
   try{const response=await fetch(`${url}/api/health`,{signal:AbortSignal.timeout(1000)});if(response.ok){const state=await response.json();if(!state.deepseek?.configured)throw new Error('AI_KEY_MISSING');ready=true;break;}}catch(error){if(error.message==='AI_KEY_MISSING')throw new Error('Configure DeepSeek in the ignored server environment file before recording.');}
   await new Promise(r=>setTimeout(r,500));
  }
  if(!ready)throw new Error('The isolated application did not become ready.');
  console.log(`Recording ${name} against the real isolated app. Model waiting time remains in the raw footage.`);
  const child=spawn(process.execPath,['capture.mjs'],{cwd:demo,env:{...process.env,DEMO_URL:url,DEMO_SCALE:String(scale),DEMO_OUTPUT:take},stdio:'inherit'});children.add(child);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});children.delete(child);
  if(code!==0)throw new Error(`${name} capture did not finish. No successful video is claimed.`);
 }finally{server.kill('SIGTERM');children.delete(server);}
}
try{for(const scale of [1,2])await capture(scale);await writeFile(resolve(output,'READY.txt'),'Unedited real app recordings are ready. Inspect frames and capture.json before editing. No narration or final 24-second cut exists yet.\n');console.log(`Both source recordings saved in ${output}`);}
finally{cleanup();}
