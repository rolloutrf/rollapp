const ACCESSORY_STEMS = [
  "адапт", "заряд", "кабел", "чех", "ремеш", "насад", "креплен",
  "пленк", "стекл", "гидрогел", "наклейк",
];
const COLOR_GROUPS = [
  ["grey", "gray", "серый"],
  ["black", "черный", "черная"],
  ["white", "белый", "белая"],
  ["orange", "оранжевый", "оранжевая"],
  ["red", "красный", "красная", "красно"],
  ["blue", "синий", "синяя", "голубой", "голубая"],
  ["green", "зеленый", "зеленая"],
  ["purple", "фиолетовый", "фиолетовая"],
];
const COLOR_WORDS = new Set(COLOR_GROUPS.flat());
const SATURATED_COLOR_GROUPS = COLOR_GROUPS.slice(4);

function words(value) {
  return String(value || "")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .match(/[a-zа-я0-9]+/g) || [];
}

export function productScore(query, productName) {
  const queryWords = words(query).filter((word) => word.length > 1 && !COLOR_WORDS.has(word));
  const allQueryWords = words(query);
  const allProductWords = words(productName);
  const productWords = new Set(allProductWords);
  if (!queryWords.length) return 0;
  const queryIsAccessory = allQueryWords.some((word) => ACCESSORY_STEMS.some((stem) => word.startsWith(stem)));
  const productIsAccessory = allProductWords.some((word) => ACCESSORY_STEMS.some((stem) => word.startsWith(stem)));
  if (productIsAccessory && !queryIsAccessory) return 0;
  const requestedColor = COLOR_GROUPS.find((group) => group.some((color) => allQueryWords.includes(color)));
  if (requestedColor && !requestedColor.some((color) => allProductWords.includes(color))) return 0;
  const hasUnrequestedAccentColor = SATURATED_COLOR_GROUPS.some((group) => (
    group.some((color) => allProductWords.includes(color))
    && !group.some((color) => allQueryWords.includes(color))
  ));
  if (hasUnrequestedAccentColor) return 0;
  const matched = queryWords.filter((word) => productWords.has(word)).length;
  return Math.round((matched / queryWords.length) * 100);
}

// Imported marketplace titles often append generic search copy after " / ".
// A shorter title is useful only when the leading segment identifies a model.
export function marketplaceProductQuery(title) {
  const full = String(title || "").trim();
  const leading = full.split(/\s+\/\s+/u, 1)[0];
  return words(leading).some(isModelCode) ? leading : full;
}

function isModelCode(word) {
  return /[a-zа-я]/.test(word) && /[0-9]/.test(word) && !/^\d+(?:w|вт|v|в|g|г|kg|кг|ml|мл|mah|мач|mm|мм|cm|см)$/.test(word);
}

export function marketplaceProductScore(wish, candidate) {
  const title = String(wish?.title || "").trim();
  const score = productScore(title, candidate);
  if (wish?.space !== "products" || score === 0) return score;
  const query = marketplaceProductQuery(title);
  if (query === title) return score;
  const candidateWords = new Set(words(candidate));
  const modelCodes = words(query).filter(isModelCode);
  if (!modelCodes.every(code => candidateWords.has(code))) return 0;
  return Math.max(score, productScore(query, candidate));
}
