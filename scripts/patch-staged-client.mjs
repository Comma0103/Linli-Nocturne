import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { applyFrontendPatch } from '../src/patcher/frontend-archive.js';
import { classifyInstallation } from '../src/patcher/installation-provenance.js';

const stageRoot = resolve(process.env.LINLI_STAGE_ROOT ?? process.argv[2] ?? '');
if (!stageRoot || stageRoot === resolve('.')) {
  throw new Error('请通过 LINLI_STAGE_ROOT 或第一个参数提供独立暂存副本路径');
}

const baseline = JSON.parse(readFileSync(new URL('../config/client-baseline-0.0.9.627.json', import.meta.url), 'utf8'));
const before = classifyInstallation({ gameRoot: stageRoot, baseline });
if (before.state !== 'pristine') {
  throw new Error(`暂存副本不是原装基线，拒绝写入补丁：${before.state} ${before.signals.join(',')}`);
}

const version = before.version;
const archivePath = join(stageRoot, version, 'resources', 'feapp.dat');
const source = readFileSync(archivePath);
const serviceUrl = process.env.LINLI_SERVICE_URL ?? 'http://127.0.0.1:27149';
const result = applyFrontendPatch(source, {
  serviceUrl,
  includeMidi: true,
  includeOfflineFeatures: true,
});
writeFileSync(archivePath, result.buffer);

console.log(JSON.stringify({
  stageRoot,
  version,
  serviceUrl,
  bytesBefore: source.length,
  bytesAfter: result.buffer.length,
  routeCount: result.needsPatch.length,
  offlineFeatureCount: Object.keys(result.offline).length,
  patched: true,
}, null, 2));
