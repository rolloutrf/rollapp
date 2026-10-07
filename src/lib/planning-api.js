import { api } from "@/api";

// Capture the selected space per render so pending saves cannot cross into another board.
export function planningApi(spaceId) {
  const path = (suffix) => `/planning/${suffix}?space=${encodeURIComponent(spaceId)}`;
  return {
    get: (suffix) => api.get(path(suffix)),
    post: (suffix, body) => api.post(path(suffix), body),
    patch: (suffix, body) => api.patch(path(suffix), body),
    delete: (suffix) => api.delete(path(suffix)),
  };
}
