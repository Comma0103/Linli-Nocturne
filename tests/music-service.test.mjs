import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../src/storage/sqlite-store.js';
import { MusicService } from '../src/music/music-service.js';

const midi = Uint8Array.from([
  0x4d,0x54,0x68,0x64, 0,0,0,6, 0,0, 0,1, 0x01,0x00,
  0x4d,0x54,0x72,0x6b, 0,0,0,12,
  0x00,0x90,0x3c,0x64, 0x40,0x80,0x3c,0x40, 0x00,0xff,0x2f,0x00
]);

test('music service renders MIDI and persists a local playlist item', () => {
  const store = new SqliteStore();
  const service = new MusicService({ store });
  const track = service.importMidi({ buffer: midi, sourceName: 'hello.mid', title: 'Hello' });
  assert.equal(track.title, 'Hello');
  assert.ok(track.audio.length > 44);
  assert.equal(service.addToPlaylist(track).title, 'Hello');
  assert.equal(service.playlist().length, 1);
  assert.equal(service.removeFromPlaylist(track.id), true);
  assert.equal(service.playlist().length, 0);
  store.close();
});

test('music service accepts a replaceable AudioRenderer', () => {
  const store = new SqliteStore();
  let calls = 0;
  const service = new MusicService({
    store,
    audioRenderer: { id: 'fake.audio', version: '9.0.0', render: () => { calls += 1; return { wav: Buffer.from('fake-audio'), duration: 1, timingManifest: { renderer: 'fake' } }; } },
  });
  const track = service.importMidi({ buffer: midi, sourceName: 'fake.mid' });
  assert.equal(calls, 1);
  assert.equal(track.audio.toString(), 'fake-audio');
  assert.equal(track.manifest.renderer, 'fake');
  store.close();
});
