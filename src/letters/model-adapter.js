export class ModelAdapter {
  constructor(provider) {
    if (!provider || typeof provider.generate !== 'function') throw new TypeError('provider.generate is required');
    this.provider = provider;
  }
  async generateReply(input) {
    const result = await this.provider.generate(input);
    if (!result || typeof result.text !== 'string' || !result.text.trim()) throw new Error('Model provider returned an invalid reply');
    return { text: result.text.trim(), provider: result.provider ?? 'unknown', metadata: result.metadata ?? {} };
  }
}

export class FallbackLetterProvider {
  async generate({ recipient = '你', prompt = '' } = {}) {
    return { provider: 'offline-fallback', text: `${recipient}，我收到了你的信。谢谢你把这些话告诉我。${prompt ? '我会记得你写下的心情。' : ''}` };
  }
}
