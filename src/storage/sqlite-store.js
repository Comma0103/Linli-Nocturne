import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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
        media_path TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_midi_jobs_created_at ON midi_jobs(created_at DESC);
    `);
    const letterColumns = new Set(this.db.prepare('PRAGMA table_info(letters)').all().map(column => column.name));
    const additions = [
      ['attempt_count', 'INTEGER NOT NULL DEFAULT 0'],
      ['processing_started_at', 'TEXT'],
      ['last_error', 'TEXT'],
      ['next_attempt_at', 'TEXT'],
    ];
    for (const [name, definition] of additions) {
      if (!letterColumns.has(name)) this.db.exec(`ALTER TABLE letters ADD COLUMN ${name} ${definition}`);
    }
    this.db.exec("UPDATE letters SET status = 'pending' WHERE status = 'queued'");
  }

  insertLetter(letter) {
    this.db.prepare(`INSERT INTO letters
      (id, recipient, body, reply, status, created_at, available_at, replied_at, read_at, attempt_count, processing_started_at, last_error, next_attempt_at)
      VALUES (?, ?, ?, NULL, 'pending', ?, ?, NULL, NULL, 0, NULL, NULL, NULL)`).run(
      letter.id, letter.recipient, letter.body, letter.createdAt, letter.availableAt
    );
    return this.getLetter(letter.id);
  }

  getLetter(id) {
    return this.db.prepare('SELECT * FROM letters WHERE id = ?').get(id) ?? null;
  }

  listLetters(limit = 50) {
    return this.db.prepare('SELECT * FROM letters ORDER BY created_at DESC LIMIT ?').all(limit);
  }

  countToday(recipient, startIso, endIso) {
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

  claimNextLetter(nowIso, maxAttempts = 3) {
    const row = this.db.prepare(`UPDATE letters
      SET status = 'processing', attempt_count = attempt_count + 1, processing_started_at = ?
      WHERE id = (
        SELECT id FROM letters
        WHERE status = 'pending' AND attempt_count < ? AND COALESCE(next_attempt_at, available_at) <= ?
        ORDER BY created_at LIMIT 1
      ) AND status = 'pending'
      RETURNING *`).get(nowIso, maxAttempts, nowIso);
    return row ?? null;
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

  countUnread() {
    return this.db.prepare("SELECT COUNT(*) AS count FROM letters WHERE status = 'replied' AND read_at IS NULL").get().count;
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
    if (existing) return this.getCompatPlaylistItem(existing.id);
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
    return { itemType: item.item_type, itemId: item.item_id, id: item.item_id, name: item.name ?? item.title, nameKey: item.name_key ?? '', createdAt: item.created_at,
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
    this.db.prepare(`INSERT INTO midi_jobs (job_id, state, filename, created_at, error, info_json, media_path)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(job.jobId, job.state, job.filename, job.createdAt, job.error ?? null, JSON.stringify(job.info ?? {}), job.mediaPath ?? null);
    return this.getMidiJob(job.jobId);
  }

  getMidiJob(jobId) {
    const job = this.db.prepare('SELECT * FROM midi_jobs WHERE job_id = ?').get(jobId);
    if (!job) return null;
    const info = JSON.parse(job.info_json);
    const renderJob = info.renderJob ?? null;
    return { jobId: job.job_id, state: job.state, filename: job.filename, createdAt: job.created_at, error: job.error,
      status: renderJob?.status ?? (job.state === 'finished' ? 'produced' : job.state === 'canceled' ? 'cancelled' : job.state),
      progress: renderJob?.progress ?? (job.state === 'finished' ? 1 : 0), attempt: renderJob?.attempt ?? 0,
      errorCode: renderJob?.errorCode ?? null, info, mediaPath: job.media_path };
  }

  listMidiJobs(limit = 20, offset = 0) {
    return this.db.prepare('SELECT * FROM midi_jobs ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset)
      .map(job => this.getMidiJob(job.job_id));
  }

  countMidiJobs() { return this.db.prepare('SELECT COUNT(*) AS count FROM midi_jobs').get().count; }

  listFinishedMidiJobs(limit = 20, offset = 0) {
    return this.db.prepare("SELECT * FROM midi_jobs WHERE state = 'finished' ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset)
      .map(job => this.getMidiJob(job.job_id));
  }

  countFinishedMidiJobs() { return this.db.prepare("SELECT COUNT(*) AS count FROM midi_jobs WHERE state = 'finished'").get().count; }

  countFinishedMidiJobsBetween(startIso, endIso) {
    return this.db.prepare("SELECT COUNT(*) AS count FROM midi_jobs WHERE state = 'finished' AND created_at >= ? AND created_at < ?")
      .get(startIso, endIso).count;
  }

  updateMidiJob(job) {
    this.db.prepare('UPDATE midi_jobs SET state = ?, error = ?, info_json = ?, media_path = ? WHERE job_id = ?')
      .run(job.state, job.error ?? null, JSON.stringify(job.info ?? {}), job.mediaPath ?? null, job.jobId);
    return this.getMidiJob(job.jobId);
  }

  deleteMidiJob(jobId) { return this.db.prepare('DELETE FROM midi_jobs WHERE job_id = ?').run(jobId).changes > 0; }

  close() { this.db.close(); }
}
