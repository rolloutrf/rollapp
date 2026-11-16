const digraphs = {
  shch: "щ", sch: "ш", zh: "ж", th: "т", ph: "ф", ck: "к", qu: "кв", kh: "х", ts: "ц", ch: "ч", sh: "ш",
  yo: "ё", jo: "ё", yu: "ю", ju: "ю", ya: "я", ja: "я", ye: "е",
  iy: "ий", ii: "ий", yi: "ый", ee: "и",
};
const letters = {
  a: "а", b: "б", c: "к", d: "д", e: "е", f: "ф", g: "г", h: "х", i: "и",
  j: "дж", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", q: "к", r: "р",
  s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс", y: "й", z: "з",
};

const commonNames = {
  michael: "майкл", john: "джон", mary: "мэри", jane: "джейн", george: "джордж",
  william: "уильям", james: "джеймс", robert: "роберт", natalia: "наталия",
  dmitry: "дмитрий", alexander: "александр", ekaterina: "екатерина",
};

function cyrillicWord(word) {
  return word.replace(/[a-z]+/g, latin =>
    Object.hasOwn(commonNames, latin) ? commonNames[latin] : latin.replace(/ry$/, "rii").replace(/shch|sch|zh|th|ph|ck|qu|kh|ts|ch|sh|[yj][ouae]|iy|ii|yi|ee|[a-z]/g,
      value => digraphs[value] ?? letters[value] ?? [...value].map(letter => letters[letter]).join("")));
}

export function profileNameAddress(name, accountType = "personal") {
  // Strip Latin accents without changing Cyrillic й/ё.
  const words = String(name ?? "").normalize("NFKC").toLowerCase()
    .replace(/(\p{Script=Latin})/gu, letter => letter.normalize("NFD").replace(/\p{M}/gu, ""))
    .replace(/[łøđðþßæœ]/g, letter => ({ ł: "l", ø: "o", đ: "d", ð: "d", þ: "t", ß: "ss", æ: "ae", œ: "oe" })[letter])
    .match(/[a-zа-яё0-9]+(?:-[a-zа-яё0-9]+)*/g)?.map(cyrillicWord) ?? [];
  if (accountType !== "business" && words.length > 1) {
    const [firstName, ...surname] = words;
    const patronymic = surname.findIndex(word => /(?:ович|евич|овна|евна|ична|оглы|кызы)$/.test(word));
    if (surname.length > 1 && patronymic >= 0) surname.splice(patronymic, 1);
    words.splice(0, words.length, ...surname, firstName);
  }
  return words.join("-").slice(0, 70).replace(/-+$/, "") || "профиль";
}
