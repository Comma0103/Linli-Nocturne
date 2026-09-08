import { randomUUID } from 'node:crypto';
import topics from './assets/memory-topics.json' with { type: 'json' };

// _long_term 的有限情景聚合方式改编自 olivia-lin；词表直接提取自其 local_engine.py。
function profileFor(episodes) {
  const counts = {};
  for (const episode of episodes) {
    const incoming = episode.content.split('\n回信：')[0].toLowerCase();
    for (const [topic, words] of Object.entries(topics)) {
      if (words.some(word => incoming.includes(word))) counts[topic] = (counts[topic] ?? 0) + 1;
    }
  }
  return { retainedLetters: episodes.length, topTopics: Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3) };
}

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

  async recall({ recipient = '林离', conversationId = 'default', contextLimit = this.maxContextChars } = {}) {
    const budget = Math.min(this.maxContextChars, contextLimit);
    if (!this.enabled || this.maxEpisodes === 0 || this.maxContextChars === 0) return { context: '', episodes: [], provider: this.provider };
    const episodes = this.store.listMemoryEpisodes(recipient, this.maxEpisodes, conversationId);
    const lines = [];
    const used = [];
    let length = 0;
    for (const episode of episodes) {
      const line = `- ${episode.content}`;
      if (length + line.length + (lines.length ? 1 : 0) > budget) break;
      lines.unshift(line);
      used.unshift(episode);
      length += line.length + (lines.length > 1 ? 1 : 0);
    }
    const profile = profileFor(used);
    const profileLine = used.length ? `有限画像（仅依据以下保留往来，主题不等于关系事实）：${JSON.stringify(profile)}\n` : '';
    const history = lines.join('\n');
    const context = profileLine.length + history.length <= budget ? profileLine + history : history;
    const last = used.at(-1);
    const quote = last?.content.split('\n回信：')[0].replace(/^来信：/u, '').slice(0, 100);
    return { context, episodes: used, provider: this.provider, profile,
      memoryEcho: quote ? `你上封信写过“${quote}”，这一句也留在这次读信的间隙。` : '' };
  }

  prepare({ recipient = '林离', conversationId = 'default', letter, reply, createdAt = new Date().toISOString() } = {}) {
    if (!this.enabled || this.maxEpisodes === 0 || !letter?.id) return null;
    const content = boundedText(`来信：${cleanText(letter.body)}\n回信：${cleanText(reply)}`, this.maxEpisodeChars);
    return { episode: { id: randomUUID(), recipient, sourceLetterId: letter.id, content, createdAt, conversationId }, maxEpisodes: this.maxEpisodes };
  }
  async remember(input = {}) {
    const prepared = this.prepare(input);
    if (!prepared) return null;
    const episode = this.store.insertMemoryEpisode(prepared.episode);
    this.store.trimMemoryEpisodes(prepared.episode.recipient, this.maxEpisodes, prepared.episode.conversationId);
    return episode;
  }
}
