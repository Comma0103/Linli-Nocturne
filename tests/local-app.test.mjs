import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLocalApp } from '../src/app/local-app.js';
import { DEFAULT_MODULE_SETTINGS } from '../src/config/module-settings.js';
import { loadUserConfig } from '../src/config/user-config.js';

test('开发版本地服务入口可以启动 Worker 和兼容网关', async () => {
  const root = mkdtempSync(join(tmpdir(), 'linli-local-app-'));
  const app = createLocalApp({ dataRoot: root, settingsPath: join(root, 'missing-settings.json'), port: 0 });
  const address = await app.start();
  try {
    assert.match(address.serviceUrl, /^http:\/\/localhost:\d+$/u);
    const health = await fetch(`${address.serviceUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);
  } finally { await app.stop(); }
});

test('用户配置把基础模型、Persona 和 Harness 分开选择', async () => {
  const root = mkdtempSync(join(tmpdir(), 'linli-user-config-'));
  const filename = join(root, 'user-config.json');
  await import('node:fs/promises').then(({ writeFile }) => writeFile(filename, JSON.stringify({
    version: 1,
    user: { timeZone: 'Asia/Shanghai' },
    letters: {
      baseModel: { provider: 'external.openai-compatible', external: { endpoint: 'https://example.invalid', model: 'deepseek-v4-pro', apiKey: 'local-secret' } },
      fallbackEnabled: true,
      persona: { providerId: 'file', file: 'persona.md' },
      harness: { enabled: true, providerId: 'olivia-soul-v18', root: 'third_party/OliviaSoul/v18-harness' },
      memory: { enabled: false },
    },
  }), 'utf8'));
  const result = loadUserConfig(filename, { defaultSettings: DEFAULT_MODULE_SETTINGS });
  assert.equal(result.settings.letters.provider, 'external.openai-compatible');
  assert.equal(result.settings.letters.persona, 'file');
  assert.equal(result.settings.letters.harness, 'olivia-soul-v18');
  assert.equal(result.options.external.model, 'deepseek-v4-pro');
  assert.equal(result.options.harness.environment.DEEPSEEK_MODEL, 'deepseek-v4-pro');
});
