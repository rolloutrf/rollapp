import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from './api.js';

test('story upload uses a bare container MIME with the original blob and authenticated credentials', async () => {
  const originalFetch = globalThis.fetch;
  const recording = new Blob(['recording'], { type: 'video/mp4;codecs=avc1.42001f,mp4a.40.2' });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/stories');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'video/mp4');
    assert.equal(options.body, recording);
    assert.equal(options.credentials, 'include');
    return new Response(JSON.stringify({ id: 'published' }), { status: 201 });
  };
  try { assert.equal((await api.uploadStory(recording)).id, 'published'); }
  finally { globalThis.fetch = originalFetch; }
});
