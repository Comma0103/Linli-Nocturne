import { SqliteMemoryProvider } from './memory-provider.js';
import { exchangeHash, MEMORY_VERSION, retrieveSoulHistory } from './olivia-soul-memory.js';
import { safeErrorCode } from './model-adapter.js';

export class OliviaSoulSqliteMemoryProvider extends SqliteMemoryProvider {
  constructor({ summarizer = null, clock = () => new Date(), retrieval = retrieveSoulHistory, ...options } = {}) {
    super(options);
    this.provider = 'olivia-soul.sqlite';
    this.version = MEMORY_VERSION;
    this.summarizer = summarizer;
    this.clock = clock;
    this.refreshing = false;
    this.retrieval = retrieval;
  }

  async recall({ recipient = '林离', conversationId = 'default', letter, contextLimit = this.maxContextChars } = {}) {
    if (!this.enabled) return { context: '', episodes: [], provider: this.provider };
    if (contextLimit <= 0 || this.maxContextChars <= 0) return { context: '', episodes: [], provider: this.provider,
      epoch: this.store.getMemoryState(recipient, conversationId)?.memory_epoch ?? 0 };
    const budget = Math.max(0, Math.min(this.maxContextChars, contextLimit));
    const rows = this.store.listSuccessfulLetters(recipient, conversationId);
    const state = this.store.getMemoryState(recipient, conversationId);
    const info = JSON.parse(state?.metadata_json ?? '{}');
    const summaries = new Map(this.store.listMemorySummaries(recipient, conversationId)
      .filter(row => row.algorithm_version === MEMORY_VERSION).map(row => [row.source_letter_id, row]));
    const recent = rows.slice(-5);
    const middle = rows.slice(Math.max(0, rows.length - 10), Math.max(0, rows.length - 5));
    const old = rows.slice(0, Math.max(0, rows.length - 10));
    const blocks = [];
    const sources = [];
    const sourceIds = new Set();
    let used = 0;
    let truncated = false;
    const add = (text, source = null, order = 0) => {
      const available = budget - used - (blocks.length ? 2 : 0);
      if (available <= 0) { truncated = true; return; }
      const suffix = '\n[上下文截断]';
      const selected = text.length > available ? (text.slice(0, Math.max(0, available - suffix.length)) + suffix).slice(0, available) : text;
      blocks.push({ text: selected, order }); used += selected.length + (blocks.length > 1 ? 2 : 0);
      truncated ||= selected.length < text.length;
      if (source) {
        sources.push({ source_letter_id: source.id });
        sourceIds.add(source.id);
      }
    };
    // 老摘要是历史概览，近期原文优先占预算；不把两个版本的当前关系重复注入。
    const bulkValid = state?.bulk_summary && info.version === MEMORY_VERSION && Array.isArray(info.bulkHashes)
      && info.bulkHashes.every((hash, index) => old[index] && exchangeHash(old[index]) === hash);
    for (let index = recent.length - 1; index >= 0; index -= 1) {
      const row = recent[index];
      add('近期往来 ' + row.id + ' ' + row.created_at + '\n来信：' + row.body + '\n回信：' + row.reply, row, 100 + index);
    }
    if (bulkValid) add('十封以前五段式回忆（当时状态，较新原文优先）：\n' + state.bulk_summary);
    for (let index = 0; index < middle.length; index += 1) {
      const row = middle[index];
      const cached = summaries.get(row.id);
      add('逐封摘要 ' + row.id + '：' + (cached?.content_md5 === exchangeHash(row) ? cached.summary : '摘要待更新；来信：' + row.body + '\n回信：' + row.reply), row, 50 + index);
    }
    // 检索出错仅影响补充证据，不丢弃已有有效记忆。
    let retrieval;
    try { retrieval = await this.retrieval(old, { query: letter?.body ?? '', person: conversationId }); }
    catch (error) { retrieval = { evidence: [], errorCode: safeErrorCode(error) }; }
    for (const item of retrieval.evidence) add('旧信原文证据 ' + item.letterId + ' md5:' + item.contentMd5
      + '\n来信：' + item.incoming + '\n回信：' + item.reply, { id: item.letterId }, 10 + item.order);
    const uncovered = old.slice(bulkValid ? info.bulkHashes.length : 0);
    for (let index = 0; index < uncovered.length; index += 1) {
      const row = uncovered[index];
      if (sourceIds.has(row.id)) continue;
      const cached = summaries.get(row.id);
      add('尚未并入旧信回忆 ' + row.id + '：' + (cached?.content_md5 === exchangeHash(row) ? cached.summary
        : '来信：' + row.body + '\n回信：' + row.reply), row, 5 + index / Math.max(1, uncovered.length));
    }
    const latest = rows.at(-1);
    const ledgerIndex = rows.findIndex(row => row.id === info.ledgerThrough);
    const initializeState = !state?.relationship_state || (info.ledgerThrough && ledgerIndex < 0) || rows.length - ledgerIndex - 1 > 1;
    return {
      context: blocks.sort((a, b) => a.order - b.order).map(block => block.text).join('\n\n'), episodes: sources, provider: this.provider, truncated,
      memoryEcho: latest ? '你上封信写过“' + latest.body.slice(0, 100) + '”。' : '',
      previousState: state?.relationship_state ?? '',
      relationshipMemory: initializeState && state?.relationship_state
        ? '此前成功提交的关系账本（截至 ' + (info.ledgerThrough || '初次往来之前') + '；仅有较新明确证据才调整）：\n' + state.relationship_state : '',
      coveredThrough: state?.covered_through ?? '',
      retrieval: { sha256: retrieval.assetSha256, snapshotId: retrieval.snapshotId, code: retrieval.errorCode, queryCount: retrieval.queryCount },
      initializeState, memoryLastLetterId: latest?.id ?? '', revision: state?.revision ?? 0,
      epoch: state?.memory_epoch ?? 0,
    };
  }

