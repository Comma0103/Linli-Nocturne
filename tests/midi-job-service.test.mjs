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
  assert.equal(job.status, 'produced');
  assert.equal(job.info.renderJob.rendererId, 'builtin.audio');
  const second = new MidiJobService({ store, mediaRoot, playbackBaseUrl: 'http://localhost:27149' });
  assert.equal(second.get(job.jobId).state, 'finished');
  assert.equal(second.get(job.jobId).status, 'produced');
  assert.equal(second.list().total, 1);
  assert.deepEqual(second.listUserSongs({ pageSize: 1 }).list[0], {
    userSongId: job.jobId, id: job.jobId, name: 'persist.mid', filename: 'persist.mid',
    audioUrl: 'http://localhost:27149/toy/midi/media/' + job.jobId + '.wav',
    videoUrl: 'http://localhost:27149/toy/midi/media/' + job.jobId + '.wav',
    videoByTodView: [
      { url: 'http://localhost:27149/toy/midi/media/' + job.jobId + '.wav', tod: 'TOD1200', view: 'NI', coverUrl: '', duration: Math.round(second.get(job.jobId).info.duration) },
      { url: 'http://localhost:27149/toy/midi/media/' + job.jobId + '.wav', tod: 'TOD1730', view: 'NI', coverUrl: '', duration: Math.round(second.get(job.jobId).info.duration) },
      { url: 'http://localhost:27149/toy/midi/media/' + job.jobId + '.wav', tod: 'TOD2000', view: 'NI', coverUrl: '', duration: Math.round(second.get(job.jobId).info.duration) },
    ],
    nameKey: job.jobId, performanceType: 'Solo', duration: second.get(job.jobId).info.duration, source: 'linli-nocturne',
  });
  const batch = second.batch([job.jobId]);
  assert.equal(batch.list[0].info.audioUrl, 'http://localhost:27149/toy/midi/media/' + job.jobId + '.wav');
  assert.deepEqual(batch.list[0].info.videoUrls, ['http://localhost:27149/toy/midi/media/' + job.jobId + '.wav']);
  assert.ok(second.mediaBytes(job.jobId).length > 44);
  assert.equal(second.delete(job.jobId), true);
  assert.equal(second.get(job.jobId), null);
  store.close();
});

test('MIDI job service accepts replaceable renderer and playback adapter', () => {
  const store = new SqliteStore();
  let renderCalls = 0;
  const service = new MidiJobService({
    store,
    renderer: { id: 'fake.renderer', version: '2.0.0', render: () => { renderCalls += 1; return { wav: Buffer.from('fake'), duration: 2, timingManifest: { renderer: 'fake' } }; } },
    playbackAdapter: { toUserSong: ({ job, mediaUrl }) => ({ id: job.jobId, customMedia: mediaUrl, renderer: job.info.renderJob.rendererId }) },
  });
  const upload = service.createUpload({ filename: 'custom.mid', uploadUrl: 'http://localhost:27149' });
  service.receiveUpload(upload.key, midi);
  const job = service.generate({ midiUrl: upload.url, filename: 'custom.mid', mediaBaseUrl: 'http://localhost:27149' });
  assert.equal(renderCalls, 1);
  assert.equal(job.info.renderJob.rendererId, 'fake.renderer');
  assert.equal(service.listUserSongs().list[0].renderer, 'fake.renderer');
  store.close();
});

test('MIDI user songs can expose an HTTPS playback origin independently of the API origin', () => {
  const store = new SqliteStore();
  const mediaRoot = mkdtempSync(join(tmpdir(), 'Linli MIDI HTTPS Media-'));
  const service = new MidiJobService({ store, mediaRoot, playbackBaseUrl: 'https://localhost:27150' });
  const upload = service.createUpload({ filename: 'https.mid', uploadUrl: 'http://127.0.0.1:27149' });
  service.receiveUpload(upload.key, midi);
  const job = service.generate({ midiUrl: upload.url, filename: 'https.mid', mediaBaseUrl: 'http://127.0.0.1:27149' });
  const song = service.listUserSongs().list[0];
  assert.match(song.videoUrl, new RegExp(`^https://localhost:27150/toy/midi/media/${job.jobId}\\.wav$`));
  assert.equal(song.audioUrl, song.videoUrl);
  assert.equal(song.videoByTodView[0].duration, Math.round(job.info.duration));
  assert.ok(song.videoByTodView.every((view) => view.url === song.videoUrl));
  store.close();
});

test('MIDI job service follows the selected encoder media contract', () => {
  const store = new SqliteStore();
  const encoder = Object.assign(() => Buffer.from('encoded-mp4'), { extension: 'mp4', contentType: 'video/mp4' });
  const service = new MidiJobService({ store, mediaEncoder: encoder, playbackBaseUrl: 'https://localhost:27150' });
  const upload = service.createUpload({ filename: 'encoded.mid', uploadUrl: 'http://localhost:27149' });
  service.receiveUpload(upload.key, midi);
  const job = service.generate({ midiUrl: upload.url, mediaBaseUrl: 'http://localhost:27149' });
  assert.match(job.info.audioUrl, /\.mp4$/u);
  assert.equal(service.mediaExtension, 'mp4');
  assert.equal(service.mediaContentType, 'video/mp4');
  store.close();
});

test('MIDI user-song pagination filters failed jobs before applying the cursor', () => {
  const store = new SqliteStore();
  const service = new MidiJobService({ store });
  const valid = Uint8Array.from([
    0x4d,0x54,0x68,0x64, 0,0,0,6, 0,0, 0,1, 0x01,0x00,
    0x4d,0x54,0x72,0x6b, 0,0,0,12,
    0x00,0x90,0x3c,0x64, 0x40,0x80,0x3c,0x40, 0x00,0xff,0x2f,0x00
  ]);
  const create = (filename, bytes = valid) => {
    const upload = service.createUpload({ filename, uploadUrl: 'http://localhost:27149' });
    service.receiveUpload(upload.key, bytes);
    return service.generate({ midiUrl: upload.url, filename, mediaBaseUrl: 'http://localhost:27149' });
  };
  create('one.mid');
  create('broken.mid', Uint8Array.from([1, 2, 3]));
  create('two.mid');
  create('three.mid');

  const first = service.listUserSongs({ pageSize: 2, cursor: 0 });
  assert.equal(first.list.length, 2);
  assert.equal(first.total, 3);
  assert.equal(first.hasMore, true);
  assert.equal(first.nextCursor, 2);
  assert.ok(first.list.every(item => item.name !== 'broken.mid'));

  const second = service.listUserSongs({ pageSize: 2, cursor: first.nextCursor });
  assert.equal(second.list.length, 1);
  assert.equal(second.total, 3);
  assert.equal(second.hasMore, false);
  assert.equal(second.nextCursor, 3);
  assert.ok(second.list.every(item => item.name !== 'broken.mid'));
  store.close();
});
