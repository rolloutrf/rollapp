import { useCallback, useEffect, useMemo, useState } from "react";
import { planningApi } from "@/lib/planning-api";
const EMPTY_EVENTS = [];
export function useDeviceCalendar(spaceId, enabled, transport) {
  const api = useMemo(() => transport || planningApi(spaceId), [spaceId, transport]);
  const [result, setResult] = useState({ spaceId, events: [], error: "" }), [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let active = true, inFlight = false;
    const load = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try { const { events } = await api.get("calendar-device/events"); if (active) setResult({ spaceId, events, error: "" }); }
      catch (cause) { if (active) setResult(previous => ({ spaceId, events: previous.spaceId === spaceId ? previous.events : [], error: cause.message })); }
      finally { inFlight = false; }
    };
    load(); const timer = setInterval(load, 30000); window.addEventListener("focus", load); document.addEventListener("visibilitychange", load);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", load); document.removeEventListener("visibilitychange", load); };
  }, [spaceId, enabled, api, revision]);
  return { events: enabled && result.spaceId === spaceId ? result.events : EMPTY_EVENTS, error: enabled && result.spaceId === spaceId ? result.error : "", refresh };
}
