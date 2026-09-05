import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../src/storage/sqlite-store.js';
import { createLocalGateway } from '../src/gateway/local-gateway.js';
import { FallbackLetterProvider, ModelAdapter } from '../src/letters/model-adapter.js';
import { LetterService } from '../src/letters/letter-service.js';
import { MusicService } from '../src/music/music-service.js';

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
  assert.equal(listPayload.data.remainingToday, 2);
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
