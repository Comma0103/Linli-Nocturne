import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

function checked(text, maxChars) {
  if (!Number.isFinite(maxChars) || text.length > maxChars) throw Object.assign(new Error('人格文本超出预算，未截断规则'), { code: 'persona_budget_exceeded' });
  return text;
}
const digest = text => createHash('sha256').update(text).digest('hex');

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

  async getPrompt() { return { text: checked(this.text, this.maxChars), provider: this.provider, metadata: { version: '1.0.0', sha256: digest(this.text) } }; }
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
    return { text: checked(text, this.maxChars), provider: this.provider, metadata: { version: '1.0.0', sha256: digest(text) } };
  }
}
