import { readFileSync } from 'node:fs';
import { createInstallPlan } from '../src/patcher/install-plan.js';

const gameRoot = process.env.LINLI_GAME_ROOT ?? process.argv[2];
const backupRoot = process.env.LINLI_BACKUP_ROOT ?? process.argv[3];
const serviceUrl = process.env.LINLI_SERVICE_URL ?? 'http://127.0.0.1:27149';
if (!gameRoot) throw new Error('请通过 LINLI_GAME_ROOT 或第一个参数提供游戏根目录');

const baseline = JSON.parse(readFileSync(new URL('../config/client-baseline-0.0.9.627.json', import.meta.url), 'utf8'));
console.log(JSON.stringify(createInstallPlan({ gameRoot, backupRoot, baseline, serviceUrl }), null, 2));
