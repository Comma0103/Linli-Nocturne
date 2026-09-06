import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class VideoImportError extends Error {
  constructor(message, code = 'video_invalid') { super(message); this.name = 'VideoImportError'; this.code = code; }
}
export class VideoImportAdapter {
  constructor({ id = 'video.importer', version = '1.0.0' } = {}) { this.id = id; this.version = version; }
  async inspect() { throw new Error('VideoImportAdapter.inspect must be implemented'); }
}

export class FfprobeMp4Adapter extends VideoImportAdapter {
  constructor({ ffprobePath = 'ffprobe', timeoutMs = 15_000, ...options } = {}) {
    super({ id: 'builtin.ffprobe.mp4', version: '1.0.0', ...options });
    this.ffprobePath = ffprobePath;
    this.timeoutMs = timeoutMs;
  }

  async inspect(path) {
    let stdout;
    try {
      ({ stdout } = await execFileAsync(this.ffprobePath, [
        '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path,
      ], { timeout: this.timeoutMs, maxBuffer: 2 * 1024 * 1024 }));
    } catch (error) {
      if (error?.killed || error?.signal === 'SIGTERM') throw new VideoImportError('视频检查超时', 'video_probe_timeout');
      if (error?.code === 'ENOENT') throw new VideoImportError('未找到 FFprobe，请先安装 FFmpeg 或选择其他视频检查器', 'video_probe_unavailable');
      throw new VideoImportError('视频容器或编码无法读取', 'video_probe_failed');
    }
    let info;
    try { info = JSON.parse(stdout); } catch { throw new VideoImportError('FFprobe 返回了无效结果', 'video_probe_invalid'); }
    const formatName = String(info.format?.format_name ?? '').split(',').map(value => value.trim());
    const video = (info.streams ?? []).find(stream => stream.codec_type === 'video');
    const audio = (info.streams ?? []).find(stream => stream.codec_type === 'audio');
    const duration = Number(info.format?.duration ?? video?.duration ?? 0);
    if (!formatName.some(value => ['mov', 'mp4', 'm4v'].includes(value))) throw new VideoImportError('只支持 MP4 视频容器', 'video_container_unsupported');
    if (!video || video.codec_name !== 'h264') throw new VideoImportError('视频必须包含 H.264 视频轨', 'video_codec_unsupported');
    if (!['yuv420p', 'yuvj420p'].includes(video.pix_fmt)) throw new VideoImportError('视频像素格式必须是 yuv420p', 'video_pixel_format_unsupported');
    if (!Number.isFinite(duration) || duration <= 0) throw new VideoImportError('视频时长无效', 'video_duration_invalid');
    return { container: 'mp4', videoCodec: video.codec_name, pixelFormat: video.pix_fmt, audioCodec: audio?.codec_name ?? null,
      duration, width: Number(video.width) || 0, height: Number(video.height) || 0, format: formatName[0] };
  }
}
