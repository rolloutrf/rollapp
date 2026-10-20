// Canonical HTML distinguishes an intentionally absent link attribute from
// an older document that relied on the editor's default link attributes.
export const inlineLinkDefaults = { target: "_blank", rel: "noopener noreferrer nofollow", class: null };
const keys = Object.keys(inlineLinkDefaults);
const value = (attributes, key) => attributes[key] === undefined ? inlineLinkDefaults[key] : attributes[key];
export function needsInlineLinkHTML(attributes = {}) {
  // The pinned Markdown link writer does not escape title quotes or URL
  // delimiters. Canonical HTML keeps those authored characters exact.
  return attributes.title === "" || /["\\\r\n\t]/.test(attributes.title || "") || /[\s<>()\\"]/.test(attributes.href || "") || keys.some(key => value(attributes, key) !== inlineLinkDefaults[key]);
}
export function inlineLinkHTMLAttributes(attributes = {}) {
  return { href: attributes.href, title: attributes.title, ...Object.fromEntries(keys.map(key => [key, value(attributes, key)])), "data-inline-link": "true" };
}
export function parseInlineLinkHTMLAttributes(attributes) {
  const complete = attributes["data-inline-link"] === "true";
  return { href: attributes.href, title: attributes.title ?? null,
    ...Object.fromEntries(keys.filter(key => complete || key in attributes).map(key => [key, attributes[key] ?? null])) };
}
