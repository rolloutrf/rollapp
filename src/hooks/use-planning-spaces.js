import { useEffect, useState } from "react";
import { api } from "@/api";

export function usePlanningSpaces(kind) {
  const [spaces, setSpaces] = useState([]);
  const [loadedKind, setLoadedKind] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!kind) { setLoadedKind(null); return; }
    let current = true;
    setLoading(true); setError(""); setSpaces([]);
    api.get(`/planning/spaces?kind=${kind}`).then(({ spaces: loaded }) => {
      if (current) setSpaces(kind === "kanban" ? loaded.filter((space) => space.id !== "main") : loaded);
    }).catch((cause) => { if (current) setError(cause.message); })
      .finally(() => { if (current) { setLoadedKind(kind); setLoading(false); } });
    return () => { current = false; };
  }, [kind, retry]);
  return { spaces: loadedKind === kind ? spaces : [], setSpaces, loading: loading || loadedKind !== kind, error: loadedKind === kind ? error : "", reload: () => setRetry((value) => value + 1) };
}
