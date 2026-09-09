import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function hydrateMidiJob(job) {
  if (!job) return null;
  const info = JSON.parse(job.info_json);
  const renderJob = info.renderJob ?? null;
  return { jobId: job.job_id, state: job.state, filename: job.filename, createdAt: job.created_at, error: job.error,
    status: renderJob?.status ?? (job.state === 'finished' ? 'produced' : job.state === 'canceled' ? 'cancelled' : job.state),
    progress: renderJob?.progress ?? (job.state === 'finished' ? 1 : 0), attempt: renderJob?.attempt ?? 0,
    errorCode: renderJob?.errorCode ?? null, info, mediaPath: job.media_path,
    inputPath: job.input_path, inputSha256: job.input_sha256, inputSize: job.input_size, inputFilename: job.input_filename };
}

function hydrateVideoJob(row) {
  if (!row) return null;
  return { jobId: row.job_id, letterId: row.letter_id, assetId: row.asset_id, fileName: row.file_name, adapterId: row.adapter_id,
    adapterVersion: row.adapter_version, status: row.status, errorCode: row.error_code, error: row.error,
    metadata: JSON.parse(row.metadata_json || '{}'), mediaPath: row.media_path, size: row.size, createdAt: row.created_at,
    publishedAt: row.published_at, deletedAt: row.deleted_at };
}

