import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ModuleRegistry } from '../src/config/module-registry.js';
import { ModuleSettingsStore, validateModuleSettings } from '../src/config/module-settings.js';
import { createDefaultModuleRegistries } from '../src/config/default-module-registries.js';
import { resolveModuleSelections } from '../src/config/module-runtime.js';
import { FilePersonaProvider, StaticPersonaProvider } from '../src/letters/persona-provider.js';
import { SqliteStore } from '../src/storage/sqlite-store.js';
import { LetterService } from '../src/letters/letter-service.js';
import { ModelAdapter } from '../src/letters/model-adapter.js';

test('ModuleRegistry 可以列出和替换具体实现', () => {
  const registry = new ModuleRegistry('demo').register({ id: 'fake', version: '1.0.0', label: '测试实现', create: options => ({ options }) });
  assert.deepEqual(registry.list(), [{ id: 'fake', version: '1.0.0', label: '测试实现', description: '' }]);
  assert.deepEqual(registry.resolve('fake', { value: 1 }), { options: { value: 1 } });
  assert.throws(() => registry.resolve('missing'), /Unknown demo module/u);
});

test('模块设置只保存实现选择，不接受 API Key 等敏感字段', () => {
  const directory = mkdtempSync(join(tmpdir(), 'linli-settings-'));
  const filename = join(directory, 'modules.json');
  const registries = createDefaultModuleRegistries();
  const settings = {
    version: 1,
    letters: { provider: 'offline-fallback', harness: null, persona: 'default', memory: 'disabled', fallback: true },
    music: { renderer: 'builtin.audio', playbackAdapter: 'olivia-lin.native', encoder: 'builtin.audio-only-mp4' },
    media: { renderer: 'builtin.audio' }, threeD: { renderer: null },
  };
  const store = new ModuleSettingsStore({ filename, registries });
  store.save(settings);
  assert.deepEqual(store.load(), settings);
  assert.throws(() => validateModuleSettings({ ...settings, apiKey: 'secret' }, registries), /Sensitive value/u);
  assert.throws(() => validateModuleSettings({ ...settings, letters: { ...settings.letters, provider: 'missing' } }, registries), /Unknown module selection/u);
});

test('PersonaProvider 支持静态文本和外部人格文件', async () => {
  const staticProvider = new StaticPersonaProvider({ text: '保持克制地回信', maxChars: 6 });
  assert.equal((await staticProvider.getPrompt()).text, '保持克制地回信'.slice(0, 6));
  const directory = mkdtempSync(join(tmpdir(), 'linli-persona-'));
  const filename = join(directory, 'persona.md');
  writeFileSync(filename, '林离人格资料', 'utf8');
  const fileProvider = new FilePersonaProvider({ path: filename, maxChars: 5 });
  assert.equal((await fileProvider.getPrompt()).text, '林离人格资料'.slice(0, 5));
});

test('模块设置可以解析成信件和音乐运行时实现', async () => {
  const store = new SqliteStore();
  const registries = createDefaultModuleRegistries({ store });
  const settings = {
    version: 1,
    letters: { provider: 'offline-fallback', harness: null, persona: 'static', memory: 'disabled', fallback: true },
    music: { renderer: 'builtin.audio', playbackAdapter: 'generic', encoder: 'builtin.audio-only-mp4' },
    media: { renderer: 'builtin.audio' }, threeD: { renderer: null },
  };
  const runtime = resolveModuleSelections(settings, { registries, options: { persona: { text: '保持克制' } } });
  assert.equal(runtime.music.renderer.id, 'builtin.audio');
  assert.equal(runtime.music.playbackAdapter.id, 'generic.playback');
  const service = new LetterService({ store, modelAdapter: runtime.letters.modelAdapter, personaProvider: runtime.letters.personaProvider, memoryProvider: runtime.letters.memoryProvider, limits: { bypass: true } });
  let received;
  service.modelAdapter = new ModelAdapter({ generate: async input => { received = input; return { text: '已回复', provider: 'fake' }; } });
  service.send({ body: '设置选择测试' });
  await service.processNext();
  assert.equal(received.persona, '保持克制');
  store.close();
});

test('模块设置可以选择未写死在核心里的自定义 provider', async () => {
  const store = new SqliteStore();
  const registries = createDefaultModuleRegistries({ store });
  registries.provider.register({ id: 'community.reply', version: '1.0.0', label: '社区回信实现', create: () => ({ provider: 'community.reply', generate: async () => ({ text: '社区实现回信', provider: 'community.reply' }) }) });
  const settings = {
    version: 1,
    letters: { provider: 'community.reply', harness: null, persona: 'default', memory: 'disabled', fallback: false },
    music: { renderer: 'builtin.audio', playbackAdapter: 'generic', encoder: 'builtin.audio-only-mp4' },
    media: { renderer: 'builtin.audio' }, threeD: { renderer: null },
  };
  const runtime = resolveModuleSelections(settings, { registries });
  assert.equal((await runtime.letters.modelAdapter.generateReply({ prompt: '测试' })).provider, 'community.reply');
  store.close();
});
