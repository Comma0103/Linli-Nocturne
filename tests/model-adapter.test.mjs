import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ExternalApiProvider, FallbackLetterProvider, LocalModelProvider, ModelAdapter, ModelProviderChain, OpenAICompatibleProvider,
} from '../src/letters/model-adapter.js';

test('OpenAI 兼容 provider 传入本地时间上下文，而不是只传 UTC', async () => {
  let payload;
  const provider = new OpenAICompatibleProvider({ endpoint: 'http://example.test/v1', model: 'deepseek-v4-pro', apiKey: 'test',
    fetchImpl: async (_url, init) => { payload = JSON.parse(init.body); return new Response(JSON.stringify({ choices: [{ message: { content: '回信' } }] }), { status: 200 }); } });
  await provider.generate({ prompt: '你好', now: '2026-09-07T14:24:00Z', timeZone: 'Asia/Shanghai', localDateTime: '2026-09-07T22:24:00', localHour: 22, timeOfDay: '深夜' });
  const context = JSON.parse(payload.messages.at(-1).content);
  assert.equal(context.timeZone, 'Asia/Shanghai'); assert.equal(context.localDateTime, '2026-09-07T22:24:00');
  assert.equal(context.localHour, 22); assert.equal(context.timeOfDay, '深夜');
});

test('explicit Harness and memory tasks preserve their assembled user message without a second letter wrapper', async () => {
  const payloads = [];
  const provider = new OpenAICompatibleProvider({ endpoint: 'http://example.test/v1', model: 'test', systemPrompt: 'default persona',
    fetchImpl: async (_url, init) => { payloads.push(JSON.parse(init.body)); return new Response(JSON.stringify({ choices: [{ message: { content: 'result' } }] })); } });
  const prompt = '从历史初始化账本。\n' + JSON.stringify({ currentLetter: { body: '今天练了钢琴' }, history: '一份历史' });
  await provider.generate({ system: '预检员，只检查 currentLetter.body', prompt, memory: '不得重复追加', persona: '不得重复追加' });
  assert.deepEqual(payloads[0].messages, [{ role: 'system', content: '预检员，只检查 currentLetter.body' }, { role: 'user', content: prompt }]);
  await provider.generate({ system: '', prompt: '独立任务' });
  assert.deepEqual(payloads[1].messages, [{ role: 'user', content: '独立任务' }]);
  await provider.generate({ system: null, prompt: '普通来信', memory: '保留历史' });
  assert.equal(JSON.parse(payloads[2].messages[1].content).currentLetter.body, '普通来信');
  assert.equal(JSON.parse(payloads[2].messages[1].content).history, '保留历史');
});

test('provider chain uses external, local and fallback through one generate contract', async () => {
  const calls = [];
  const external = new ExternalApiProvider({ generate: async () => { calls.push('external'); return { text: '外部回信' }; } });
  const local = new LocalModelProvider({ generate: async () => { calls.push('local'); return { text: '本地回信' }; } });
  const adapter = new ModelAdapter(new ModelProviderChain({ external, local, fallback: new FallbackLetterProvider() }));
  const result = await adapter.generateReply({ recipient: '林离', prompt: '你好' });
  assert.equal(result.provider, 'external-api');
  assert.deepEqual(calls, ['external']);

  calls.length = 0;
  const fallback = new FallbackLetterProvider();
  const fallbackAdapter = new ModelAdapter(new ModelProviderChain({
    external: new ExternalApiProvider({ generate: async () => { calls.push('external'); throw Object.assign(new Error('offline'), { code: 'offline' }); } }),
    local: new LocalModelProvider({ generate: async () => { calls.push('local'); throw Object.assign(new Error('offline'), { code: 'offline' }); } }),
    fallback,
  }));
  const fallbackResult = await fallbackAdapter.generateReply({ recipient: '林离', userDisplayName: '嘉树', prompt: '你好' });
  assert.equal(fallbackResult.provider, 'offline-fallback');
  assert.deepEqual(calls, ['external', 'local']);
  assert.equal(fallbackResult.metadata.providerFailures.length, 2);
  assert.match(fallbackResult.text, /^嘉树，/u);
});

test('provider chain reports a clear exhausted error when fallback is disabled', async () => {
  const adapter = new ModelAdapter(new ModelProviderChain({
    external: new ExternalApiProvider({ generate: async () => { throw new Error('external down'); } }),
    local: new LocalModelProvider({ generate: async () => { throw new Error('local down'); } }),
    fallback: null,
  }));
  await assert.rejects(() => adapter.generateReply({ prompt: '失败' }), { code: 'provider_chain_exhausted' });
});
