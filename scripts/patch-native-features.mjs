import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { applyNativeFeaturePatch } from '../src/patcher/native-feature-patch.js';

const gameRoot = resolve(process.env.LINLI_GAME_ROOT ?? process.argv[2] ?? '');
if (!gameRoot || gameRoot === resolve('.')) throw new Error('请通过 LINLI_GAME_ROOT 或第一个参数提供游戏根目录');
const version = process.env.LINLI_GAME_VERSION ?? '0.0.9.627';
const versionRoot = join(gameRoot, version);
const studioPath = join(versionRoot, 'plugins', 'Studio', 'NutStudioUI.dll');
const containerPath = join(versionRoot, 'plugins', 'Container', 'NutContainerPlugin.dll');
const result = applyNativeFeaturePatch({ studio: readFileSync(studioPath), container: readFileSync(containerPath) });

function atomicReplace(path, bytes) {
  const temp = `${path}.linli-nocturne.tmp`;
  writeFileSync(temp, bytes);
  try { renameSync(temp, path); } catch (error) { try { unlinkSync(temp); } catch {} throw error; }
}

atomicReplace(studioPath, result.studio.buffer);
atomicReplace(containerPath, result.container.buffer);
console.log(JSON.stringify({ gameRoot, version, studio: result.studio.patches, container: result.container.patches }, null, 2));
