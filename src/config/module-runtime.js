import { createConfiguredModelAdapter } from '../letters/model-adapter.js';
import { validateModuleSettings } from './module-settings.js';

export function resolveModuleSelections(settings, { registries, store = null, options = {} } = {}) {
  if (!registries) throw new TypeError('module registries are required');
  validateModuleSettings(settings, registries);
  const letters = settings.letters ?? {};
  const modelConfig = { fallback: letters.fallback !== false };
  if (registries.provider?.has(letters.provider)) modelConfig.provider = registries.provider.resolve(letters.provider, options.provider ?? options.external ?? options.local ?? {});
  if (letters.harness) modelConfig.harness = registries.harness.resolve(letters.harness, options.harness ?? {});
  if (letters.provider === 'offline-fallback') modelConfig.fallback = false;
  const modelAdapter = createConfiguredModelAdapter(modelConfig);
  const memoryOptions = { ...(options.memory ?? {}) };
  if (store) memoryOptions.store = store;
  const memoryProvider = registries.memory.resolve(letters.memory ?? 'disabled', memoryOptions);
  const personaProvider = registries.persona.resolve(letters.persona ?? 'default', options.persona ?? {});
  const renderer = registries.renderer.resolve(settings.music?.renderer ?? 'builtin.audio', options.renderer ?? {});
  const playbackAdapter = registries.playback.resolve(settings.music?.playbackAdapter ?? 'olivia-lin.native', options.playback ?? {});
  const mediaEncoder = settings.music?.encoder ? registries.encoder.resolve(settings.music.encoder, options.encoder ?? {}) : null;
  const videoImporter = settings.media?.videoImporter ? registries.videoImporter.resolve(settings.media.videoImporter, options.videoImporter ?? {}) : null;
  return { letters: { modelAdapter, memoryProvider, personaProvider }, music: { renderer, playbackAdapter, mediaEncoder }, media: { videoImporter } };
}
