import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { resolveUnderRoot } from './path-guard.js';

export class UnsupportedGameVersionError extends Error {
  constructor(version) { super(`Unsupported game version: ${version}`); this.name = 'UnsupportedGameVersionError'; }
}

export function readGameVersion(gameRoot) {
  const versionFile = join(gameRoot, 'version.json');
  if (!existsSync(versionFile)) throw new Error(`Game version metadata not found: ${versionFile}`);
  const metadata = JSON.parse(readFileSync(versionFile, 'utf8'));
  const match = String(metadata.client ?? '').match(/v(\d+\.\d+\.\d+(?:\.\d+)?)/);
  if (!match) throw new Error('Game version metadata has no semantic client version');
  return { version: match[1], metadata, versionFile };
}

export function sha256File(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }

export function verifyBaseline(gameRoot, baseline) {
  const result = { version: baseline.version, ok: true, files: [] };
  for (const expected of baseline.files ?? []) {
    const path = resolveUnderRoot(gameRoot, expected.path);
    if (!existsSync(path)) { result.ok = false; result.files.push({ path: expected.path, status: 'missing' }); continue; }
    const actual = sha256File(path);
    const status = actual === expected.sha256 ? 'unchanged' : 'changed';
    if (status !== 'unchanged') result.ok = false;
    result.files.push({ path: expected.path, status, expected: expected.sha256, actual });
  }
  return result;
}

export function requireSupportedVersion(version, supportedVersions) {
  if (!supportedVersions.includes(version)) throw new UnsupportedGameVersionError(version);
  return version;
}
