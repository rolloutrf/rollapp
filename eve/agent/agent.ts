import { defineAgent } from 'eve';

export default defineAgent({
  model: 'openai/gpt-6-luna-fast',
  // Scheduled delivery uses a handler. Provide the unused conversation limit
  // explicitly so image builds do not need the AI Gateway model catalog.
  modelContextWindowTokens: 200_000,
});
