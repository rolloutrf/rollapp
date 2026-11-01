// Applied only by the separate, explicitly authorized messenger migration.
export const messengerSchema = `
CREATE TABLE IF NOT EXISTS messenger_conversations (
  id UUID PRIMARY KEY,
  user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (user_a < user_b), UNIQUE (user_a, user_b)
);
CREATE TABLE IF NOT EXISTS messenger_messages (
  seq BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES messenger_conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (sender_id, client_id)
);
CREATE INDEX IF NOT EXISTS messenger_messages_history ON messenger_messages(conversation_id, seq DESC);
CREATE INDEX IF NOT EXISTS messenger_conversations_a ON messenger_conversations(user_a, updated_at DESC);
CREATE INDEX IF NOT EXISTS messenger_conversations_b ON messenger_conversations(user_b, updated_at DESC);
CREATE TABLE IF NOT EXISTS messenger_reads (
  conversation_id UUID NOT NULL REFERENCES messenger_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_seq BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, user_id)
);
`;
