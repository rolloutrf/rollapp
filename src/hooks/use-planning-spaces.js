import { useEffect, useState } from "react";
import { api } from "@/api";

export function usePlanningSpaces(kind) {
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setLoading(true); setError("");
    api.get(`/planning/spaces?kind=${kind}`).then(({ spaces: loaded }) => {
      if (current) setSpaces(kind === "kanban" ? loaded.filter((space) => space.id !== "main") : loaded);
    }).catch((cause) => { if (current) setError(cause.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [kind, retry]);
  return { spaces, setSpaces, loading, error, reload: () => setRetry((value) => value + 1) };
}
