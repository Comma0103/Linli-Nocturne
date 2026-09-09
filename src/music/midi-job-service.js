import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRenderJob, RenderJobStatus, transitionJob } from '../core/render-job.js';
import { createDayBoundary, DEFAULT_TIME_ZONE } from '../core/time-boundary.js';
import { inspectMidi } from './midi-manifest.js';
import { BuiltinAudioRenderer } from './audio-renderer.js';
import { OliviaLinPlaybackAdapter } from './playback-adapter.js';

const TERMINAL = new Set(['finished', 'failed', 'canceled']);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function renderJobFor(jobId, filename, renderer, clock) {
  return { ...createRenderJob({ kind: 'audio', inputAssetIds: [filename], rendererId: renderer.id, rendererVersion: renderer.version }), id: jobId, createdAt: clock().toISOString() };
}

export class MidiJobService {
  constructor({ clock = () => new Date(), timeZone = DEFAULT_TIME_ZONE, store = null, mediaRoot = null, playbackBaseUrl = '', mediaEncoder = null, mediaExtension = null, mediaContentType = null, nativeUgcMediaStore = null, renderer = new BuiltinAudioRenderer(), playbackAdapter = new OliviaLinPlaybackAdapter() } = {}) {
    this.clock = clock;
    this.dayBoundary = createDayBoundary(timeZone);
    this.store = store;
    this.mediaRoot = mediaRoot;
    this.inputRoot = mediaRoot ? join(mediaRoot, 'inputs') : null;
    this.playbackBaseUrl = playbackBaseUrl;
    this.mediaEncoder = mediaEncoder;
    this.nativeUgcMediaStore = nativeUgcMediaStore;
    if (!renderer || typeof renderer.render !== 'function' || !renderer.id || !renderer.version) throw new TypeError('renderer.id, version and render are required');
    if (!playbackAdapter || typeof playbackAdapter.toUserSong !== 'function') throw new TypeError('playbackAdapter.toUserSong is required');
    this.renderer = renderer;
    this.playbackAdapter = playbackAdapter;
    this.mediaExtension = String(mediaExtension ?? mediaEncoder?.extension ?? 'wav').replace(/^\./u, '') || 'wav';
    this.mediaContentType = mediaContentType ?? mediaEncoder?.contentType ?? 'audio/wav';
    if (mediaRoot) mkdirSync(mediaRoot, { recursive: true });
    if (this.inputRoot) mkdirSync(this.inputRoot, { recursive: true });
    this.uploads = new Map();
    this.inputs = new Map();
    this.jobs = new Map();
    this.media = new Map();
    this.active = new Map();
    this.scheduled = new Set();
    if (this.store) this.recover();
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
    upload.sha256 = sha256(upload.buffer);
    upload.size = upload.buffer.length;
    if (this.inputRoot) {
      upload.inputPath = join(this.inputRoot, key);
      writeFileSync(upload.inputPath, upload.buffer, { flag: 'w' });
    }
    return upload;
  }

  generate({ midiUrl, filename = 'untitled.mid', mediaBaseUrl = '' }) {
    const key = this.keyFromUrl(midiUrl);
    const upload = this.uploads.get(key);
    if (!upload?.buffer) throw Object.assign(new Error('uploaded_midi_not_found'), { code: 'uploaded_midi_not_found' });
    const jobId = randomUUID();
    const job = { jobId, state: 'queued', filename: upload.filename ?? filename, createdAt: this.clock().toISOString(), mediaPath: null,
      inputPath: upload.inputPath ?? null, inputSha256: upload.sha256 ?? sha256(upload.buffer), inputSize: upload.size ?? upload.buffer.length,
      inputFilename: upload.filename ?? filename, status: RenderJobStatus.QUEUED, progress: 0, attempt: 0, errorCode: null,
      info: { renderJob: renderJobFor(jobId, upload.filename ?? filename, this.renderer, this.clock) } };
    this.jobs.set(jobId, job);
    this.inputs.set(jobId, Buffer.from(upload.buffer));
    this.store?.insertMidiJob(job);
    let scheduled;
    scheduled = new Promise(resolve => setImmediate(async () => {
      try { await this.processJob(jobId, { mediaBaseUrl }); } finally { this.scheduled.delete(scheduled); resolve(); }
    }));
    this.scheduled.add(scheduled);
    return job;
  }

