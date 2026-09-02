const GOOGLE_FAVICON_ENDPOINT = "https://www.google.com/s2/favicons";

export function siteLogoUrl(resourceUrl) {
  try {
    const url = new URL(String(resourceUrl || "").trim());
    if (!["http:", "https:"].includes(url.protocol)) return "";

    const params = new URLSearchParams({
      domain_url: url.origin,
      sz: "128",
    });
    return `${GOOGLE_FAVICON_ENDPOINT}?${params.toString()}`;
  } catch {
    return "";
  }
}

export function logoUrlAfterResourceChange({ currentLogoUrl, previousResourceUrl, resourceUrl }) {
  const currentLogo = String(currentLogoUrl || "").trim();
  const previousAutomaticLogo = siteLogoUrl(previousResourceUrl);
  const nextAutomaticLogo = siteLogoUrl(resourceUrl);

  if (currentLogo && currentLogo !== previousAutomaticLogo) return currentLogo;
  return nextAutomaticLogo;
}
