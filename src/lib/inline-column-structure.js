// Remove a column only when the explicit block deletion covers its entire
// content. A blank input in a newly created column remains a real input.
export function removeColumnContent(tr, from, to) {
  const $from=tr.doc.resolve(from);
  if ($from.parent.type.name!=="column" || $from.start()!==from || $from.end()!==to) return null;
  const column=$from.parent,row=$from.node(-1);
  if(row.type.name!=="columns")return null;
  const position=$from.before(),index=$from.index($from.depth-1);
  if(row.childCount>2){tr.delete(position,position+column.nodeSize);return Math.min(position,tr.doc.content.size);}
  const rowPosition=$from.before($from.depth-1),remaining=row.child(index===0?1:0);
  tr.replaceWith(rowPosition,rowPosition+row.nodeSize,remaining.content);
  return Math.min(rowPosition,tr.doc.content.size);
}

export function resizeColumnPairTransaction(state, position, index, left, right) {
  if(!Number.isInteger(position)||position<0||position>=state.doc.content.size||!Number.isInteger(index)||index<0||![left,right].every(value=>Number.isFinite(value)&&value>0&&value<=1000000))return null;
  const row=state.doc.nodeAt(position);
  if(row?.type.name!=="columns"||index>=row.childCount-1)return null;
  const a=row.child(index),b=row.child(index+1);
  const total=a.attrs.width+b.attrs.width;
  if(Math.abs(left+right-total)>Math.max(1,total)*1e-9)return null;
  if(a.attrs.width===left&&b.attrs.width===right)return null;
  let offset=position+1;for(let i=0;i<index;i++)offset+=row.child(i).nodeSize;
  return state.tr.setNodeMarkup(offset,undefined,{...a.attrs,width:left}).setNodeMarkup(offset+a.nodeSize,undefined,{...b.attrs,width:right});
}
