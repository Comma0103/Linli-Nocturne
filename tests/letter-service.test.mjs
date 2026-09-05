import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../src/storage/sqlite-store.js';
import { FallbackLetterProvider, ModelAdapter } from '../src/letters/model-adapter.js';
import { LetterLimitError, LetterService } from '../src/letters/letter-service.js';

test('letter service enforces original daily limit and delay by default', async () => {
  const now = new Date('2026-09-05T10:00:00.000Z');
  const store = new SqliteStore();
  const service = new LetterService({ store, modelAdapter: new ModelAdapter(new FallbackLetterProvider()), clock: () => now });
  const first = service.send({ body: '第一封' });
  assert.equal(first.status, 'queued');
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
  store.close();
});
