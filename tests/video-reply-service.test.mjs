import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { SqliteStore } from '../src/storage/sqlite-store.js';
import { FallbackLetterProvider, ModelAdapter } from '../src/letters/model-adapter.js';
import { LetterService } from '../src/letters/letter-service.js';
import { VideoReplyService } from '../src/letters/video-reply-service.js';
import { FfprobeMp4Adapter } from '../src/letters/video-import-adapter.js';
import { createLocalGateway } from '../src/gateway/local-gateway.js';

function fakeAdapter() {
  return { id: 'test.video', version: '1.0.0', inspect: async () => ({ container: 'mp4', videoCodec: 'h264', pixelFormat: 'yuv420p', audioCodec: 'aac', duration: 2, width: 1280, height: 720 }) };
}

test('默认 FFprobe 检查器识别合成 MP4 的统一元数据', async t => {
  let toolsAvailable = true;
  try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { toolsAvailable = false; }
  if (!toolsAvailable) return t.skip('本机未安装 FFmpeg/FFprobe');
  const directory = mkdtempSync(join(tmpdir(), 'linli-video-probe-'));
  const path = join(directory, 'sample.mp4');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:d=1', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path]);
  const metadata = await new FfprobeMp4Adapter().inspect(path);
  assert.equal(metadata.container, 'mp4');
  assert.equal(metadata.videoCodec, 'h264');
  assert.equal(metadata.pixelFormat, 'yuv420p');
  assert.equal(metadata.audioCodec, 'aac');
  assert.equal(metadata.width, 320);
  assert.equal(metadata.height, 240);
});

async function repliedLetter(store) {
  const letters = new LetterService({ store, modelAdapter: new ModelAdapter(new FallbackLetterProvider()), limits: { bypass: true } });
  const letter = letters.send({ body: '视频回信测试' });
  await letters.processNext();
  return letter;
}

test('视频回信支持导入、替换、删除，并保留旧任务记录', async () => {
  const store = new SqliteStore();
  const service = new VideoReplyService({ store, mediaRoot: mkdtempSync(join(tmpdir(), 'linli-video-')), importAdapter: fakeAdapter() });
  const letter = await repliedLetter(store);
  const first = await service.importBuffer({ letterId: letter.id, buffer: Buffer.from('first'), fileName: 'first.mp4' });
  assert.equal(first.status, 'published');
  assert.equal(service.getActive(letter.id).assetId, first.assetId);
  assert.match(service.mediaPath(first.assetId), /\.mp4$/u);
  const second = await service.importBuffer({ letterId: letter.id, buffer: Buffer.from('second'), fileName: 'second.mp4' });
  assert.equal(second.status, 'published');
  assert.equal(service.getActive(letter.id).assetId, second.assetId);
  assert.equal(service.mediaPath(first.assetId), null);
  assert.equal(service.delete(letter.id), true);
  assert.equal(service.getActive(letter.id), null);
  assert.equal(service.delete(letter.id), false);
  assert.equal(service.listJobs(letter.id).length, 2);
  store.close();
});

test('同一封信不会同时领取两个视频导入任务', async () => {
  const store = new SqliteStore();
  const service = new VideoReplyService({ store, mediaRoot: mkdtempSync(join(tmpdir(), 'linli-video-lock-')), importAdapter: fakeAdapter() });
  const letter = await repliedLetter(store);
  store.createVideoJob({ jobId: 'in-flight', letterId: letter.id, assetId: 'asset-in-flight', fileName: 'first.mp4', adapterId: 'test.video', adapterVersion: '1.0.0', createdAt: new Date().toISOString() });
  await assert.rejects(() => service.importBuffer({ letterId: letter.id, buffer: Buffer.from('second') }), { code: 'video_job_conflict' });
  store.close();
});

test('视频回信网关提供导入、播放和删除接口', async () => {
  const store = new SqliteStore();
  const service = new VideoReplyService({ store, mediaRoot: mkdtempSync(join(tmpdir(), 'linli-video-gateway-')), importAdapter: fakeAdapter() });
  const letter = await repliedLetter(store);
  const server = createLocalGateway({ letterService: new LetterService({ store, modelAdapter: new ModelAdapter(new FallbackLetterProvider()), limits: { bypass: true } }), videoReplyService: service });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const upload = await fetch(`${base}/letter/video/upload/${letter.id}`, { method: 'PUT', headers: { 'x-file-name': 'test.mp4', 'content-type': 'video/mp4' }, body: Buffer.from('fake') });
    assert.equal(upload.status, 200);
    const list = await fetch(`${base}/toy/letter/list`);
    const item = (await list.json()).data.list[0];
    assert.match(item.replyVideoUrl, /\/letter\/video\/media\//u);
    const media = await fetch(item.replyVideoUrl);
    assert.equal(media.status, 200);
    assert.equal(media.headers.get('content-type'), 'video/mp4');
    assert.equal((await media.arrayBuffer()).byteLength, 4);
    const range = await fetch(item.replyVideoUrl, { headers: { range: 'bytes=0-1' } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get('content-range'), 'bytes 0-1/4');
    assert.equal((await range.arrayBuffer()).byteLength, 2);
    const uploadBody = await upload.json();
    assert.equal('mediaPath' in uploadBody.job, false);
    const page = await fetch(`${base}/letters/videos`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /视频回信/u);
    const deleted = await fetch(`${base}/letter/video/delete/${letter.id}`, { method: 'POST' });
    assert.deepEqual(await deleted.json(), { deleted: true });
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});
