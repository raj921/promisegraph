import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import App from '../src/App';
import {Sidebar,DesktopSidebar} from '../src/vendor/aceternity/sidebar';

test('the saved theme is applied before the application loads, including when storage is blocked',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const script=html.match(/<script id="theme-init">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script,'A theme bootstrap is present.');
 assert.ok(html.indexOf('id="theme-init"')<html.indexOf('src="/src/main.tsx"'),'The theme is selected before mounting React.');
 for(const saved of ['light','dark',null,'blocked']){
  const root={dataset:{} as Record<string,string>,classList:{toggle:(name:string,on:boolean)=>{dark=on;}}};
  let dark=false,color='';
  runInNewContext(script,{document:{documentElement:root,querySelector:()=>({setAttribute:(_name:string,value:string)=>{color=value;}})},localStorage:{getItem:()=>{if(saved==='blocked')throw new Error('Storage denied');return saved;}}});
  assert.equal(root.dataset.theme,saved==='light'?'light':'dark');
  assert.equal(dark,saved!=='light');
  assert.equal(color,saved==='light'?'#ffffff':'#111111');
 }
});

test('fixed desktop sidebar hover cannot open the mobile drawer',()=>{
 for(const animate of [false,true]){
  const changes:boolean[]=[];
  function Probe(){
   const desktop=DesktopSidebar({}).props.children;
   desktop.props.onMouseEnter?.();
   desktop.props.onMouseLeave?.();
   return null;
  }
  renderToStaticMarkup(createElement(Sidebar,{animate,open:false,setOpen:value=>changes.push(value as boolean),children:createElement(Probe)}));
  assert.deepEqual(changes,animate?[true,false]:[],'Only an animated desktop sidebar should change expansion state on hover.');
 }
});

test('a workspace is only presented as empty after its saved state loads successfully',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>null},configurable:true});
 function render(state:'loading'|'error'|'empty'|'disconnected'|'configured'){
  const client=new QueryClient({defaultOptions:{queries:{retry:false,retryOnMount:false}}});
  client.setQueryData(['health','',''],{database:{connected:true,mode:'embedded'},deepseek:{configured:state==='configured',model:'deepseek-flash'},revision:'0'});
  if(state==='empty'||state==='disconnected'||state==='configured')client.setQueryData(['workspace','',''],{promises:[],sources:[],candidates:[],memory:[],graph:{nodes:[],edges:[]},revision:'0'});
  if(state==='disconnected')client.getQueryCache().find({queryKey:['health','','']})!.setState({status:'error',error:new Error('Temporary connection failure'),fetchStatus:'idle'});
  if(state==='error')client.getQueryCache().build(client,{queryKey:['workspace','','']}).setState({status:'error',error:new Error('Workspace unavailable'),fetchStatus:'idle'});
  try{return renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(App)));}
  finally{client.clear();}
 }
 try{
  const loading=render('loading');
  assert.ok(loading.includes('Loading your saved workspace'),'Loading feedback is visible.');
  assert.ok(!loading.includes('Your first promise starts here'),'An unresolved request must not claim that saved work is absent.');
  const failed=render('error');
  assert.ok(failed.includes('Your workspace could not load')&&failed.includes('Retry loading'),'A failed request has a recovery action.');
  assert.ok(!failed.includes('Your first promise starts here'),'A failed request must not claim that saved work is absent.');
  const empty=render('empty');
  assert.ok(empty.includes('Your first promise starts here')&&empty.includes('/assets/connected-evidence.png'),'A successfully loaded empty workspace offers the first-use screen.');
  const disconnected=render('disconnected');
  assert.ok(disconnected.includes('Your first promise starts here'),'A failed background health check must not unmount the loaded workspace.');
  assert.ok(disconnected.includes('Retry connection'),'A failed background check provides an explicit recovery action.');
  assert.ok(render('configured').includes('DeepSeek key configured'),'A configured key must not be presented as proof of successful live generation.');
  Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>{throw new Error('Storage denied');}},configurable:true});
  assert.ok(render('empty').includes('Your first promise starts here'),'Blocked browser storage must not blank the application.');
 }finally{
  if(original)Object.defineProperty(globalThis,'localStorage',original);
  else Reflect.deleteProperty(globalThis,'localStorage');
 }
});
