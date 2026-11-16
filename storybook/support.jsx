import { useLayoutEffect, useRef, useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MobileFormPages } from "@/components/mobile-form-pages";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { SessionContext } from "@/modules/auth/session.jsx";
import { SphereSharingProvider } from "@/modules/access/sphere-sharing.jsx";
import { CollectionNavigationProvider } from "@/modules/categories/collection-navigation.jsx";
import { ProfileEditorProvider } from "@/modules/profile/profile-editor.jsx";
import { api } from "@/modules/runtime/api.js";
import { ToastProvider } from "@/modules/shell/toast.jsx";
import { Toaster } from "@/components/ui/sonner";

export const owner = {
  id: "storybook-owner", name: "Мария Волкова", username: "storybook-owner",
  memberNumber: 12345, bio: "Планирую поездки и собираю идеи для дома.",
  birthday: "1992-09-19", publicMood: 4,
};
export const person = { id: "storybook-member", name: "Алексей Орлов", username: "storybook-member" };

export const noop = () => {};
export function hold() { return new Promise(() => {}); }
export function fixtureError(message, status = 503, code = "") {
  return Object.assign(new Error(message), { status, code });
}

// Stories exercise React composition with local values. Unlisted API operations
// reject immediately, including calls made from new effects in a reused component.
function FixtureBoundary({ routes, children }) {
  const [ready, setReady] = useState(false);
  const activeRoutes = useRef(routes);
  useLayoutEffect(() => { activeRoutes.current = routes; }, [routes]);
  useLayoutEffect(() => {
    const original = { ...api };
    const previousFetch = window.fetch;
    for (const method of Object.keys(api)) {
      api[method] = async (...args) => {
        const path = typeof args[0] === "string" ? args[0].split("?")[0] : "";
        const key = `${method.toUpperCase()} ${path}`.trimEnd();
        const map = activeRoutes.current;
        const pattern = Object.keys(map).find(route => route.endsWith("/*") && key.startsWith(route.slice(0, -1)));
        const handler = map[key] ?? map[pattern];
        if (handler === undefined) throw fixtureError(`Операция вне UI-сценария: ${key}`);
        return typeof handler === "function" ? handler(...args) : structuredClone(handler);
      };
    }
    window.fetch = async (input, options) => {
      const url = new URL(input instanceof Request ? input.url : input, window.location.href);
      const method = options?.method ?? (input instanceof Request ? input.method : "GET");
      const transport = activeRoutes.current[`FETCH ${method} ${url.pathname}`];
      if (url.origin === window.location.origin && transport) return transport(input, options);
      return previousFetch(input, options);
    };
    setReady(true);
    return () => {
      window.fetch = previousFetch;
      Object.assign(api, original);
    };
  }, []);
  return ready ? children : null;
}

const noRoutes = {};
function StoryContent({ children, route }) {
  useVisualViewport();
  return <>
    <Routes>
      <Route path={route} element={children} />
    </Routes>
    <Toaster />
  </>;
}

export function Scenario({ children, path = "/", route = "*", user = owner, routes = noRoutes, access }) {
  const content = <MobileFormPages><StoryContent route={route}>{children}</StoryContent></MobileFormPages>;
  const effectiveRoutes = access ? {
    "GET /sphere-shares/context": { owner: access.readOnly ? person : user, isOwner: !access.readOnly, people: [], requests: [] },
    ...routes,
  } : routes;
  return <FixtureBoundary routes={effectiveRoutes}>
    <MemoryRouter initialEntries={[path]}>
      <SessionContext.Provider value={{ user, loading: false, refresh: async () => user, setSession: noop }}>
        <CollectionNavigationProvider>
          <ToastProvider>
            <ProfileEditorProvider>
              {access ? <SphereSharingProvider currentUser={user} scope={access} search={access.readOnly ? "?owner=storybook-member" : ""}>
                {content}
              </SphereSharingProvider> : content}
            </ProfileEditorProvider>
          </ToastProvider>
        </CollectionNavigationProvider>
      </SessionContext.Provider>
    </MemoryRouter>
  </FixtureBoundary>;
}

export function Page({ children, title, className = "" }) {
  return <div className="rollapp-story">
    <main className={`app-page page-stack rollapp-body ${className}`}>
      {title && <header className="typeset typeset-rollapp"><h1>{title}</h1></header>}
      {children}
    </main>
  </div>;
}

export function Examples({ children }) {
  return <div className="rollapp-story__examples">{children}</div>;
}

export function Example({ title, children }) {
  return <section><h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>{children}</section>;
}
