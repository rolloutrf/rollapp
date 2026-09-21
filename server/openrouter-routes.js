import { z } from "zod";
import { DEFAULT_MODEL } from "./openrouter-marketplace-offers.js";
import { encryptUserCredential, userCredentialHint, userCredentialsConfigured, UserCredentialsError } from "./user-credentials.js";
import { listOpenRouterModels, OpenRouterSettingsError, validateOpenRouterKey, validateOpenRouterModel } from "./openrouter-settings.js";

const openRouterCredentialSchema = z.object({
  apiKey: z.string().trim().min(20).max(512).regex(/^sk-or-v1-[A-Za-z0-9_-]+$/),
  model: z.string().trim().min(1).max(200).optional(),
}).strict();
const openRouterModelSchema = z.object({ model: z.string().trim().min(1).max(200) }).strict();
const OPENROUTER_CREDENTIAL_PROVIDER = "openrouter";

export async function readOpenRouterCredential(query, userId) {
  const result = await query(
    `SELECT encrypted_secret,secret_hint,model,updated_at
     FROM user_ai_credentials WHERE user_id=$1 AND provider=$2`,
    [userId, OPENROUTER_CREDENTIAL_PROVIDER],
  );
  return result.rows[0] || null;
}

export function registerOpenRouterRoutes(app, {
  query, requireAuth, authRateLimit, asyncRoute,
  listModels = listOpenRouterModels, validateKey = validateOpenRouterKey, validateModel = validateOpenRouterModel,
}) {
  function openRouterCredentialStatus(credential) {
    return {
      available: userCredentialsConfigured(),
      configured: Boolean(credential),
      keyHint: credential?.secret_hint || "",
      model: credential?.model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
      defaultModel: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
      serverFallbackConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    };
  }

  app.get("/api/me/openrouter", requireAuth, asyncRoute(async (req, res) => {
    const credential = await readOpenRouterCredential(query, req.user.id);
    res.set("Cache-Control", "private, no-store");
    return res.json(openRouterCredentialStatus(credential));
  }));

  app.get("/api/me/openrouter/models", requireAuth, asyncRoute(async (_req, res) => {
    res.set("Cache-Control", "private, no-store");
    try {
      return res.json({ models: await listModels() });
    } catch (error) {
      if (error instanceof OpenRouterSettingsError) return res.status(error.status).json({ error: error.message, code: error.code });
      throw error;
    }
  }));

  app.patch("/api/me/openrouter", requireAuth, authRateLimit, asyncRoute(async (req, res) => {
    const parsed = openRouterModelSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Выберите модель OpenRouter", code: "openrouter_model_invalid" });
    const credential = await readOpenRouterCredential(query, req.user.id);
    if (!credential) return res.status(409).json({ error: "Сначала подключите личный ключ OpenRouter", code: "openrouter_key_required" });
    try {
      await validateModel(parsed.data.model);
    } catch (error) {
      if (error instanceof OpenRouterSettingsError) return res.status(error.status).json({ error: error.message, code: error.code });
      throw error;
    }
    const result = await query(
      `UPDATE user_ai_credentials SET model=$3,updated_at=CURRENT_TIMESTAMP
       WHERE user_id=$1 AND provider=$2 RETURNING secret_hint,model,updated_at`,
      [req.user.id, OPENROUTER_CREDENTIAL_PROVIDER, parsed.data.model],
    );
    if (!result.rowCount) return res.status(409).json({ error: "Ключ был отключён. Подключите его заново.", code: "openrouter_key_required" });
    res.set("Cache-Control", "private, no-store");
    return res.json(openRouterCredentialStatus(result.rows[0]));
  }));

  app.post("/api/me/openrouter", requireAuth, authRateLimit, asyncRoute(async (req, res) => {
    const parsed = openRouterCredentialSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Введите действующий API-ключ OpenRouter в формате sk-or-v1-…",
        code: "openrouter_key_invalid",
      });
    }
    let encryptedSecret;
    let model;
    try {
      const current = await readOpenRouterCredential(query, req.user.id);
      model = parsed.data.model || current?.model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
      encryptedSecret = encryptUserCredential(parsed.data.apiKey, {
        userId: req.user.id,
        provider: OPENROUTER_CREDENTIAL_PROVIDER,
      });
      await validateKey(parsed.data.apiKey);
      await validateModel(model);
    } catch (error) {
      if (error instanceof OpenRouterSettingsError) return res.status(error.status).json({ error: error.message, code: error.code });
      if (error instanceof UserCredentialsError) {
        return res.status(503).json({ error: error.message, code: error.code });
      }
      throw error;
    }
    const hint = userCredentialHint(parsed.data.apiKey);
    const result = await query(
      `INSERT INTO user_ai_credentials (user_id,provider,encrypted_secret,secret_hint,model)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id,provider) DO UPDATE SET
         encrypted_secret=EXCLUDED.encrypted_secret,
         secret_hint=EXCLUDED.secret_hint,
         model=EXCLUDED.model,
         updated_at=CURRENT_TIMESTAMP
       RETURNING secret_hint,model,updated_at`,
      [req.user.id, OPENROUTER_CREDENTIAL_PROVIDER, encryptedSecret, hint, model],
    );
    res.set("Cache-Control", "private, no-store");
    return res.json(openRouterCredentialStatus(result.rows[0]));
  }));

  app.delete("/api/me/openrouter", requireAuth, asyncRoute(async (req, res) => {
    await query(
      "DELETE FROM user_ai_credentials WHERE user_id=$1 AND provider=$2",
      [req.user.id, OPENROUTER_CREDENTIAL_PROVIDER],
    );
    res.set("Cache-Control", "private, no-store");
    return res.json(openRouterCredentialStatus(null));
  }));

}
