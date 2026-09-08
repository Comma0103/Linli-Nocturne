import { createConfiguredModelAdapter } from '../letters/model-adapter.js';
import { validateModuleSettings } from './module-settings.js';

export function resolveModuleSelections(settings, { registries, store = null, options = {} } = {}) {
  if (!registries) throw new TypeError('module registries are required');
  validateModuleSettings(settings, registries);
  const letters = settings.letters ?? {};
  const modelConfig = { fallback: letters.fallback !== false };
  let baseProvider = null;
  if (registries.provider?.has(letters.provider)) {
    baseProvider = registries.provider.resolve(letters.provider, options.provider ?? options.external ?? options.local ?? {});
    modelConfig.provider = baseProvider;
  }
  if (letters.harness) {
    const selectedHarness = registries.harness.resolve(letters.harness, options.harness ?? {});
    if (selectedHarness?.wrap) {
      modelConfig.provider = selectedHarness.wrap(modelConfig.provider);
      if (modelConfig.provider && !modelConfig.provider.moduleInfo && selectedHarness.moduleInfo && Object.isExtensible(modelConfig.provider)) {
        modelConfig.provider.moduleInfo = selectedHarness.moduleInfo;
      }
    } else if (selectedHarness?.mode === 'standalone') {
      modelConfig.provider = selectedHarness;
      modelConfig.fallback = false;
    } else {
      modelConfig.harness = selectedHarness;
    }
  }
  if (letters.provider === 'offline-fallback') modelConfig.fallback = false;
  const modelAdapter = createConfiguredModelAdapter(modelConfig);
  modelAdapter.configuration = { provider: letters.provider, harness: letters.harness ?? null, persona: letters.persona ?? 'default', memory: letters.memory ?? 'disabled', fallback: letters.fallback !== false };
  const memoryOptions = { ...(options.memory ?? {}) };
  if (store) memoryOptions.store = store;
  memoryOptions.modelProvider ??= baseProvider;
  const memoryProvider = registries.memory.resolve(letters.memory ?? 'disabled', memoryOptions);
  const personaProvider = registries.persona.resolve(letters.persona ?? 'default', options.persona ?? {});
  const outputPolicy = registries.outputPolicy?.resolve(letters.outputPolicy ?? 'persona-contract', options.outputPolicy ?? {});
  const renderer = registries.renderer.resolve(settings.music?.renderer ?? 'builtin.audio', options.renderer ?? {});
  const playbackAdapter = registries.playback.resolve(settings.music?.playbackAdapter ?? 'olivia-lin.native', options.playback ?? {});
  const mediaEncoder = settings.music?.encoder ? registries.encoder.resolve(settings.music.encoder, options.encoder ?? {}) : null;
  const videoImporter = settings.media?.videoImporter ? registries.videoImporter.resolve(settings.media.videoImporter, options.videoImporter ?? {}) : null;
  return { letters: { modelAdapter, memoryProvider, personaProvider, outputPolicy }, music: { renderer, playbackAdapter, mediaEncoder }, media: { videoImporter } };
}
