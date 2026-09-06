import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTALL_CONFIRMATION, parseInstallArgs } from '../src/patcher/install-command.js';

test('install command defaults to a read-only plan', () => {
  const options = parseInstallArgs(['D:/game', 'D:/backups']);
  assert.equal(options.apply, false);
  assert.equal(options.confirmed, false);
  assert.equal(options.gameRoot, 'D:/game');
  assert.equal(options.backupRoot, 'D:/backups');
});

test('install command requires the exact confirmation marker for writes', () => {
  assert.equal(parseInstallArgs(['--apply', '--confirm=' + INSTALL_CONFIRMATION, 'D:/game']).confirmed, true);
  assert.equal(parseInstallArgs(['--apply', '--confirm=wrong', 'D:/game']).confirmed, false);
});

test('install command rejects unknown flags', () => {
  assert.throws(() => parseInstallArgs(['--force', 'D:/game']), /未知参数/);
});
