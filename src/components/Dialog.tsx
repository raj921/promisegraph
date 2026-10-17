import {Dialog as Root,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '../vendor/shadcn/dialog';
import {useRef,type ReactNode} from 'react';
export function Dialog({open,onOpenChange,title,description,children,wide=false}:{open:boolean;onOpenChange:(value:boolean)=>void;title:string;description:string;children:ReactNode;wide?:boolean}){
 const returnFocus=useRef<HTMLElement|null>(null);
 return <Root open={open} onOpenChange={onOpenChange}><DialogContent className={`modal ${wide?'modal-wide':''}`} onInteractOutside={e=>e.preventDefault()} onOpenAutoFocus={()=>{returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;}} onCloseAutoFocus={e=>{if(returnFocus.current?.isConnected){e.preventDefault();returnFocus.current.focus();}}}><DialogHeader className="modal-header"><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><div className="modal-body">{children}</div></DialogContent></Root>;
}
