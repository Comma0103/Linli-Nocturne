import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../src/storage/sqlite-store.js';
import { FallbackLetterProvider, ModelAdapter } from '../src/letters/model-adapter.js';
import { LetterService } from '../src/letters/letter-service.js';
import { createLocalGateway } from '../src/gateway/local-gateway.js';
import { MidiJobService } from '../src/music/midi-job-service.js';

const midi = Uint8Array.from([
  0x4d,0x54,0x68,0x64, 0,0,0,6, 0,0, 0,1, 0x01,0x00,
  0x4d,0x54,0x72,0x6b, 0,0,0,12,
  0x00,0x90,0x3c,0x64, 0x40,0x80,0x3c,0x40, 0x00,0xff,0x2f,0x00
]);

test('local gateway smoke test covers health, send, process and list', async () => {
  const store = new SqliteStore();
  const service = new LetterService({ store, modelAdapter: new ModelAdapter(new FallbackLetterProvider()), limits: { bypass: true } });
  const server = createLocalGateway({ letterService: service });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  const sent = await fetch(`${base}/letter/send`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: '网关测试' }) });
  assert.equal(sent.status, 200);
  const processed = await fetch(`${base}/letter/process`, { method: 'POST' });
  assert.equal((await processed.json()).status, 'replied');
  const list = await fetch(`${base}/letter/send/list`);
  assert.equal((await list.json()).letters.length, 1);
  await new Promise(resolve => server.close(resolve));
  store.close();
});

test('local gateway supports the original MIDI upload and polling contract', async () => {
  const store = new SqliteStore();
  const service = new LetterService({ store, modelAdapter: new ModelAdapter(new FallbackLetterProvider()), limits: { bypass: true } });
  const server = createLocalGateway({ letterService: service, midiJobService: new MidiJobService() });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const upload = await (await fetch(`${base}/toy/genObjectUploadUrl`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: 'test.mid', type: 12 }) })).json();
  assert.ok(upload.key);
  const uploaded = await fetch(upload.url, { method: 'PUT', body: midi });
  assert.equal(uploaded.status, 200);
  const job = await (await fetch(`${base}/toy/midi/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ midiUrl: upload.url, filename: 'test.mid' }) })).json();
  assert.equal(job.state, 'finished');
  const result = await (await fetch(`${base}/toy/midi/getGenerateResult?jobId=${job.jobId}`)).json();
  assert.equal(result.info.videoUrls.length, 1);
  const userSongs = await (await fetch(`${base}/toy/searchUserSongs?pageSize=1&cursor=0`)).json();
  assert.equal(userSongs.list[0].userSongId, job.jobId);
  assert.equal(userSongs.hasMore, false);
  const media = await fetch(result.info.audioUrl);
  assert.equal(media.headers.get('content-type'), 'audio/wav');
  assert.equal((await media.arrayBuffer()).byteLength > 44, true);
  await new Promise(resolve => server.close(resolve));
  store.close();
});
