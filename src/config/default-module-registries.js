import { ModuleRegistry } from './module-registry.js';
import { FallbackLetterProvider, OliviaSoulHarnessProvider, OpenAICompatibleProvider } from '../letters/model-adapter.js';
import { NoopMemoryProvider, SqliteMemoryProvider } from '../letters/memory-provider.js';
import { FilePersonaProvider, NoopPersonaProvider, StaticPersonaProvider } from '../letters/persona-provider.js';
import { createRendererRegistry } from '../music/renderer-registry.js';
import { GamePlaybackAdapter, OliviaLinPlaybackAdapter } from '../music/playback-adapter.js';
import { createAudioOnlyMp4Encoder } from '../music/media-encoder.js';

export function createDefaultModuleRegistries({ store = null } = {}) {
  const provider = new ModuleRegistry('provider')
    .register({ id: 'offline-fallback', version: '1.0.0', label: '离线降级回信', create: () => new FallbackLetterProvider() })
    .register({ id: 'external.openai-compatible', version: '1.0.0', label: '外部 OpenAI 兼容 API', create: options => new OpenAICompatibleProvider(options) })
    .register({ id: 'local.openai-compatible', version: '1.0.0', label: '本地 OpenAI 兼容模型', create: options => new OpenAICompatibleProvider({ ...options, provider: 'local-model' }) });
  const harness = new ModuleRegistry('harness').register({ id: 'olivia-soul-v18', version: '1.0.0', label: 'OliviaSoul v18 Harness', create: options => new OliviaSoulHarnessProvider(options) });
  const persona = new ModuleRegistry('persona')
    .register({ id: 'default', version: '1.0.0', label: '不注入额外人格', create: () => new NoopPersonaProvider() })
    .register({ id: 'static', version: '1.0.0', label: '设置中的静态人格', create: options => new StaticPersonaProvider(options) })
    .register({ id: 'file', version: '1.0.0', label: '外部人格文件', create: options => new FilePersonaProvider(options) });
  const memory = new ModuleRegistry('memory')
    .register({ id: 'disabled', version: '1.0.0', label: '关闭记忆', create: () => new NoopMemoryProvider() })
    .register({ id: 'sqlite', version: '1.0.0', label: '本地 SQLite 记忆', create: options => new SqliteMemoryProvider({ store, ...options }) });
  const playback = new ModuleRegistry('playback')
    .register({ id: 'olivia-lin.native', version: '0.0.9.627', label: 'Olivia Lin 原生播放器适配', create: options => new OliviaLinPlaybackAdapter(options) })
    .register({ id: 'generic', version: '1.0.0', label: '通用播放器适配', create: options => new GamePlaybackAdapter(options) });
  const encoder = new ModuleRegistry('encoder')
    .register({ id: 'builtin.audio-only-mp4', version: '1.0.0', label: '内置音频 MP4 编码器', create: options => createAudioOnlyMp4Encoder(options) });
  return { provider, harness, persona, memory, renderer: createRendererRegistry(), playback, encoder };
}
