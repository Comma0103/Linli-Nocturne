import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

function clone(value) { return JSON.parse(JSON.stringify(value)); }

export function loadUserConfig(filename, { defaultSettings, runtimeRoot = '', validateAccess = true } = {}) {
  if (!filename || !existsSync(filename)) return null;
  const user = JSON.parse(readFileSync(filename, 'utf8'));
  if (user?.version !== 1) throw new Error('Unsupported user config version');
  const settings = clone(defaultSettings);
  const letters = user.letters ?? {};
  const fromConfig = value => value && !isAbsolute(value) ? resolve(dirname(filename), value) : value;
  const base = letters.baseModel ?? {};
  const provider = base.provider ?? 'offline-fallback';
  if (validateAccess && provider === 'external.openai-compatible' && user.privacy?.allowExternalModelRequests === false) throw new Error('请先在 privacy.allowExternalModelRequests 中允许外部模型请求');
  settings.letters = {
    ...settings.letters,
    provider,
    harness: letters.harness?.enabled === false ? null : (letters.harness?.providerId ?? null),
    persona: letters.persona?.providerId ?? settings.letters.persona,
    memory: letters.memory?.enabled ? (letters.memory.provider ?? 'sqlite') : 'disabled',
    fallback: letters.fallbackEnabled !== false,
    outputPolicy: letters.outputPolicy?.providerId ?? 'persona-contract',
  };
  for (const section of ['music', 'media', 'threeD']) {
    if (user[section] && typeof user[section] === 'object') {
      settings[section] = { ...(settings[section] ?? {}), ...user[section] };
    }
  }
  const external = base.external ?? {};
  const local = base.local ?? {};
  const selected = provider === 'external.openai-compatible' ? external : provider === 'local.openai-compatible' ? local : {};
  const backendEnv = {
    DEEPSEEK_BASE: selected.endpoint ?? '',
    DEEPSEEK_MODEL: selected.model ?? '',
    DEEPSEEK_API_KEY: selected.apiKey ?? '',
    OLIVIA_ENDPOINT: selected.endpoint ?? '',
    OLIVIA_MODEL: selected.model ?? '',
    OLIVIA_API_KEY: selected.apiKey ?? '',
  };
  return {
    user,
    userDisplayName: String(user.user?.displayName ?? '').trim(),
    conversationId: String(user.user?.profileId ?? 'default'),
    settings,
    options: {
      provider: { endpoint: selected.endpoint, apiKey: selected.apiKey ?? '', model: selected.model, systemPrompt: user.letters?.systemPrompt,
        timeoutMs: selected.timeoutMs, python: /[/\\]/u.test(base.offline?.python ?? '') ? fromConfig(base.offline.python) : base.offline?.python || 'python' },
      external: { endpoint: external.endpoint, apiKey: external.apiKey ?? '', model: external.model, systemPrompt: user.letters?.systemPrompt },
      local: { endpoint: local.endpoint, apiKey: local.apiKey ?? '', model: local.model, systemPrompt: user.letters?.systemPrompt, provider: 'local-model' },
      harness: { root: fromConfig(letters.harness?.root), runtimeRoot, person: letters.harness?.person ?? 'linli-local-user', environment: backendEnv,
        timeoutMs: letters.harness?.timeoutMs, maxRewrites: letters.harness?.maxRewrites },
      persona: { path: fromConfig(letters.persona?.file), text: letters.persona?.text ?? '', maxChars: letters.persona?.maxChars },
      outputPolicy: { signature: letters.outputPolicy?.signature },
      memory: { enabled: Boolean(letters.memory?.enabled), maxEpisodes: letters.memory?.maxEpisodes, maxEpisodeChars: letters.memory?.maxCharsPerEpisode, maxContextChars: letters.memory?.maxContextChars },
    },
    timeZone: user.user?.timeZone,
    bypass: Boolean(letters.dailyLimitBypass),
  };
}
