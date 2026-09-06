import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteStore } from '../src/storage/sqlite-store.js';
import { LetterService } from '../src/letters/letter-service.js';
import { LetterWorker } from '../src/letters/letter-worker.js';
import { createDefaultModuleRegistries } from '../src/config/default-module-registries.js';
import { resolveModuleSelections } from '../src/config/module-runtime.js';
import { VideoReplyService } from '../src/letters/video-reply-service.js';
import { createLocalGateway } from '../src/gateway/local-gateway.js';

async function waitFor(check, timeoutMs = 800) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('condition was not reached before timeout');
}

test('Phase 3 总体验收：设置、Worker、provider、记忆和视频回信串联', async t => {
  const store = new SqliteStore();
  const mediaRoot = mkdtempSync(join(tmpdir(), 'linli-phase3-acceptance-'));
  const observed = [];
  const registries = createDefaultModuleRegistries({ store });
  registries.provider.register({ id: 'acceptance.reply', version: '1.0.0', label: 'Phase 3 假 provider', create: () => ({
    provider: 'acceptance.reply',
    generate: async input => { observed.push(input); return { text: `回信：${input.prompt}`, provider: 'acceptance.reply' }; },
  }) });
  const fakeVideo = { id: 'acceptance.video', version: '1.0.0', inspect: async () => ({ container: 'mp4', videoCodec: 'h264', pixelFormat: 'yuv420p', audioCodec: 'aac', duration: 1, width: 320, height: 240 }) };
  registries.videoImporter.register({ id: fakeVideo.id, version: fakeVideo.version, label: 'Phase 3 假视频检查器', create: () => fakeVideo });
  const settings = {
    version: 1,
    letters: { provider: 'acceptance.reply', harness: null, persona: 'static', memory: 'sqlite', fallback: true },
    music: { renderer: 'builtin.audio', playbackAdapter: 'generic', encoder: 'builtin.audio-only-mp4' },
    media: { renderer: 'builtin.audio', videoImporter: fakeVideo.id },
    threeD: { renderer: null },
  };
  const runtime = resolveModuleSelections(settings, { registries, options: { persona: { text: '克制、细腻、记得上下文' } } });
  const letters = new LetterService({ store, modelAdapter: runtime.letters.modelAdapter, memoryProvider: runtime.letters.memoryProvider, personaProvider: runtime.letters.personaProvider, limits: { bypass: true } });
  const worker = new LetterWorker({ letterService: letters, intervalMs: 5, leaseMs: 60_000 });
  const videos = new VideoReplyService({ store, mediaRoot, importAdapter: runtime.media.videoImporter });
  const server = createLocalGateway({ letterService: letters, videoReplyService: videos });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await worker.stop(); await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;

  const first = letters.send({ body: '第一封信' });
  worker.start();
  await waitFor(() => store.getLetter(first.id)?.status === 'replied');
  assert.equal(observed[0].persona, '克制、细腻、记得上下文');
  assert.equal(observed[0].memory, '');

  const second = letters.send({ body: '第二封信' });
  await waitFor(() => store.getLetter(second.id)?.status === 'replied');
  assert.match(observed[1].memory, /第一封信/u);
  assert.equal(store.listMemoryEpisodes('林离').length, 2);

  const upload = await fetch(`${base}/letter/video/upload/${first.id}`, { method: 'PUT', headers: { 'x-file-name': 'reply.mp4', 'content-type': 'video/mp4' }, body: Buffer.from('video') });
  assert.equal(upload.status, 200);
  const job = (await upload.json()).job;
  assert.equal(job.status, 'published');
  const detail = await fetch(`${base}/toy/letter/detail?letterId=${first.id}`);
  const detailData = (await detail.json()).data;
  assert.match(detailData.replyVideoUrl, /\/letter\/video\/media\//u);
  assert.equal((await (await fetch(detailData.replyVideoUrl)).arrayBuffer()).byteLength, 5);
  assert.equal((await (await fetch(`${base}/letter/video/delete/${first.id}`, { method: 'POST' })).json()).deleted, true);
  assert.equal((await (await fetch(`${base}/toy/letter/detail?letterId=${first.id}`)).json()).data.replyVideoUrl, null);
});
