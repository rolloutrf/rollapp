import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/api";
import { isSphereSection } from "../../shared/sphere-sharing.js";

const SphereSharingContext = createContext({
  active: false,
  loading: false,
  error: null,
  owner: null,
  people: [],
  requests: [],
  isOwner: true,
  readOnly: false,
  sphere: "",
  section: "",
  reload: async () => {},
});

export function sphereScopeFromLocation(pathname, search, tabsBySphere = {}) {
  const sphere = pathname.match(/^\/app\/spheres\/([^/]+)/)?.[1] || "";
  if (!sphere) return null;
  if (sphere === "contacts") return { sphere, section: "contacts" };
  const tabs = tabsBySphere[sphere] || [];
  const requested = new URLSearchParams(search).get("tab");
  const section = tabs.some((tab) => tab.id === requested) ? requested : tabs[0]?.id;
  return section && isSphereSection(sphere, section) ? { sphere, section } : null;
}

export function SphereSharingProvider({ children, currentUser, scope, search }) {
  const requestedOwner = new URLSearchParams(search).get("owner")?.trim().toLowerCase() || "";
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({ loading: Boolean(scope), error: null, context: null });

  useEffect(() => {
    if (!scope) {
      setState({ loading: false, error: null, context: null });
      return undefined;
    }
    let current = true;
    const query = new URLSearchParams({ sphere: scope.sphere, section: scope.section });
    if (requestedOwner) query.set("owner", requestedOwner);
    setState((value) => ({ ...value, loading: true, error: null }));
    api.get(`/sphere-shares/context?${query.toString()}`).then((context) => {
      if (current) setState({ loading: false, error: null, context });
    }).catch((error) => {
      if (current) setState({ loading: false, error, context: null });
    });
    return () => { current = false; };
  }, [requestedOwner, scope?.section, scope?.sphere, version]);

  const value = useMemo(() => {
    const context = state.context;
    const owner = context?.owner || (!requestedOwner ? currentUser : null);
    const isOwner = context?.isOwner ?? !requestedOwner;
    return {
      active: Boolean(scope),
      loading: state.loading,
      error: state.error,
      owner,
      people: context?.people || [],
      requests: context?.requests || [],
      isOwner,
      readOnly: Boolean(scope && context && !isOwner),
      sphere: scope?.sphere || "",
      section: scope?.section || "",
      reload: async () => setVersion((value) => value + 1),
    };
  }, [currentUser, requestedOwner, scope, state.context, state.error, state.loading]);

  return <SphereSharingContext.Provider value={value}>{children}</SphereSharingContext.Provider>;
}

export function useSphereSharing() {
  return useContext(SphereSharingContext);
}
