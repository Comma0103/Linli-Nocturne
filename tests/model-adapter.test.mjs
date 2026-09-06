import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ExternalApiProvider, FallbackLetterProvider, LocalModelProvider, ModelAdapter, ModelProviderChain,
} from '../src/letters/model-adapter.js';

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
  const fallbackResult = await fallbackAdapter.generateReply({ recipient: '林离', prompt: '你好' });
  assert.equal(fallbackResult.provider, 'offline-fallback');
  assert.deepEqual(calls, ['external', 'local']);
  assert.equal(fallbackResult.metadata.providerFailures.length, 2);
});

test('provider chain reports a clear exhausted error when fallback is disabled', async () => {
  const adapter = new ModelAdapter(new ModelProviderChain({
    external: new ExternalApiProvider({ generate: async () => { throw new Error('external down'); } }),
    local: new LocalModelProvider({ generate: async () => { throw new Error('local down'); } }),
    fallback: null,
  }));
  await assert.rejects(() => adapter.generateReply({ prompt: '失败' }), { code: 'provider_chain_exhausted' });
});
