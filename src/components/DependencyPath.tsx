import {Building2,Flag,Layers3,GitBranch,UserRound} from 'lucide-react';
import type {PromiseRecord} from '../../shared/schema';
import {CircuitBoard,type CircuitNodeType} from '../vendor/componentry/circuit-board';
import {Button} from '../vendor/shadcn/button';
import {useBoardWidth,boardBox} from './use-board-width';
const rowHeight=104,firstRow=76,pathWidth=640;
export function DependencyPath({promise,onInspect}:{promise:PromiseRecord;onInspect:(kind:string,label:string)=>void}){
 const [board,boardWidth]=useBoardWidth(pathWidth);
 const columns=promise.feature?3:2;
 const {edge,step,width,offset}=boardBox(boardWidth,columns,{min:112,max:190});
 const facts=[{id:'customer',kind:'Customer',label:promise.customer,subtitle:promise.owner,icon:Building2,risk:false},{id:'promise',kind:'Promise',label:promise.title,subtitle:`Promised ${promise.due_at}`,icon:Flag,risk:promise.status==='at_risk'},...(promise.feature?[{id:'feature',kind:'Feature',label:promise.feature,subtitle:'Confirmed dependency',icon:Layers3,risk:false}]:[]),...promise.tasks.map(t=>({id:t.id,kind:'Task',label:t.title,subtitle:t.due_at?`Scheduled ${t.due_at}`:'Schedule not confirmed',icon:GitBranch,risk:Boolean(t.due_at&&t.due_at>promise.due_at)}))];
 const leadRow=promise.feature?2:1;
 const nodes:CircuitNodeType[]=facts.map((f,i)=>({id:f.id,x:offset+edge+(i<=leadRow?i:leadRow)*step,y:i<=leadRow?firstRow:firstRow+(i-leadRow)*rowHeight,label:f.kind,icon:<f.icon size={20}/>,size:'lg',status:f.risk?'error':'active'}));
 const connections=[{from:'customer',to:'promise'},...(promise.feature?[{from:'promise',to:'feature'},...promise.tasks.map(t=>({from:'feature',to:t.id}))]:[])];
 const height=Math.max(160,...nodes.map(n=>n.y))+80;
 return <section className="path-canvas" aria-label="Commitment dependency graph"><div className="circuit-scroll" ref={board}><CircuitBoard nodes={nodes} connections={connections} width={width} height={height} gridColor="var(--border-strong)" traceColor="var(--border-strong)" pulseColor="var(--brand-foreground)" nodeColor="var(--muted)" onSelectNode={id=>{const f=facts.find(f=>f.id===id);if(f)onInspect(f.kind,f.label);}}/></div><div className="fact-list">{facts.map(f=><Button variant="ghost" className={`fact-detail ${f.risk?'fact-risk':''}`} key={f.id} onClick={()=>onInspect(f.kind,f.label)}><f.icon size={16}/><span><small>{f.kind}</small><strong>{f.label}</strong><small>{f.subtitle}</small></span></Button>)}</div><p className="graph-caption"><UserRound size={13}/>{promise.owner} · Select a fact to inspect its source</p></section>;
}

