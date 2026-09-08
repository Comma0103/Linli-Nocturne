export function applySelectionsToUserConfig(user, settings) {
  const result = structuredClone(user);
  const letters = result.letters ??= {};
  letters.baseModel = { ...letters.baseModel, provider: settings.letters.provider };
  letters.harness = { ...letters.harness, enabled: Boolean(settings.letters.harness), providerId: settings.letters.harness ?? '' };
  letters.persona = { ...letters.persona, providerId: settings.letters.persona };
  letters.memory = { ...letters.memory, enabled: settings.letters.memory !== 'disabled', provider: settings.letters.memory };
  letters.outputPolicy = { ...letters.outputPolicy, providerId: settings.letters.outputPolicy ?? 'persona-contract' };
  letters.fallbackEnabled = settings.letters.fallback;
  for (const section of ['music', 'media', 'threeD']) result[section] = { ...result[section], ...settings[section] };
  return result;
}
