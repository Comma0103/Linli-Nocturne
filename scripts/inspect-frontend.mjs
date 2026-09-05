import { readFileSync } from 'node:fs';
import { inspectFrontendArchive, planFrontendPatch } from '../src/patcher/frontend-archive.js';

const gameRoot = process.env.LINLI_GAME_ROOT ?? 'D:/Program Files (x86)/Steam/steamapps/common/BSide Olivia Lin Test';
const version = process.env.LINLI_GAME_VERSION ?? '0.0.9.627';
const serviceUrl = process.env.LINLI_SERVICE_URL ?? 'http://127.0.0.1:27149';
const archivePath = `${gameRoot}/${version}/resources/feapp.dat`;
const archive = readFileSync(archivePath);
const inspected = inspectFrontendArchive(archive);
const plan = planFrontendPatch(archive, { serviceUrl });
console.log(JSON.stringify({ archivePath, mainPath: inspected.mainPath, entryCount: Object.keys(inspected.entries).length, markerPresent: inspected.markerPresent, routes: inspected.routes, alreadyLocal: plan.alreadyLocal, needsPatch: plan.needsPatch }, null, 2));
