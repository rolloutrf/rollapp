import { safeInlineColor } from "./inline-color-values.js";
import { safeBlockColor } from "./inline-block-color-values.js";

const key="rollapp.inline.last-color.v1";
let fallback=null;
function clean(style) {
  if(style?.scope==="block"&&(style.color==null||safeBlockColor(style.color)))return{scope:"block",color:style.color??null};
  if(style?.scope==="inline"&&style.attributes&&typeof style.attributes==="object") {
    const attributes=Object.fromEntries(Object.entries(style.attributes).filter(([key,value])=>["color","background"].includes(key)&&(value==null||safeInlineColor(value))).map(([key,value])=>[key,value??null]));
    if(Object.keys(attributes).length)return{scope:"inline",attributes};
  }
  return null;
}
export function rememberColor(style) {
  const value=clean(style);if(!value)return;
  fallback=value;try{localStorage.setItem(key,JSON.stringify(value));}catch{}
}
export function lastColor() {
  try{return clean(JSON.parse(localStorage.getItem(key)))||fallback;}catch{return fallback;}
}
