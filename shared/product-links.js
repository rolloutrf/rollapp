// Provider identifiers stay internal; storefront links contain only the merchant.
export function merchantProductUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    if (/(^|\.)ohmywishes\.com$/i.test(url.hostname)) return "";
    for (const [key, entry] of [...url.searchParams]) {
      if (/ohmywishes/i.test(`${key} ${entry}`)) url.searchParams.delete(key);
    }
    if (/ohmywishes/i.test(url.hash)) url.hash = "";
    return url.href;
  } catch { return ""; }
}
