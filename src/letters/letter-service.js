import { randomUUID } from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;

export class LetterLimitError extends Error {
  constructor(message, code) { super(message); this.name = 'LetterLimitError'; this.code = code; }
}

export class LetterService {
  constructor({ store, modelAdapter, clock = () => new Date(), limits = {} }) {
    this.store = store;
    this.modelAdapter = modelAdapter;
    this.clock = clock;
    this.limits = { dailyLimit: limits.dailyLimit ?? 3, delayMs: limits.delayMs ?? 5 * 60 * 1000, bypass: limits.bypass ?? false };
  }

  send({ recipient = '林离', body }) {
    if (typeof body !== 'string' || !body.trim()) throw new TypeError('Letter body is required');
    const now = this.clock();
    const start = new Date(now.getTime() - (now.getTime() % DAY_MS)).toISOString();
    if (!this.limits.bypass && this.store.countToday(recipient, start) >= this.limits.dailyLimit) {
      throw new LetterLimitError('Daily letter limit reached', 'daily_limit');
    }
    const letter = { id: randomUUID(), recipient, body: body.trim(), createdAt: now.toISOString(),
      availableAt: new Date(now.getTime() + (this.limits.bypass ? 0 : this.limits.delayMs)).toISOString() };
    return this.store.insertLetter(letter);
  }

  async processNext() {
    const letter = this.store.nextReadyLetter(this.clock().toISOString());
    if (!letter) return null;
    const result = await this.modelAdapter.generateReply({ recipient: letter.recipient, prompt: letter.body });
    return this.store.markReplied(letter.id, result.text, this.clock().toISOString());
  }

  list() { return this.store.listLetters(); }
  remainingToday(recipient = '林离') {
    const now = this.clock();
    const start = new Date(now.getTime() - (now.getTime() % DAY_MS)).toISOString();
    return Math.max(0, this.limits.dailyLimit - this.store.countToday(recipient, start));
  }
  detail(id) { return this.store.getLetter(id); }
  unreadCount() { return this.store.countUnread(); }
  markRead(id) { return this.store.markRead(id, this.clock().toISOString()); }
}
