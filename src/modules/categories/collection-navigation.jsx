import { createContext, useMemo, useState } from "react";

export const CollectionNavigationContext = createContext(null);

export function CollectionNavigationProvider({ children }) {
  const [collection, setCollection] = useState(null);
  const value = useMemo(() => ({ collection, setCollection }), [collection]);
  return <CollectionNavigationContext.Provider value={value}>{children}</CollectionNavigationContext.Provider>;
}
