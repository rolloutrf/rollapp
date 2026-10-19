import { useCallback, useEffect, useMemo } from "react";

// Fixed menus use viewport coordinates. A separate body host avoids a
// positioned document ancestor and keeps blur containment local to one editor.
export function useInlineMenuPortal(enabled = true) {
  const host = useMemo(() => {
    const element = document.createElement("div");
    element.className = "inline-editor__overlay not-typeset";
    return element;
  }, []);
  useEffect(() => {
    if (!enabled) return;
    document.body.appendChild(host);
    return () => host.remove();
  }, [host, enabled]);
  return useCallback(() => host, [host]);
}
