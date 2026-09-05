import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStore } from '../src/storage/sqlite-store.js';
import { MidiJobService } from '../src/music/midi-job-service.js';

const midi = Uint8Array.from([
  0x4d,0x54,0x68,0x64, 0,0,0,6, 0,0, 0,1, 0x01,0x00,
  0x4d,0x54,0x72,0x6b, 0,0,0,12,
  0x00,0x90,0x3c,0x64, 0x40,0x80,0x3c,0x40, 0x00,0xff,0x2f,0x00
]);

test('MIDI jobs survive service recreation through SQLite metadata and media files', () => {
  const store = new SqliteStore();
  const mediaRoot = mkdtempSync(join(tmpdir(), 'Linli MIDI Media With Spaces-'));
  const first = new MidiJobService({ store, mediaRoot });
  const upload = first.createUpload({ filename: 'persist.mid', uploadUrl: 'http://127.0.0.1:27149' });
  first.receiveUpload(upload.key, midi);
  const job = first.generate({ midiUrl: upload.url, filename: 'persist.mid', mediaBaseUrl: 'http://127.0.0.1:27149' });
  const second = new MidiJobService({ store, mediaRoot });
  assert.equal(second.get(job.jobId).state, 'finished');
  assert.equal(second.list().total, 1);
  assert.ok(second.mediaBytes(job.jobId).length > 44);
  assert.equal(second.delete(job.jobId), true);
  assert.equal(second.get(job.jobId), null);
  store.close();
});