  prepare(input = {}) {
    if (!this.enabled || !input.letter?.id) return null;
    const base = super.prepare(input) ?? {};
    const update = input.generation?.memoryUpdate;
    return { ...base, refresh: { recipient: input.recipient, conversationId: input.conversationId, epoch: input.recalled?.epoch ?? 0,
      needed: this.store.listSuccessfulLetters(input.recipient, input.conversationId).length >= 5 },
      ledger: update?.relationshipState ? {
        text: update.relationshipState, coveredThrough: input.recalled?.memoryLastLetterId ?? '',
        priorText: input.recalled?.previousState ?? '', version: update.version ?? 'unknown',
      } : null };
  }
  queueAfterReply({ recipient, conversationId } = {}) {
    return { status: this.store.listSuccessfulLetters(recipient, conversationId).length <= 5 ? 'ready' : this.summarizer ? 'queued' : 'waiting-model' };
  }

  async processPending({ conversationId = 'default' } = {}) {
    if (!this.enabled || !this.summarizer || this.refreshing) return 0;
    const now = this.clock().toISOString();
    const cutoff = new Date(this.clock().getTime() - 15 * 60_000).toISOString();
    this.store.db.prepare("UPDATE memory_states SET status = 'failed', last_error = 'memory_lease_expired' WHERE conversation_id = ? AND status = 'processing' AND attempt_count >= 3 AND updated_at < ?").run(conversationId, cutoff);
    const state = this.store.db.prepare("SELECT * FROM memory_states WHERE conversation_id = ? AND ((status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)) OR (status = 'processing' AND updated_at < ?)) AND attempt_count < 3 ORDER BY updated_at LIMIT 1")
      .get(conversationId, now, cutoff);
    if (!state) return 0;
    const claimed = this.store.db.prepare("UPDATE memory_states SET status = 'processing', attempt_count = attempt_count + 1, updated_at = ? WHERE conversation_id = ? AND recipient = ? AND revision = ? AND (status = 'pending' OR (status = 'processing' AND updated_at < ?))")
      .run(now, conversationId, state.recipient, state.revision, cutoff);
    if (!claimed.changes) return 0;
    this.refreshing = true;
    const lease = setInterval(() => this.store.db.prepare("UPDATE memory_states SET updated_at = ? WHERE conversation_id = ? AND recipient = ? AND revision = ? AND status = 'processing'")
      .run(this.clock().toISOString(), conversationId, state.recipient, state.revision), 30_000);
    lease.unref?.();
    try {
      const rows = this.store.listSuccessfulLetters(state.recipient, conversationId);
      const info = JSON.parse(state.metadata_json ?? '{}');
      const cached = new Map(this.store.listMemorySummaries(state.recipient, conversationId)
        .filter(row => row.algorithm_version === MEMORY_VERSION).map(row => [row.source_letter_id, row]));
      const assertCurrent = () => {
        if (!this.enabled || this.store.getMemoryState(state.recipient, conversationId)?.revision !== state.revision) {
          throw Object.assign(new Error('记忆输入已变化'), { code: 'memory_superseded' });
        }
      };
      const summaryRows = rows.slice(0, Math.max(0, rows.length - 5));
      const calls = [];
      for (const row of summaryRows) {
        const hash = exchangeHash(row);
        if (cached.get(row.id)?.content_md5 === hash) continue;
        const result = await this.summarizer({ kind: 'letter', letter: row });
        assertCurrent();
        if (!String(result.text ?? '').trim()) throw Object.assign(new Error('摘要为空'), { code: 'memory_empty_summary' });
        const saved = this.store.upsertMemorySummary({ recipient: state.recipient, conversationId,
          sourceLetterId: row.id, contentMd5: hash, summary: result.text, algorithmVersion: MEMORY_VERSION,
          createdAt: row.created_at, updatedAt: this.clock().toISOString() });
        cached.set(row.id, saved);
        calls.push({ provider: result.provider, model: result.model, version: result.version, assetSha256: result.assetSha256, sourceLetterId: row.id });
      }
      const old = rows.slice(0, Math.max(0, rows.length - 10));
      const hashes = old.map(exchangeHash);
      const priorHashes = info.bulkHashes ?? [];
      const reusable = state.bulk_summary && info.version === MEMORY_VERSION && priorHashes.length <= hashes.length && priorHashes.every((hash, i) => hash === hashes[i]);
      let bulk = reusable ? state.bulk_summary : '';
      if (old.length && (!reusable || priorHashes.length !== hashes.length)) {
        const selected = reusable ? old.slice(priorHashes.length) : old;
        const result = await this.summarizer({ kind: 'bulk', previous: bulk,
          summaries: selected.map(row => '往来 ' + row.id + ' md5:' + exchangeHash(row) + '：' + cached.get(row.id).summary) });
        assertCurrent();
        bulk = result.text;
        calls.push({ provider: result.provider, model: result.model, version: result.version, assetSha256: result.assetSha256 });
      }
      assertCurrent();
      const latest = this.store.listSuccessfulLetters(state.recipient, conversationId).at(-1);
      const status = latest?.id === rows.at(-1)?.id ? 'ready' : 'pending';
      const metadata = { ...info, bulkHashes: hashes, version: MEMORY_VERSION, calls, lastProcessedLetterId: rows.at(-1)?.id ?? '' };
      const result = this.store.db.prepare('UPDATE memory_states SET bulk_summary = ?, covered_through = ?, metadata_json = ?, revision = revision + 1, status = ?, last_error = NULL, attempt_count = 0, next_attempt_at = NULL, updated_at = ? WHERE conversation_id = ? AND recipient = ? AND revision = ?')
        .run(bulk, old.at(-1)?.id ?? '', JSON.stringify(metadata), status, this.clock().toISOString(), conversationId, state.recipient, state.revision);
      return result.changes;
    } catch (error) {
      const attempts = state.attempt_count + 1;
      const code = safeErrorCode(error);
      this.store.db.prepare("UPDATE memory_states SET status = ?, last_error = ?, next_attempt_at = ?, updated_at = ? WHERE conversation_id = ? AND recipient = ? AND revision = ?")
        .run(attempts >= 3 ? 'failed' : 'pending', code, new Date(this.clock().getTime() + 60_000 * 2 ** (attempts - 1)).toISOString(),
          this.clock().toISOString(), conversationId, state.recipient, state.revision);
      return 0;
    } finally { clearInterval(lease); this.refreshing = false; }
  }

