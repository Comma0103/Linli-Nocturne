import { randomUUID } from 'node:crypto';
import { createDayBoundary, DEFAULT_TIME_ZONE } from '../core/time-boundary.js';
import { NoopMemoryProvider } from './memory-provider.js';
import { NoopPersonaProvider } from './persona-provider.js';

export class LetterLimitError extends Error {
  constructor(message, code) { super(message); this.name = 'LetterLimitError'; this.code = code; }
}

export class LetterService {
  constructor({ store, modelAdapter, memoryProvider = new NoopMemoryProvider(), personaProvider = new NoopPersonaProvider(), clock = () => new Date(), timeZone = DEFAULT_TIME_ZONE, limits = {} }) {
    this.store = store;
    this.modelAdapter = modelAdapter;
    if (!memoryProvider || typeof memoryProvider.recall !== 'function' || typeof memoryProvider.remember !== 'function') throw new TypeError('memoryProvider.recall and remember are required');
    this.memoryProvider = memoryProvider;
    if (!personaProvider || typeof personaProvider.getPrompt !== 'function') throw new TypeError('personaProvider.getPrompt is required');
    this.personaProvider = personaProvider;
    this.clock = clock;
    this.dayBoundary = createDayBoundary(timeZone);
    const maxAttempts = Number.isInteger(limits.maxAttempts) ? limits.maxAttempts : 3;
    const retryDelayMs = Number.isFinite(limits.retryDelayMs) ? limits.retryDelayMs : 60 * 1000;
    const memoryContextMaxChars = Number.isFinite(limits.memoryContextMaxChars) ? limits.memoryContextMaxChars : 4_000;
    this.limits = { dailyLimit: limits.dailyLimit ?? 3, delayMs: limits.delayMs ?? 5 * 60 * 1000, bypass: limits.bypass ?? false,
      maxAttempts: Math.max(1, maxAttempts), retryDelayMs: Math.max(0, retryDelayMs), memoryContextMaxChars: Math.max(0, Math.floor(memoryContextMaxChars)) };
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
      let memory = { context: '' };
      try { memory = await this.memoryProvider.recall({ recipient: letter.recipient, letter }); } catch { /* memory is auxiliary */ }
      const memoryContext = String(memory?.context ?? '').slice(0, this.limits.memoryContextMaxChars);
      let persona = { text: '' };
      try { persona = await this.personaProvider.getPrompt({ recipient: letter.recipient, letter }); } catch { /* persona is auxiliary */ }
      const personaText = String(persona?.text ?? '').slice(0, this.limits.memoryContextMaxChars);
      const result = await this.modelAdapter.generateReply({ recipient: letter.recipient, prompt: letter.body, memory: memoryContext, persona: personaText });
      const replied = this.store.markReplied(letter.id, result.text, this.clock().toISOString());
      try { await this.memoryProvider.remember({ recipient: letter.recipient, letter, reply: result.text, createdAt: replied?.replied_at ?? this.clock().toISOString() }); } catch { /* memory is auxiliary */ }
      return replied;
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
    if (this.limits.bypass) return this.limits.dailyLimit;
    const now = this.clock();
    const { startIso, endIso } = this.dayBoundary(now);
    return Math.max(0, this.limits.dailyLimit - this.store.countToday(recipient, startIso, endIso));
  }
  detail(id) { return this.store.getLetter(id); }
  unreadCount() { return this.store.countUnread(); }
  markRead(id) { return this.store.markRead(id, this.clock().toISOString()); }
}
