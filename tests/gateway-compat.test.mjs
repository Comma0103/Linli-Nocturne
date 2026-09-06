import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../src/storage/sqlite-store.js';
import { createLocalGateway } from '../src/gateway/local-gateway.js';
import { FallbackLetterProvider, ModelAdapter } from '../src/letters/model-adapter.js';
import { LetterService } from '../src/letters/letter-service.js';
import { MusicService } from '../src/music/music-service.js';

test('0.0.9.627 信件列表和详情使用原版数字状态，领域状态保持字符串', async t => {
  const store = new SqliteStore();
  const replyGate = Promise.withResolvers();
  const letters = new LetterService({ store, limits: { bypass: true, maxAttempts: 1 }, modelAdapter: new ModelAdapter({
    generate: async ({ prompt }) => {
      if (prompt === '失败测试') throw new Error('测试生成失败');
      return replyGate.promise;
    },
  }) });
  const server = createLocalGateway({ letterService: letters });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async path => {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.code, 0);
    return payload.data;
  };
  const letter = letters.send({ body: '显示回信测试' });
  const checkState = async (id, internalStatus, nativeStatus) => {
    const item = (await get('/toy/letter/list')).list.find(entry => entry.letterId === id);
    const detail = await get(`/toy/letter/detail?letterId=${id}`);
    for (const entry of [item, detail]) {
      assert.equal(entry.letterStatus, nativeStatus);
      assert.equal(entry.auditStatus, 2);
    }
    assert.equal(store.getLetter(id).status, internalStatus);
    return detail;
  };
  const pending = await checkState(letter.id, 'pending', 1);
  assert.equal(pending.replyType, 0);
  assert.equal(pending.replyText, null);
  assert.equal(store.getLetter(letter.id).read_at, null);

  const processing = letters.processNext();
  const active = await checkState(letter.id, 'processing', 3);
  assert.equal(active.replyText, null);
  assert.equal(store.getLetter(letter.id).read_at, null);
  replyGate.resolve({ text: '这是一封可以显示的回信。', provider: 'fake' });
  await processing;
  assert.equal((await get('/toy/letter/unread_count')).unreadCount, 1);
  const replied = await checkState(letter.id, 'replied', 4);
  // 原版只在数字 REPLIED 且非 NONE 时建立回信对象，TEXT 决定正文展示。
  assert.equal(replied.replyType, 1);
  assert.equal(replied.replyText, '这是一封可以显示的回信。');
  assert.equal(replied.isRead, 1);
  assert.equal((await get('/toy/letter/unread_count')).unreadCount, 0);
  const domain = await (await fetch(`${base}/letter/send/detail/${letter.id}`)).json();
  assert.equal(domain.status, 'replied');

  const failed = letters.send({ body: '失败测试' });
  await letters.processNext();
  const error = await checkState(failed.id, 'failed', 5);
  assert.equal(error.replyType, 0);
  assert.equal(error.replyText, null);
  assert.equal(error.error, 'provider_failed');
});

test('toy compatibility routes expose local letters and playlist shapes', async () => {
  const store = new SqliteStore();
  const letters = new LetterService({ store, modelAdapter: new ModelAdapter(new FallbackLetterProvider()), limits: { bypass: true } });
  const music = new MusicService({ store });
  const server = createLocalGateway({ letterService: letters, musicService: music, userProfile: { nickname: '林离' } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/toy/signIn`, { method: 'POST', body: '{}' });
  assert.equal((await login.json()).data.userInfo.nickname, '林离');
  const sent = await fetch(`${base}/toy/letter/send`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: '兼容测试' }) });
  assert.equal((await sent.json()).code, 0);
  await fetch(`${base}/letter/process`, { method: 'POST' });
  const list = await fetch(`${base}/toy/letter/list`);
  const listPayload = await list.json();
  assert.equal(listPayload.data.list[0].content, '兼容测试');
  assert.equal(listPayload.data.remainingToday, 3, 'bypass 模式继续允许客户端打开写信入口');
  const added = await fetch(`${base}/toy/addToPlaylist`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemType: 3, itemId: 'local-1', name: '本地曲目' }) });
  assert.equal((await added.json()).data.itemId, 'local-1');
  const playlist = await fetch(`${base}/toy/searchPlaylist`);
  assert.equal((await playlist.json()).data.list[0].name, '本地曲目');
  await new Promise(resolve => server.close(resolve));
  store.close();
});

test('toy compatibility routes allow browser CORS preflight and follow-up reads', async () => {
  const store = new SqliteStore();
  const letters = new LetterService({ store, modelAdapter: new ModelAdapter(new FallbackLetterProvider()), limits: { bypass: true } });
  const server = createLocalGateway({ letterService: letters });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const preflight = await fetch(`${base}/toy/letter/list?page_size=20`, {
    method: 'OPTIONS',
    headers: { origin: 'http://localhost', 'access-control-request-method': 'GET', 'access-control-request-headers': 'content-type,x-device_id' },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost');
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
  assert.match(preflight.headers.get('access-control-allow-methods'), /GET/);
  assert.match(preflight.headers.get('access-control-allow-headers'), /content-type/);
  assert.match(preflight.headers.get('access-control-allow-headers'), /x-device_id/);
  const list = await fetch(`${base}/toy/letter/list?page_size=20`);
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).data.list, []);
  await new Promise(resolve => server.close(resolve));
  store.close();
});
