import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, normalize, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

const SONG_PATH_PATTERN = /"songStoragePath"\s*:\s*"((?:\\.|[^"\\])*)"/gu;

function decodeJsonPath(value) {
  try { return JSON.parse(`"${value}"`); } catch { return value.replace(/\\\\/gu, '\\'); }
}

export function discoverNativeUgcRoot({ explicitRoot = '', env = process.env, appData = env.APPDATA, logFiles = null } = {}) {
  if (explicitRoot) return resolve(String(explicitRoot));
  if (env.LINLI_NATIVE_UGC_ROOT) return resolve(env.LINLI_NATIVE_UGC_ROOT);
  const root = appData ? join(appData, 'miHoYo', 'Olivia-steam') : join(homedir(), 'AppData', 'Roaming', 'miHoYo', 'Olivia-steam');
  const candidates = logFiles ?? [join(root, 'logs', 'Olivia.log'), join(root, 'logs', 'Olivia.1.log')];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    for (const candidate of text.matchAll(SONG_PATH_PATTERN)) {
      const path = decodeJsonPath(candidate[1]);
      if (path && existsSync(path)) return normalize(path);
    }
  }
  return null;
}

function safeChild(root, child) {
  const base = resolve(root);
  const target = resolve(base, child);
  if (target !== base && !target.startsWith(`${base}${sep}`)) throw new Error('native_ugc_path_escape');
  return target;
}

export class NativeUgcMediaStore {
  constructor({ root = null } = {}) { this.root = root ? resolve(root) : null; }

  materialize({ songId, filename, bytes }) {
    if (!this.root) return { status: 'unavailable', code: 'native_ugc_root_not_found', message: '未发现游戏的 songStoragePath；请先启动一次游戏，或在 music.nativeUgcRoot 中填写路径。' };
    if (!songId || !filename || !Buffer.isBuffer(bytes)) return { status: 'failed', code: 'native_ugc_input_invalid' };
    const directory = safeChild(this.root, String(songId));
    const target = safeChild(directory, String(filename));
    const temporary = `${target}.tmp-${randomUUID()}`;
    try {
      mkdirSync(directory, { recursive: true });
      writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 });
      renameSync(temporary, target);
      return { status: 'ready', path: target };
    } catch (error) {
      try { if (existsSync(temporary)) unlinkSync(temporary); } catch {}
      return { status: 'failed', code: 'native_ugc_write_failed', message: `无法写入游戏原生音乐目录：${error.message}。请关闭游戏并检查目录权限。` };
    }
  }

  previewPath(nameKey) {
    if (!this.root || !/^[A-Za-z0-9_-]+$/u.test(String(nameKey ?? ''))) return null;
    const directory = safeChild(this.root, String(nameKey));
    if (!existsSync(directory)) return null;
    let names;
    try { names = readdirSync(directory); } catch { return null; }
    const escapedKey = String(nameKey).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const expected = names.filter(name => new RegExp(`^${escapedKey}_TOD(?:1200|1730|2000)_NI_L\\.mp4$`, 'u').test(name));
    const filename = expected.find(name => name.includes('_TOD1730_')) ?? expected[0];
    return filename ? safeChild(directory, filename) : null;
  }
}
