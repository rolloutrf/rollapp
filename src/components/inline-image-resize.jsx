import { AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ControlBar } from "@/components/control-bar";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { useVisualViewportBoundary } from "@/hooks/use-visual-viewport";
import { commitInlineImageAlignment } from "@/lib/inline-image-alignment";
import { imageAlignmentActionLeft } from "@/lib/inline-image-controls";
import { useEffect, useId, useRef, useState } from "react";
import { NodeSelection } from "@tiptap/pm/state";
import { ScreenPortal } from "@/components/ui/screen-portal";
import { useInlineMenuPortal } from "@/hooks/use-inline-menu-portal";
import { measureVisualViewport } from "@/hooks/use-visual-viewport";
import { commitInlineImageResize, imageResizeDimensions } from "@/lib/inline-image-resize";

const endpoint = doc => {
  const s=doc.getSelection();
  return s && {anchor:s.anchorNode,anchorOffset:s.anchorOffset,focus:s.focusNode,focusOffset:s.focusOffset};
};
const sameEndpoint = (doc, before) => {
  const next=endpoint(doc);
  return before && next && Object.keys(before).every(key=>before[key]===next[key]);
};
const availableWidth = image => {
  const parent=image.parentElement,style=getComputedStyle(parent);
  const width=parent.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
  if(style.display!=="grid")return width;
  const tracks=style.gridTemplateColumns.split(/\s+/).map(value=>/^\d+(?:\.\d+)?px$/.test(value)?parseFloat(value):NaN);
  const placement=getComputedStyle(image),start=Number(placement.gridColumnStart),end=Number(placement.gridColumnEnd);
  if(!tracks.length || tracks.some(Number.isNaN) || !Number.isInteger(start) || start<1)return width;
  const stop=end===-1?tracks.length:Number.isInteger(end)&&end>start?end-1:start;
  return tracks.slice(start-1,stop).reduce((sum,value)=>sum+value,0)+(parseFloat(style.columnGap)||0)*Math.max(0,stop-start);
};

function imageActionRect(image) {
  const rect=image.getBoundingClientRect(),viewport=measureVisualViewport(window),header=document.querySelector('.global-app-chrome')?.getBoundingClientRect(),navigation=document.querySelector('.mobile-app-navigation')?.getBoundingClientRect();
  const top=Math.max(viewport.offsetTop,header?.height?header.bottom:0)+8,bottom=Math.min(viewport.offsetTop+viewport.height,navigation?.height?navigation.top:Infinity)-8;
  const x=imageAlignmentActionLeft(rect,innerWidth);
  if(x===null)return null;
  const y=Math.max(top,Math.min(bottom-48,rect.top+(rect.height>=64?8:rect.height/2-24)));
  return new DOMRect(x,y,48,48);
}

