import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { normalizeStoryVideo } from './story-video.js';
const execute = promisify(execFile);
test('real encoder trims a 61-second recording to at most 60 seconds', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rollapp-story-test-'));
  try {
    const filename = path.join(directory, 'long.mp4');
    await execute('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=orange:s=32x32:r=10', '-f', 'lavfi', '-i', 'anullsrc', '-t', '61', '-c:v', 'libx264', '-c:a', 'aac', '-y', filename]);
    const result = await normalizeStoryVideo(await readFile(filename));
    assert(result.duration > 59 && result.duration <= 60, `duration ${result.duration}`);
    assert(result.video.length > 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('encoder rejects non-video input', async () => {
  await assert.rejects(normalizeStoryVideo(Buffer.from('not a video')));
});

test('encoder refuses playlist input and external file references', async () => {
  await assert.rejects(normalizeStoryVideo(Buffer.from('ffconcat version 1.0\nfile /etc/passwd\n')));
});
