import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteStore } from '../src/storage/sqlite-store.js';
import { FallbackLetterProvider, ModelAdapter } from '../src/letters/model-adapter.js';
import { LetterLimitError, LetterService } from '../src/letters/letter-service.js';

test('letter service enforces original daily limit and delay by default', async () => {
  const now = new Date('2026-09-05T10:00:00.000Z');
  const store = new SqliteStore();
  const service = new LetterService({ store, modelAdapter: new ModelAdapter(new FallbackLetterProvider()), clock: () => now });
  const first = service.send({ body: '第一封' });
  assert.equal(first.status, 'pending');
  assert.equal(await service.processNext(), null);
  now.setTime(now.getTime() + 5 * 60 * 1000);
  assert.equal((await service.processNext()).status, 'replied');
  service.send({ body: '第二封' }); service.send({ body: '第三封' });
  assert.throws(() => service.send({ body: '第四封' }), LetterLimitError);
  store.close();
});

test('bypass mode removes daily and delay limits', async () => {
  const store = new SqliteStore();
  const service = new LetterService({ store, modelAdapter: new ModelAdapter(new FallbackLetterProvider()), limits: { bypass: true } });
  service.send({ body: '即时信' });
  assert.equal((await service.processNext()).status, 'replied');
  assert.equal(service.remainingToday(), 3, 'bypass 模式不能让客户端把写信按钮置灰');
  store.close();
});

test('letter claiming is atomic and successful processing is idempotent', async () => {
  const store = new SqliteStore();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const service = new LetterService({
    store,
    modelAdapter: new ModelAdapter({ generate: async () => { calls += 1; await gate; return { text: '统一回信', provider: 'fake' }; } }),
    limits: { bypass: true },
  });
  const letter = service.send({ body: '并发领取' });
  const first = service.processNext();
  const second = service.processNext();
  assert.equal(await second, null);
  release();
  assert.equal((await first).status, 'replied');
  assert.equal(calls, 1);
  assert.equal((await service.processNext()), null);
  assert.equal(store.getLetter(letter.id).status, 'replied');
  store.close();
});

test('provider failures retry and then become failed at the configured maximum', async () => {
  const store = new SqliteStore();
  let calls = 0;
  const clock = () => new Date('2026-09-06T16:00:00.000Z');
  const service = new LetterService({
    store, clock,
    modelAdapter: new ModelAdapter({ generate: async () => { calls += 1; throw Object.assign(new Error('fake failure'), { code: 'fake_unavailable' }); } }),
    limits: { bypass: true, maxAttempts: 2, retryDelayMs: 0 },
  });
  service.send({ body: '会失败的信' });
  assert.equal((await service.processNext()).status, 'pending');
  assert.equal((await service.processNext()).status, 'failed');
  assert.equal(calls, 2);
  assert.equal(service.list()[0].last_error, 'fake_unavailable');
  assert.equal(await service.processNext(), null);
  store.close();
});

test('legacy queued letters migrate to the Phase 3 state fields', () => {
  const directory = mkdtempSync(join(tmpdir(), 'linli-letter-migration-'));
  const filename = join(directory, 'legacy.sqlite');
  const legacy = new DatabaseSync(filename);
  legacy.exec(`CREATE TABLE letters (
    id TEXT PRIMARY KEY, recipient TEXT NOT NULL, body TEXT NOT NULL, reply TEXT,
    status TEXT NOT NULL, created_at TEXT NOT NULL, available_at TEXT NOT NULL,
    replied_at TEXT, read_at TEXT
  )`);
  legacy.prepare(`INSERT INTO letters (id, recipient, body, status, created_at, available_at)
    VALUES ('legacy-1', '林离', '旧信件', 'queued', '2026-09-06T00:00:00.000Z', '2026-09-06T00:00:00.000Z')`).run();
  legacy.close();
  const store = new SqliteStore(filename);
  const letter = store.getLetter('legacy-1');
  assert.equal(letter.status, 'pending');
  assert.equal(letter.attempt_count, 0);
  assert.equal(letter.last_error, null);
  store.close();
});
