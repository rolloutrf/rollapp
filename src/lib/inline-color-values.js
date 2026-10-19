export const inlineColors = [
  [null,"Обычный"],["gray","Серый"],["brown","Коричневый"],["orange","Оранжевый"],["yellow","Жёлтый"],["green","Зелёный"],["blue","Синий"],["purple","Фиолетовый"],["pink","Розовый"],["red","Красный"],
];
const colors=new Set(inlineColors.map(([id])=>id));
export const safeInlineColor=value=>colors.has(value)?value:null;
