import {useState} from 'react';
import {Building2,Flag,Layers3,GitBranch,FileCheck2,Search} from 'lucide-react';
import type {Workspace} from '../api';
import {CircuitBoard,type CircuitNodeType} from '../vendor/componentry/circuit-board';
import {Button} from '../vendor/shadcn/button';
import {Input} from '../vendor/shadcn/input';
import {Badge} from '../vendor/shadcn/badge';
import {useBoardWidth,boardBox} from './use-board-width';
const groups=['Customer','Promise','Feature','Task','FollowUp'];
const icons=[Building2,Flag,Layers3,GitBranch,FileCheck2];
const rowHeight=112,firstRow=64;
export function WorkspaceGraph({graph,onSelect}:{graph:Workspace['graph'];onSelect:(id:string)=>void}){
 const [query,setQuery]=useState(''),[selected,setSelected]=useState(''),[board,boardWidth]=useBoardWidth(820);
 const shown=graph.nodes.slice(0,100),counts=new Map<string,number>();
 const columns=Math.max(1,...shown.map(n=>Math.max(0,groups.indexOf(n.group))+1));
 const {edge,step,width,offset}=boardBox(boardWidth,columns,{min:118,max:195});
 const nodes:CircuitNodeType[]=shown.map(n=>{const column=Math.max(0,groups.indexOf(n.group)),row=counts.get(n.group)||0;counts.set(n.group,row+1);const Icon=icons[column];return {id:n.id,x:offset+edge+column*step,y:firstRow+row*rowHeight,label:n.label.length>24?n.label.slice(0,22)+'…':n.label,icon:<Icon size={20}/>,status:n.id===selected?'processing':'active',size:'lg'};});
 const connections=graph.edges.filter(e=>shown.some(n=>n.id===e.source)&&shown.some(n=>n.id===e.target)).map(e=>({from:e.source,to:e.target,animated:e.source===selected||e.target===selected}));
 const node=shown.find(n=>n.id===selected);
 const matches=shown.filter(n=>`${n.label} ${n.group}`.toLowerCase().includes(query.toLowerCase()));
 function inspect(id:string){setSelected(id);}
 return <><label className="search-field graph-search"><Search size={16}/><Input placeholder="Find an entity" aria-label="Search graph entities" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="graph-layout"><div className="circuit-scroll full-graph" ref={board} tabIndex={0} role="region" aria-label="Workspace graph. Scroll to explore connected entities."><CircuitBoard nodes={nodes} connections={connections} width={width} height={Math.max(144,...nodes.map(n=>n.y))+80} gridColor="var(--border-strong)" traceColor="var(--border-strong)" pulseColor="var(--brand-foreground)" nodeColor="var(--muted)" onSelectNode={inspect}/></div><aside className="graph-inspector"><h3>{node?.label||'Explore the graph'}</h3><p>{node?'Direct relationships from FalkorDB.':'Select a node or find it in the list. Every connection comes from confirmed facts.'}</p>{node&&<><Badge variant="outline" className="tag">{node.group}</Badge>{graph.edges.filter(e=>e.source===node.id||e.target===node.id).map((e,i)=><p className="graph-relationship" key={i}>{graph.nodes.find(n=>n.id===e.source)?.label}<strong>{e.label.replaceAll('_',' ')}</strong>{graph.nodes.find(n=>n.id===e.target)?.label}</p>)}<Button className="button" variant="outline" onClick={()=>onSelect(node.id)}>Inspect selected entity</Button></>}<div className="entity-list">{matches.map(n=><Button key={n.id} variant="ghost" className="entity-item" aria-pressed={n.id===selected} onClick={()=>inspect(n.id)}><span>{n.label}</span><small>{n.group}</small></Button>)}{!matches.length&&<p className="empty-small" role="status">No entities match “{query}”. <Button variant="ghost" className="clear-search" onClick={()=>setQuery('')}>Clear search</Button></p>}</div></aside></div></>;
}