  clear({ conversationId = 'default', sourceLetterId = null } = {}) {
    this.store.db.exec('BEGIN IMMEDIATE');
    try {
      this.store.db.prepare("INSERT OR IGNORE INTO memory_states (conversation_id, recipient, updated_at) SELECT DISTINCT conversation_id, recipient, ? FROM letters WHERE conversation_id = ?")
        .run(this.clock().toISOString(), conversationId);
      if (sourceLetterId) {
        this.store.db.prepare('UPDATE letters SET memory_allowed = 0 WHERE conversation_id = ? AND id = ?').run(conversationId, sourceLetterId);
        this.store.db.prepare('DELETE FROM memory_summaries WHERE conversation_id = ? AND source_letter_id = ?').run(conversationId, sourceLetterId);
      } else {
        this.store.db.prepare('UPDATE letters SET memory_allowed = 0 WHERE conversation_id = ?').run(conversationId);
        this.store.db.prepare('DELETE FROM memory_summaries WHERE conversation_id = ?').run(conversationId);
      }
      this.store.deleteMemoryEpisodes(conversationId, sourceLetterId);
      this.store.db.prepare("UPDATE memory_states SET bulk_summary = '', relationship_state = '', covered_through = '', metadata_json = '{}', revision = revision + 1, memory_epoch = memory_epoch + 1, status = 'pending', attempt_count = 0, next_attempt_at = NULL WHERE conversation_id = ?").run(conversationId);
      this.store.db.exec('COMMIT');
    } catch (error) { this.store.db.exec('ROLLBACK'); throw error; }
  }

  includeHistory({ conversationId = 'default', sourceLetterId = null } = {}) {
    this.store.db.exec('BEGIN IMMEDIATE');
    try {
      const changed = this.store.db.prepare("UPDATE letters SET memory_allowed = 1 WHERE conversation_id = ? AND status = 'replied' AND (? IS NULL OR id = ?)")
        .run(conversationId, sourceLetterId, sourceLetterId).changes;
      if (changed) {
        this.store.db.prepare("INSERT OR IGNORE INTO memory_states (conversation_id, recipient, updated_at) SELECT DISTINCT conversation_id, recipient, ? FROM letters WHERE conversation_id = ? AND memory_allowed = 1")
          .run(this.clock().toISOString(), conversationId);
        this.store.db.prepare("UPDATE memory_states SET revision = revision + 1, metadata_json = json_set(metadata_json, '$.ledgerThrough', 'history-rebuild'), status = 'pending', attempt_count = 0, next_attempt_at = NULL WHERE conversation_id = ?").run(conversationId);
      }
      this.store.db.exec('COMMIT');
      return changed;
    } catch (error) { this.store.db.exec('ROLLBACK'); throw error; }
  }
}
