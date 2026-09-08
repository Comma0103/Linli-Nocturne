import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, lstatSync, mkdtempSync, rmSync, renameSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

const SCHEMA = 'linli-nocturne.user-data';
const MAX_BYTES = 256 * 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const within = (root, path) => { const r = relative(resolve(root), resolve(path)); return !r.startsWith('..' + sep) && r !== '..' && !isAbsolute(r); };
const fail = message => { throw new Error(message); };
const cleanEntry = name => name && !name.includes('\\') && !name.startsWith('/') && !name.includes(':')
  && name.split('/').every(part => part && part !== '.' && part !== '..');
function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key, /api[-_]?key|token|secret|password|authorization/iu.test(key) ? '' : scrub(child),
  ]));
}
function mapStrings(value, fn) {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map(item => mapStrings(item, fn));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)]));
  return value;
}
function dataPath(root, token) {
  if (!cleanEntry(token.slice(6))) fail('数据库或配置中的数据路径越界。');
  return resolve(root, token.slice(6));
}
function rebaseDatabase(db, root, direction, references = new Set()) {
  const fields = {
    midi_jobs: ['media_path', 'info_json'],
    video_jobs: ['media_path', 'metadata_json'],
    playlist_items: ['audio_path', 'manifest_json'],
  };
  const convert = value => {
    if (direction === 'in') return value.startsWith('@data/') ? dataPath(root, value) : value;
    if (value.startsWith('http:') || value.startsWith('https:') || !/[\\/]/u.test(value)) return value;
    const path = resolve(value);
    if (within(root, path)) {
      const token = '@data/' + relative(root, path).replaceAll('\\', '/');
      references.add('data/' + token.slice(6));
      return token;
    }
    if (isAbsolute(value) && existsSync(path)) fail('数据库引用了数据目录外的资源，无法完整迁移：' + basename(path));
    return value;
  };
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
  for (const [table, names] of Object.entries(fields)) {
    if (!tables.has(table)) continue;
    const columns = new Set(db.prepare('PRAGMA table_info(' + table + ')').all().map(row => row.name));
    for (const name of names.filter(name => columns.has(name))) {
      for (const row of db.prepare('SELECT rowid AS transfer_row, ' + name + ' AS value FROM ' + table + ' WHERE ' + name + ' IS NOT NULL').all()) {
        const value = name.endsWith('_json') ? JSON.stringify(mapStrings(JSON.parse(row.value), convert)) : convert(row.value);
        db.prepare('UPDATE ' + table + ' SET ' + name + ' = ? WHERE rowid = ?').run(value, row.transfer_row);
      }
    }
  }
}
export function assertServiceStopped(dataRoot) {
  const lock = join(resolve(dataRoot), 'service.lock');
  if (!existsSync(lock)) return;
  let owner;
  try { owner = JSON.parse(readFileSync(lock, 'utf8')); } catch { fail('服务锁无法读取，请先停止本地服务并检查 service.lock。'); }
  try { process.kill(owner.pid, 0); } catch (error) {
    if (error.code === 'ESRCH') return;
    fail('无法确认本地服务已停止。');
  }
  fail('请先停止本地服务，再进行数据导入或档案管理。');
}
export async function exportUserData({ dataRoot, configPath, output }) {
  const root = resolve(dataRoot), destination = resolve(output);
  if (within(root, destination)) fail('数据包请保存到数据目录之外。');
  if (existsSync(destination)) fail('输出文件已存在，请选择另一个名称。');
  const sourceFile = join(root, 'linli.sqlite');
  if (!existsSync(sourceFile)) fail('尚未找到本地信件数据库。');
  const temp = mkdtempSync(join(tmpdir(), 'linli-export-'));
  let source, snapshot;
  try {
    source = new DatabaseSync(sourceFile, { readOnly: true });
    await backup(source, join(temp, 'linli.sqlite'));
    source.close(); source = null;
    snapshot = new DatabaseSync(join(temp, 'linli.sqlite'));
    const references = new Set();
    rebaseDatabase(snapshot, root, 'out', references);
    snapshot.close(); snapshot = null;
    const entries = { 'data/linli.sqlite': new Uint8Array(readFileSync(join(temp, 'linli.sqlite'))) };
    let total = entries['data/linli.sqlite'].length;
    if (total > MAX_BYTES) fail('数据库超过当前数据包大小上限。');
    const add = (name, bytes) => {
      total += bytes.length;
      if (total > MAX_BYTES) fail('数据包超过当前 256 MiB 上限；请先移出不需要迁移的媒体。');
      entries[name] = new Uint8Array(bytes);
    };
    const walk = directory => {
      for (const item of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, item.name);
        if (lstatSync(path).isSymbolicLink()) fail('数据目录包含符号链接，不能自动打包：' + item.name);
        if (item.isDirectory()) {
          if (!['harness-runtime', 'logs', 'letter-diagnostics'].includes(item.name)) walk(path);
        } else if (!/\.sqlite(?:-(?:wal|shm))?$/u.test(item.name) && item.name !== 'service.lock') {
          add('data/' + relative(root, path).replaceAll('\\', '/'), readFileSync(path));
        }
      }
    };
    walk(root);
    for (const name of references) if (!entries[name]) fail('快照引用的媒体缺失或仍在变化，请停止服务后重试：' + name);
    if (configPath && existsSync(configPath)) {
      const config = scrub(JSON.parse(readFileSync(configPath, 'utf8')));
      const personaFile = config.letters?.persona?.file;
      if (personaFile) {
        const path = resolve(dirname(configPath), personaFile);
        add('data/user-assets/persona.md', readFileSync(path));
        config.letters.persona.file = '@data/user-assets/persona.md';
      }
      if (config.letters?.harness?.root?.replaceAll('\\', '/').endsWith('third_party/OliviaSoul/v18-harness')) {
        config.letters.harness.root = '../third_party/OliviaSoul/v18-harness';
      }
      if (isAbsolute(config.letters?.baseModel?.offline?.python ?? '')) config.letters.baseModel.offline.python = basename(config.letters.baseModel.offline.python);
      if (config.letters?.harness?.diagnostics?.directory) config.letters.harness.diagnostics.directory = '../logs/letter-diagnostics';
      add('config/user-config.json', strToU8(JSON.stringify(config, null, 2) + '\n'));
    }
    const manifest = { schema: SCHEMA, schemaVersion: 1, exportedAt: new Date().toISOString(),
      files: Object.entries(entries).map(([name, bytes]) => ({ name, bytes: bytes.length, sha256: hash(bytes) })) };
    entries['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
    const archive = zipSync(entries, { level: 6 });
    if (total + entries['manifest.json'].length > MAX_BYTES || archive.length > MAX_BYTES) fail('数据包超过当前大小上限。');
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, archive, { flag: 'wx' });
    return { output: destination, files: manifest.files.length, bytes: total };
  } finally {
    source?.close(); snapshot?.close();
    rmSync(temp, { recursive: true, force: true });
  }
}
export function importUserData({ input, dataRoot, configPath }) {
  const root = resolve(dataRoot), config = configPath ? resolve(configPath) : null;
  if (dirname(root) === root) fail('不能把磁盘根目录作为数据目录。');
  if (config && within(root, config)) fail('用户配置文件须放在数据目录之外。');
  assertServiceStopped(root);
  const archive = readFileSync(input);
  if (archive.length > MAX_BYTES) fail('数据包超过当前大小上限。');
  let bytes = 0;
  const entries = unzipSync(new Uint8Array(archive), { filter: file => {
    bytes += file.originalSize;
    if (!cleanEntry(file.name) || bytes > MAX_BYTES) fail('数据包路径或大小不合法。');
    return true;
  } });
  if (!entries['manifest.json']) fail('缺少数据包清单。');
  const manifest = JSON.parse(strFromU8(entries['manifest.json']));
  if (manifest.schema !== SCHEMA || manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) fail('不支持的数据包版本。');
  const names = new Set();
  for (const file of manifest.files) {
    if (!cleanEntry(file.name) || names.has(file.name) || !entries[file.name]) fail('数据包清单无效。');
    names.add(file.name);
    if (entries[file.name].length !== file.bytes || hash(entries[file.name]) !== file.sha256) fail('数据包校验失败：' + file.name);
    if (!file.name.startsWith('data/') && file.name !== 'config/user-config.json') fail('数据包包含未知内容。');
  }
  if (Object.keys(entries).length !== names.size + 1 || !names.has('data/linli.sqlite')) fail('数据包内容与清单不符。');
  let importedConfig;
  if (config && entries['config/user-config.json']) {
    importedConfig = scrub(JSON.parse(strFromU8(entries['config/user-config.json'])));
    if (importedConfig.version !== 1) fail('用户配置版本不兼容。');
    importedConfig = mapStrings(importedConfig, value => value.startsWith('@data/')
      ? relative(dirname(config), dataPath(root, value)).replaceAll('\\', '/') : value);
  }
  mkdirSync(dirname(root), { recursive: true });
  const temp = mkdtempSync(join(dirname(root), basename(root) + '.import-'));
  const suffix = '.before-import-' + Date.now();
  const oldRoot = root + suffix;
  const oldConfig = config ? config + suffix : null;
  let movedData = false, installedData = false, movedConfig = false, installedConfig = false;
  try {
    for (const file of manifest.files.filter(file => file.name.startsWith('data/'))) {
      const target = resolve(temp, file.name.slice(5));
      if (!within(temp, target)) fail('数据包路径越界。');
      mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, entries[file.name]);
    }
    const db = new DatabaseSync(join(temp, 'linli.sqlite'));
    try {
      if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') fail('数据库完整性校验失败。');
      if (!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'letters'").get()) fail('数据包中没有信件表。');
      rebaseDatabase(db, root, 'in');
      // 旧机器的进程租约不再有效；尝试次数仍按既有上限恢复。
      db.exec("UPDATE letters SET processing_started_at = '1970-01-01T00:00:00.000Z' WHERE status = 'processing'");
      if (db.prepare("SELECT name FROM sqlite_master WHERE name = 'memory_states'").get()) {
        db.exec("UPDATE memory_states SET status = 'pending', next_attempt_at = NULL WHERE status = 'processing' AND attempt_count < 3");
        db.exec("UPDATE memory_states SET status = 'failed', last_error = 'memory_lease_expired' WHERE status = 'processing' AND attempt_count >= 3");
      }
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } finally { db.close(); }
    if (existsSync(root)) { renameSync(root, oldRoot); movedData = true; }
    renameSync(temp, root); installedData = true;
    if (importedConfig) {
      mkdirSync(dirname(config), { recursive: true });
      if (existsSync(config)) { renameSync(config, oldConfig); movedConfig = true; }
      writeFileSync(config, JSON.stringify(importedConfig, null, 2) + '\n', { flag: 'wx' }); installedConfig = true;
    }
    return { dataRoot: root, backup: movedData ? oldRoot : null, configBackup: movedConfig ? oldConfig : null };
  } catch (error) {
    if (installedConfig) rmSync(config, { force: true });
    if (movedConfig) renameSync(oldConfig, config);
    if (installedData) rmSync(root, { recursive: true, force: true });
    if (movedData) renameSync(oldRoot, root);
    throw error;
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
