import { readFile } from 'node:fs/promises';

export class PersonaProvider {
  constructor({ provider = 'persona' } = {}) { this.provider = provider; }
  async getPrompt() { return { text: '', provider: this.provider, metadata: {} }; }
}

export class NoopPersonaProvider extends PersonaProvider {
  constructor() { super({ provider: 'persona-disabled' }); }
}

export class StaticPersonaProvider extends PersonaProvider {
  constructor({ text = '', provider = 'persona-static', maxChars = 8_000 } = {}) {
    super({ provider });
    this.text = String(text);
    this.maxChars = Math.max(0, Math.floor(maxChars));
  }

  async getPrompt() { return { text: this.text.slice(0, this.maxChars), provider: this.provider, metadata: { source: 'static' } }; }
}

export class FilePersonaProvider extends PersonaProvider {
  constructor({ path, provider = 'persona-file', maxChars = 8_000 } = {}) {
    super({ provider });
    if (!path) throw new TypeError('persona file path is required');
    this.path = path;
    this.maxChars = Math.max(0, Math.floor(maxChars));
  }

  async getPrompt() {
    const text = await readFile(this.path, 'utf8');
    return { text: text.slice(0, this.maxChars), provider: this.provider, metadata: { source: 'file', path: this.path } };
  }
}
