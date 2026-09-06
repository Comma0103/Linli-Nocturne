import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLocalApp } from '../src/app/local-app.js';

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

