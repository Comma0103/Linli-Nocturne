import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../src/storage/sqlite-store.js';
import { LetterService } from '../src/letters/letter-service.js';
import { ModelAdapter } from '../src/letters/model-adapter.js';
import { NoopMemoryProvider, SqliteMemoryProvider } from '../src/letters/memory-provider.js';

test('默认无记忆实现不改变 provider 输入，也不写入记忆', async () => {
  const store = new SqliteStore();
  let received;
  const service = new LetterService({
    store,
    modelAdapter: new ModelAdapter({ generate: async input => { received = input; return { text: '回信', provider: 'fake' }; } }),
    limits: { bypass: true },
  });
  service.send({ body: '没有记忆' });
  await service.processNext();
  assert.equal(received.memory, '');
  assert.deepEqual(store.listMemoryEpisodes('林离'), []);
  store.close();
});

test('SQLite memory provider 为下一封信提供有限的上一封对话', async () => {
  const store = new SqliteStore();
  const memory = new SqliteMemoryProvider({ store, maxEpisodes: 2, maxEpisodeChars: 80, maxContextChars: 120 });
  const inputs = [];
  const service = new LetterService({
    store, memoryProvider: memory,
    modelAdapter: new ModelAdapter({ generate: async input => { inputs.push(input); return { text: `回信${inputs.length}`, provider: 'fake' }; } }),
    limits: { bypass: true },
  });
  service.send({ body: '第一封内容' });
  await service.processNext();
  service.send({ body: '第二封内容' });
  await service.processNext();
  assert.equal(inputs[0].memory, '');
  assert.match(inputs[1].memory, /第一封内容/u);
  assert.match(inputs[1].memory, /回信1/u);
  assert.equal(store.listMemoryEpisodes('林离').length, 2);
  store.close();
});

test('SQLite memory provider 限制条数和单条大小，关闭后不再保存', async () => {
  const store = new SqliteStore();
  const memory = new SqliteMemoryProvider({ store, maxEpisodes: 1, maxEpisodeChars: 20, maxContextChars: 20 });
  const service = new LetterService({ store, memoryProvider: memory, modelAdapter: new ModelAdapter({ generate: async () => ({ text: '这是很长的回信内容', provider: 'fake' }) }), limits: { bypass: true } });
  service.send({ body: '这是第一封很长很长的信' });
  await service.processNext();
  service.send({ body: '这是第二封很长很长的信' });
  await service.processNext();
  const episodes = store.listMemoryEpisodes('林离');
  assert.equal(episodes.length, 1);
  assert.ok(episodes[0].content.length <= 20);
  const disabled = new SqliteMemoryProvider({ store, enabled: false });
  const disabledService = new LetterService({ store, memoryProvider: disabled, modelAdapter: new ModelAdapter({ generate: async () => ({ text: '不保存', provider: 'fake' }) }), limits: { bypass: true } });
  disabledService.send({ body: '关闭记忆' });
  await disabledService.processNext();
  assert.equal(store.listMemoryEpisodes('林离').length, 1);
  store.close();
});

test('记忆 provider 失败不会让信件处理失败', async () => {
  const store = new SqliteStore();
  const failingMemory = { recall: async () => { throw new Error('memory unavailable'); }, remember: async () => { throw new Error('memory unavailable'); } };
  const service = new LetterService({
    store, memoryProvider: failingMemory,
    modelAdapter: new ModelAdapter({ generate: async ({ memory }) => { assert.equal(memory, ''); return { text: '仍然回复', provider: 'fake' }; } }),
    limits: { bypass: true },
  });
  const letter = service.send({ body: '记忆服务坏了' });
  assert.equal((await service.processNext()).status, 'replied');
  assert.equal(store.getLetter(letter.id).reply, '仍然回复');
  store.close();
});

test('NoopMemoryProvider 保持显式关闭', async () => {
  const provider = new NoopMemoryProvider();
  assert.equal(provider.enabled, false);
  assert.deepEqual(await provider.recall({ recipient: '林离' }), { context: '', episodes: [], provider: 'memory-disabled' });
});
