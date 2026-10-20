const pages = new WeakMap();
const cleanURL = value => { try { const url = new URL(value);return url.origin + url.pathname; } catch { return "invalid-url"; } };

// Observers only: no waits, retries, focus changes or swallowed browser errors.
// Bounded traces distinguish a missing module from a missing editor assertion.
export function instrumentSmokeBrowser(browser) {
  const contexts = new WeakSet();
  const watchPage = page => {
    if (pages.has(page)) return page;
    const trail = [], pending = new Map();
    const record = value => { trail.push({ time: Date.now(), ...value });if (trail.length > 80) trail.shift(); };
    pages.set(page, () => ({ trail: [...trail], pending: [...pending.values()].map(value => ({ url: value.url, ageMs: Date.now() - value.started })) }));
    page.on("request", request => { if (pending.size >= 200) pending.delete(pending.keys().next().value);pending.set(request, { url: cleanURL(request.url()), started: Date.now() }); });
    page.on("requestfinished", request => pending.delete(request));
    page.on("requestfailed", request => { pending.delete(request);record({ kind: "requestfailed", url: cleanURL(request.url()), error: request.failure()?.errorText }); });
    page.on("response", response => { if (response.status() >= 400) record({ kind: "http", url: cleanURL(response.url()), status: response.status() }); });
    page.on("pageerror", error => record({ kind: "pageerror", message: error.message }));
    page.on("console", message => { if (["warning", "error"].includes(message.type())) record({ kind: message.type(), message: message.text() }); });
    return page;
  };
  const watchContext = context => {
    if (!contexts.has(context)) { contexts.add(context);context.on("page", watchPage);for (const page of context.pages()) watchPage(page); }
    return context;
  };
  const methods = new Map();
  return new Proxy(browser, { get(target, key) {
    if (methods.has(key)) return methods.get(key);
    let value = Reflect.get(target, key, target);
    if (key === "newPage") value = async (...args) => { const page = await target.newPage(...args);watchContext(page.context());return watchPage(page); };
    else if (key === "newContext") value = async (...args) => watchContext(await target.newContext(...args));
    else if (typeof value === "function") value = value.bind(target);
    if (typeof value === "function") methods.set(key, value);
    return value;
  } });
}
export const smokeBrowserDiagnostics = page => pages.get(page)?.() || { trail: [], pending: [] };
