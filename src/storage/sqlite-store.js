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
        read_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_letters_status_available ON letters(status, available_at);
      CREATE TABLE IF NOT EXISTS playlist_items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        source_name TEXT NOT NULL,
        audio_path TEXT,
        manifest_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  insertLetter(letter) {
    this.db.prepare(`INSERT INTO letters
      (id, recipient, body, reply, status, created_at, available_at, replied_at, read_at)
      VALUES (?, ?, ?, NULL, 'queued', ?, ?, NULL, NULL)`).run(
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

  countToday(recipient, startIso) {
    return this.db.prepare('SELECT COUNT(*) AS count FROM letters WHERE recipient = ? AND created_at >= ?').get(recipient, startIso).count;
  }

  nextReadyLetter(nowIso) {
    return this.db.prepare("SELECT * FROM letters WHERE status = 'queued' AND available_at <= ? ORDER BY created_at LIMIT 1").get(nowIso) ?? null;
  }

  markReplied(id, reply, repliedAt) {
    this.db.prepare("UPDATE letters SET reply = ?, status = 'replied', replied_at = ? WHERE id = ?").run(reply, repliedAt, id);
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

  getPlaylistItem(id) {
    const item = this.db.prepare('SELECT * FROM playlist_items WHERE id = ?').get(id);
    return item ? { ...item, manifest: JSON.parse(item.manifest_json) } : null;
  }

  listPlaylist() {
    return this.db.prepare('SELECT * FROM playlist_items ORDER BY created_at DESC').all().map(item => ({ ...item, manifest: JSON.parse(item.manifest_json) }));
  }

  deletePlaylistItem(id) { return this.db.prepare('DELETE FROM playlist_items WHERE id = ?').run(id).changes > 0; }

  close() { this.db.close(); }
}
