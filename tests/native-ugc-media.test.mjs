import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverNativeUgcRoot, NativeUgcMediaStore } from '../src/music/native-ugc-media.js';

test('从 Olivia 日志发现用户自己的 songStoragePath', () => {
  const root = mkdtempSync(join(tmpdir(), 'linli-native-discovery-'));
  const ugc = join(root, 'video');
  const logs = join(root, 'logs');
  const log = join(logs, 'Olivia.log');
  mkdirSync(ugc, { recursive: true });
  mkdirSync(logs, { recursive: true });
  writeFileSync(log, `query.response: {"songStoragePath":"${ugc.replaceAll('\\', '\\\\')}"}`);
  assert.equal(discoverNativeUgcRoot({ appData: root, logFiles: [log], env: {} }), ugc);
});

test('原生 UGC 存储拒绝目录逃逸并返回权限错误', () => {
  const root = mkdtempSync(join(tmpdir(), 'linli-native-store-'));
  const media = new NativeUgcMediaStore({ root });
  assert.throws(() => media.materialize({ songId: '..', filename: 'x.wav', bytes: Buffer.from('x') }), /native_ugc_path_escape/u);
  const unavailable = new NativeUgcMediaStore().materialize({ songId: 'id', filename: 'x.wav', bytes: Buffer.from('x') });
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.code, 'native_ugc_root_not_found');
  assert.match(unavailable.message, /songStoragePath/u);
});

test('能够从游戏曲库缓存中解析预设曲目的试听媒体', () => {
  const root = mkdtempSync(join(tmpdir(), 'linli-native-preview-'));
  const nameKey = 'Solo_Prelude_In_G_Minor_Op23_No5';
  const directory = join(root, nameKey);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${nameKey}_TOD1730_NI_L.mp4`), Buffer.from('mp4'));
  const media = new NativeUgcMediaStore({ root });
  assert.equal(media.previewPath(nameKey), join(directory, `${nameKey}_TOD1730_NI_L.mp4`));
  assert.equal(media.previewPath('../escape'), null);
});
