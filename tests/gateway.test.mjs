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

test('文字回信端到端链路返回统一 provider 的回复和状态', async () => {
  const store = new SqliteStore();
  const service = new LetterService({
    store,
    modelAdapter: new ModelAdapter({ generate: async ({ prompt }) => ({ text: `收到：${prompt}`, provider: 'fake-external' }) }),
    limits: { bypass: true },
  });
  const server = createLocalGateway({ letterService: service });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const sent = await fetch(`${base}/toy/letter/send`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: '端到端测试' }),
    });
    const sentData = (await sent.json()).data;
    const processed = await fetch(`${base}/letter/process`, { method: 'POST' });
    assert.equal((await processed.json()).status, 'replied');
    const detail = await fetch(`${base}/toy/letter/detail?letterId=${sentData.letterId}`);
    const detailData = (await detail.json()).data;
    assert.equal(detailData.letterStatus, 4); // 0.0.9.627 的 REPLIED 是数字枚举。
    assert.equal(detailData.auditStatus, 2);
    assert.equal(detailData.replyText, '收到：端到端测试');
    assert.equal(detailData.replyType, 1);
    assert.equal((await (await fetch(`${base}/toy/letter/unread_count`)).json()).data.unreadCount, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    store.close();
  }
});

for (const naming of ['snake_case', 'camelCase']) test(`MIDI client contract: upload, generation and polling with ${naming} requests`, async t => {
  const store = new SqliteStore();
  const service = new LetterService({ store, modelAdapter: new ModelAdapter(new FallbackLetterProvider()), limits: { bypass: true } });
  const midiService = new MidiJobService({ store });
  const server = createLocalGateway({ letterService: service, midiJobService: midiService });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const field = name => naming === 'snake_case' ? name.replace(/[A-Z]/g, char => `_${char.toLowerCase()}`) : name;
  const origin = 'https://olivia.local';
  const clientRequest = async (path, body) => {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { origin, 'content-type': 'application/json', 'x-pkg_version': '0.0.9.627' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    const envelope = await response.json();
    // The game's response interceptor rejects a missing/nonzero code before the
    // upload component ever receives the URL. HTTP 200 alone is insufficient.
    assert.equal(envelope.code, 0, `game would reject ${path} as a network error`);
    assert.equal(envelope.message, 'success');
    assert.ok(envelope.data);
    return envelope.data;
  };
  const upload = await clientRequest('/toy/genObjectUploadUrl', { filename: 'test.mid', type: 12 });
  assert.ok(upload.key);
  const preflight = await fetch(upload.url, { method: 'OPTIONS', headers: {
    origin, 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type',
  } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.match(preflight.headers.get('access-control-allow-methods'), /PUT/);
  const uploaded = await fetch(upload.url, { method: 'PUT', headers: { origin, ...upload.headers }, body: midi });
  assert.equal(uploaded.status, 200);
  // The real upload callback returns the storage key, then snake-cases midiUrl.
  const job = await clientRequest('/toy/midi/generate', { [field('midiUrl')]: upload.key, filename: 'test.mid' });
  assert.equal(job.state, 3); // De.Finished in the original client.
  assert.equal(midiService.get(job.jobId).state, 'finished');
  assert.equal(job.status, 'produced');
  assert.equal('mediaPath' in job, false);
  const result = await clientRequest(`/toy/midi/getGenerateResult?${field('jobId')}=${job.jobId}`);
  assert.equal(result.state, 3);
  assert.equal(result.info.videoUrls.length, 1);
  const userSongs = await clientRequest(`/toy/searchUserSongs?${field('pageSize')}=1&cursor=0`);
  assert.equal(userSongs.list[0].userSongId, job.jobId);
  assert.equal(userSongs.hasMore, false);
  const media = await fetch(result.info.audioUrl);
  assert.equal(media.headers.get('content-type'), 'audio/wav');
  assert.equal(media.headers.get('accept-ranges'), 'bytes');
  assert.equal((await media.arrayBuffer()).byteLength > 44, true);
  const head = await fetch(result.info.audioUrl, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(Number(head.headers.get('content-length')), Number(media.headers.get('content-length')));
  const range = await fetch(result.info.audioUrl, { headers: { range: 'bytes=0-15' } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('content-range'), `bytes 0-15/${media.headers.get('content-length')}`);
  assert.equal((await range.arrayBuffer()).byteLength, 16);
  const suffix = await fetch(result.info.audioUrl, { headers: { range: 'bytes=-8' } });
  assert.equal(suffix.status, 206);
  assert.equal(suffix.headers.get('content-range'), `bytes ${Number(media.headers.get('content-length')) - 8}-${Number(media.headers.get('content-length')) - 1}/${media.headers.get('content-length')}`);
  assert.equal((await suffix.arrayBuffer()).byteLength, 8);

  const invalidUpload = await clientRequest('/toy/genObjectUploadUrl', { filename: 'broken.mid' });
  await fetch(invalidUpload.url, { method: 'PUT', body: 'invalid MIDI' });
  const failed = await clientRequest('/toy/midi/generate', { [field('midiUrl')]: invalidUpload.url });
  assert.equal(failed.state, 5);
  const page = await clientRequest(`/toy/midi/listJobs?${field('pageSize')}=1&cursor=0`);
  assert.equal(page.list.length, 1);
  assert.equal(typeof page.list[0].state, 'number');
  assert.equal(page.total, 2);
  assert.equal(page.hasMore, true);
  const nextPage = await clientRequest(`/toy/midi/listJobs?${field('pageSize')}=1&cursor=${page.nextCursor}`);
  assert.equal(nextPage.list.length, 1);
  assert.notEqual(nextPage.list[0].jobId, page.list[0].jobId);
  assert.equal(nextPage.hasMore, false);

  const batch = await clientRequest(`/toy/midi/batchGetResult?${field('jobIds')}=${job.jobId}&${field('jobIds')}=${failed.jobId}`);
  assert.deepEqual(batch.results.map(item => item.state), [3, 5]);
  assert.equal(batch.generatedToday, 1);
  assert.equal(batch.dailyLimit, 3);
  const commaBatch = await clientRequest(`/toy/midi/batchGetResult?${field('jobIds')}=${job.jobId},${failed.jobId}`);
  assert.deepEqual(commaBatch.results.map(item => item.jobId), [job.jobId, failed.jobId]);
  const fallbackBatch = await clientRequest('/toy/midi/batchGetResult');
  assert.deepEqual(new Set(fallbackBatch.results.map(item => item.jobId)), new Set([job.jobId, failed.jobId]));
  const canceled = await clientRequest('/toy/midi/cancelGenerate', { [field('jobId')]: job.jobId });
  assert.equal(canceled.state, 3); // A completed task must stay completed.
  const deleted = await clientRequest('/toy/midi/deleteJob', { [field('jobId')]: failed.jobId });
  assert.equal(deleted.deleted, true);
  const missing = await clientRequest(`/toy/midi/getGenerateResult?${field('jobId')}=${failed.jobId}`);
  assert.equal(missing.state, 5);
  assert.equal(missing.error, 'job_not_found');
});

test('MIDI gateway serves encoded media with the encoder MIME type and extension', async t => {
  const store = new SqliteStore();
  const letters = new LetterService({ store, modelAdapter: new ModelAdapter(new FallbackLetterProvider()), limits: { bypass: true } });
  const encoder = Object.assign(() => Buffer.from('encoded-media'), { extension: 'mp4', contentType: 'video/mp4' });
  const midiService = new MidiJobService({ store, mediaEncoder: encoder });
  const server = createLocalGateway({ letterService: letters, midiJobService: midiService });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const upload = await (await fetch(`${base}/toy/genObjectUploadUrl`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: 'encoded.mid' }) })).json();
  await fetch(upload.data.url, { method: 'PUT', body: midi });
  const generated = await (await fetch(`${base}/toy/midi/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ midiUrl: upload.data.key }) })).json();
  assert.match(generated.data.info.audioUrl, /\.mp4$/u);
  const media = await fetch(generated.data.info.audioUrl);
  assert.equal(media.headers.get('content-type'), 'video/mp4');
  assert.equal(Buffer.from(await media.arrayBuffer()).toString(), 'encoded-media');
});
