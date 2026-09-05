import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRenderJob, RenderJobStatus, transitionJob } from '../core/render-job.js';
import { inspectMidi } from './midi-manifest.js';
import { renderMidiToWav } from './audio-renderer.js';

const TERMINAL = new Set(['finished', 'failed', 'canceled']);
const RENDERER_ID = 'builtin.audio';
const RENDERER_VERSION = '0.1.0';

function makeRenderJob(jobId, filename) {
  let renderJob = { ...createRenderJob({ kind: 'audio', inputAssetIds: [filename], rendererId: RENDERER_ID, rendererVersion: RENDERER_VERSION }), id: jobId };
  renderJob = transitionJob(renderJob, RenderJobStatus.VALIDATING);
  renderJob = transitionJob(renderJob, RenderJobStatus.RENDERING, { attempt: 1 });
  return renderJob;
}

export class MidiJobService {
  constructor({ clock = () => new Date(), store = null, mediaRoot = null, playbackBaseUrl = '' } = {}) {
    this.clock = clock;
    this.store = store;
    this.mediaRoot = mediaRoot;
    // The API may remain HTTP for compatibility, while media playback can be
    // served over HTTPS so the game's HTTPS CEF page does not block it as
    // mixed content.
    this.playbackBaseUrl = playbackBaseUrl;
    if (mediaRoot) mkdirSync(mediaRoot, { recursive: true });
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
      const playbackBaseUrl = this.playbackBaseUrl || mediaBaseUrl;
      const mediaUrl = `${playbackBaseUrl.replace(/\/$/u, '')}/toy/midi/media/${jobId}`;
      const mediaPath = this.mediaRoot ? join(this.mediaRoot, `${jobId}.wav`) : null;
      if (mediaPath) writeFileSync(mediaPath, rendered.wav);
      const renderJob = transitionJob(makeRenderJob(jobId, upload.filename ?? filename), RenderJobStatus.PRODUCED, { progress: 1 });
      const job = { jobId, state: 'finished', filename: upload.filename ?? filename, createdAt, mediaPath,
        status: renderJob.status, progress: renderJob.progress, attempt: renderJob.attempt, errorCode: null,
        info: { videoUrls: [mediaUrl], audioUrl: mediaUrl, duration: rendered.duration, timingManifest: rendered.timingManifest, midi, renderJob } };
      this.jobs.set(jobId, job);
      this.store?.insertMidiJob(job);
      return job;
    } catch (error) {
      const renderJob = transitionJob(makeRenderJob(jobId, upload.filename ?? filename), RenderJobStatus.FAILED, { errorCode: error.code ?? 'render_failed', error: error.message });
      const job = { jobId, state: 'failed', filename: upload.filename ?? filename, createdAt, status: renderJob.status, progress: renderJob.progress, attempt: renderJob.attempt, errorCode: renderJob.errorCode, error: error.message, info: { renderJob } };
      this.jobs.set(jobId, job);
      this.store?.insertMidiJob(job);
      return job;
    }
  }

  keyFromUrl(value) {
    const raw = String(value ?? '');
    try { return decodeURIComponent(new URL(raw, 'http://localhost').pathname.split('/').pop()); } catch { return raw; }
  }

  get(jobId) {
    const id = String(jobId);
    return this.jobs.get(id) ?? this.store?.getMidiJob(id) ?? null;
  }

  list({ pageSize = 20, cursor = 0 } = {}) {
    const offset = Number.isFinite(Number(cursor)) ? Math.max(0, Number(cursor)) : 0;
    const limit = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const all = this.store ? this.store.listMidiJobs(limit, offset) : [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(offset, offset + limit);
    const total = this.store ? this.store.countMidiJobs() : this.jobs.size;
    return { list: all, hasMore: offset + all.length < total, nextCursor: offset + all.length, total };
  }

  listUserSongs({ pageSize = 20, cursor = 0 } = {}) {
    const page = this.list({ pageSize, cursor });
    const list = page.list.filter(job => job.state === 'finished').map(job => ({
      userSongId: job.jobId,
      id: job.jobId,
      name: job.filename,
      filename: job.filename,
      audioUrl: this.playbackBaseUrl ? `${this.playbackBaseUrl.replace(/\/$/u, '')}/toy/midi/media/${job.jobId}` : (job.info?.audioUrl ?? ''),
      videoUrl: this.playbackBaseUrl ? `${this.playbackBaseUrl.replace(/\/$/u, '')}/toy/midi/media/${job.jobId}` : (job.info?.videoUrls?.[0] ?? job.info?.audioUrl ?? ''),
      // Lite's native player does not play a song from videoUrl alone. It
      // selects a TOD/view entry from this array before forwarding the URL to
      // NutWebPlayer. Local MIDI renders are audio-only, so all three TOD
      // slots intentionally point to the same rendered media while keeping
      // the native song contract intact.
      videoByTodView: (() => {
        const storedMediaUrl = job.info?.videoUrls?.[0] ?? job.info?.audioUrl ?? '';
        const mediaUrl = this.playbackBaseUrl
          ? `${this.playbackBaseUrl.replace(/\/$/u, '')}/toy/midi/media/${job.jobId}`
          : storedMediaUrl;
        const duration = job.info?.duration ?? 0;
        return mediaUrl ? [
          { url: mediaUrl, tod: 'TOD12', view: 'NI', coverUrl: '', duration },
          { url: mediaUrl, tod: 'TOD17', view: 'NI', coverUrl: '', duration },
          { url: mediaUrl, tod: 'TOD20', view: 'NI', coverUrl: '', duration },
        ] : [];
      })(),
      nameKey: job.jobId,
      performanceType: 'Solo',
      duration: job.info?.duration ?? 0,
      source: 'linli-nocturne',
    }));
    return { list, hasMore: page.hasMore, nextCursor: page.nextCursor, total: page.total };
  }

  batch(ids = []) { return { list: ids.map(id => this.get(id)).filter(Boolean) }; }

  dailyUsage() {
    const start = new Date(this.clock());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const generatedToday = this.store
      ? this.store.countFinishedMidiJobsBetween(start.toISOString(), end.toISOString())
      : [...this.jobs.values()].filter(job => job.state === 'finished' && job.createdAt >= start.toISOString() && job.createdAt < end.toISOString()).length;
    // Display contract only; configurable MIDI quota enforcement is a later task.
    return { generatedToday, dailyLimit: 3 };
  }

  cancel(jobId) {
    const job = this.get(jobId);
    if (!job) return null;
    if (!TERMINAL.has(job.state)) {
      job.state = 'canceled';
      job.status = RenderJobStatus.CANCELLED;
      if (job.info?.renderJob) job.info = { ...job.info, renderJob: { ...job.info.renderJob, status: RenderJobStatus.CANCELLED, updatedAt: this.clock().toISOString() } };
      this.store?.updateMidiJob(job);
    }
    return job;
  }

  delete(jobId) {
    const id = String(jobId);
    const job = this.get(id);
    this.media.delete(id);
    if (job?.mediaPath) { try { unlinkSync(job.mediaPath); } catch {} }
    const deleted = this.store ? this.store.deleteMidiJob(id) : this.jobs.delete(id);
    this.jobs.delete(id);
    return deleted;
  }

  mediaBytes(jobId) {
    const id = String(jobId);
    const inMemory = this.media.get(id);
    if (inMemory) return inMemory;
    const job = this.get(id);
    if (!job?.mediaPath) return null;
    try { return readFileSync(job.mediaPath); } catch { return null; }
  }
}
