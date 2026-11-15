import assert from "node:assert/strict";
import test from "node:test";
import { imageAlignmentActionLeft } from "./inline-image-controls.js";

test("image action leaves narrow media and both resize rails disjoint across page widths",()=>{
 for(const viewport of [320,390,768,820,1024,1440,1920])for(const width of [1,16,31,32,79,80,120])for(const factor of [0,0.5,1]){
  const left=14+(viewport-28-width)*factor,right=left+width,x=imageAlignmentActionLeft({left,right,width},viewport);
  assert.notEqual(x,null);assert(x>=16&&x+48<=viewport-16);
  const rails=width<32?[[left-17,left-1],[right+1,right+17]]:[[left-8,left+8],[right-8,right+8]];
  for(const [start,end] of rails)assert(Math.min(x+48,end)<=Math.max(x,start),JSON.stringify({viewport,width,factor,x,start,end}));
  if(width<80)assert(x+48<=left||x>=right,"Small native image remains reachable");
 }
});
test("image action is omitted if neither outside side can hold the shared control",()=>{
 assert.equal(imageAlignmentActionLeft({left:30,right:31,width:1},60),null);
});
