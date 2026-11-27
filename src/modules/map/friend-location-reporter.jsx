import { useEffect, useRef, useState } from "react";
import { api } from "@/modules/runtime/api.js";

const LOCATION_SEND_INTERVAL_MS = 25_000;
const STATUS_REFRESH_INTERVAL_MS = 5 * 60_000;

function locationErrorMessage(error) {
  if (error?.code === 1) return "Доступ к геопозиции запрещён в настройках браузера.";
  if (error?.code === 2) return "Не удалось определить геопозицию. Проверьте GPS или сеть.";
  if (error?.code === 3) return "Определение геопозиции заняло слишком много времени.";
  return "Не удалось получить геопозицию.";
}

function notify(type, detail = {}) {
  window.dispatchEvent(new CustomEvent(`rollapp:friend-map-${type}`, { detail }));
}

export function FriendLocationReporter({ userId }) {
  const [sharing, setSharing] = useState(false);
  const lastSentAt = useRef(0);
  const sending = useRef(false);

  useEffect(() => {
    let active = true;
    const load = () => api.get("/friend-map/status")
      .then(result => { if (active) setSharing(result.preferences.shareLocation); })
      .catch(() => {});
    void load();
    const timer = window.setInterval(load, STATUS_REFRESH_INTERVAL_MS);
    const update = event => setSharing(event.detail?.shareLocation === true);
    window.addEventListener("rollapp:friend-map-preferences", update);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("rollapp:friend-map-preferences", update);
    };
  }, [userId]);

  useEffect(() => {
    if (!sharing || !navigator.geolocation) return undefined;
    const watch = navigator.geolocation.watchPosition(position => {
      const now = Date.now();
      if (sending.current || now - lastSentAt.current < LOCATION_SEND_INTERVAL_MS) return;
      sending.current = true;
      lastSentAt.current = now;
      api.post("/friend-map/location", {
        longitude: position.coords.longitude,
        latitude: position.coords.latitude,
        accuracyMeters: Math.min(5000, Math.max(0, position.coords.accuracy || 0)),
      }).then(result => notify("location", result))
        .catch(error => {
          if (error.status === 403) setSharing(false);
          if (error.status !== 429) notify("location-error", { message: error.message });
        })
        .finally(() => { sending.current = false; });
    }, error => notify("location-error", { message: locationErrorMessage(error) }), {
      enableHighAccuracy: true,
      maximumAge: 20_000,
      timeout: 15_000,
    });
    return () => navigator.geolocation.clearWatch(watch);
  }, [sharing, userId]);

  return null;
}