  keyFromUrl(value) {
    const raw = String(value ?? '');
    try { return decodeURIComponent(new URL(raw, 'http://localhost').pathname.split('/').pop()); } catch { return raw; }
  }

  mediaFormat(job) {
    const legacyExtension = (job?.mediaPath ?? job?.info?.audioUrl ?? job?.info?.videoUrls?.[0] ?? '').match(/\.(wav|mp4)(?:[?#].*)?$/u)?.[1];
    const extension = job?.info?.mediaExtension ?? legacyExtension ?? this.mediaExtension;
    const contentType = job?.info?.mediaContentType ?? ({ wav: 'audio/wav', mp4: 'video/mp4' }[extension] ?? 'application/octet-stream');
    return { extension, contentType };
  }

  playbackUrl(job) {
    return this.playbackBaseUrl
      ? `${this.playbackBaseUrl.replace(/\/$/u, '')}/toy/midi/media/${job.jobId}.${this.mediaFormat(job).extension}`
      : '';
  }

  persist(job) { if (this.store) this.store.updateMidiJob(job); }

  transition(job, state, nextStatus, patch = {}) {
    const renderJob = job.info?.renderJob ?? renderJobFor(job.jobId, job.filename, this.renderer, this.clock);
    const { info: infoPatch, ...renderPatch } = patch;
    const nextRenderJob = nextStatus === renderJob.status ? { ...renderJob, ...renderPatch, updatedAt: this.clock().toISOString() } : transitionJob(renderJob, nextStatus, renderPatch);
    const next = { ...job, ...patch, state, status: nextRenderJob.status, progress: nextRenderJob.progress ?? job.progress, attempt: nextRenderJob.attempt ?? job.attempt, info: { ...(job.info ?? {}), ...(infoPatch ?? {}), renderJob: nextRenderJob } };
    this.jobs.set(job.jobId, next);
    this.persist(next);
    return next;
  }

  async processJob(jobId, { mediaBaseUrl = '' } = {}) {
    if (this.active.has(jobId) && this.active.get(jobId)?.promise) return this.active.get(jobId).promise;
    const controller = new AbortController();
    const promise = this.runJob(jobId, { mediaBaseUrl, controller }).finally(() => this.active.delete(jobId));
    this.active.set(jobId, { controller, promise });
    return promise;
  }

  async runJob(jobId, { mediaBaseUrl = '', controller }) {
    let job = this.get(jobId);
    if (!job || TERMINAL.has(job.state)) return job;
    let tempPath = null;
    try {
      job = this.transition(job, 'processing', RenderJobStatus.VALIDATING);
      const bytes = job.inputPath && existsSync(job.inputPath) ? readFileSync(job.inputPath) : this.inputs.get(jobId) ?? null;
      if (!bytes || sha256(bytes) !== job.inputSha256) throw Object.assign(new Error('midi_input_invalid_or_missing'), { code: 'midi_input_invalid_or_missing' });
      const midi = inspectMidi(bytes);
      if (controller.signal.aborted || this.get(jobId)?.state === 'canceled') return this.get(jobId);
      job = this.transition(job, 'processing', RenderJobStatus.RENDERING, { attempt: 1 });
      const rendered = await this.renderer.render(bytes, { signal: controller.signal });
      const mediaBytes = this.mediaEncoder ? this.mediaEncoder(rendered.wav) : rendered.wav;
      if (controller.signal.aborted || this.get(jobId)?.state === 'canceled') return this.get(jobId);
      const playbackBaseUrl = this.playbackBaseUrl || mediaBaseUrl;
      const mediaUrl = `${playbackBaseUrl.replace(/\/$/u, '')}/toy/midi/media/${jobId}.${this.mediaExtension}`;
      const mediaPath = this.mediaRoot ? join(this.mediaRoot, `${jobId}.${this.mediaExtension}`) : null;
      if (mediaPath) {
        tempPath = `${mediaPath}.tmp-${randomUUID()}`;
        writeFileSync(tempPath, mediaBytes, { flag: 'wx' });
        renameSync(tempPath, mediaPath);
        tempPath = null;
      }
      this.media.set(jobId, mediaBytes);
      const nativeFilename = `${jobId}.${this.mediaExtension}`;
      const nativePlayback = this.nativeUgcMediaStore
        ? this.nativeUgcMediaStore.materialize({ songId: jobId, filename: nativeFilename, bytes: Buffer.from(mediaBytes) })
        : { status: 'disabled', code: 'native_ugc_not_configured' };
      return this.transition(job, 'finished', RenderJobStatus.PRODUCED, { progress: 1, mediaPath, errorCode: null, error: null,
        info: { videoUrls: [mediaUrl], audioUrl: mediaUrl, duration: rendered.duration, timingManifest: rendered.timingManifest, midi,
          mediaExtension: this.mediaExtension, mediaContentType: this.mediaContentType, encoderId: this.mediaEncoder?.id ?? null,
          nativePlayback: { ...nativePlayback, filename: nativeFilename } } });
    } catch (error) {
      if (tempPath) { try { unlinkSync(tempPath); } catch {} }
      if (controller.signal.aborted || this.get(jobId)?.state === 'canceled') return this.get(jobId);
      job = this.get(jobId) ?? job;
      const status = job.info?.renderJob?.status;
      if (status === RenderJobStatus.QUEUED) job = this.transition(job, 'processing', RenderJobStatus.VALIDATING);
      if (job.info?.renderJob?.status === RenderJobStatus.VALIDATING || job.info?.renderJob?.status === RenderJobStatus.RENDERING) {
        job = this.transition(job, 'failed', RenderJobStatus.FAILED, { errorCode: error.code ?? 'render_failed', error: error.message });
      }
      return job;
    }
  }

  recover() {
    for (const persisted of this.store?.listRecoverableMidiJobs() ?? []) {
      if (!persisted.inputPath || !existsSync(persisted.inputPath)) {
        let failed = persisted;
        if (failed.info?.renderJob?.status === RenderJobStatus.QUEUED) failed = this.transition(failed, 'processing', RenderJobStatus.VALIDATING);
        if (failed.info?.renderJob?.status === RenderJobStatus.VALIDATING || failed.info?.renderJob?.status === RenderJobStatus.RENDERING) this.transition(failed, 'failed', RenderJobStatus.FAILED, { errorCode: 'midi_input_invalid_or_missing', error: 'midi_input_invalid_or_missing' });
        continue;
      }
      let queued = persisted;
      if (queued.info?.renderJob?.status === RenderJobStatus.RENDERING) {
        queued = { ...queued, state: 'queued', status: RenderJobStatus.QUEUED, info: { ...queued.info, renderJob: { ...queued.info.renderJob, status: RenderJobStatus.QUEUED, progress: 0 } } };
        this.jobs.set(queued.jobId, queued); this.persist(queued);
      }
      setImmediate(() => { void this.processJob(queued.jobId); });
    }
  }

  normalizePersistedJob(job) {
    if (!job) return null;
    const renderJob = job.info?.renderJob ?? null;
    const info = job.info ? { ...job.info } : {};
    const mediaUrl = job.state === 'finished' ? this.playbackUrl(job) : '';
    if (mediaUrl) { info.audioUrl = mediaUrl; info.videoUrls = [mediaUrl]; }
    return { ...job, status: renderJob?.status ?? (job.state === 'finished' ? RenderJobStatus.PRODUCED : job.state === 'canceled' ? RenderJobStatus.CANCELLED : job.state), progress: renderJob?.progress ?? (job.state === 'finished' ? 1 : 0), attempt: renderJob?.attempt ?? 0, errorCode: renderJob?.errorCode ?? job.errorCode ?? null, info };
  }

  get(jobId) { const id = String(jobId); return this.jobs.get(id) ?? this.normalizePersistedJob(this.store?.getMidiJob(id)); }
  list({ pageSize = 20, cursor = 0 } = {}) {
    const offset = Number.isFinite(Number(cursor)) ? Math.max(0, Number(cursor)) : 0; const limit = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const all = this.store ? this.store.listMidiJobs(limit, offset).map(job => this.normalizePersistedJob(job)) : [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(offset, offset + limit); const total = this.store ? this.store.countMidiJobs() : this.jobs.size;
    return { list: all, hasMore: offset + all.length < total, nextCursor: offset + all.length, total };
  }
  listFinished({ pageSize = 20, cursor = 0 } = {}) {
    const offset = Number.isFinite(Number(cursor)) ? Math.max(0, Number(cursor)) : 0; const limit = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const all = this.store ? this.store.listFinishedMidiJobs(limit, offset).map(job => this.normalizePersistedJob(job)) : [...this.jobs.values()].filter(job => job.state === 'finished').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(offset, offset + limit); const total = this.store ? this.store.countFinishedMidiJobs() : [...this.jobs.values()].filter(job => job.state === 'finished').length;
    return { list: all, hasMore: offset + all.length < total, nextCursor: offset + all.length, total };
  }
  userSong(jobId) {
    const job = this.get(jobId);
    if (!job || job.state !== 'finished') return null;
    return this.playbackAdapter.toUserSong({ job, mediaUrl: this.playbackUrl(job) || job.info?.videoUrls?.[0] || job.info?.audioUrl || '' });
  }
  listUserSongs({ pageSize = 20, cursor = 0 } = {}) { const page = this.listFinished({ pageSize, cursor }); return { ...page, list: page.list.map(job => this.userSong(job.jobId)).filter(Boolean) }; }
  batch(ids = []) { return { list: ids.map(id => this.get(id)).filter(Boolean) }; }
  dailyUsage() {
    const { startIso, endIso } = this.dayBoundary(this.clock()); const generatedToday = this.store ? this.store.countFinishedMidiJobsBetween(startIso, endIso) : [...this.jobs.values()].filter(job => job.state === 'finished' && job.createdAt >= startIso && job.createdAt < endIso).length;
    return { generatedToday, dailyLimit: 3 };
  }
  cancel(jobId) {
    const id = String(jobId); const job = this.get(id); if (!job || TERMINAL.has(job.state)) return job;
    this.active.get(id)?.controller.abort();
    const renderJob = job.info?.renderJob; const nextRenderJob = renderJob && renderJob.status !== RenderJobStatus.CANCELLED ? transitionJob(renderJob, RenderJobStatus.CANCELLED) : renderJob;
    const canceled = { ...job, state: 'canceled', status: RenderJobStatus.CANCELLED, info: { ...(job.info ?? {}), renderJob: nextRenderJob } }; this.jobs.set(id, canceled); this.persist(canceled); return canceled;
  }
  delete(jobId) {
    const id = String(jobId); const job = this.get(id); this.media.delete(id); this.inputs.delete(id); this.jobs.delete(id); this.active.get(id)?.controller.abort();
    if (job?.mediaPath) { try { unlinkSync(job.mediaPath); } catch {} }
    if (job?.info?.nativePlayback?.path) { try { unlinkSync(job.info.nativePlayback.path); } catch {} }
    if (job?.inputPath) { try { unlinkSync(job.inputPath); } catch {} }
    return this.store ? this.store.deleteMidiJob(id) : Boolean(job);
  }
  mediaBytes(jobId) {
    const id = String(jobId); const inMemory = this.media.get(id); if (inMemory) return inMemory; const job = this.get(id); if (!job?.mediaPath) return null;
    try { const bytes = readFileSync(job.mediaPath); this.media.set(id, bytes); return bytes; } catch { return null; }
  }

  async drain() {
    while (this.scheduled.size || this.active.size) {
      await Promise.all([...this.scheduled, ...this.active.values()].map(entry => entry?.promise ?? entry));
    }
  }
}
