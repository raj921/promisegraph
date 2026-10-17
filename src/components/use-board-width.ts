import {useEffect,useRef,useState} from 'react';
/** Half a node caption's width, so a node's caption never falls outside the board. */
export const captionEdge=(boardWidth:number)=>boardWidth<560?64:96;
/**
 * CircuitBoard positions nodes at absolute pixel coordinates, so a board whose
 * declared width merely matches its container clips every node past that width
 * instead of letting the container scroll. Size the board to the content it
 * really has, and keep the first and last caption clear of the board's edges.
 */
export function boardBox(available:number,columns:number,range:{min:number;max:number}){
  const edge=captionEdge(available);
  const step=columns>1?Math.min(range.max,Math.max(range.min,(available-edge*2)/(columns-1))):0;
  const content=edge*2+(columns-1)*step;
  const width=Math.max(available,content);
  return {edge,step,width,offset:Math.max(0,(width-content)/2)};
}
/**
 * Lays a board out to the width its container really has.
 */
export function useBoardWidth(fallback:number){
  const ref=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(fallback);
  useEffect(()=>{
    const element=ref.current;if(!element)return;
    const measure=()=>{
      const next=Math.max(260,Math.round(element.getBoundingClientRect().width)-4);
      setWidth(current=>current===next?current:next);
    };
    measure();
    if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(measure);observer.observe(element);
    return()=>observer.disconnect();
  },[]);
  return [ref,width] as const;
}
