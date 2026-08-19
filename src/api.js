const API_ROOT = "/api";

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });
  } catch (cause) {
    const error = new Error("Сервер временно недоступен. Подождите пару секунд и попробуйте снова.", { cause });
    error.code = "API_UNAVAILABLE";
    throw error;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Что-то пошло не так");
    error.status = response.status;
    error.code = payload.code || "";
    error.payload = payload;
    error.retryAfterSeconds = Number(payload.retryAfterSeconds || response.headers.get("Retry-After")) || 0;
    throw error;
  }
  return payload;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: "DELETE" }),
  uploadImage: (file) => request("/uploads/images", {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  }),
};
