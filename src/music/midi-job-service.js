import { randomUUID } from 'node:crypto';
import { inspectMidi } from './midi-manifest.js';
import { renderMidiToWav } from './audio-renderer.js';

const TERMINAL = new Set(['finished', 'failed', 'canceled']);

export class MidiJobService {
  constructor({ clock = () => new Date() } = {}) {
    this.clock = clock;
    this.uploads = new Map();
    this.jobs = new Map();
    this.media = new Map();
  }

  createUpload({ filename = 'untitled.mid', uploadUrl }) {
    const key = `${randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    this.uploads.set(key, { key, filename, buffer: null, createdAt: this.clock().toISOString() });
    return { key, url: `${uploadUrl.replace(/\/$/u, '')}/toy/midi/upload/${encodeURIComponent(key)}`, headers: { 'content-type': 'application/octet-stream' } };
  }

  receiveUpload(key, buffer) {
    const upload = this.uploads.get(key);
    if (!upload) throw Object.assign(new Error('upload_not_found'), { code: 'upload_not_found' });
    upload.buffer = Buffer.from(buffer);
    return upload;
  }

  generate({ midiUrl, filename = 'untitled.mid', mediaBaseUrl = '' }) {
    const key = this.keyFromUrl(midiUrl);
    const upload = this.uploads.get(key);
    if (!upload?.buffer) throw Object.assign(new Error('uploaded_midi_not_found'), { code: 'uploaded_midi_not_found' });
    const jobId = randomUUID();
    const createdAt = this.clock().toISOString();
    try {
      const midi = inspectMidi(upload.buffer);
      const rendered = renderMidiToWav(upload.buffer);
      this.media.set(jobId, rendered.wav);
      const mediaUrl = `${mediaBaseUrl.replace(/\/$/u, '')}/toy/midi/media/${jobId}`;
      const job = { jobId, state: 'finished', filename: upload.filename ?? filename, createdAt,
        info: { videoUrls: [mediaUrl], audioUrl: mediaUrl, duration: rendered.duration, timingManifest: rendered.timingManifest, midi } };
      this.jobs.set(jobId, job);
      return job;
    } catch (error) {
      const job = { jobId, state: 'failed', filename: upload.filename ?? filename, createdAt, error: error.message };
      this.jobs.set(jobId, job);
      return job;
    }
  }

  keyFromUrl(value) {
    const raw = String(value ?? '');
    try { return decodeURIComponent(new URL(raw, 'http://localhost').pathname.split('/').pop()); } catch { return raw; }
  }

  get(jobId) { return this.jobs.get(String(jobId)) ?? null; }

  list({ pageSize = 20, cursor = 0 } = {}) {
    const all = [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const offset = Number.isFinite(Number(cursor)) ? Math.max(0, Number(cursor)) : 0;
    const list = all.slice(offset, offset + Math.min(100, Math.max(1, Number(pageSize) || 20)));
    return { list, hasMore: offset + list.length < all.length, nextCursor: offset + list.length, total: all.length };
  }

  batch(ids = []) { return { list: ids.map(id => this.get(id)).filter(Boolean) }; }

  cancel(jobId) {
    const job = this.get(jobId);
    if (!job) return null;
    if (!TERMINAL.has(job.state)) job.state = 'canceled';
    return job;
  }

  delete(jobId) {
    this.media.delete(String(jobId));
    return this.jobs.delete(String(jobId));
  }

  mediaBytes(jobId) { return this.media.get(String(jobId)) ?? null; }
}
