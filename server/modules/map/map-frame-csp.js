// Yandex Maps JS API v3 requires unsafe-eval for its vector engine. Keep that
// exception inside the dedicated map iframe instead of weakening Rollapp's CSP.
export const mapFrameContentSecurityPolicy = [
  "default-src 'none'",
  "script-src 'self' https://api-maps.yandex.ru https://*.api-maps.yandex.ru https://yastatic.net 'unsafe-eval'",
  "connect-src https://api-maps.yandex.ru https://*.api-maps.yandex.ru https://*.maps.yandex.net",
  "style-src 'self' 'unsafe-inline' https://api-maps.yandex.ru https://*.api-maps.yandex.ru https://yastatic.net",
  "img-src 'self' data: https: https://api-maps.yandex.ru https://*.api-maps.yandex.ru https://*.maps.yandex.net https://yastatic.net",
  "worker-src data: https://api-maps.yandex.ru https://*.api-maps.yandex.ru https://yastatic.net",
  "font-src 'self' data:",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");
