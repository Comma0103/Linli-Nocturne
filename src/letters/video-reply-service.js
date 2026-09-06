import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, join } from 'node:path';
import { FfprobeMp4Adapter, VideoImportError } from './video-import-adapter.js';

const safeFileName = value => basename(String(value || 'reply.mp4')).replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120) || 'reply.mp4';

export class VideoReplyService {
  constructor({ store, mediaRoot, importAdapter = new FfprobeMp4Adapter(), maxBytes = 100 * 1024 * 1024, maxDurationSeconds = 600, clock = () => new Date() } = {}) {
    if (!store || !mediaRoot) throw new TypeError('store and mediaRoot are required');
    if (!importAdapter || typeof importAdapter.inspect !== 'function' || !importAdapter.id || !importAdapter.version) throw new TypeError('importAdapter must implement inspect');
    this.store = store; this.mediaRoot = mediaRoot; this.importAdapter = importAdapter;
    this.maxBytes = maxBytes; this.maxDurationSeconds = maxDurationSeconds; this.clock = clock;
    this.ready = mkdir(mediaRoot, { recursive: true });
  }

  async importBuffer({ letterId, buffer, fileName = 'reply.mp4' }) {
    const letter = this.store.getLetter(letterId);
    if (!letter) throw new VideoImportError('信件不存在', 'letter_not_found');
    if (letter.status !== 'replied') throw new VideoImportError('只有已回复的信件才能添加视频', 'letter_not_replied');
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new VideoImportError('视频文件为空', 'video_empty');
    if (buffer.length > this.maxBytes) throw new VideoImportError(`视频不能超过 ${Math.floor(this.maxBytes / 1024 / 1024)} MiB`, 'video_too_large');
    await this.ready;
    const jobId = randomUUID();
    const tempPath = join(this.mediaRoot, `.${jobId}.upload`);
    const assetId = randomUUID();
    const job = this.store.createVideoJob({ jobId, letterId, assetId, fileName: safeFileName(fileName), adapterId: this.importAdapter.id, adapterVersion: this.importAdapter.version, createdAt: this.clock().toISOString() });
    if (!job) throw new VideoImportError('这封信已有视频正在处理中', 'video_job_conflict');
    try {
      await writeFile(tempPath, buffer, { flag: 'wx' });
      this.store.updateVideoJob(jobId, { status: 'validating' });
      const metadata = await this.importAdapter.inspect(tempPath);
      if (metadata.duration > this.maxDurationSeconds) throw new VideoImportError(`视频不能超过 ${this.maxDurationSeconds} 秒`, 'video_too_long');
      this.store.updateVideoJob(jobId, { status: 'rendering', metadata });
      const finalPath = join(this.mediaRoot, `${assetId}.mp4`);
      await rename(tempPath, finalPath);
      const size = (await stat(finalPath)).size;
      const published = this.store.publishVideoJob(jobId, { path: finalPath, size, metadata, fileName: safeFileName(fileName), publishedAt: this.clock().toISOString() });
      return published;
    } catch (error) {
      await rm(tempPath, { force: true });
      const normalized = error instanceof VideoImportError ? error : new VideoImportError(error?.message ?? '视频导入失败', error?.code ?? 'video_import_failed');
      this.store.failVideoJob(jobId, normalized.code, normalized.message, this.clock().toISOString());
      throw normalized;
    }
  }

  getJob(jobId) { return this.store.getVideoJob(jobId); }
  listJobs(letterId) { return this.store.listVideoJobs(letterId); }
  getActive(letterId) { return this.store.getActiveVideo(letterId); }
  listActive() { return this.store.listActiveVideos(); }
  mediaPath(assetId) { const video = this.store.getVideoAsset(assetId); return video?.active ? video.mediaPath : null; }
  delete(letterId) { return this.store.deleteActiveVideo(letterId, this.clock().toISOString()); }
}
