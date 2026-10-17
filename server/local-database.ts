import {BinaryManager} from 'falkordblite';
import {FalkorDB} from 'falkordb';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import getPort from 'get-port';
import {setTimeout as delay} from 'node:timers/promises';

// Official FalkorDB binaries and driver; loopback TCP avoids macOS sandbox Unix-socket restrictions.
export async function openLocalDatabase(path:string){
 const dir=resolve(path);await mkdir(dir,{recursive:true});
 const native=resolve('.data/native-wheel/redislite/bin');
 const manager=new BinaryManager({
  falkordbModulePath:process.env.FALKORDB_MODULE_PATH||(existsSync(join(native,'falkordb.so'))?join(native,'falkordb.so'):undefined),
  redisServerPath:process.env.FALKORDB_REDIS_PATH||(existsSync(join(native,'redis-server'))?join(native,'redis-server'):undefined),
 });
 const binaries=await manager.ensureBinaries();const port=await getPort({host:'127.0.0.1'});const password=randomBytes(32).toString('hex');
 const child=spawn(binaries.redisServerPath,['-'],{stdio:['pipe','ignore','ignore']});
 let failure:Error|undefined;
 child.on('error',e=>{failure=e;});
 const config=[`bind 127.0.0.1`,`port ${port}`,'protected-mode yes',`requirepass ${password}`,`dir ${JSON.stringify(dir)}`,'appendonly yes','appendfsync always','save 60 1',`loadmodule ${JSON.stringify(binaries.falkordbModulePath)}`,`logfile ${JSON.stringify(join(dir,'server.log'))}`].join('\n');
 child.stdin.on('error',()=>{});child.stdin.end(config+'\n');
 for(let attempt=0;attempt<100;attempt++){
  if(failure)throw failure;
  if(child.exitCode!==null)throw new Error('FalkorDB stopped before readiness. Inspect the local database log.');
  try{
   // FalkorDB forwards Redis socket options; its SocketOptions declaration omits reconnectStrategy.
   const socket={host:'127.0.0.1',port,connectTimeout:250,reconnectStrategy:false as const};
   const db=await FalkorDB.connect({socket,password});
   return {db,close:async()=>{await db.close();if(child.exitCode===null){const closed=new Promise<void>(r=>child.once('exit',()=>r()));child.kill('SIGTERM');await closed;}}};
  }catch{await delay(100);}
 }
 child.kill('SIGTERM');throw new Error('FalkorDB did not become ready within 10 seconds.');
}
