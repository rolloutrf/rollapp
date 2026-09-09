const MODELS_URL = "https://openrouter.ai/api/v1/models";
const KEY_URL = "https://openrouter.ai/api/v1/key";
const CACHE_MS = 5 * 60_000;

export class OpenRouterSettingsError extends Error {
  constructor(message, { status = 503, code = "openrouter_unavailable" } = {}) {
    super(message);
    this.name = "OpenRouterSettingsError";
    this.status = status;
    this.code = code;
  }
}

export function normalizeOpenRouterModels(payload) {
  if (!Array.isArray(payload?.data)) {
    throw new OpenRouterSettingsError("Не удалось получить список моделей OpenRouter");
  }
  const models = new Map();
  for (const model of payload.data) {
    if (!model || typeof model !== "object") continue;
    const parameters = Array.isArray(model.supported_parameters) ? model.supported_parameters : [];
    // Marketplace search uses a web-search tool and a strict JSON schema.
    if (!model.architecture?.input_modalities?.includes("text")
      || !model.architecture?.output_modalities?.includes("text")
      || !parameters.includes("tools")
      || !parameters.includes("structured_outputs")
      || !parameters.includes("max_tokens")
      || typeof model.id !== "string" || !model.id || model.id.length > 200
      || model.id.endsWith(":batch")) continue;
    models.set(model.id, {
      id: model.id,
      name: String(model.name || model.id),
      contextLength: Number(model.context_length) || 0,
    });
  }
  return [...models.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function createOpenRouterModelCatalog({ fetchImpl = fetch, now = Date.now } = {}) {
  let cached = null;
  let expiresAt = 0;
  let pending = null;
  return async function listModels() {
    if (cached && now() < expiresAt) return cached;
    if (pending) return pending;
    pending = Promise.resolve().then(async () => {
      try {
        const response = await fetchImpl(MODELS_URL, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
          redirect: "error",
        });
        if (!response.ok) throw new Error("Model catalogue unavailable");
        const models = normalizeOpenRouterModels(await response.json());
        if (!models.length) throw new Error("Empty model catalogue");
        cached = models;
        expiresAt = now() + CACHE_MS;
        return models;
      } catch {
        throw new OpenRouterSettingsError("Не удалось загрузить модели OpenRouter. Попробуйте ещё раз.");
      } finally {
        pending = null;
      }
    });
    return pending;
  };
}

export const listOpenRouterModels = createOpenRouterModelCatalog();

export async function validateOpenRouterModel(modelId, { listModels = listOpenRouterModels } = {}) {
  if (!(await listModels()).some((model) => model.id === modelId)) {
    throw new OpenRouterSettingsError("Выберите доступную модель из списка OpenRouter", {
      status: 400,
      code: "openrouter_model_invalid",
    });
  }
  return modelId;
}

export async function validateOpenRouterKey(apiKey, { fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(KEY_URL, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
  } catch {
    throw new OpenRouterSettingsError("Не удалось проверить ключ OpenRouter. Попробуйте ещё раз.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new OpenRouterSettingsError("OpenRouter отклонил ключ. Проверьте его и попробуйте ещё раз.", {
      status: 400,
      code: "openrouter_key_invalid",
    });
  }
  if (!response.ok) {
    throw new OpenRouterSettingsError("OpenRouter временно не может проверить ключ. Попробуйте ещё раз.");
  }
  const payload = await response.json().catch(() => null);
  if (!payload?.data || payload.data.is_management_key || payload.data.is_provisioning_key) {
    throw new OpenRouterSettingsError("Нужен обычный API-ключ для запросов к моделям, а не ключ управления.", {
      status: 400,
      code: "openrouter_key_invalid",
    });
  }
}

export function resolveOpenRouterModel(credential, { source, defaultModel } = {}) {
  return source === "user" && credential?.model ? credential.model : defaultModel;
}
