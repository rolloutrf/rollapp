// Small media keeps its native hit target and both outside resize rails.
// Prefer the free side instead of clamping the action back over the image.
export function imageAlignmentActionLeft(rect, viewportWidth) {
  const size=48,inset=16,gap=8;
  if(rect.width>=80)return Math.max(inset,Math.min(viewportWidth-inset-size,rect.right-size-gap));
  const rail=rect.width<32?17:8;
  const right=rect.right+rail+gap,left=rect.left-rail-gap-size;
  if(right+size<=viewportWidth-inset)return right;
  if(left>=inset)return left;
  return null;
}
