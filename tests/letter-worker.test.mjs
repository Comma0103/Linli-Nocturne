import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../src/storage/sqlite-store.js';
import { FallbackLetterProvider, ModelAdapter } from '../src/letters/model-adapter.js';
import { LetterService } from '../src/letters/letter-service.js';
import { LetterWorker } from '../src/letters/letter-worker.js';

async function waitFor(check, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('condition was not reached before timeout');
}

test('后台 worker 自动处理待回复信件，停止后不再轮询', async () => {
  const store = new SqliteStore();
  const service = new LetterService({ store, modelAdapter: new ModelAdapter(new FallbackLetterProvider()), limits: { bypass: true } });
  const worker = new LetterWorker({ letterService: service, intervalMs: 10, leaseMs: 60_000 });
  const letter = service.send({ body: '自动处理' });
  worker.start();
  await waitFor(() => store.getLetter(letter.id)?.status === 'replied');
  await worker.stop();
  assert.equal(store.getLetter(letter.id).status, 'replied');
  assert.equal(worker.timer, null);
  store.close();
});

test('并发 runOnce 共用一个处理 Promise，不重复调用 provider', async () => {
  const store = new SqliteStore();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const service = new LetterService({
    store,
    modelAdapter: new ModelAdapter({ generate: async () => { calls += 1; await gate; return { text: '只回一次', provider: 'fake' }; } }),
    limits: { bypass: true },
  });
  const worker = new LetterWorker({ letterService: service, intervalMs: 50 });
  service.send({ body: '并发 worker' });
  const first = worker.runOnce();
  const second = worker.runOnce();
  release();
  assert.equal((await first).status, 'replied');
  assert.equal((await second).status, 'replied');
  assert.equal(calls, 1);
  await worker.stop();
  store.close();
});

test('新 worker 会恢复过期 processing 租约，并在达到上限时失败', async () => {
  let now = new Date('2026-09-06T10:00:00.000Z');
  const store = new SqliteStore();
  const service = new LetterService({
    store, clock: () => now, modelAdapter: new ModelAdapter(new FallbackLetterProvider()),
    limits: { bypass: true, maxAttempts: 2, retryDelayMs: 0 },
  });
  const retried = service.send({ body: '重启后继续' });
  store.claimNextLetter(now.toISOString(), 2);
  now = new Date('2026-09-06T10:06:00.000Z');
  const worker = new LetterWorker({ letterService: service, leaseMs: 5 * 60 * 1000 });
  assert.equal((await worker.runOnce()).status, 'replied');
  assert.equal(store.getLetter(retried.id).attempt_count, 2);

  const exhausted = service.send({ body: '达到上限' });
  store.claimNextLetter(now.toISOString(), 2);
  now = new Date('2026-09-06T10:12:00.000Z');
  service.recoverStaleProcessing({ leaseMs: 5 * 60 * 1000 });
  store.claimNextLetter(now.toISOString(), 2);
  now = new Date('2026-09-06T10:18:00.000Z');
  assert.equal(await worker.runOnce(), null);
  assert.equal(store.getLetter(exhausted.id).status, 'failed');
  assert.equal(store.getLetter(exhausted.id).last_error, 'processing_lease_expired');
  await worker.stop();
  store.close();
});