export class SqliteStore {
  constructor(filename = ':memory:') {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS letters (
        id TEXT PRIMARY KEY,
        recipient TEXT NOT NULL,
        body TEXT NOT NULL,
        reply TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        available_at TEXT NOT NULL,
        replied_at TEXT,
        read_at TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        processing_started_at TEXT,
        last_error TEXT,
        next_attempt_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_letters_status_available ON letters(status, available_at);
      CREATE TABLE IF NOT EXISTS letter_attempts (
        letter_id TEXT NOT NULL, attempt INTEGER NOT NULL, status TEXT NOT NULL,
        started_at TEXT NOT NULL, ended_at TEXT, error_code TEXT, metadata_json TEXT NOT NULL,
        PRIMARY KEY(letter_id, attempt)
      );
      CREATE TABLE IF NOT EXISTS memory_episodes (
        id TEXT PRIMARY KEY,
        recipient TEXT NOT NULL,
        source_letter_id TEXT NOT NULL UNIQUE,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_episodes_recipient_created ON memory_episodes(recipient, created_at DESC);
      CREATE TABLE IF NOT EXISTS memory_summaries (
        conversation_id TEXT NOT NULL, recipient TEXT NOT NULL, source_letter_id TEXT NOT NULL,
        content_md5 TEXT NOT NULL, summary TEXT NOT NULL, algorithm_version TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY (conversation_id, recipient, source_letter_id)
      );
      CREATE INDEX IF NOT EXISTS idx_memory_summaries_scope ON memory_summaries(conversation_id, recipient, updated_at DESC);
      CREATE TABLE IF NOT EXISTS memory_states (
        conversation_id TEXT NOT NULL, recipient TEXT NOT NULL, bulk_summary TEXT NOT NULL DEFAULT '',
        relationship_state TEXT NOT NULL DEFAULT '', covered_through TEXT NOT NULL DEFAULT '',
        revision INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'ready',
        last_error TEXT, updated_at TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}',
        attempt_count INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT,
        PRIMARY KEY (conversation_id, recipient)
      );
      CREATE TABLE IF NOT EXISTS playlist_items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        source_name TEXT NOT NULL,
        audio_path TEXT,
        manifest_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        item_type INTEGER,
        item_id TEXT,
        name TEXT,
        name_key TEXT,
        icon_url TEXT,
        song_id TEXT,
        performance_id TEXT,
        duration REAL,
        video_duration REAL,
        video_url TEXT,
        performance_type TEXT,
        video_by_tod_view TEXT,
        UNIQUE(item_type, item_id)
      );
      CREATE TABLE IF NOT EXISTS midi_jobs (
        job_id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        filename TEXT NOT NULL,
        created_at TEXT NOT NULL,
        error TEXT,
        info_json TEXT NOT NULL,
        media_path TEXT,
        input_path TEXT,
        input_sha256 TEXT,
        input_size INTEGER,
        input_filename TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_midi_jobs_created_at ON midi_jobs(created_at DESC);
      CREATE TABLE IF NOT EXISTS video_jobs (
        job_id TEXT PRIMARY KEY,
        letter_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        adapter_id TEXT NOT NULL,
        adapter_version TEXT NOT NULL,
        status TEXT NOT NULL,
        error_code TEXT,
        error TEXT,
        metadata_json TEXT NOT NULL,
        media_path TEXT,
        size INTEGER,
        created_at TEXT NOT NULL,
        published_at TEXT,
        deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_video_jobs_letter_created ON video_jobs(letter_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS letter_video_assets (
        letter_id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );
    `);
    const letterColumns = new Set(this.db.prepare('PRAGMA table_info(letters)').all().map(column => column.name));
    const additions = [
      ['attempt_count', 'INTEGER NOT NULL DEFAULT 0'],
      ['processing_started_at', 'TEXT'],
      ['last_error', 'TEXT'],
      ['next_attempt_at', 'TEXT'],
      ['conversation_id', "TEXT NOT NULL DEFAULT 'default'"],
      ['memory_allowed', 'INTEGER NOT NULL DEFAULT 0'],
    ];
    for (const [name, definition] of additions) {
      if (!letterColumns.has(name)) this.db.exec(`ALTER TABLE letters ADD COLUMN ${name} ${definition}`);
    }
    this.db.exec("UPDATE letters SET status = 'pending' WHERE status = 'queued'");
    const memoryColumns = new Set(this.db.prepare('PRAGMA table_info(memory_episodes)').all().map(column => column.name));
    if (!memoryColumns.has('conversation_id')) this.db.exec("ALTER TABLE memory_episodes ADD COLUMN conversation_id TEXT NOT NULL DEFAULT 'default'");
    if (!letterColumns.has('memory_allowed')) this.db.exec('UPDATE letters SET memory_allowed = 1 WHERE id IN (SELECT source_letter_id FROM memory_episodes)');
    const stateColumns = new Set(this.db.prepare('PRAGMA table_info(memory_states)').all().map(column => column.name));
    for (const [name, type] of [['metadata_json', "TEXT NOT NULL DEFAULT '{}'"], ['attempt_count', 'INTEGER NOT NULL DEFAULT 0'], ['next_attempt_at', 'TEXT'], ['memory_epoch', 'INTEGER NOT NULL DEFAULT 0']]) {
      if (!stateColumns.has(name)) this.db.exec('ALTER TABLE memory_states ADD COLUMN ' + name + ' ' + type);
    }
    const midiColumns = new Set(this.db.prepare('PRAGMA table_info(midi_jobs)').all().map(column => column.name));
    for (const [name, type] of [['input_path', 'TEXT'], ['input_sha256', 'TEXT'], ['input_size', 'INTEGER'], ['input_filename', 'TEXT']]) {
      if (!midiColumns.has(name)) this.db.exec('ALTER TABLE midi_jobs ADD COLUMN ' + name + ' ' + type);
    }
  }

  insertLetter(letter) {
    this.db.prepare(`INSERT INTO letters
      (id, recipient, body, reply, status, created_at, available_at, replied_at, read_at, attempt_count, processing_started_at, last_error, next_attempt_at, conversation_id)
      VALUES (?, ?, ?, NULL, 'pending', ?, ?, NULL, NULL, 0, NULL, NULL, NULL, ?)`).run(
      letter.id, letter.recipient, letter.body, letter.createdAt, letter.availableAt, letter.conversationId ?? 'default'
    );
    return this.getLetter(letter.id);
  }

  getLetter(id) {
    return this.db.prepare('SELECT * FROM letters WHERE id = ?').get(id) ?? null;
  }

  listLetters(limit = 50, conversationId = null) {
    return conversationId
      ? this.db.prepare('SELECT * FROM letters WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?').all(conversationId, limit)
      : this.db.prepare('SELECT * FROM letters ORDER BY created_at DESC LIMIT ?').all(limit);
  }

  listSuccessfulLetters(recipient, conversationId) {
    return this.db.prepare("SELECT * FROM letters WHERE recipient = ? AND conversation_id = ? AND status = 'replied' AND memory_allowed = 1 ORDER BY created_at ASC, rowid ASC")
      .all(recipient, conversationId);
  }

  countToday(recipient, startIso, endIso, conversationId = null) {
    if (conversationId) return this.db.prepare('SELECT COUNT(*) AS count FROM letters WHERE recipient = ? AND conversation_id = ? AND created_at >= ? AND created_at < ?')
      .get(recipient, conversationId, startIso, endIso).count;
    return this.db.prepare('SELECT COUNT(*) AS count FROM letters WHERE recipient = ? AND created_at >= ? AND created_at < ?')
      .get(recipient, startIso, endIso).count;
  }

  nextReadyLetter(nowIso) {
    return this.db.prepare("SELECT * FROM letters WHERE status = 'pending' AND COALESCE(next_attempt_at, available_at) <= ? ORDER BY created_at LIMIT 1").get(nowIso) ?? null;
  }

  markReplied(id, reply, repliedAt) {
    const existing = this.getLetter(id);
    if (!existing || existing.status === 'replied') return existing;
    this.db.prepare("UPDATE letters SET reply = ?, status = 'replied', replied_at = ?, processing_started_at = NULL, next_attempt_at = NULL WHERE id = ? AND status = 'processing'").run(reply, repliedAt, id);
    return this.getLetter(id);
  }

  claimNextLetter(nowIso, maxAttempts = 3, conversationId = 'default') {
    this.db.exec('BEGIN IMMEDIATE');
    try {
    const row = this.db.prepare(`UPDATE letters
      SET status = 'processing', attempt_count = attempt_count + 1, processing_started_at = ?
      WHERE id = (
        SELECT id FROM letters
        WHERE status = 'pending' AND attempt_count < ? AND COALESCE(next_attempt_at, available_at) <= ? AND conversation_id = ?
          AND NOT EXISTS (SELECT 1 FROM letters active WHERE active.conversation_id = letters.conversation_id AND active.status = 'processing')
        ORDER BY created_at LIMIT 1
      ) AND status = 'pending'
      RETURNING *`).get(nowIso, maxAttempts, nowIso, conversationId);
    if (row) this.db.prepare("INSERT INTO letter_attempts VALUES (?, ?, 'processing', ?, NULL, NULL, '{}')").run(row.id, row.attempt_count, nowIso);
    this.db.exec('COMMIT');
    return row ?? null;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  updateAttempt(letter, metadata) {
    this.db.prepare("UPDATE letter_attempts SET metadata_json = ? WHERE letter_id = ? AND attempt = ? AND status = 'processing'").run(JSON.stringify(metadata), letter.id, letter.attempt_count);
  }
  getLetterAttempts(id) {
    return this.db.prepare('SELECT * FROM letter_attempts WHERE letter_id = ? ORDER BY attempt').all(id)
      .map(({ metadata_json, ...row }) => ({ ...row, metadata: JSON.parse(metadata_json) }));
  }
  renewLetterLease(letter, now) {
    this.db.prepare("UPDATE letters SET processing_started_at = ? WHERE id = ? AND status = 'processing' AND attempt_count = ?").run(now, letter.id, letter.attempt_count);
  }
  finishLetterAttempt(letter, { text, errorCode, at, metadata, memory, retryOptions } = {}) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.getLetter(letter.id);
      if (current?.status !== 'processing' || current.attempt_count !== letter.attempt_count) {
        this.db.exec('ROLLBACK'); return current;
      }
      if (memory?.refresh) {
        const state = this.getMemoryState(memory.refresh.recipient, memory.refresh.conversationId);
        if ((state?.memory_epoch ?? 0) !== memory.refresh.epoch) memory = null;
      }
      const result = errorCode ? this.markFailed(letter.id, errorCode, at, retryOptions) : this.markReplied(letter.id, text, at);
      if (!errorCode) this.db.prepare('UPDATE letters SET memory_allowed = ? WHERE id = ?').run(memory?.episode || memory?.refresh ? 1 : 0, letter.id);
      if (!errorCode && memory?.episode) {
        this.insertMemoryEpisode(memory.episode);
        this.trimMemoryEpisodes(memory.episode.recipient, memory.maxEpisodes, memory.episode.conversationId);
      }
      if (!errorCode && memory?.refresh) {
        const currentState = this.getMemoryState(memory.refresh.recipient, memory.refresh.conversationId);
        this.upsertMemoryState({ recipient: memory.refresh.recipient, conversationId: memory.refresh.conversationId,
          bulkSummary: currentState?.bulk_summary ?? '', relationshipState: currentState?.relationship_state ?? '',
          coveredThrough: currentState?.covered_through ?? '', revision: Number(currentState?.revision ?? 0),
          status: memory.refresh.needed === false ? 'ready' : currentState?.status === 'processing' ? 'processing' : 'pending',
          lastError: memory.refresh.needed === false ? null : 'memory_refresh_queued', updatedAt: at });
        this.db.prepare("UPDATE memory_states SET attempt_count = 0, next_attempt_at = NULL WHERE recipient = ? AND conversation_id = ? AND status != 'processing'")
          .run(memory.refresh.recipient, memory.refresh.conversationId);
        if (memory.ledger && (currentState?.relationship_state ?? '') === memory.ledger.priorText) {
          const info = JSON.parse(currentState?.metadata_json ?? '{}');
          info.ledgerThrough = memory.ledger.coveredThrough;
          info.ledgerVersion = memory.ledger.version;
          this.db.prepare("UPDATE memory_states SET relationship_state = ?, metadata_json = ?, revision = revision + 1, status = ?, attempt_count = 0, next_attempt_at = NULL WHERE recipient = ? AND conversation_id = ?")
            .run(memory.ledger.text, JSON.stringify(info), memory.refresh.needed === false ? 'ready' : 'pending', memory.refresh.recipient, memory.refresh.conversationId);
        }
      }
      this.db.prepare('UPDATE letter_attempts SET status = ?, ended_at = ?, error_code = ?, metadata_json = ? WHERE letter_id = ? AND attempt = ?')
        .run(errorCode ? 'failed' : 'replied', at, errorCode ?? null, JSON.stringify(metadata), letter.id, letter.attempt_count);
      this.db.exec('COMMIT'); return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  recoverStaleLetters(nowIso, leaseMs, maxAttempts = 3, retryDelayMs = 0) {
    const cutoffIso = new Date(Date.parse(nowIso) - Math.max(0, leaseMs)).toISOString();
    const retryAt = new Date(Date.parse(nowIso) + Math.max(0, retryDelayMs)).toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
    this.db.prepare(`UPDATE letter_attempts SET status = 'failed', ended_at = ?, error_code = 'processing_lease_expired'
      WHERE status = 'processing' AND EXISTS (SELECT 1 FROM letters l WHERE l.id = letter_id AND l.attempt_count = attempt
      AND l.status = 'processing' AND l.processing_started_at <= ?)`).run(nowIso, cutoffIso);
    const result = this.db.prepare(`UPDATE letters
      SET status = CASE WHEN attempt_count < ? THEN 'pending' ELSE 'failed' END,
          last_error = 'processing_lease_expired',
          next_attempt_at = CASE WHEN attempt_count < ? THEN ? ELSE NULL END,
          processing_started_at = NULL
      WHERE status = 'processing' AND processing_started_at IS NOT NULL AND processing_started_at <= ?`)
      .run(maxAttempts, maxAttempts, retryAt, cutoffIso);
    this.db.exec('COMMIT'); return result.changes;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  markFailed(id, errorCode, failedAt, { maxAttempts = 3, retryDelayMs = 60_000 } = {}) {
    const existing = this.getLetter(id);
    if (!existing || existing.status === 'replied' || existing.status === 'failed') return existing;
    const retry = existing.attempt_count < maxAttempts;
    const retryAt = retry ? new Date(Date.parse(failedAt) + retryDelayMs * (2 ** Math.max(0, existing.attempt_count - 1))).toISOString() : null;
    this.db.prepare(`UPDATE letters SET status = ?, last_error = ?, next_attempt_at = ?, processing_started_at = NULL
      WHERE id = ? AND status = 'processing'`).run(retry ? 'pending' : 'failed', errorCode ?? 'provider_failed', retryAt, id);
    return this.getLetter(id);
  }

  markRead(id, readAt) {
    this.db.prepare('UPDATE letters SET read_at = ? WHERE id = ?').run(readAt, id);
    return this.getLetter(id);
  }

  countUnread(conversationId = null) {
    if (conversationId) return this.db.prepare("SELECT COUNT(*) AS count FROM letters WHERE conversation_id = ? AND status = 'replied' AND read_at IS NULL").get(conversationId).count;
    return this.db.prepare("SELECT COUNT(*) AS count FROM letters WHERE status = 'replied' AND read_at IS NULL").get().count;
  }

  insertMemoryEpisode(episode) {
    this.db.prepare(`INSERT OR IGNORE INTO memory_episodes
      (id, recipient, source_letter_id, content, created_at, conversation_id) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(episode.id, episode.recipient, episode.sourceLetterId, episode.content, episode.createdAt, episode.conversationId ?? 'default');
    return this.getMemoryEpisodeByLetter(episode.sourceLetterId);
  }

  getMemoryEpisodeByLetter(sourceLetterId) {
    return this.db.prepare('SELECT * FROM memory_episodes WHERE source_letter_id = ?').get(sourceLetterId) ?? null;
  }

  listMemoryEpisodes(recipient, limit = 8, conversationId = 'default') {
    return this.db.prepare('SELECT * FROM memory_episodes WHERE recipient = ? AND conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?').all(recipient, conversationId, limit);
  }

  trimMemoryEpisodes(recipient, maxEpisodes = 8, conversationId = 'default') {
    return this.db.prepare(`DELETE FROM memory_episodes
      WHERE recipient = ? AND conversation_id = ? AND id NOT IN (
        SELECT id FROM memory_episodes WHERE recipient = ? AND conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
      )`).run(recipient, conversationId, recipient, conversationId, maxEpisodes).changes;
  }

  deleteMemoryEpisodes(conversationId = 'default', sourceLetterId = null) {
    return sourceLetterId
      ? this.db.prepare('DELETE FROM memory_episodes WHERE conversation_id = ? AND source_letter_id = ?').run(conversationId, sourceLetterId).changes
      : this.db.prepare('DELETE FROM memory_episodes WHERE conversation_id = ?').run(conversationId).changes;
  }

  listMemorySummaries(recipient, conversationId) {
    return this.db.prepare('SELECT * FROM memory_summaries WHERE recipient = ? AND conversation_id = ? ORDER BY created_at ASC').all(recipient, conversationId);
  }

  getMemoryState(recipient, conversationId) {
    return this.db.prepare('SELECT * FROM memory_states WHERE recipient = ? AND conversation_id = ?').get(recipient, conversationId) ?? null;
  }

  upsertMemoryState({ recipient, conversationId = 'default', bulkSummary = '', relationshipState = '', coveredThrough = '', revision = 0, status = 'ready', lastError = null, updatedAt = new Date().toISOString() }) {
    this.db.prepare('INSERT INTO memory_states (conversation_id, recipient, bulk_summary, relationship_state, covered_through, revision, status, last_error, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(conversation_id, recipient) DO UPDATE SET bulk_summary=excluded.bulk_summary, relationship_state=excluded.relationship_state, covered_through=excluded.covered_through, revision=excluded.revision, status=excluded.status, last_error=excluded.last_error, updated_at=excluded.updated_at')
      .run(conversationId, recipient, bulkSummary, relationshipState, coveredThrough, revision, status, lastError, updatedAt);
    return this.getMemoryState(recipient, conversationId);
  }

  upsertMemorySummary({ recipient, conversationId = 'default', sourceLetterId, contentMd5, summary, algorithmVersion = 'unknown', createdAt, updatedAt = new Date().toISOString() }) {
    this.db.prepare('INSERT INTO memory_summaries (conversation_id, recipient, source_letter_id, content_md5, summary, algorithm_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(conversation_id, recipient, source_letter_id) DO UPDATE SET content_md5=excluded.content_md5, summary=excluded.summary, algorithm_version=excluded.algorithm_version, updated_at=excluded.updated_at')
      .run(conversationId, recipient, sourceLetterId, contentMd5, summary, algorithmVersion, createdAt ?? updatedAt, updatedAt);
    return this.db.prepare('SELECT * FROM memory_summaries WHERE recipient = ? AND conversation_id = ? AND source_letter_id = ?').get(recipient, conversationId, sourceLetterId);
  }

  addPlaylistItem(item) {
    this.db.prepare(`INSERT INTO playlist_items
      (id, title, source_name, audio_path, manifest_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
      item.id, item.title, item.sourceName, item.audioPath ?? null, JSON.stringify(item.manifest), item.createdAt
    );
    return this.getPlaylistItem(item.id);
  }

  addCompatPlaylistItem(item) {
    const existing = this.db.prepare('SELECT * FROM playlist_items WHERE item_type = ? AND item_id = ?').get(item.itemType, item.itemId);
    if (existing) {
      const value = (incoming, fallback) => incoming == null || incoming === '' || (Array.isArray(incoming) && incoming.length === 0) ? fallback : incoming;
      const name = existing.name && existing.name !== existing.item_id ? existing.name : value(item.name, existing.name ?? existing.item_id);
      const nameKey = existing.name_key || value(item.nameKey, '');
      const iconUrl = existing.icon_url || value(item.iconUrl ?? item.coverUrl, '');
      const songId = existing.song_id || value(item.songId, '');
      const performanceId = existing.performance_id || value(item.performanceId, '');
      const duration = Number(existing.duration) > 0 ? existing.duration : (Number(item.duration) > 0 ? Number(item.duration) : 0);
      const videoDuration = Number(existing.video_duration) > 0 ? existing.video_duration : (Number(item.videoDuration ?? item.duration) > 0 ? Number(item.videoDuration ?? item.duration) : duration);
      const videoUrl = existing.video_url || value(item.videoUrl ?? item.mediaUrl, '');
      const performanceType = existing.performance_type || value(item.performanceType, '');
      const videoByTodView = existing.video_by_tod_view ? JSON.parse(existing.video_by_tod_view) : value(item.videoByTodView, null);
      this.db.prepare(`UPDATE playlist_items SET title = ?, source_name = ?, name = ?, name_key = ?, icon_url = ?, song_id = ?, performance_id = ?, duration = ?, video_duration = ?, video_url = ?, performance_type = ?, video_by_tod_view = ? WHERE id = ?`).run(
        name, existing.source_name || value(item.sourceName, 'compatibility'), name, nameKey, iconUrl, songId, performanceId, duration, videoDuration, videoUrl, performanceType,
        videoByTodView == null ? null : JSON.stringify(videoByTodView), existing.id
      );
      return this.getCompatPlaylistItem(existing.id);
    }
    const id = item.id ?? `${item.itemType}:${item.itemId}`;
    this.db.prepare(`INSERT INTO playlist_items
      (id, title, source_name, audio_path, manifest_json, created_at, item_type, item_id, name, name_key, icon_url, song_id, performance_id, duration, video_duration, video_url, performance_type, video_by_tod_view)
      VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, item.name ?? item.itemId, item.sourceName ?? 'compatibility', JSON.stringify(item.manifest ?? {}), item.createdAt,
      item.itemType, item.itemId, item.name ?? item.itemId, item.nameKey ?? '', item.iconUrl ?? item.coverUrl ?? '',
      item.songId ?? '', item.performanceId ?? '', item.duration ?? 0, item.videoDuration ?? item.duration ?? 0,
      item.videoUrl ?? item.mediaUrl ?? '', item.performanceType ?? '', item.videoByTodView == null ? null : JSON.stringify(item.videoByTodView)
    );
    return this.getCompatPlaylistItem(id);
  }

  getCompatPlaylistItem(id) {
    const item = this.db.prepare('SELECT * FROM playlist_items WHERE id = ?').get(id);
    return item ? this.compatPlaylistPayload(item) : null;
  }

  compatPlaylist() { return this.db.prepare('SELECT * FROM playlist_items WHERE item_type IS NOT NULL ORDER BY created_at DESC').all().map(item => this.compatPlaylistPayload(item)); }

  compatPlaylistPayload(item) {
    const numericCreatedAt = Number(item.created_at);
    const createdAt = Number.isFinite(numericCreatedAt) && numericCreatedAt > 0
      ? Math.floor(numericCreatedAt)
      : Math.floor((Date.parse(item.created_at) || 0) / 1000);
    return { itemType: item.item_type, itemId: item.item_id, id: item.item_id, name: item.name ?? item.title, nameKey: item.name_key ?? '', createdAt,
      iconUrl: item.icon_url ?? '', coverUrl: item.icon_url ?? '', songId: item.song_id ?? '', performanceId: item.performance_id ?? '',
      duration: item.duration ?? 0, videoDuration: item.video_duration ?? item.duration ?? 0, videoUrl: item.video_url ?? '',
      performanceType: item.performance_type ?? '', videoByTodView: item.video_by_tod_view ? JSON.parse(item.video_by_tod_view) : undefined };
  }

  deleteCompatPlaylistItem(itemType, itemId) { return this.db.prepare('DELETE FROM playlist_items WHERE item_type = ? AND item_id = ?').run(itemType, itemId).changes > 0; }

  getPlaylistItem(id) {
    const item = this.db.prepare('SELECT * FROM playlist_items WHERE id = ?').get(id);
    return item ? { ...item, manifest: JSON.parse(item.manifest_json) } : null;
  }

  listPlaylist() {
    return this.db.prepare('SELECT * FROM playlist_items ORDER BY created_at DESC').all().map(item => ({ ...item, manifest: JSON.parse(item.manifest_json) }));
  }

  deletePlaylistItem(id) { return this.db.prepare('DELETE FROM playlist_items WHERE id = ?').run(id).changes > 0; }

  insertMidiJob(job) {
    this.db.prepare(`INSERT INTO midi_jobs (job_id, state, filename, created_at, error, info_json, media_path, input_path, input_sha256, input_size, input_filename)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(job.jobId, job.state, job.filename, job.createdAt, job.error ?? null, JSON.stringify(job.info ?? {}), job.mediaPath ?? null,
      job.inputPath ?? null, job.inputSha256 ?? null, job.inputSize ?? null, job.inputFilename ?? job.filename ?? null);
    return this.getMidiJob(job.jobId);
  }

  getMidiJob(jobId) {
    return hydrateMidiJob(this.db.prepare('SELECT * FROM midi_jobs WHERE job_id = ?').get(jobId));
  }

  listMidiJobs(limit = 20, offset = 0) {
    return this.db.prepare('SELECT * FROM midi_jobs ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset)
      .map(hydrateMidiJob);
  }

  countMidiJobs() { return this.db.prepare('SELECT COUNT(*) AS count FROM midi_jobs').get().count; }

  listFinishedMidiJobs(limit = 20, offset = 0) {
    return this.db.prepare("SELECT * FROM midi_jobs WHERE state = 'finished' ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset)
      .map(hydrateMidiJob);
  }

  countFinishedMidiJobs() { return this.db.prepare("SELECT COUNT(*) AS count FROM midi_jobs WHERE state = 'finished'").get().count; }

  countFinishedMidiJobsBetween(startIso, endIso) {
    return this.db.prepare("SELECT COUNT(*) AS count FROM midi_jobs WHERE state = 'finished' AND created_at >= ? AND created_at < ?")
      .get(startIso, endIso).count;
  }

  updateMidiJob(job) {
    this.db.prepare('UPDATE midi_jobs SET state = ?, error = ?, info_json = ?, media_path = ?, input_path = ?, input_sha256 = ?, input_size = ?, input_filename = ? WHERE job_id = ?')
      .run(job.state, job.error ?? null, JSON.stringify(job.info ?? {}), job.mediaPath ?? null, job.inputPath ?? null, job.inputSha256 ?? null, job.inputSize ?? null, job.inputFilename ?? job.filename ?? null, job.jobId);
    return this.getMidiJob(job.jobId);
  }

  listRecoverableMidiJobs() {
    return this.db.prepare("SELECT * FROM midi_jobs WHERE state IN ('queued', 'processing') ORDER BY created_at").all().map(hydrateMidiJob);
  }

  deleteMidiJob(jobId) { return this.db.prepare('DELETE FROM midi_jobs WHERE job_id = ?').run(jobId).changes > 0; }

  createVideoJob(job) {
    const result = this.db.prepare(`INSERT INTO video_jobs
      (job_id, letter_id, asset_id, file_name, adapter_id, adapter_version, status, metadata_json, created_at)
      SELECT ?, ?, ?, ?, ?, ?, 'queued', '{}', ?
      WHERE NOT EXISTS (SELECT 1 FROM video_jobs WHERE letter_id = ? AND status IN ('queued', 'validating', 'rendering'))`).run(job.jobId, job.letterId, job.assetId, job.fileName, job.adapterId, job.adapterVersion, job.createdAt, job.letterId);
    if (result.changes === 0) return null;
    return this.getVideoJob(job.jobId);
  }

  updateVideoJob(jobId, patch = {}) {
    const current = this.getVideoJob(jobId);
    if (!current) return null;
    this.db.prepare(`UPDATE video_jobs SET status = ?, metadata_json = ?, error_code = ?, error = ?, media_path = ?, size = ?, published_at = ? WHERE job_id = ?`)
      .run(patch.status ?? current.status, JSON.stringify(patch.metadata ?? current.metadata ?? {}), patch.errorCode ?? current.errorCode ?? null, patch.error ?? current.error ?? null, patch.path ?? current.mediaPath ?? null, patch.size ?? current.size ?? null, patch.publishedAt ?? current.publishedAt ?? null, jobId);
    return this.getVideoJob(jobId);
  }

  failVideoJob(jobId, errorCode, error, at) {
    return this.updateVideoJob(jobId, { status: 'failed', errorCode, error });
  }

  publishVideoJob(jobId, { path, size, metadata, fileName, publishedAt }) {
    const job = this.getVideoJob(jobId);
    if (!job) return null;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE video_jobs SET status = \'published\', metadata_json = ?, media_path = ?, size = ?, published_at = ?, file_name = ?, error_code = NULL, error = NULL WHERE job_id = ?')
        .run(JSON.stringify(metadata ?? {}), path, size, publishedAt, fileName ?? job.fileName, jobId);
      this.db.prepare('UPDATE letter_video_assets SET active = 0 WHERE letter_id = ?').run(job.letterId);
      this.db.prepare('INSERT INTO letter_video_assets (letter_id, asset_id, job_id, active, updated_at) VALUES (?, ?, ?, 1, ?) ON CONFLICT(letter_id) DO UPDATE SET asset_id = excluded.asset_id, job_id = excluded.job_id, active = 1, updated_at = excluded.updated_at')
        .run(job.letterId, job.assetId, job.jobId, publishedAt);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return this.getVideoJob(jobId);
  }

  getVideoJob(jobId) {
    return hydrateVideoJob(this.db.prepare('SELECT * FROM video_jobs WHERE job_id = ?').get(jobId));
  }

  listVideoJobs(letterId) { return this.db.prepare('SELECT * FROM video_jobs WHERE letter_id = ? ORDER BY created_at DESC').all(letterId).map(hydrateVideoJob); }
  getVideoAsset(assetId) {
    const row = this.db.prepare(`SELECT v.*, a.active FROM video_jobs v LEFT JOIN letter_video_assets a ON a.asset_id = v.asset_id WHERE v.asset_id = ? ORDER BY v.created_at DESC LIMIT 1`).get(assetId);
    const job = hydrateVideoJob(row);
    return job ? { ...job, active: row.active === 1 } : null;
  }
  getActiveVideo(letterId) {
    return hydrateVideoJob(this.db.prepare('SELECT v.* FROM letter_video_assets a JOIN video_jobs v ON v.job_id = a.job_id WHERE a.letter_id = ? AND a.active = 1').get(letterId));
  }
  listActiveVideos() { return this.db.prepare('SELECT a.letter_id, v.* FROM letter_video_assets a JOIN video_jobs v ON v.job_id = a.job_id WHERE a.active = 1').all().map(row => ({ letterId: row.letter_id, ...hydrateVideoJob(row) })); }
  deleteActiveVideo(letterId, at) {
    const current = this.getActiveVideo(letterId);
    if (!current) return false;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE letter_video_assets SET active = 0, updated_at = ? WHERE letter_id = ?').run(at, letterId);
      this.db.prepare("UPDATE video_jobs SET status = 'archived', deleted_at = ? WHERE job_id = ?").run(at, current.jobId);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return true;
  }

  close() { this.db.close(); }
}
