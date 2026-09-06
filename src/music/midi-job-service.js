import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRenderJob, RenderJobStatus, transitionJob } from '../core/render-job.js';
import { createDayBoundary, DEFAULT_TIME_ZONE } from '../core/time-boundary.js';
import { inspectMidi } from './midi-manifest.js';
import { BuiltinAudioRenderer } from './audio-renderer.js';
import { OliviaLinPlaybackAdapter } from './playback-adapter.js';

const TERMINAL = new Set(['finished', 'failed', 'canceled']);
function makeRenderJob(jobId, filename, renderer) {
  let renderJob = { ...createRenderJob({ kind: 'audio', inputAssetIds: [filename], rendererId: renderer.id, rendererVersion: renderer.version }), id: jobId };
  renderJob = transitionJob(renderJob, RenderJobStatus.VALIDATING);
  renderJob = transitionJob(renderJob, RenderJobStatus.RENDERING, { attempt: 1 });
  return renderJob;
}

export class MidiJobService {
  constructor({ clock = () => new Date(), timeZone = DEFAULT_TIME_ZONE, store = null, mediaRoot = null, playbackBaseUrl = '', mediaEncoder = null, mediaExtension = 'wav', mediaContentType = 'audio/wav', renderer = new BuiltinAudioRenderer(), playbackAdapter = new OliviaLinPlaybackAdapter() } = {}) {
    this.clock = clock;
    this.dayBoundary = createDayBoundary(timeZone);
    this.store = store;
    this.mediaRoot = mediaRoot;
    // The API may remain HTTP for compatibility, while media playback can be
    // served over HTTPS so the game's HTTPS CEF page does not block it as
    // mixed content.
    this.playbackBaseUrl = playbackBaseUrl;
    this.mediaEncoder = mediaEncoder;
    if (!renderer || typeof renderer.render !== 'function' || !renderer.id || !renderer.version) throw new TypeError('renderer.id, version and render are required');
    if (!playbackAdapter || typeof playbackAdapter.toUserSong !== 'function') throw new TypeError('playbackAdapter.toUserSong is required');
    this.renderer = renderer;
    this.playbackAdapter = playbackAdapter;
    this.mediaExtension = mediaExtension;
    this.mediaContentType = mediaContentType;
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
      const rendered = this.renderer.render(upload.buffer);
      const mediaBytes = this.mediaEncoder ? this.mediaEncoder(rendered.wav) : rendered.wav;
      this.media.set(jobId, mediaBytes);
      const playbackBaseUrl = this.playbackBaseUrl || mediaBaseUrl;
      const mediaUrl = `${playbackBaseUrl.replace(/\/$/u, '')}/toy/midi/media/${jobId}.mp4`;
      const mediaPath = this.mediaRoot ? join(this.mediaRoot, `${jobId}.${this.mediaExtension}`) : null;
      if (mediaPath) writeFileSync(mediaPath, mediaBytes);
      const renderJob = transitionJob(makeRenderJob(jobId, upload.filename ?? filename, this.renderer), RenderJobStatus.PRODUCED, { progress: 1 });
      const job = { jobId, state: 'finished', filename: upload.filename ?? filename, createdAt, mediaPath,
        status: renderJob.status, progress: renderJob.progress, attempt: renderJob.attempt, errorCode: null,
        info: { videoUrls: [mediaUrl], audioUrl: mediaUrl, duration: rendered.duration, timingManifest: rendered.timingManifest, midi, renderJob } };
      this.jobs.set(jobId, job);
      this.store?.insertMidiJob(job);
      return job;
    } catch (error) {
      const renderJob = transitionJob(makeRenderJob(jobId, upload.filename ?? filename, this.renderer), RenderJobStatus.FAILED, { errorCode: error.code ?? 'render_failed', error: error.message });
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

  playbackUrl(jobId) {
    return this.playbackBaseUrl
      ? `${this.playbackBaseUrl.replace(/\/$/u, '')}/toy/midi/media/${jobId}.mp4`
      : '';
  }

  normalizePersistedJob(job) {
    if (!job) return null;
    const renderJob = job.info?.renderJob ?? null;
    const info = job.info ? { ...job.info } : {};
    const mediaUrl = job.state === 'finished' ? this.playbackUrl(job.jobId) : '';
    if (mediaUrl) {
      info.audioUrl = mediaUrl;
      info.videoUrls = [mediaUrl];
    }
    return {
      ...job,
      status: renderJob?.status ?? (job.state === 'finished' ? RenderJobStatus.PRODUCED : job.state === 'canceled' ? RenderJobStatus.CANCELLED : RenderJobStatus.FAILED),
      progress: renderJob?.progress ?? (job.state === 'finished' ? 1 : 0),
      attempt: renderJob?.attempt ?? 0,
      errorCode: renderJob?.errorCode ?? job.errorCode ?? null,
      info,
    };
  }

  get(jobId) {
    const id = String(jobId);
    const inMemory = this.jobs.get(id);
    return inMemory ?? this.normalizePersistedJob(this.store?.getMidiJob(id));
  }

  list({ pageSize = 20, cursor = 0 } = {}) {
    const offset = Number.isFinite(Number(cursor)) ? Math.max(0, Number(cursor)) : 0;
    const limit = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const all = this.store ? this.store.listMidiJobs(limit, offset).map(job => this.normalizePersistedJob(job)) : [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(offset, offset + limit);
    const total = this.store ? this.store.countMidiJobs() : this.jobs.size;
    return { list: all, hasMore: offset + all.length < total, nextCursor: offset + all.length, total };
  }

  listFinished({ pageSize = 20, cursor = 0 } = {}) {
    const offset = Number.isFinite(Number(cursor)) ? Math.max(0, Number(cursor)) : 0;
    const limit = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const all = this.store
      ? this.store.listFinishedMidiJobs(limit, offset).map(job => this.normalizePersistedJob(job))
      : [...this.jobs.values()].filter(job => job.state === 'finished').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(offset, offset + limit);
    const total = this.store ? this.store.countFinishedMidiJobs() : [...this.jobs.values()].filter(job => job.state === 'finished').length;
    return { list: all, hasMore: offset + all.length < total, nextCursor: offset + all.length, total };
  }

  listUserSongs({ pageSize = 20, cursor = 0 } = {}) {
    const page = this.listFinished({ pageSize, cursor });
    const list = page.list.map(job => {
      const storedMediaUrl = job.info?.videoUrls?.[0] ?? job.info?.audioUrl ?? '';
      const mediaUrl = this.playbackUrl(job.jobId) || storedMediaUrl;
      return this.playbackAdapter.toUserSong({ job, mediaUrl });
    });
    return { list, hasMore: page.hasMore, nextCursor: page.nextCursor, total: page.total };
  }

  batch(ids = []) { return { list: ids.map(id => this.get(id)).filter(Boolean) }; }

  dailyUsage() {
    const { startIso, endIso } = this.dayBoundary(this.clock());
    const generatedToday = this.store
      ? this.store.countFinishedMidiJobsBetween(startIso, endIso)
      : [...this.jobs.values()].filter(job => job.state === 'finished' && job.createdAt >= startIso && job.createdAt < endIso).length;
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
    try {
      const bytes = readFileSync(job.mediaPath);
      if (this.mediaEncoder && job.mediaPath.toLowerCase().endsWith('.wav')) {
        const encoded = this.mediaEncoder(bytes);
        this.media.set(id, encoded);
        return encoded;
      }
      return bytes;
    } catch { return null; }
  }
}
