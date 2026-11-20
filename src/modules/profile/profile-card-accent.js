const cardAccents = ["#9b72e8", "#5b8def", "#43bd83", "#e66a8f", "#f2a65a", "#49a7a1", "#7d83ea"];

export function profileCardAccent(label = "") {
  const index = [...label].reduce((sum, character) => sum + character.codePointAt(0), 0);
  return cardAccents[index % cardAccents.length];
}
