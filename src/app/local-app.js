import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { SqliteStore } from '../storage/sqlite-store.js';
import { LetterService } from '../letters/letter-service.js';
import { LetterWorker } from '../letters/letter-worker.js';
import { VideoReplyService } from '../letters/video-reply-service.js';
import { MidiJobService } from '../music/midi-job-service.js';
import { createLocalGateway } from '../gateway/local-gateway.js';
import { createDefaultModuleRegistries } from '../config/default-module-registries.js';
import { ModuleSettingsStore } from '../config/module-settings.js';
import { resolveModuleSelections } from '../config/module-runtime.js';
import { DEFAULT_MODULE_SETTINGS } from '../config/module-settings.js';
import { loadUserConfig } from '../config/user-config.js';

function envOptions(env) {
  const modelOptions = {
    endpoint: env.LINLI_MODEL_ENDPOINT,
    apiKey: env.LINLI_MODEL_API_KEY ?? env.DEEPSEEK_API_KEY ?? '',
    model: env.LINLI_MODEL_NAME,
    systemPrompt: env.LINLI_SYSTEM_PROMPT ?? '请用简体中文，以林离的克制、真诚口吻回复来信。',
  };
  return {
    provider: modelOptions,
    external: modelOptions,
    local: { ...modelOptions, endpoint: env.LINLI_LOCAL_MODEL_ENDPOINT ?? env.LINLI_MODEL_ENDPOINT, apiKey: env.LINLI_LOCAL_MODEL_API_KEY ?? '' },
    harness: { root: env.LINLI_HARNESS_ROOT, person: env.LINLI_HARNESS_PERSON ?? 'linli-local-user' },
    persona: { path: env.LINLI_PERSONA_FILE, text: env.LINLI_PERSONA_TEXT ?? '' },
    videoImporter: { ffprobePath: env.LINLI_FFPROBE_PATH ?? 'ffprobe' },
    encoder: { ffmpegPath: env.LINLI_FFMPEG_PATH ?? 'ffmpeg' },
  };
}

export function createLocalApp({ dataRoot = 'data', settingsPath = 'config/module-settings.json', userConfigPath = null, host = '127.0.0.1', port = 27149, env = process.env } = {}) {
  const store = new SqliteStore(join(dataRoot, 'linli.sqlite'));
  const registries = createDefaultModuleRegistries({ store });
  const userConfig = loadUserConfig(userConfigPath, { defaultSettings: DEFAULT_MODULE_SETTINGS, runtimeRoot: join(dataRoot, 'harness-runtime') });
  const settings = userConfig?.settings ?? new ModuleSettingsStore({ filename: settingsPath, registries }).load();
  const runtimeOptions = userConfig ? {
    ...envOptions(env),
    ...userConfig.options,
    provider: { ...envOptions(env).provider, ...userConfig.options.provider },
    external: { ...envOptions(env).external, ...userConfig.options.external },
    local: { ...envOptions(env).local, ...userConfig.options.local },
    harness: { ...envOptions(env).harness, ...userConfig.options.harness },
    persona: { ...envOptions(env).persona, ...userConfig.options.persona },
    memory: { ...envOptions(env).memory, ...userConfig.options.memory },
    encoder: { ...envOptions(env).encoder, ...userConfig.options.encoder },
  } : envOptions(env);
  const runtime = resolveModuleSelections(settings, { registries, options: runtimeOptions });
  const letterService = new LetterService({
    store, modelAdapter: runtime.letters.modelAdapter, memoryProvider: runtime.letters.memoryProvider,
    personaProvider: runtime.letters.personaProvider, timeZone: userConfig?.timeZone ?? env.LINLI_TIME_ZONE ?? 'Asia/Shanghai',
    userDisplayName: userConfig?.userDisplayName ?? env.LINLI_USER_DISPLAY_NAME ?? '',
    limits: { bypass: userConfig?.bypass ?? env.LINLI_BYPASS === 'true' },
  });
  const letterWorker = new LetterWorker({ letterService, intervalMs: Number(env.LINLI_WORKER_INTERVAL_MS) || 1_000 });
  const videoReplyService = new VideoReplyService({ store, mediaRoot: join(dataRoot, 'video-media'), importAdapter: runtime.media.videoImporter ?? registries.videoImporter.resolve('builtin.ffprobe.mp4', envOptions(env).videoImporter) });
  const midiJobService = new MidiJobService({
    store, mediaRoot: join(dataRoot, 'midi-media'), renderer: runtime.music.renderer,
    playbackAdapter: runtime.music.playbackAdapter, mediaEncoder: runtime.music.mediaEncoder,
    timeZone: userConfig?.timeZone ?? env.LINLI_TIME_ZONE ?? 'Asia/Shanghai',
    mediaExtension: runtime.music.mediaEncoder?.extension,
    mediaContentType: runtime.music.mediaEncoder?.contentType,
  });
  const musicService = { compatPlaylist: () => store.compatPlaylist(), addCompatPlaylistItem: item => store.addCompatPlaylistItem(item), removeCompatPlaylistItem: (itemType, itemId) => store.deleteCompatPlaylistItem(itemType, itemId) };
  const server = createLocalGateway({ letterService, musicService, midiJobService, videoReplyService });
  let address;
  return {
    settings, store, letterService, letterWorker, videoReplyService, midiJobService, server,
    async start() {
      await mkdir(dataRoot, { recursive: true });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
      address = server.address();
      letterWorker.start();
      return { host, port: address.port, serviceUrl: `http://localhost:${address.port}` };
    },
    async stop() {
      await letterWorker.stop();
      if (server.listening) await new Promise(resolve => server.close(resolve));
      store.close();
    },
  };
}
