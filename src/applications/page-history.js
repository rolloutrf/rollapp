import { UNSAFE_createBrowserHistory, createPath, parsePath } from "react-router-dom";
import { internalSpherePageUrl, spherePageUrl } from "../../shared/modules/shell/sphere-page-urls.js";

export function createPageHistory(browser = window, application = null) {
  const history = UNSAFE_createBrowserHistory({ window: browser, v5Compat: true });
  const createHref = history.createHref;
  const normalizeAddress = () => {
    const path = createPath(browser.location);
    const localized = spherePageUrl(path, application);
    if (localized !== path) browser.history.replaceState(browser.history.state, "", localized);
  };
  const readLocation = location => ({
    ...location, search: "", hash: "", ...parsePath(internalSpherePageUrl(createPath(location), application)),
  });

  // Preserve React Router's state, keys, history index and POP/PUSH/REPLACE
  // semantics. Only the URL written into the browser is translated.
  history.createHref = to => spherePageUrl(createHref(to), application);
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
