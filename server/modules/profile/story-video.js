import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const execute = promisify(execFile);
export const STORY_MAX_BYTES = 25 * 1024 * 1024;
export const STORY_SECONDS = 60;
// Always decode and encode: neither MIME headers nor client duration are trusted.
export async function normalizeStoryVideo(data) {
  const directory = await mkdtemp(path.join(tmpdir(), 'rollapp-story-'));
  try {
    const input = path.join(directory, 'input');
    const output = path.join(directory, 'story.mp4');
    await writeFile(input, data);
    await execute('ffmpeg', ['-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe',
      '-format_whitelist', 'mov,matroska,webm', '-i', input, '-t', String(STORY_SECONDS), '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', "scale=w='min(720,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
      '-c:v', 'libx264', '-preset', 'veryfast', '-threads', '2', '-crf', '26', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-y', output],
    { timeout: 120_000, maxBuffer: 64 * 1024 });
    const { stdout } = await execute('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', output], { timeout: 10_000 });
    const duration = Number(JSON.parse(stdout).format?.duration);
    const video = await readFile(output);
    if (!(duration > 0) || duration > STORY_SECONDS || !video.length || video.length > STORY_MAX_BYTES) throw new Error('Invalid story video');
    return { video, duration };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
