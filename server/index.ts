import {config} from 'dotenv';
import {serve} from '@hono/node-server';
import {serveStatic} from '@hono/node-server/serve-static';
import {Store} from './store';
import {DeepSeek} from './deepseek';
import {createApp} from './app';
config({path:'.env.local',quiet:true});
const host=process.env.HOST||'127.0.0.1';
if(!['localhost','127.0.0.1','::1'].includes(host)&&!process.env.APP_ACCESS_TOKEN)throw new Error('Set APP_ACCESS_TOKEN before binding a public interface.');
const store=await Store.open();
try{await store.init();}catch(error){await store.close();throw error;}
// A crashed extraction remains retriable; facts are only committed by explicit review.
await store.query('MATCH(s:Source{status:"extracting"}) SET s.status="extraction_failed",s.error="Server restarted. Retry extraction."');
const app=createApp(store,new DeepSeek(),{token:process.env.APP_ACCESS_TOKEN,origins:process.env.ALLOWED_ORIGINS?.split(',')});
app.all('/api/*',c=>c.json({error:{code:'NOT_FOUND',message:'Unknown API endpoint.'}},404));
app.use('/*',serveStatic({root:'./dist'}));
app.get('/*',serveStatic({path:'./dist/index.html'}));
const server=serve({fetch:app.fetch,hostname:host,port:Number(process.env.PORT||4174)},info=>console.log(`PromiseGraph listening on http://${host}:${info.port} · FalkorDB ${store.mode}`));
let stopping=false;
async function stop(){if(stopping)return;stopping=true;server.close();await store.close();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
