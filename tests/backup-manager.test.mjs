import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackup, restoreBackup } from '../src/patcher/backup-manager.js';

test('backup manager creates a hashed copy and restores it', () => {
  const root = mkdtempSync(join(tmpdir(), 'linli-game-'));
  const backups = mkdtempSync(join(tmpdir(), 'linli-backups-'));
  mkdirSync(join(root, 'resources'), { recursive: true });
  const file = join(root, 'resources', 'feapp.dat');
  writeFileSync(file, 'original-client');
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
