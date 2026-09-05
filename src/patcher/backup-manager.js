import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sha256File } from './baseline-verifier.js';
import { canonicalPath, directoryRoot, isWithin, resolveUnderRoot, uniquePaths } from './path-guard.js';

function validBackupId(input) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(input) || input === '.' || input === '..') throw new Error(`Unsafe backup id: ${input}`);
  return input;
}

export function createBackup(gameRoot, relativePaths, backupRoot, backupId = new Date().toISOString().replaceAll(':', '-')) {
  const root = directoryRoot(gameRoot);
  const paths = uniquePaths(relativePaths);
  const id = validBackupId(backupId);
  const destination = resolve(canonicalPath(backupRoot), id);
  if (existsSync(destination)) throw new Error(`Backup already exists: ${destination}`);
  if (isWithin(root, destination) || isWithin(destination, root)) throw new Error('Backup directory must be separate from game directory');

  const sources = paths.map(path => {
    const source = resolveUnderRoot(root, path);
    if (!existsSync(source) || !statSync(source).isFile()) throw new Error(`Cannot back up missing file: ${path}`);
    return { path, source, sha256: sha256File(source), size: statSync(source).size };
  });
  mkdirSync(destination, { recursive: true });
  try {
    for (const item of sources) {
      const target = resolveUnderRoot(destination, item.path);
      mkdirSync(resolve(target, '..'), { recursive: true });
      copyFileSync(item.source, target);
      if (sha256File(target) !== item.sha256) throw new Error(`Backup verification failed: ${item.path}`);
    }
    const manifest = { schema: 'linli-nocturne.backup', schemaVersion: 1, backupId: id, gameRoot: root,
      files: sources.map(({ path, sha256, size }) => ({ path, sha256, size })) };
    writeFileSync(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    return { destination, manifest };
  } catch (error) {
    throw new Error(`Backup failed before manifest creation: ${error.message}`, { cause: error });
  }
}

export function restoreBackup(backupDirectory, gameRoot) {
  const backup = directoryRoot(backupDirectory);
  const manifestPath = resolveUnderRoot(backup, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`Backup manifest not found: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.schema !== 'linli-nocturne.backup' || manifest.schemaVersion !== 1) throw new Error('Unsupported backup manifest');
  const root = directoryRoot(gameRoot);
  const paths = uniquePaths((manifest.files ?? []).map(item => item.path));
  const files = manifest.files.map(item => {
    const source = resolveUnderRoot(backup, item.path);
    const target = resolveUnderRoot(root, item.path);
    if (!existsSync(source) || !statSync(source).isFile() || sha256File(source) !== item.sha256) throw new Error(`Backup integrity check failed: ${item.path}`);
    if (!existsSync(target) || !statSync(target).isFile()) throw new Error(`Restore target is missing: ${item.path}`);
    return { source, target, path: item.path };
  });
  for (const file of files) copyFileSync(file.source, file.target);
  return { ...manifest, files: paths.map(path => manifest.files.find(item => item.path === path)) };
}
