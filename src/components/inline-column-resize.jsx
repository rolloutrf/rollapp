import { useEffect, useRef, useState } from "react";
import { closeHistory } from "@tiptap/pm/history";
import { ScreenPortal } from "@/components/ui/screen-portal";
import { useInlineMenuPortal } from "@/hooks/use-inline-menu-portal";
import { resizeColumnPairTransaction } from "@/lib/inline-column-structure";

export function InlineColumnResize({editor,suspended=false}) {
  const [handles,setHandles]=useState([]),[hovered,setHovered]=useState(null);
  const drag=useRef(null),measured=useRef([]),append=useInlineMenuPortal();
  const valid=value=>!editor.isDestroyed&&editor.isEditable&&!editor.view.composing&&editor.state.doc===value.doc&&value.row.isConnected;
  const restore=value=>value.nodes.forEach(node=>{if(node.isConnected)node.style.flexGrow=node.getAttribute("data-column-width")||"1";});
  const cancel=()=>{const value=drag.current;if(!value)return;drag.current=null;restore(value);if(value.control.hasPointerCapture(value.id))value.control.releasePointerCapture(value.id);};
  const apply=(value,left,right,focus=false)=>{
    if(!valid(value))return false;
    const tr=resizeColumnPairTransaction(editor.state,value.position,value.index,left,right);
    if(!tr)return false;
    if(focus)editor.view.focus();
    if(editor.state.doc!==value.doc||!editor.isEditable||editor.view.composing)return false;
    editor.view.dispatch(closeHistory(tr));editor.view.dispatch(closeHistory(editor.state.tr));return true;
  };
  useEffect(()=>{
    let frame=0,root=null;
    const measure=()=>{
      cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
        if(drag.current&&!valid(drag.current))cancel();
        if(editor.isDestroyed||!editor.isInitialized||!editor.isEditable||editor.view.composing||suspended||innerWidth<768){cancel();setHandles([]);return;}
        const values=[],viewport=window.visualViewport,top=Math.max(viewport?.offsetTop||0,document.querySelector('.global-app-chrome')?.getBoundingClientRect().bottom||0)+8,bottom=(viewport?.offsetTop||0)+(viewport?.height||innerHeight)-8;
        for(const row of editor.view.dom.querySelectorAll('[data-type="columns"]')){
          const nodes=[...row.children].filter(node=>node.matches('[data-type="column"]')),box=row.getBoundingClientRect(),position=editor.view.posAtDOM(row,0)-1;
          const visibleTop=Math.max(box.top,top),visibleBottom=Math.min(box.bottom,bottom);
          if(visibleBottom<=visibleTop)continue;
          nodes.slice(0,-1).forEach((a,index)=>{
            const b=nodes[index+1],ab=a.getBoundingClientRect(),bb=b.getBoundingClientRect();
            values.push({row,nodes,position,index,doc:editor.state.doc,left:Number(a.getAttribute('data-column-width')||1),right:Number(b.getAttribute('data-column-width')||1),x:(ab.right+bb.left)/2-4,y:visibleTop,height:visibleBottom-visibleTop,pixels:ab.width+bb.width});
          });
        }
        measured.current=values;setHandles(values);
      });
    };
    const pointer=event=>{
      if(editor.isDestroyed||!editor.isInitialized)return;
      const value=drag.current;
      if(value){
        if(event.pointerId!==value.id)return;
        if(!valid(value)){cancel();return;}
        const total=value.left+value.right,left=Math.max(total*0.05,Math.min(total*0.95,value.left+(event.clientX-value.startX)/value.pixels*total));
        value.next=[left,total-left];value.nodes[value.index].style.flexGrow=String(left);value.nodes[value.index+1].style.flexGrow=String(total-left);measure();return;
      }
      const row=event.target.closest?.('[data-type="columns"]');
      if(row&&editor.view.dom.contains(row)){
        const target=measured.current.find(value=>value.row===row&&Math.abs(event.clientX-value.x-4)<=8&&event.clientY>=value.y&&event.clientY<=value.y+value.height);
        setHovered(target?`${target.position}:${target.index}`:null);
      }
      else if(!event.target.closest?.('[data-column-separator]'))setHovered(null);
    };
    const up=event=>{const value=drag.current;if(!value||value.id!==event.pointerId)return;const next=value.next;cancel();if(next)apply(value,...next,true);measure();};
    const key=event=>{if(event.key==='Escape'&&drag.current){event.preventDefault();event.stopPropagation();cancel();measure();}};
    const stop=()=>{cancel();measure();};
    const observer=new ResizeObserver(measure);
    const unbind=()=>{cancel();if(root){observer.unobserve(root);root.removeEventListener('compositionstart',stop);root.removeEventListener('compositionend',measure);root=null;}};
    const bind=()=>{unbind();if(editor.isDestroyed)return;root=editor.view.dom;observer.observe(root);root.addEventListener('compositionstart',stop);root.addEventListener('compositionend',measure);measure();};
    editor.on('mount',bind);editor.on('unmount',unbind);editor.on('transaction',measure);bind();
    document.addEventListener('pointermove',pointer);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',stop);document.addEventListener('keydown',key,true);
    window.addEventListener('scroll',measure,true);window.addEventListener('resize',measure);window.addEventListener('blur',stop);window.visualViewport?.addEventListener('resize',measure);window.visualViewport?.addEventListener('scroll',measure);
    return()=>{cancelAnimationFrame(frame);cancel();unbind();observer.disconnect();editor.off('mount',bind);editor.off('unmount',unbind);editor.off('transaction',measure);document.removeEventListener('pointermove',pointer);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',stop);document.removeEventListener('keydown',key,true);window.removeEventListener('scroll',measure,true);window.removeEventListener('resize',measure);window.removeEventListener('blur',stop);window.visualViewport?.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('scroll',measure);};
  },[editor,suspended]);
  return <ScreenPortal container={append()}>{handles.map(value=><div key={`${value.position}:${value.index}`} role="separator" aria-orientation="vertical" aria-label={`Ширина колонки ${value.index+1}`} aria-valuemin={5} aria-valuemax={95} aria-valuenow={Math.round(value.left/(value.left+value.right)*100)} tabIndex={0} data-column-separator={`${value.position}:${value.index}`} data-active={hovered===`${value.position}:${value.index}`||undefined} className="inline-editor__column-separator not-typeset" style={{left:value.x,top:value.y,height:value.height}}
    onPointerDown={event=>{if(event.button!==0||suspended||!valid(value))return;event.preventDefault();drag.current={...value,control:event.currentTarget,id:event.pointerId,startX:event.clientX,next:null};event.currentTarget.setPointerCapture(event.pointerId);}}
    onLostPointerCapture={()=>cancel()}
    onKeyDown={event=>{
      if(event.isComposing||!valid(value))return;
      if((event.metaKey||event.ctrlKey)&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();if(event.key.toLowerCase()==='y'||event.shiftKey)editor.commands.redo();else editor.commands.undo();return;}
      if(event.key==='Escape'){event.preventDefault();editor.view.focus();return;}
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const total=value.left+value.right,step=total*(event.shiftKey?0.1:0.01),left=event.key==='Home'?total*0.05:event.key==='End'?total*0.95:Math.max(total*0.05,Math.min(total*0.95,value.left+(event.key==='ArrowLeft'?-step:step)));apply(value,left,total-left);
    }}/>)}</ScreenPortal>;
}
