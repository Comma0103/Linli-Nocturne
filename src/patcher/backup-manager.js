import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sha256File } from './baseline-verifier.js';

function safeRelativePath(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new Error(`Unsafe game-relative path: ${relativePath}`);
  }
  return normalized;
}

function ensureInside(root, path) {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + '\\')) throw new Error(`Path escapes root: ${path}`);
  return resolvedPath;
}

export function createBackup(gameRoot, relativePaths, backupRoot, backupId = new Date().toISOString().replaceAll(':', '-')) {
  const root = resolve(gameRoot);
  const destination = ensureInside(backupRoot, join(backupRoot, backupId));
  mkdirSync(destination, { recursive: true });
  const files = [];
  for (const inputPath of relativePaths) {
    const safePath = safeRelativePath(inputPath);
    const source = ensureInside(root, join(root, safePath));
    if (!existsSync(source)) throw new Error(`Cannot back up missing file: ${safePath}`);
    const target = ensureInside(destination, join(destination, safePath));
    mkdirSync(resolve(target, '..'), { recursive: true });
    copyFileSync(source, target);
    files.push({ path: safePath, sha256: sha256File(target) });
  }
  const manifest = { schema: 'linli-nocturne.backup', backupId, gameRoot: root, files };
  writeFileSync(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return { destination, manifest };
}

export function restoreBackup(backupDirectory, gameRoot) {
  const manifestPath = join(backupDirectory, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`Backup manifest not found: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const root = resolve(gameRoot);
  for (const item of manifest.files ?? []) {
    const safePath = safeRelativePath(item.path);
    const source = ensureInside(backupDirectory, join(backupDirectory, safePath));
    if (!existsSync(source) || sha256File(source) !== item.sha256) throw new Error(`Backup integrity check failed: ${safePath}`);
    const target = ensureInside(root, join(root, safePath));
    mkdirSync(resolve(target, '..'), { recursive: true });
    copyFileSync(source, target);
  }
  return manifest;
}
