import { randomUUID } from 'node:crypto';
import { inspectMidi } from './midi-manifest.js';
import { BuiltinAudioRenderer } from './audio-renderer.js';

export class MusicService {
  constructor({ store, clock = () => new Date(), audioRenderer = new BuiltinAudioRenderer() }) { this.store = store; this.clock = clock; this.audioRenderer = audioRenderer; }

  renderMidi(buffer) {
    inspectMidi(buffer);
    return this.audioRenderer.render(buffer);
  }

  importMidi({ buffer, sourceName = 'untitled.mid', title = sourceName.replace(/\.mid(i)?$/i, '') }) {
    const rendered = this.renderMidi(buffer);
    return { id: randomUUID(), title, sourceName, audio: rendered.wav, duration: rendered.duration, manifest: rendered.timingManifest };
  }

  addToPlaylist(track, audioPath = null) {
    return this.store.addPlaylistItem({ id: track.id, title: track.title, sourceName: track.sourceName, audioPath,
      manifest: track.manifest, createdAt: this.clock().toISOString() });
  }

  addCompatPlaylistItem(item) {
    return this.store.addCompatPlaylistItem({ ...item, createdAt: this.clock().toISOString(), manifest: item.manifest ?? { schemaVersion: 1, source: 'compatibility' } });
  }

  compatPlaylist() { return this.store.compatPlaylist(); }
  removeCompatPlaylistItem(itemType, itemId) { return this.store.deleteCompatPlaylistItem(itemType, itemId); }

  playlist() { return this.store.listPlaylist(); }
  removeFromPlaylist(id) { return this.store.deletePlaylistItem(id); }
}
