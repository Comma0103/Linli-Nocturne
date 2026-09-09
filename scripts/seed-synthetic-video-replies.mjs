import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { SqliteStore } from '../src/storage/sqlite-store.js';
import { FallbackLetterProvider, ModelAdapter } from '../src/letters/model-adapter.js';
import { LetterService } from '../src/letters/letter-service.js';
import { FfprobeMp4Adapter } from '../src/letters/video-import-adapter.js';
import { VideoReplyService } from '../src/letters/video-reply-service.js';

const execFileAsync = promisify(execFile);
const rootArg = process.argv.indexOf('--data-root');
const root = resolve(rootArg >= 0 ? process.argv[rootArg + 1] : process.env.LINLI_SYNTHETIC_VIDEO_ROOT ?? 'synthetic-video-replies');
const conversationArg = process.argv.indexOf('--conversation-id');
const conversationId = conversationArg >= 0 ? process.argv[conversationArg + 1] : 'default';
const replace = process.argv.includes('--replace');
const ffmpegPath = process.env.LINLI_FFMPEG_PATH ?? 'ffmpeg';
const ffprobePath = process.env.LINLI_FFPROBE_PATH ?? 'ffprobe';

const samples = [
  { key: 'blue-quiet', color: '0x3158a8', duration: 4, frequency: 440, label: '蓝色·4 秒·440 Hz' },
  { key: 'green-warm', color: '0x2f8f68', duration: 6, frequency: 660, label: '绿色·6 秒·660 Hz' },
  { key: 'purple-night', color: '0x7546a8', duration: 8, frequency: 880, label: '紫色·8 秒·880 Hz' },
];

async function createVideo(sample, target) {
  await execFileAsync(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `color=c=${sample.color}:s=640x360:r=30:d=${sample.duration}`,
    '-f', 'lavfi', '-i', `sine=frequency=${sample.frequency}:duration=${sample.duration}`,
    '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', target,
  ]);
}

if (existsSync(root)) {
  if (!replace) throw new Error(`数据目录已存在：${root}\n如确认重建，请追加 --replace。`);
  await rm(root, { recursive: true, force: true });
}
await mkdir(root, { recursive: true });
const sourceRoot = join(root, 'seed-sources');
const mediaRoot = join(root, 'video-media');
await mkdir(sourceRoot, { recursive: true });

const store = new SqliteStore(join(root, 'linli.sqlite'));
const letters = new LetterService({
  store,
  conversationId,
  modelAdapter: new ModelAdapter(new FallbackLetterProvider()),
  limits: { bypass: true },
});
const videos = new VideoReplyService({ store, mediaRoot, importAdapter: new FfprobeMp4Adapter({ ffprobePath }) });
const manifest = [];

try {
  for (const sample of samples) {
    const sourcePath = join(sourceRoot, `${sample.key}.mp4`);
    await createVideo(sample, sourcePath);
    const letter = letters.send({ body: `[合成视频回信测试] ${sample.label}，请播放这条视频。` });
    const reply = await letters.processNext();
    if (reply?.status !== 'replied') throw new Error(`合成信件处理失败：${letter.id}`);
    const imported = await videos.importBuffer({
      letterId: letter.id,
      buffer: await readFile(sourcePath),
      fileName: `${sample.key}.mp4`,
    });
    manifest.push({
      sample: sample.key,
      label: sample.label,
      letterId: letter.id,
      jobId: imported.jobId,
      assetId: imported.assetId,
      mediaPath: imported.mediaPath,
      mediaUrlPath: `/letter/video/media/${imported.assetId}.mp4`,
      sourcePath,
      metadata: imported.metadata,
    });
  }
  await writeFile(join(root, 'synthetic-video-manifest.json'), `${JSON.stringify({ conversationId, root, samples: manifest }, null, 2)}\n`);
} finally {
  store.close();
}

console.log(`已生成 ${manifest.length} 条合成视频回信数据：${root}`);
console.log(`启动服务时使用：$env:LINLI_DATA_ROOT = '${root}'`);
console.log("为保持数据隔离，启动时设置：$env:LINLI_USER_CONFIG = ''");
for (const item of manifest) console.log(`${item.sample}: letter=${item.letterId}, asset=${item.assetId}, ${item.metadata.width}x${item.metadata.height}, ${item.metadata.duration}s`);
