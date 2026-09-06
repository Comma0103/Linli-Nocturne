import { randomUUID } from 'node:crypto';

function cleanText(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu, '').trim();
}

function boundedText(value, maxChars) {
  const text = cleanText(value);
  if (maxChars <= 0) return '';
  return text.length > maxChars ? `${text.slice(0, Math.max(0, maxChars - 1))}…` : text;
}

export class MemoryProvider {
  constructor({ provider = 'memory', enabled = true, maxEpisodes = 8, maxEpisodeChars = 1_000, maxContextChars = 4_000 } = {}) {
    this.provider = provider;
    this.enabled = enabled;
    this.maxEpisodes = Math.max(0, Math.floor(maxEpisodes));
    this.maxEpisodeChars = Math.max(0, Math.floor(maxEpisodeChars));
    this.maxContextChars = Math.max(0, Math.floor(maxContextChars));
  }

  async recall() { return { context: '', episodes: [], provider: this.provider }; }
  async remember() { return null; }
}

export class NoopMemoryProvider extends MemoryProvider {
  constructor() { super({ provider: 'memory-disabled', enabled: false, maxEpisodes: 0, maxEpisodeChars: 0, maxContextChars: 0 }); }
}

export class SqliteMemoryProvider extends MemoryProvider {
  constructor({ store, ...options } = {}) {
    super({ provider: 'sqlite-memory', ...options });
    if (!store || typeof store.listMemoryEpisodes !== 'function') throw new TypeError('store memory methods are required');
    this.store = store;
  }

  async recall({ recipient = '林离' } = {}) {
    if (!this.enabled || this.maxEpisodes === 0 || this.maxContextChars === 0) return { context: '', episodes: [], provider: this.provider };
    const episodes = this.store.listMemoryEpisodes(recipient, this.maxEpisodes);
    const lines = [];
    let length = 0;
    for (const episode of episodes) {
      const line = `- ${episode.content}`;
      if (length + line.length + (lines.length ? 1 : 0) > this.maxContextChars) break;
      lines.unshift(line);
      length += line.length + (lines.length > 1 ? 1 : 0);
    }
    return { context: lines.join('\n'), episodes, provider: this.provider };
  }

  async remember({ recipient = '林离', letter, reply, createdAt = new Date().toISOString() } = {}) {
    if (!this.enabled || this.maxEpisodes === 0 || !letter?.id) return null;
    const content = boundedText(`来信：${cleanText(letter.body)}\n回信：${cleanText(reply)}`, this.maxEpisodeChars);
    const episode = this.store.insertMemoryEpisode({
      id: randomUUID(), recipient, sourceLetterId: letter.id, content, createdAt,
    });
    this.store.trimMemoryEpisodes(recipient, this.maxEpisodes);
    return episode;
  }
}
