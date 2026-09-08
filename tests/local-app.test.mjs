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

test('真实启动入口可加入歌单，自动填时间，重复加入和重启后移除都正确', async () => {
  const root = mkdtempSync(join(tmpdir(), 'linli-app-playlist-'));
  const options = { dataRoot: root, settingsPath: join(root, 'missing.json'), port: 0, env: {} };
  let app = createLocalApp(options);
  let base;
  const request = async (path, body) => {
    const response = await fetch(base + path, {
      method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    assert.equal(response.status, 200);
    return (await response.json()).data;
  };
  let createdAt;
  await app.start();
  base = `http://127.0.0.1:${app.server.address().port}`;
  try {
    const item = { itemType: 3, itemId: 'app-playlist-song', name: '本地验收曲目', videoUrl: base + '/synthetic.wav', duration: 2 };
    const added = await request('/toy/addToPlaylist', item);
    createdAt = added.createdAt;
    assert.ok(Number.isFinite(Date.parse(createdAt)));
    assert.equal(added.videoUrl, item.videoUrl);
    assert.equal((await request('/toy/addToPlaylist', item)).createdAt, createdAt);
    assert.equal((await request('/toy/searchPlaylist')).list.length, 1);
  } finally { await app.stop(); }
  app = createLocalApp(options);
  await app.start();
  base = `http://127.0.0.1:${app.server.address().port}`;
  try {
    const page = await request('/toy/searchPlaylist');
    assert.equal(page.list.length, 1);
    assert.equal(page.list[0].createdAt, createdAt);
    assert.equal((await request('/toy/delFromPlaylist', { item_type: 3, item_id: 'app-playlist-song' })).deleted, true);
    assert.equal((await request('/toy/searchPlaylist')).list.length, 0);
  } finally { await app.stop(); }
});

test('用户配置把基础模型、Persona 和 Harness 分开选择', async () => {
  const root = mkdtempSync(join(tmpdir(), 'linli-user-config-'));
  const filename = join(root, 'user-config.json');
  await import('node:fs/promises').then(({ writeFile }) => writeFile(filename, JSON.stringify({
    version: 1,
    user: { displayName: '嘉树', timeZone: 'Asia/Shanghai' },
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
  assert.equal(result.userDisplayName, '嘉树');
});

test('用户配置的音乐选择、时区和编码器媒体契约进入本地应用', async () => {
  const root = mkdtempSync(join(tmpdir(), 'linli-music-config-'));
  const filename = join(root, 'user-config.json');
  await import('node:fs/promises').then(({ writeFile }) => writeFile(filename, JSON.stringify({
    version: 1,
    user: { displayName: '嘉树', timeZone: 'America/Los_Angeles' },
    letters: { baseModel: { provider: 'offline-fallback' } },
    music: { renderer: 'builtin.audio', playbackAdapter: 'generic', encoder: 'builtin.audio-only-mp4' },
  }), 'utf8'));
  const app = createLocalApp({ dataRoot: join(root, 'data'), userConfigPath: filename, port: 0 });
  assert.equal(app.settings.music.playbackAdapter, 'generic');
  assert.equal(app.midiJobService.dayBoundary(new Date('2026-09-07T06:30:00.000Z')).startIso, '2026-09-06T07:00:00.000Z');
  assert.equal(app.midiJobService.mediaExtension, 'mp4');
  assert.equal(app.midiJobService.mediaContentType, 'video/mp4');
  await app.stop();
});
