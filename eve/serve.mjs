import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadNotificationWorkerToken } from '../server/modules/notifications/worker-token.js';

if (!await loadNotificationWorkerToken()) throw new Error('Eve notification worker token is missing');
const worker = spawn(process.execPath, ['node_modules/eve/bin/eve.js', 'start', '--host', '127.0.0.1'], {
  cwd: fileURLToPath(new URL('.', import.meta.url)), stdio: 'inherit',
});
worker.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGTERM' ? 0 : 1); });