export function InlineImageResize({ editor, suspended=false, onActiveChange }) {
  const [handles,setHandles]=useState([]), hovered=useRef(null), focused=useRef(null), otherHover=useRef(false), drag=useRef(null), callbacks=useRef(null), measureRef=useRef(()=>{});
  callbacks.current={suspended,onActiveChange};
  const [alignment,setAlignment]=useState(null),alignmentRef=useRef(null);
  const viewportBoundary=useVisualViewportBoundary(Boolean(alignment));
  const header=alignment&&document.querySelector('.global-app-chrome')?.getBoundingClientRect(),navigation=alignment&&document.querySelector('.mobile-app-navigation')?.getBoundingClientRect();
  const contentTop=Math.max(viewportBoundary.y,header?.height?header.bottom:0),contentBottom=Math.min(viewportBoundary.y+viewportBoundary.height,navigation?.height?navigation.top:Infinity);
  const boundary=alignment?{...viewportBoundary,y:contentTop,height:Math.max(0,contentBottom-contentTop)}:viewportBoundary;
  const notifyActivity=()=>callbacks.current.onActiveChange?.(Boolean(drag.current || alignmentRef.current));
  const closeAlignment=()=>{alignmentRef.current=null;setAlignment(null);notifyActivity();measureRef.current();};

  const append=useInlineMenuPortal(), owner=useId();
  const ownsControl = active => active?.getAttribute?.("data-image-resize-owner") === owner;
  const owned = value => !editor.isDestroyed && editor.isInitialized && editor.isEditable && !editor.view.composing && !callbacks.current.suspended && value.image.isConnected && editor.view.dom.contains(value.image) && editor.state.doc===value.doc && editor.state.selection.eq(value.selection) && editor.state.doc.nodeAt(value.position)===value.node;
  const valid = value => !alignmentRef.current && owned(value);
  const restore = value => { if(value.image.isConnected){value.image.style.width=value.style.width;value.image.style.height=value.style.height;} };
  const cancel = (focus=false) => {
    const value=drag.current;if(!value)return;
    drag.current=null;restore(value);
    if(value.control.hasPointerCapture(value.id))value.control.releasePointerCapture(value.id);
    notifyActivity();
    if(focus && value.previousFocus?.isConnected)value.previousFocus.focus({preventScroll:true});
  };
  const preview = (value, delta) => {
    const size=imageResizeDimensions(value.box.width,value.box.height,delta,value.side,availableWidth(value.image));
    if(!size)return;
    value.image.style.width=`${size.width}px`;value.image.style.height="auto";
    const rect=value.image.getBoundingClientRect();
    value.dimensions={width:Math.max(1,Math.round(rect.width)),height:Math.max(1,Math.round(rect.height))};
    value.moved=Math.abs(rect.width-value.box.width)>=0.5 || Math.abs(rect.height-value.box.height)>=0.5;
  };
  useEffect(()=>{
    let frame=0,root=null;
    const publish=next=>setHandles(current=>current.length===next.length && current.every((value,index)=>{
      const other=next[index];
      return ["image","position","node","doc","side","x","y","height","width","maxWidth","hitWidth","guideX"].every(key=>value[key]===other[key]) && value.selection.eq(other.selection);
    })?current:next);
    const locate=image=>{
      if(!image || !root?.contains(image) || !image.complete || !image.naturalWidth)return null;
      const position=editor.view.posAtDOM(image,0),node=editor.state.doc.nodeAt(position);
      if(node?.type.name!=="image" || editor.view.nodeDOM(position)!==image)return null;
      return {image,position,node,doc:editor.state.doc,selection:editor.state.selection};
    };
    const measure=()=>{
      cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
        if(drag.current && !valid(drag.current))cancel();
        if(alignmentRef.current){if(!owned(alignmentRef.current))closeAlignment();else{publish([]);return;}}
        if(editor.isDestroyed || !editor.isInitialized || !root?.isConnected || !editor.isEditable || editor.view.composing || callbacks.current.suspended){cancel();publish([]);return;}
        const active=root.ownerDocument.activeElement,controlFocused=ownsControl(active);
        const selected=active===root && !otherHover.current && editor.state.selection instanceof NodeSelection && editor.state.selection.node.type.name==="image" ? editor.view.nodeDOM(editor.state.selection.from) : null;
        const value=drag.current || locate(controlFocused?focused.current:null) || locate(hovered.current) || locate(selected);
        if(!value){publish([]);return;}
        const rect=value.image.getBoundingClientRect(),viewport=measureVisualViewport(window),header=document.querySelector('.global-app-chrome')?.getBoundingClientRect(),navigation=document.querySelector('.mobile-app-navigation')?.getBoundingClientRect();
        const left=0,right=innerWidth;
        const top=Math.max(viewport.offsetTop,header?.height?header.bottom:0)+8,bottom=Math.min(viewport.offsetTop+viewport.height,navigation?.height?navigation.top:Infinity)-8;
        const visibleTop=Math.max(top,rect.top),visibleBottom=Math.min(bottom,rect.bottom);
        if(rect.width<=0 || visibleBottom<=visibleTop || rect.right<left || rect.left>right){if(!drag.current)publish([]);return;}
        const height=Math.min(64,visibleBottom-visibleTop),y=visibleTop+(visibleBottom-visibleTop-height)/2,maxWidth=Math.max(Math.round(rect.width),Math.floor(availableWidth(value.image)));
        publish(["left","right"].map(side=>{
          const edge=side==="left"?rect.left:rect.right;
          // Narrow media must remain selectable after hover. Keep a real gap
          // between its native hit target and the outside resize hit areas.
          const x=rect.width<32 ? side==="left"?Math.max(left,edge-17):edge+1 : edge-8;
          const hitWidth=rect.width<32 ? Math.max(0,Math.min(16,side==="left"?edge-1-x:right-x)) : 16;
          return {...value,side,x,y,height,width:rect.width,maxWidth,hitWidth,guideX:edge-x-2};
        }).filter(value=>drag.current || value.hitWidth>0&&value.x>=left&&value.x+value.hitWidth<=right));
      });
    };
    measureRef.current=measure;
    const pointer=event=>{
      const value=drag.current;
      if(value){
        if(event.pointerId!==value.id)return;
        if(!valid(value)){cancel();measure();return;}
        preview(value,event.clientX-value.startX);measure();return;
      }
      if(ownsControl(event.target.closest?.('[data-image-resize-owner]')))return;
      const image=event.target.closest?.("img");otherHover.current=Boolean(image&&!root?.contains(image));hovered.current=root?.contains(image)?image:null;if(otherHover.current)focused.current=null;measure();
    };
    const up=event=>{
      const value=drag.current;if(!value || event.pointerId!==value.id)return;
      const allowed=valid(value),dimensions=value.dimensions,moved=value.moved;
      cancel();
      if(allowed && moved && dimensions)commitInlineImageResize(editor,value,dimensions);
      measure();
    };
    const stop=()=>{cancel();measure();};
    const focus=()=>{
      const active=document.activeElement,ownControl=ownsControl(active);
      if(active===root)otherHover.current=false;
      if(!ownControl)focused.current=null;
      if(!ownControl && active!==root)hovered.current=null;
      measure();
    };
    const key=event=>{if(event.key==="Escape" && drag.current){event.preventDefault();event.stopPropagation();cancel(true);measure();}};
    const selection=()=>{if(drag.current && !sameEndpoint(root.ownerDocument,drag.current.native)){cancel();measure();}};
    const observer=new ResizeObserver(measure);
    const unbind=()=>{cancel();if(alignmentRef.current)closeAlignment();if(root){observer.unobserve(root);root.removeEventListener("compositionstart",stop);root.removeEventListener("compositionend",measure);root=null;}};
    const bind=()=>{unbind();if(editor.isDestroyed)return;root=editor.view.dom;observer.observe(root);root.addEventListener("compositionstart",stop);root.addEventListener("compositionend",measure);measure();};
    editor.on("mount",bind);editor.on("create",bind);editor.on("unmount",unbind);editor.on("transaction",measure);if(editor.isInitialized)bind();
    document.addEventListener("pointermove",pointer);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",stop);document.addEventListener("keydown",key,true);document.addEventListener("selectionchange",selection);document.addEventListener("focusin",focus);document.addEventListener("wheel",stop,{passive:true});
    window.addEventListener("scroll",measure,true);window.addEventListener("resize",stop);window.addEventListener("blur",stop);window.visualViewport?.addEventListener("resize",stop);window.visualViewport?.addEventListener("scroll",measure);
    return()=>{measureRef.current=()=>{};unbind();observer.disconnect();editor.off("mount",bind);editor.off("create",bind);editor.off("unmount",unbind);editor.off("transaction",measure);document.removeEventListener("pointermove",pointer);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",stop);document.removeEventListener("keydown",key,true);document.removeEventListener("selectionchange",selection);document.removeEventListener("focusin",focus);document.removeEventListener("wheel",stop);window.removeEventListener("scroll",measure,true);window.removeEventListener("resize",stop);window.removeEventListener("blur",stop);window.visualViewport?.removeEventListener("resize",stop);window.visualViewport?.removeEventListener("scroll",measure);cancelAnimationFrame(frame);};
  },[editor,owner]);
  useEffect(()=>{if(suspended){cancel();if(alignmentRef.current)closeAlignment();setHandles([]);}else measureRef.current();},[suspended]);
  const begin=(event,value)=>{
    if(event.button!==0 || drag.current || !valid(value))return;
    event.preventDefault();
    const previousFocus=value.image.ownerDocument.activeElement;
    event.currentTarget.focus({preventScroll:true});
    if(!valid(value))return;
    drag.current={...value,id:event.pointerId,control:event.currentTarget,startX:event.clientX,box:value.image.getBoundingClientRect(),style:{width:value.image.style.width,height:value.image.style.height},previousFocus,native:endpoint(value.image.ownerDocument),moved:false,dimensions:null};
    event.currentTarget.setPointerCapture(event.pointerId);notifyActivity();
  };
  const key=(event,value)=>{
    if(event.isComposing || !valid(value))return;
    if(drag.current){event.preventDefault();return;}
    if((event.metaKey||event.ctrlKey) && ["z","y"].includes(event.key.toLowerCase())){
      event.preventDefault();editor.view.focus();if(event.key.toLowerCase()==="y"||event.shiftKey)editor.commands.redo();else editor.commands.undo();return;
    }
    if(event.key==="Escape"){event.preventDefault();editor.view.focus();return;}
    if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
    event.preventDefault();const box=value.image.getBoundingClientRect(),step=event.shiftKey?32:8;
    const delta=event.key==="Home"?1-box.width:event.key==="End"?100000:event.key==="ArrowRight"?step:-step;
    const operation={...value,box,side:"right",style:{width:value.image.style.width,height:value.image.style.height}};
    preview(operation,delta);restore(operation);
    if(operation.moved)commitInlineImageResize(editor,value,operation.dimensions);
    measureRef.current();
  };
  const target=!drag.current&&handles[0],action=target&&target.width<target.maxWidth-1?imageActionRect(target.image):null;
  const openAlignment=()=>{
    if(!target || !action || !valid(target))return;
    focused.current=target.image;
    const request={...target,anchor:{contextElement:target.image,getBoundingClientRect:()=>imageActionRect(target.image)||target.image.getBoundingClientRect()}};
    alignmentRef.current=request;setAlignment(request);notifyActivity();measureRef.current();
  };
  const applyAlignment=value=>{
    const request=alignmentRef.current;
    if(!request || !owned(request))return;
    commitInlineImageAlignment(editor,request,value);
    closeAlignment();
    if(!editor.isDestroyed&&editor.isEditable)editor.view.focus();
  };
  return <ScreenPortal container={append()}>
    {action&&<ControlBar className="inline-editor__image-alignment-control not-typeset" style={{left:action.x,top:action.y}}><Button type="button" variant="secondary" size="icon" data-control-icon data-image-resize-owner={owner} aria-label="Выравнивание изображения" aria-expanded={Boolean(alignment)} onFocus={()=>{focused.current=target.image;measureRef.current();}} onClick={openAlignment}><AlignCenter aria-hidden="true" /></Button></ControlBar>}
    <Popover open={Boolean(alignment)} onOpenChange={open=>{if(!open)closeAlignment();}}>
      {alignment&&<PopoverContent anchor={alignment.anchor} collisionBoundary={boundary} collisionPadding={16} collisionAvoidance={{side:"shift",align:"shift"}} positionMethod="fixed" className="inline-editor__image-alignment-menu not-typeset" aria-label="Выравнивание изображения" finalFocus={()=>false} onKeyDown={event=>{if(event.key==="Escape"&&!event.nativeEvent.isComposing){event.preventDefault();closeAlignment();editor.view.focus();}}}>
        <ControlBar className="flex gap-2" aria-label="Положение изображения">{[["left","По левому краю",AlignLeft],["center","По центру",AlignCenter],["right","По правому краю",AlignRight]].map(([value,label,Icon])=><Button key={value} type="button" variant={(alignment.node.attrs.alignment||"left")===value?"default":"ghost"} size="icon" data-control-icon data-image-resize-owner={owner} aria-label={label} aria-pressed={(alignment.node.attrs.alignment||"left")===value} onClick={()=>applyAlignment(value)}><Icon aria-hidden="true" /></Button>)}</ControlBar>
      </PopoverContent>}
    </Popover>
    {handles.map(value=><div key={`${value.position}:${value.side}`} role="separator" aria-orientation="vertical" aria-label={`Изменить ширину изображения ${value.side==="left"?"слева":"справа"}`} aria-valuemin={1} aria-valuemax={value.maxWidth} aria-valuenow={Math.round(value.width)} tabIndex={0} data-image-resize-owner={owner} data-image-resize={value.side} className="inline-editor__image-resize not-typeset" style={{left:value.x,top:value.y,height:value.height,width:value.hitWidth,"--image-resize-guide-x":`${value.guideX}px`}} onFocus={()=>{focused.current=value.image;measureRef.current();}} onPointerDown={event=>begin(event,value)} onLostPointerCapture={()=>{cancel();measureRef.current();}} onKeyDown={event=>key(event,value)}/>)}</ScreenPortal>;
}
