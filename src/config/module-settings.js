import { dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

export const DEFAULT_MODULE_SETTINGS = Object.freeze({
  version: 1,
  letters: Object.freeze({ provider: 'offline-fallback', harness: null, persona: 'default', memory: 'disabled', fallback: true }),
  music: Object.freeze({ renderer: 'builtin.audio', playbackAdapter: 'olivia-lin.native', encoder: 'builtin.audio-only-mp4' }),
  media: Object.freeze({ renderer: 'builtin.audio' }),
  threeD: Object.freeze({ renderer: null }),
});

const SECRET_KEYS = /(?:api[-_]?key|token|secret|password|authorization)/iu;

function cloneDefault() { return JSON.parse(JSON.stringify(DEFAULT_MODULE_SETTINGS)); }

function assertNoSecrets(value, path = 'settings') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEYS.test(key)) throw new Error(`Sensitive value is not allowed in module settings: ${path}.${key}`);
    assertNoSecrets(child, `${path}.${key}`);
  }
}

function assertRegistrySelection(settings, registries = {}) {
  const selections = [
    ['provider', settings.letters?.provider, registries.provider],
    ['harness', settings.letters?.harness, registries.harness],
    ['persona', settings.letters?.persona, registries.persona],
    ['memory', settings.letters?.memory, registries.memory],
    ['renderer', settings.music?.renderer, registries.renderer],
    ['playbackAdapter', settings.music?.playbackAdapter, registries.playback],
    ['encoder', settings.music?.encoder, registries.encoder],
    ['renderer', settings.media?.renderer, registries.renderer],
    ['renderer', settings.threeD?.renderer, registries.threeD],
  ];
  for (const [name, id, registry] of selections) {
    if (id && registry && !registry.has(id)) throw new Error(`Unknown module selection ${name}: ${id}`);
  }
}

export function validateModuleSettings(input, registries = {}) {
  if (!input || typeof input !== 'object' || input.version !== 1) throw new Error('Unsupported module settings version');
  assertNoSecrets(input);
  assertRegistrySelection(input, registries);
  return input;
}

export class ModuleSettingsStore {
  constructor({ filename, registries = {} } = {}) {
    if (!filename) throw new TypeError('module settings filename is required');
    this.filename = filename;
    this.registries = registries;
  }

  load() {
    if (!existsSync(this.filename)) return cloneDefault();
    const parsed = JSON.parse(readFileSync(this.filename, 'utf8'));
    return validateModuleSettings(parsed, this.registries);
  }

  save(settings) {
    const valid = validateModuleSettings(settings, this.registries);
    mkdirSync(dirname(this.filename), { recursive: true });
    const temporary = `${this.filename}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(valid, null, 2)}\n`, 'utf8');
    renameSync(temporary, this.filename);
    return valid;
  }
}
