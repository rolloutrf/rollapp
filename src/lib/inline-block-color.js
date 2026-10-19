import { Extension } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { CellSelection } from "@tiptap/pm/tables";
import { AllSelection, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { selectedBlockPosition, selectedBlockRange } from "./inline-blocks.js";
import { blockColorTypes, colorableBlockTypes, safeBlockColor } from "./inline-block-color-values.js";
import { blockHTML } from "./inline-table-markdown.js";
import { lastColor,rememberColor } from "./inline-color-memory.js";
import { setInlineStyle } from "./inline-text-style.js";
import { isBlockSelection } from "./inline-block-selection.js";

function colorPosition(doc,$from) {
  const position=selectedBlockPosition({$from});
  if(doc.nodeAt(position)?.type.name==="table")for(let depth=$from.depth;depth>0;depth-=1)if(["tableCell","tableHeader"].includes($from.node(depth).type.name))return $from.before(depth);
  return position;
}

export function coloredBlockPositions(state, { position, cells = false } = {}) {
  if (cells && state.selection instanceof CellSelection) { const positions=[];state.selection.forEachCell((node,pos)=>positions.push(pos));return positions; }
  if((state.selection instanceof AllSelection||state.selection instanceof TextSelection&&!state.selection.empty)&&(position==null||position===selectedBlockPosition(state.selection))&&!cells) {
    const positions=new Set();
    state.doc.nodesBetween(state.selection.from,state.selection.to,(node,pos)=>{if(node.isTextblock)positions.add(colorPosition(state.doc,state.doc.resolve(pos+1)));});
    let end=-1;return [...positions].sort((a,b)=>a-b).filter(pos=>{if(pos<end)return false;end=pos+state.doc.nodeAt(pos).nodeSize;return true;});
  }
  if(cells || position == null && state.doc.nodeAt(selectedBlockPosition(state.selection))?.type.name === "table") {
    for(let depth=state.selection.$from.depth;depth>0;depth-=1)if(["tableCell","tableHeader"].includes(state.selection.$from.node(depth).type.name))return[state.selection.$from.before(depth)];
    if(cells)return[];
  }
  position ??= selectedBlockPosition(state.selection);
  const range=selectedBlockRange(state.doc,position,state.selection);
  if (!range) return [];
  if (range.positions) return expandColourUnits(state.doc,range.positions.filter(pos => colorableBlockTypes.includes(state.doc.nodeAt(pos).type.name)));
  const positions=[];let pos=range.from;
  for(let index=0;index<range.count;index+=1) {const node=range.parent.child(range.index+index);if(colorableBlockTypes.includes(node.type.name))positions.push(pos);pos+=node.nodeSize;}
  return expandColourUnits(state.doc,positions);
}

function expandColourUnits(doc,positions) {
  const units=[];
  for(const pos of positions) {
    const node=doc.nodeAt(pos);units.push(pos);
    if(["bulletList","orderedList","taskList"].includes(node.type.name))node.forEach((_item,offset)=>units.push(pos+1+offset));
  }
  return [...new Set(units)];
}

export function blockSelectionColor(state, target) {
  const colors=coloredBlockPositions(state,target).map(pos=>safeBlockColor(state.doc.nodeAt(pos)?.attrs.blockColor));
  return colors.length && colors.every(value=>value===colors[0]) ? colors[0] : undefined;
}

export function colorBlocks(tr, color, target) {
  if (color != null && !safeBlockColor(color)) return false;
  const positions=coloredBlockPositions({doc:tr.doc,selection:tr.selection},target);
  for(const pos of positions) {
    const node=tr.doc.nodeAt(pos);tr.setNodeMarkup(pos,undefined,{...node.attrs,blockColor:color});
    // The first paragraph/summary is the container's own text. Its old block
    // colour must not mask a new colour on the quote/item/toggle. Inline marks
    // and independently styled child blocks keep their own attributes.
    if(["nestedBlock","blockquote","listItem","taskItem","details"].includes(node.type.name)&&node.firstChild?.isTextblock&&node.firstChild.attrs.blockColor) {
      tr.setNodeMarkup(pos+1,undefined,{...node.firstChild.attrs,blockColor:null});
    }
  }
  return positions.length>0;
}

// A type change may lift text out of a coloured list/quote. Track each text
// block independently, including the default colour, rather than painting the
// entire selection with the active block's colour afterwards.
export function captureBlockColors(tr) {
  const blocks=[];
  const seen=new Set();
  for(const {$from,$to} of tr.selection.ranges)tr.doc.nodesBetween($from.pos,$to.pos,(node,pos)=>{
    if (!node.isTextblock) return;
    if(seen.has(pos))return;seen.add(pos);
    const $inside=tr.doc.resolve(pos+1);
    blocks.push({position:pos+1,color:inheritedBlockColor($inside)});
  });
  return {blocks,mapFrom:tr.mapping.maps.length};
}

export function inheritedBlockColor($position) {
  let color=null;
  for(let depth=1;depth<=$position.depth;depth+=1)color=safeBlockColor($position.node(depth).attrs.blockColor)||color;
  return color;
}

export function restoreBlockColors(tr,snapshot) {
  const mapping=tr.mapping.slice(snapshot.mapFrom);
  for(const block of snapshot.blocks) {
    const mapped=mapping.mapResult(block.position,1);
    if(mapped.deleted || mapped.pos<0 || mapped.pos>tr.doc.content.size)continue;
    const $inside=tr.doc.resolve(mapped.pos);
    let node=$inside.parent,position=$inside.depth?$inside.before():null;
    if(!node.isTextblock || !colorableBlockTypes.includes(node.type.name))continue;
    // A newly wrapped list item owns its marker and background as well as its
    // only paragraph. Do not recolour a container with other child blocks.
    const parent=$inside.depth>1?$inside.node($inside.depth-1):null;
    if(parent?.childCount===1 && ["listItem","taskItem"].includes(parent.type.name)) {
      node=parent;position=$inside.before($inside.depth-1);
    }
    const $target=tr.doc.resolve(position+1);
    const color=inheritedBlockColor($target);
    if(color!==block.color)tr.setNodeMarkup(position,undefined,{...node.attrs,blockColor:block.color});
  }
  return true;
}

export function setBlockColor(editor, color, target) {
  if(!editor.isEditable)return false;
  const tr=closeHistory(editor.state.tr);if(!colorBlocks(tr,color,target))return false;
  editor.view.dispatch(tr.scrollIntoView());editor.view.dispatch(closeHistory(editor.state.tr));rememberColor({scope:"block",color});editor.commands.focus();return true;
}

export function withBlockColorMarkdown(extension) {
  return extension.extend({
    addExtensions() { return (this.parent?.() || []).map(withBlockColorMarkdown); },
    ...(blockColorTypes.includes(extension.name) ? {renderMarkdown(node,helpers,context) {
      // A list item can own arbitrary document blocks. The upstream compact
      // Markdown list writer joins their lines, which can turn a divider (or
      // a second paragraph) into text. Keep those children as explicit blocks.
      const lists = ["bulletList", "orderedList", "taskList"];
      const requiresHTML=node=>node.type === "nestedBlock" || safeBlockColor(node.attrs?.blockColor) ||
        lists.includes(node.type) && node.content?.some(item => item.content?.some((child,index) => index > 0 && !lists.includes(child.type))) || node.content?.some(requiresHTML);
      if(requiresHTML(node))return blockHTML(node);
      // Null defaults are schema metadata, not a new directive in old Markdown.
      const attrs={...node.attrs};delete attrs.blockColor;
      return this.parent({...node,attrs},helpers,context);
    }} : {}),
  });
}

export const InlineBlockColor = Extension.create({
  name:"inlineBlockColor",
  priority:1100,
  addKeyboardShortcuts(){return{"Mod-Shift-h":()=>{
    const style=lastColor()||{scope:"inline",attributes:{background:"yellow"}},selection=this.editor.state.selection;
    if(isBlockSelection(selection)||selection instanceof NodeSelection||selection instanceof CellSelection)return setBlockColor(this.editor,style.scope==="block"?style.color:style.attributes.background?`${style.attributes.background}_background`:style.attributes.color??null,{cells:selection instanceof CellSelection});
    if(style.scope==="block"&&selection.empty)return setBlockColor(this.editor,style.color);
    const attributes=style.scope==="inline"?style.attributes:style.color?.endsWith("_background")?{background:style.color.slice(0,-11)}:{color:style.color};
    return setInlineStyle(this.editor,attributes,false);
  }};},
  addGlobalAttributes:()=>[{types:blockColorTypes,attributes:{blockColor:{default:null,keepOnSplit:true,
    parseHTML:el=>safeBlockColor(el.getAttribute("data-block-color")),
    renderHTML:attrs=>safeBlockColor(attrs.blockColor)?{"data-block-color":attrs.blockColor}:{},
  }}}],
});
