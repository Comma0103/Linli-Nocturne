import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackup, restoreBackup } from '../src/patcher/backup-manager.js';
import { readGameVersion, sha256File, verifyBaseline } from '../src/patcher/baseline-verifier.js';

test('backup manager creates a hashed copy and restores it', () => {
  const root = mkdtempSync(join(tmpdir(), 'Linli Game Root With Spaces-'));
  const backups = mkdtempSync(join(tmpdir(), 'Linli Backups With Spaces-'));
  mkdirSync(join(root, 'resources'), { recursive: true });
  writeFileSync(join(root, 'version.json'), JSON.stringify({ client: 'ToyPianist-win-x64-rel-v0.0.9.627' }));
  const file = join(root, 'resources', 'feapp.dat');
  writeFileSync(file, 'original-client');
  assert.equal(readGameVersion(root).version, '0.0.9.627');
  assert.equal(verifyBaseline(root, { version: '0.0.9.627', files: [{ path: 'resources/feapp.dat', sha256: sha256File(file) }] }).ok, true);
  const result = createBackup(root, ['resources/feapp.dat'], backups, 'test-backup');
  assert.equal(result.manifest.files.length, 1);
  writeFileSync(file, 'patched-client');
  restoreBackup(result.destination, root);
  assert.equal(readFileSync(file, 'utf8'), 'original-client');
});

test('backup manager rejects traversal paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'linli-game-'));
  const backups = mkdtempSync(join(tmpdir(), 'linli-backups-'));
  assert.throws(() => createBackup(root, ['../outside.bin'], backups, 'unsafe'), /Unsafe game-relative path/);
});
