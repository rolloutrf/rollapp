// Preloaded only by the credential integration test; no requests leave the test process.
if (process.env.NODE_ENV !== "test") throw new Error("OpenRouter fixture requires NODE_ENV=test");

globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url === "https://openrouter.ai/api/v1/key") {
    const valid = options.headers?.Authorization === "Bearer sk-or-v1-integration-private-key-1234";
    return Response.json(valid ? { data: { is_management_key: false } } : { error: { message: "Invalid key" } }, {
      status: valid ? 200 : 401,
    });
  }
  if (url === "https://openrouter.ai/api/v1/models") {
    return Response.json({
      data: ["test/default-model", "test/selected-model"].map((id) => ({
        id,
        name: id,
        context_length: 32_768,
        architecture: { input_modalities: ["text"], output_modalities: ["text"] },
        supported_parameters: ["tools", "structured_outputs", "max_tokens"],
      })),
    });
  }
  throw new Error(`Unexpected request in OpenRouter integration test: ${url}`);
};
