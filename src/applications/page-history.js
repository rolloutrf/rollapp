import { UNSAFE_createBrowserHistory, createPath, parsePath } from "react-router-dom";
import { internalPageUrl, localizedPageUrl } from "../../shared/modules/shell/page-urls.js";

export function createPageHistory(browser = window) {
  const history = UNSAFE_createBrowserHistory({ window: browser, v5Compat: true });
  const createHref = history.createHref;
  const normalizeAddress = () => {
    const path = createPath(browser.location);
    const localized = localizedPageUrl(path);
    if (localized !== path) browser.history.replaceState(browser.history.state, "", localized);
  };
  const readLocation = location => ({ ...location, ...parsePath(internalPageUrl(createPath(location))) });

  // Preserve React Router's state, keys, history index and POP/PUSH/REPLACE
  // semantics. Only the URL written into the browser is translated.
  history.createHref = to => localizedPageUrl(createHref(to));
  normalizeAddress();
  return {
    ...history,
    get action() { return history.action; },
    get location() { return readLocation(history.location); },
    listen(listener) {
      return history.listen(update => {
        normalizeAddress();
        listener({ ...update, location: readLocation(update.location) });
      });
    },
  };
}
