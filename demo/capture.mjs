// Records only the real application. Use a fresh, isolated DATA_DIR per take.
// npm install in demo/, then DEMO_URL=http://127.0.0.1:4175 node capture.mjs
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright-core');
const scale=Number(process.env.DEMO_SCALE||1);
const output=resolve(process.env.DEMO_OUTPUT||`../.data/demo/${scale===2?'4k':'1080p'}`);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--force-color-profile=srgb','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:scale});
const page=await context.newPage();
const beats=[];let started=0;const frames=[];const pending=[];
const mark=(name)=>{const beat={name,seconds:(performance.now()-started)/1000};beats.push(beat);console.log(JSON.stringify(beat));};
async function glide(locator){await locator.scrollIntoViewIfNeeded();const b=await locator.boundingBox();if(!b)throw new Error('Target invisible');await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:32});await page.waitForTimeout(280);}
async function click(locator){await glide(locator);await locator.click();await page.waitForTimeout(500);}
try{
 await page.goto(process.env.DEMO_URL||'http://127.0.0.1:4175');
 await page.getByRole('button',{name:'Import source',exact:true}).waitFor();
 await page.evaluate(()=>{
  // Recording instrumentation: a visible cursor only. No UI content is changed.
  const cursor=document.createElement('div');cursor.id='demo-cursor';
  cursor.innerHTML='<svg width="30" height="36" viewBox="0 0 30 36"><path d="M3 2v27l7-7 6 12 5-3-6-11h11Z" fill="white" stroke="#111" stroke-width="2"/></svg>';
  cursor.style.cssText='position:fixed;left:1050px;top:700px;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 2px 3px #0006)';
  document.body.append(cursor);document.addEventListener('mousemove',e=>{cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px';});
 });
 if(process.argv.includes('--inspect')){await page.screenshot({path:resolve(output,'inspection.png')});console.log(await page.locator('body').innerText());}
 else{
  const cdp=await context.newCDPSession(page);await cdp.send('Page.enable');
  cdp.on('Page.screencastFrame',event=>{
   const i=frames.length;const filename=`frame-${String(i).padStart(6,'0')}.jpg`;
   frames.push({file:filename,timestamp:event.metadata.timestamp});
   pending.push(writeFile(resolve(output,filename),Buffer.from(event.data,'base64')));
   void cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});
  });
  started=performance.now();await cdp.send('Page.startScreencast',{format:'jpeg',quality:95,maxWidth:1920*scale,maxHeight:1080*scale,everyNthFrame:1});
  mark('source-open');await click(page.getByRole('button',{name:'Import source',exact:true}));
  await page.getByLabel('Source title',{exact:true}).fill('Lumen · customer commitment (fictional demo)');
  await page.getByLabel('Author',{exact:true}).fill('Mira');
  await page.getByLabel('Original text',{exact:true}).fill('Mira promised Lumen PDF reports by 2026-11-04. PDF reports requires Report builder. Report builder depends on the Renderer release task, owned by Dev. Confirmed: Renderer release is scheduled for 2026-11-06.');
  await page.waitForTimeout(1600);mark('source-ready');
  await click(page.getByRole('button',{name:'Save original source',exact:true}));mark('real-extraction-requested');
  await page.getByRole('status').filter({hasText:'Extracting facts'}).waitFor({state:'hidden',timeout:120000});
  await click(page.getByRole('tab',{name:/Review facts/}));
  await page.getByRole('button',{name:'Confirm fact',exact:true}).first().waitFor({timeout:120000});
  mark('real-proposals-visible');await page.waitForTimeout(2000);
  while(await page.getByRole('button',{name:'Confirm fact',exact:true}).count()){
   await click(page.getByRole('button',{name:'Confirm fact',exact:true}).first());
   await page.waitForTimeout(700);
  }
  mark('human-review-complete');await click(page.getByText('Commitment inbox',{exact:true}));
  await page.getByRole('button',{name:'Prepare draft',exact:true}).waitFor();
  await page.waitForTimeout(2000);mark('risk-path-visible');
  await click(page.getByRole('button',{name:'Prepare draft',exact:true}));mark('real-draft-requested');
  await page.getByRole('heading',{name:'Review the follow-up',exact:true}).waitFor({timeout:120000});
  mark('real-draft-visible');await page.waitForTimeout(2600);
  await click(page.getByRole('button',{name:'Save reviewed draft',exact:true}));mark('reviewed-draft-saved');
  await click(page.getByText('Connected graph',{exact:true}));await page.waitForTimeout(2000);mark('graph-visible');
  await page.reload();await page.getByRole('button',{name:'Prepare draft',exact:true}).waitFor();
  mark('reload-recall-visible');await page.waitForTimeout(1400);
  await cdp.send('Page.stopScreencast');await Promise.all(pending);
  const duration=(performance.now()-started)/1000;
  await writeFile(resolve(output,'capture.json'),JSON.stringify({url:process.env.DEMO_URL,viewport:{width:1920,height:1080},scale,outputPixels:{width:1920*scale,height:1080*scale},duration,frames:frames.length,averageDeliveredFps:frames.length/duration,beats,frameTimestamps:frames},null,2));
  const lines=['ffconcat version 1.0'];for(let i=0;i<frames.length;i++){lines.push(`file '${frames[i].file}'`,`duration ${Math.max(1/120,frames[i+1]?frames[i+1].timestamp-frames[i].timestamp:1/60).toFixed(6)}`);}if(frames.length)lines.push(`file '${frames.at(-1).file}'`);
  await writeFile(resolve(output,'frames.ffconcat'),lines.join('\n')+'\n');
  console.log(`Recorded ${frames.length} compositor frames in ${duration.toFixed(1)}s. Delivered rate is measured, not assumed to be 60fps.`);
  // Encode the unedited recording as a usable source asset. No UI redraws,
  // captions, music, compositing, time compression or editorial cuts here.
  await run(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',resolve(output,'frames.ffconcat'),'-vf','fps=60','-c:v','libx264','-crf','16','-preset','medium','-pix_fmt','yuv420p','-an','-movflags','+faststart',resolve(output,'real-app-source.mp4')],{maxBuffer:4*1024*1024});
  const {stdout}=await run(process.env.FFPROBE_PATH||'ffprobe',['-v','error','-show_streams','-show_format','-of','json',resolve(output,'real-app-source.mp4')]);
  await writeFile(resolve(output,'media-probe.json'),stdout);
  console.log(`Unedited source movie: ${resolve(output,'real-app-source.mp4')}`);
 }
}catch(error){await page.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});console.error(await page.locator('body').innerText().catch(()=>''));throw error;}
finally{await browser.close();}
