function withTimeout(task, timeoutMs, label) {
  if (!timeoutMs || timeoutMs <= 0) return task();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${label} provider timeout`), { code: 'provider_timeout' })), timeoutMs);
  });
  return Promise.race([Promise.resolve().then(task), timeout]).finally(() => clearTimeout(timer));
}

export class ModelProviderError extends Error {
  constructor(message, code = 'provider_failed', provider = 'unknown') {
    super(message); this.name = 'ModelProviderError'; this.code = code; this.provider = provider;
  }
}

class FunctionProvider {
  constructor({ generate, provider, timeoutMs = 30_000 }) {
    if (typeof generate !== 'function') throw new TypeError(`${provider}.generate is required`);
    this.generateFn = generate;
    this.provider = provider;
    this.timeoutMs = timeoutMs;
  }

  async generate(input) {
    try {
      const result = await withTimeout(() => this.generateFn(input), this.timeoutMs, this.provider);
      return { ...result, provider: result?.provider ?? this.provider };
    } catch (error) {
      if (error instanceof ModelProviderError) throw error;
      throw new ModelProviderError(error?.message ?? `${this.provider} provider failed`, error?.code ?? 'provider_failed', this.provider);
    }
  }
}

export class ExternalApiProvider extends FunctionProvider {
  constructor(options) { super({ ...options, provider: options.provider ?? 'external-api' }); }
}

export class LocalModelProvider extends FunctionProvider {
  constructor(options) { super({ ...options, provider: options.provider ?? 'local-model' }); }
}

export class ModelProviderChain {
  constructor({ external = null, local = null, fallback = new FallbackLetterProvider() } = {}) {
    this.providers = [external, local, fallback].filter(Boolean);
  }

  async generate(input) {
    const failures = [];
    for (const provider of this.providers) {
      try {
        const result = await provider.generate(input);
        return { ...result, metadata: { ...(result?.metadata ?? {}), providerFailures: failures } };
      } catch (error) {
        failures.push({ provider: provider.provider ?? provider.constructor.name, code: error?.code ?? 'provider_failed' });
      }
    }
    throw new ModelProviderError('No model provider could generate a reply', 'provider_chain_exhausted', 'chain');
  }
}

export class ModelAdapter {
  constructor(provider) {
    if (!provider || typeof provider.generate !== 'function') throw new TypeError('provider.generate is required');
    this.provider = provider;
  }

  async generateReply(input) {
    const result = await this.provider.generate(input);
    if (!result || typeof result.text !== 'string' || !result.text.trim()) throw new ModelProviderError('Model provider returned an invalid reply', 'invalid_provider_reply', result?.provider ?? 'unknown');
    return { text: result.text.trim(), provider: result.provider ?? 'unknown', metadata: result.metadata ?? {} };
  }
}

export class FallbackLetterProvider {
  constructor({ provider = 'offline-fallback' } = {}) { this.provider = provider; }

  async generate({ recipient = '你', prompt = '' } = {}) {
    return { provider: this.provider, text: `${recipient}，我收到了你的信。谢谢你把这些话告诉我。${prompt ? '我会记得你写下的心情。' : ''}` };
  }
}
