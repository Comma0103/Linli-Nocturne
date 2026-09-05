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

  close() { this.db.close(); }
}
