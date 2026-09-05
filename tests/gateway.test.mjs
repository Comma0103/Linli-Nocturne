import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../src/storage/sqlite-store.js';
import { FallbackLetterProvider, ModelAdapter } from '../src/letters/model-adapter.js';
import { LetterService } from '../src/letters/letter-service.js';
import { createLocalGateway } from '../src/gateway/local-gateway.js';

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
