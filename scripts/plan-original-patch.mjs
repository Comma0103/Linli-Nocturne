import { readFileSync } from 'node:fs';
import { applyFrontendPatch } from '../src/patcher/frontend-archive.js';

const archivePath = process.env.LINLI_ORIGINAL_FEAPP
  ?? 'C:/Users/jwl42/AppData/Roaming/OliviaSoul/client-backups/7cc61827b436631c58cbb32677e7b169.feapp.dat';
const serviceUrl = process.env.LINLI_SERVICE_URL ?? 'http://127.0.0.1:27149';
const source = readFileSync(archivePath);
const result = applyFrontendPatch(source, { serviceUrl, includeMidi: true, includeOfflineFeatures: true });
console.log(JSON.stringify({
  archivePath,
  serviceUrl,
  dryRun: true,
  bytesBefore: source.length,
  bytesAfter: result.buffer.length,
  routeCount: result.needsPatch.length,
  offlineFeatureCount: Object.keys(result.offline).length,
  alreadyPatched: result.alreadyPatched ?? false,
}, null, 2));
