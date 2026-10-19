import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection } from "@tiptap/pm/state";

// Measure the displayed ratio, including legacy image dimensions. No model
// changes happen until the owning gesture explicitly commits its final size.
export function imageResizeDimensions(width, height, delta, side, maxWidth=100000) {
  if (![width,height,delta,maxWidth].every(Number.isFinite) || width <= 0 || height <= 0 || maxWidth<=0 || !["left","right"].includes(side)) return null;
  const ratio = width / height;
  if(ratio<1/100000 || ratio>100000)return null;
  const limit = Math.floor(Math.min(maxWidth,100000,100000 * ratio));
  const nextWidth = Math.max(1,Math.min(limit,Math.round(width + (side === "left" ? -delta : delta))));
  return { width:nextWidth,height:Math.max(1,Math.round(nextWidth / ratio)) };
}

export function imageResizeTransaction(state, request, dimensions) {
  const { width,height } = dimensions || {};
  if (![width,height].every(value=>Number.isInteger(value) && value>0 && value<=100000) || state.doc !== request.doc || !state.selection.eq(request.selection)) return null;
  const node = state.doc.nodeAt(request.position);
  if (node?.type.name !== "image" || node !== request.node) return null;
  if (Number(node.attrs.width) === width && Number(node.attrs.height) === height) return null;
  const tr = closeHistory(state.tr).setNodeMarkup(request.position,undefined,{...node.attrs,width,height});
  return tr.setSelection(NodeSelection.create(tr.doc,request.position));
}

export function commitInlineImageResize(editor, request, dimensions) {
  if (editor.isDestroyed || !editor.isEditable || editor.view.composing) return false;
  const tr = imageResizeTransaction(editor.state,request,dimensions);
  if (!tr) return false;
  editor.view.focus();
  if (editor.isDestroyed || !editor.isEditable || editor.view.composing || editor.state.doc !== request.doc || !editor.state.selection.eq(request.selection)) return false;
  editor.view.dispatch(tr);
  editor.view.dispatch(closeHistory(editor.state.tr));
  return true;
}
