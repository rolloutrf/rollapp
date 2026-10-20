export function smokeMode(arguments_, known) {
  if (!Array.isArray(arguments_) || arguments_.length > 1 || arguments_.some(value => !known.includes(value))) {
    throw new Error("Choose at most one recognized smoke mode; unknown flags never start a full run");
  }
  return arguments_[0];
}
