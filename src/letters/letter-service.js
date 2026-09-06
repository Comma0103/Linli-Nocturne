import { randomUUID } from 'node:crypto';
import { createDayBoundary, DEFAULT_TIME_ZONE } from '../core/time-boundary.js';

export class LetterLimitError extends Error {
  constructor(message, code) { super(message); this.name = 'LetterLimitError'; this.code = code; }
}

export class LetterService {
  constructor({ store, modelAdapter, clock = () => new Date(), timeZone = DEFAULT_TIME_ZONE, limits = {} }) {
    this.store = store;
    this.modelAdapter = modelAdapter;
    this.clock = clock;
    this.dayBoundary = createDayBoundary(timeZone);
    const maxAttempts = Number.isInteger(limits.maxAttempts) ? limits.maxAttempts : 3;
    const retryDelayMs = Number.isFinite(limits.retryDelayMs) ? limits.retryDelayMs : 60 * 1000;
    this.limits = { dailyLimit: limits.dailyLimit ?? 3, delayMs: limits.delayMs ?? 5 * 60 * 1000, bypass: limits.bypass ?? false,
      maxAttempts: Math.max(1, maxAttempts), retryDelayMs: Math.max(0, retryDelayMs) };
  }

  send({ recipient = '林离', body }) {
    if (typeof body !== 'string' || !body.trim()) throw new TypeError('Letter body is required');
    const now = this.clock();
    const { startIso, endIso } = this.dayBoundary(now);
    if (!this.limits.bypass && this.store.countToday(recipient, startIso, endIso) >= this.limits.dailyLimit) {
      throw new LetterLimitError('Daily letter limit reached', 'daily_limit');
    }
    const letter = { id: randomUUID(), recipient, body: body.trim(), createdAt: now.toISOString(),
      availableAt: new Date(now.getTime() + (this.limits.bypass ? 0 : this.limits.delayMs)).toISOString() };
    return this.store.insertLetter(letter);
  }

  async processNext() {
    const letter = this.store.claimNextLetter(this.clock().toISOString(), this.limits.maxAttempts);
    if (!letter) return null;
    try {
      const result = await this.modelAdapter.generateReply({ recipient: letter.recipient, prompt: letter.body });
      return this.store.markReplied(letter.id, result.text, this.clock().toISOString());
    } catch (error) {
      const errorCode = /^[a-z][a-z0-9_.:-]*$/iu.test(error?.code ?? '') ? error.code : 'provider_failed';
      return this.store.markFailed(letter.id, errorCode, this.clock().toISOString(), {
        maxAttempts: this.limits.maxAttempts, retryDelayMs: this.limits.retryDelayMs,
      });
    }
  }

  recoverStaleProcessing({ leaseMs = 5 * 60 * 1000 } = {}) {
    return this.store.recoverStaleLetters(this.clock().toISOString(), leaseMs, this.limits.maxAttempts, this.limits.retryDelayMs);
  }

  list() { return this.store.listLetters(); }
  remainingToday(recipient = '林离') {
    const now = this.clock();
    const { startIso, endIso } = this.dayBoundary(now);
    return Math.max(0, this.limits.dailyLimit - this.store.countToday(recipient, startIso, endIso));
  }
  detail(id) { return this.store.getLetter(id); }
  unreadCount() { return this.store.countUnread(); }
  markRead(id) { return this.store.markRead(id, this.clock().toISOString()); }
}
