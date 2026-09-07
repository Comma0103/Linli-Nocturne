import { randomUUID } from 'node:crypto';
import { createDayBoundary, DEFAULT_TIME_ZONE } from '../core/time-boundary.js';
import { NoopMemoryProvider } from './memory-provider.js';
import { NoopPersonaProvider } from './persona-provider.js';
import { PersonaReplyPolicy } from './reply-policy.js';
import { executionTrace } from './execution-trace.js';
import { safeErrorCode } from './model-adapter.js';
import { localTimeContext } from '../core/time-context.js';

export class LetterLimitError extends Error {
  constructor(message, code) { super(message); this.name = 'LetterLimitError'; this.code = code; }
}

export class LetterService {
  constructor({ store, modelAdapter, memoryProvider = new NoopMemoryProvider(), personaProvider = new NoopPersonaProvider(), outputPolicy = new PersonaReplyPolicy(), conversationId = 'default', userDisplayName = '', clock = () => new Date(), timeZone = DEFAULT_TIME_ZONE, limits = {} }) {
    this.store = store;
    this.modelAdapter = modelAdapter;
    if (!memoryProvider || typeof memoryProvider.recall !== 'function' || typeof memoryProvider.remember !== 'function') throw new TypeError('memoryProvider.recall and remember are required');
    this.memoryProvider = memoryProvider;
    if (!personaProvider || typeof personaProvider.getPrompt !== 'function') throw new TypeError('personaProvider.getPrompt is required');
    this.personaProvider = personaProvider;
    this.userDisplayName = String(userDisplayName ?? '').trim();
    this.conversationId = conversationId;
    this.outputPolicy = outputPolicy;
    this.timeZone = timeZone;
    this.clock = clock;
    this.dayBoundary = createDayBoundary(timeZone);
    const maxAttempts = Number.isInteger(limits.maxAttempts) ? limits.maxAttempts : 3;
    const retryDelayMs = Number.isFinite(limits.retryDelayMs) ? limits.retryDelayMs : 60 * 1000;
    const memoryContextMaxChars = Number.isFinite(limits.memoryContextMaxChars) ? limits.memoryContextMaxChars : memoryProvider.maxContextChars ?? 4_000;
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
    const letter = { id: randomUUID(), recipient, conversationId: this.conversationId, body: body.trim(), createdAt: now.toISOString(),
      availableAt: new Date(now.getTime() + (this.limits.bypass ? 0 : this.limits.delayMs)).toISOString() };
    return this.store.insertLetter(letter);
  }

  resend(id) {
    const original = this.detail(id);
    if (!original) throw Object.assign(new Error('Letter not found'), { code: 'letter_not_found' });
    if (original.status !== 'failed') throw Object.assign(new Error('Only failed letters can be resent'), { code: 'letter_not_failed' });
    return this.send({ recipient: original.recipient, body: original.body });
  }

  async processNext() {
    const letter = this.store.claimNextLetter(this.clock().toISOString(), this.limits.maxAttempts, this.conversationId);
    if (!letter) return null;
    const trace = { configured: this.modelAdapter.configuration ?? {}, warnings: [] };
    const saveTrace = () => this.store.updateAttempt(letter, executionTrace(trace));
    const lease = setInterval(() => this.store.renewLetterLease(letter, this.clock().toISOString()), 30_000);
    lease.unref?.();
    try {
      saveTrace();
      let memory = { context: '' };
      try { memory = await this.memoryProvider.recall({ recipient: letter.recipient, conversationId: this.conversationId, letter, contextLimit: this.limits.memoryContextMaxChars }); }
      catch (error) { trace.warnings.push({ id: 'memory-recall', code: safeErrorCode(error) }); }
      const memoryContext = String(memory?.context ?? '').slice(0, this.limits.memoryContextMaxChars);
      trace.memory = { ...(this.memoryProvider.moduleInfo ?? { id: this.memoryProvider.provider ?? 'unknown', version: 'unknown' }),
        enabled: this.memoryProvider.enabled !== false, contextChars: memoryContext.length, maxChars: this.limits.memoryContextMaxChars,
        sources: (memory?.episodes ?? []).map(item => ({ sourceLetterId: item.source_letter_id })) };
      // 选定人格缺失是配置错误，不得静默退成无人格回信。
      const persona = await this.personaProvider.getPrompt({ recipient: letter.recipient, letter });
      trace.persona = { id: this.personaProvider.moduleInfo?.id ?? persona.provider, version: this.personaProvider.moduleInfo?.version ?? 'unknown', ...persona.metadata };
      saveTrace();
      const now = this.clock();
      const localTime = localTimeContext(now, this.timeZone);
      const temporalRule = `当前本地时间为 ${localTime.localDateTime}（${this.timeZone}），当前时段为“${localTime.timeOfDay}”。起首必须遵循这个本地时段，不得根据 UTC 时间自行猜测。`;
      const result = await this.modelAdapter.generateReply({ recipient: letter.recipient, userDisplayName: this.userDisplayName, prompt: letter.body,
        memory: memoryContext, memoryEcho: memoryContext ? memory.memoryEcho : '', persona: String(persona?.text ?? ''), personaId: persona.provider,
        rules: `${persona.rules ?? ''}\n${temporalRule}`, now: now.toISOString(), timeZone: this.timeZone,
        ...localTime,
        onExecution: execution => { trace.execution = execution; saveTrace(); } });
      trace.execution = { provider: result.provider, version: 'unknown', ...result.metadata };
      const finalized = this.outputPolicy.apply(result.text, persona, { timeOfDay: localTime.timeOfDay });
      trace.outputPolicy = finalized.metadata;
      const at = this.clock().toISOString();
      const memoryInput = { recipient: letter.recipient, conversationId: this.conversationId, letter, reply: finalized.text, createdAt: at };
      // 默认 SQLite 记忆与正文、留痕在同一事务提交；第三方记忆失败有可见记录。
      const prepared = this.memoryProvider.prepare?.(memoryInput);
      const replied = this.store.finishLetterAttempt(letter, { text: finalized.text, at, metadata: executionTrace(trace), memory: prepared });
      if (!this.memoryProvider.prepare && replied?.status === 'replied') {
        try { await this.memoryProvider.remember(memoryInput); }
        catch (error) {
          trace.warnings.push({ id: 'memory-remember', code: safeErrorCode(error) });
          this.store.db.prepare('UPDATE letter_attempts SET metadata_json = ? WHERE letter_id = ? AND attempt = ?').run(JSON.stringify(executionTrace(trace)), letter.id, letter.attempt_count);
        }
      }
      return replied;
    } catch (error) {
      if (error.execution) trace.execution = error.execution;
      return this.store.finishLetterAttempt(letter, { errorCode: safeErrorCode(error), at: this.clock().toISOString(), metadata: executionTrace(trace),
        retryOptions: { maxAttempts: this.limits.maxAttempts, retryDelayMs: this.limits.retryDelayMs } });
    } finally { clearInterval(lease); }
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
  detail(id) { const row = this.store.getLetter(id); return row?.conversation_id === this.conversationId ? row : null; }
  execution(id) { return this.detail(id) ? { letterId: id, attempts: this.store.getLetterAttempts(id), provenance: this.store.getLetterAttempts(id).length ? 'recorded' : 'unknown' } : null; }
  unreadCount() { return this.store.countUnread(); }
  markRead(id) { return this.store.markRead(id, this.clock().toISOString()); }
}
