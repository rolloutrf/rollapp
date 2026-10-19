import { inlineColors, safeInlineColor } from "./inline-color-values.js";

export const blockColorTypes = ["nestedBlock", "paragraph", "heading", "typographyBlock", "blockquote", "bulletList", "orderedList", "listItem", "taskList", "taskItem", "details", "detailsSummary", "codeBlock", "table", "tableCell", "tableHeader", "image", "horizontalRule"];
// Keep imported metadata, but offer colours only where the current renderer
// has text or a meaningful container surface. Images/dividers have no text.
export const colorableBlockTypes=blockColorTypes.filter(type=>!["image","horizontalRule"].includes(type));
export const safeBlockColor = value => {
  if (safeInlineColor(value)) return value;
  return typeof value === "string" && value.endsWith("_background") && safeInlineColor(value.slice(0,-11)) ? value : null;
};
export const blockColorCommands = [
  { id:"block-default",kind:"color",color:null,label:"Обычный цвет блока",aliases:"default color обычный сброс цвет",description:"Вернуть блоку обычный цвет и убрать его фон.",shortcut:"" },
  ...inlineColors.filter(([id])=>id).flatMap(([color,label])=>[
    { id:`block-${color}`,kind:"color",color,label:`${label} текст блока`,aliases:`${color} color цвет`,description:"Изменить цвет целого блока, сохранив оформление его фрагментов.",shortcut:"" },
    { id:`block-${color}-background`,kind:"color",color:`${color}_background`,label:`${label} фон блока`,aliases:`${color} background фон`,description:"Окрасить фон целого блока.",shortcut:"" },
  ]),
];
