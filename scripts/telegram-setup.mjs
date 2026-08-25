#!/usr/bin/env node
/**
 * telegram-setup.mjs — manage the @rollappRFbot webhook, menu button, and commands.
 *
 * Usage:
 *   node scripts/telegram-setup.mjs status   Show getMe + getWebhookInfo.
 *   node scripts/telegram-setup.mjs setup    setWebhook + setChatMenuButton + setMyCommands.
 *   node scripts/telegram-setup.mjs unset    deleteWebhook + reset the menu button to default.
 *
 * Environment (from process env, falling back to a local .env file):
 *   TELEGRAM_BOT_TOKEN       Bot token from @BotFather (required).
 *   TELEGRAM_WEBHOOK_SECRET  Secret token sent back to Telegram as
 *                            x-telegram-bot-api-secret-token on every webhook
 *                            call (required for `setup`, >= 32 random chars).
 *   TELEGRAM_WEBAPP_URL      Mini App URL for the chat menu button
 *                            (default: https://xn--80avakiab.xn--p1ai).
 *
 * No dependencies: Node 22+ with global fetch.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEBHOOK_URL = 'https://xn--80avakiab.xn--p1ai/api/telegram/webhook';
const DEFAULT_WEBAPP_URL = 'https://xn--80avakiab.xn--p1ai';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

/** Minimal KEY=VALUE parser; env variables already set always win. */
async function loadDotEnv() {
  let text;
  try {
    text = await readFile(path.join(repoRoot, '.env'), 'utf8');
  } catch {
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

let botToken = '';

async function callApi(method, params) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params ?? {}),
  });
  const payload = await response.json().catch(() => null);
  if (!payload || payload.ok !== true) {
    console.error(`${method}: FAILED (HTTP ${response.status})`);
    console.error(JSON.stringify(payload, null, 2));
    process.exitCode = 1;
    return null;
  }
  console.log(`${method}: ok`);
  if (payload.result !== undefined) console.log(JSON.stringify(payload.result, null, 2));
  return payload.result;
}

async function commandStatus() {
  await callApi('getMe');
  await callApi('getWebhookInfo');
}

async function commandSetup() {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  if (secret.length < 32) {
    fail('TELEGRAM_WEBHOOK_SECRET must be set to at least 32 random characters.');
  }
  const webappUrl = process.env.TELEGRAM_WEBAPP_URL || DEFAULT_WEBAPP_URL;

  await callApi('setWebhook', {
    url: WEBHOOK_URL,
    secret_token: secret,
    allowed_updates: ['message'],
  });
  await callApi('setChatMenuButton', {
    menu_button: {
      type: 'web_app',
      text: 'Открыть Rollapp',
      web_app: { url: webappUrl },
    },
  });
  await callApi('setMyCommands', {
    commands: [{ command: 'start', description: 'Открыть Rollapp' }],
  });
  console.log('Setup finished. Verify with: node scripts/telegram-setup.mjs status');
}

async function commandUnset() {
  await callApi('deleteWebhook', { drop_pending_updates: true });
  // There is no deleteChatMenuButton; reset by setting the default button.
  await callApi('setChatMenuButton', { menu_button: { type: 'default' } });
  console.log('Webhook removed and menu button reset to default.');
}

async function main() {
  await loadDotEnv();
  botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!botToken) {
    fail('TELEGRAM_BOT_TOKEN is not set (env or .env). Get it from @BotFather.');
  }

  const command = process.argv[2];
  switch (command) {
    case 'status':
      await commandStatus();
      break;
    case 'setup':
      await commandSetup();
      break;
    case 'unset':
      await commandUnset();
      break;
    default:
      console.error('Usage: node scripts/telegram-setup.mjs <status|setup|unset>');
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error?.message || error}`);
  process.exit(1);
});
