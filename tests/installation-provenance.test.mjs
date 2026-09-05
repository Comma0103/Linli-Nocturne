import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { classifyInstallation } from '../src/patcher/installation-provenance.js';
import { sha256File } from '../src/patcher/baseline-verifier.js';

const endpoints = ['/signIn', '/getUserInfo', '/letter/send', '/letter/list', '/letter/detail', '/letter/unread_count', '/letter/share', '/letter/resend', '/addToPlaylist', '/delFromPlaylist', '/searchPlaylist'];

function makeGame(source) {
  const root = mkdtempSync(join(tmpdir(), 'linli-provenance-'));
  const dir = join(root, '0.0.9.627', 'resources');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(root, 'version.json'), JSON.stringify({ client: 'ToyPianist-win-x64-rel-v0.0.9.627' }));
  writeFileSync(join(dir, 'feapp.dat'), zipSync({ 'assets/main-test.js': strToU8(source) }));
  return root;
}

function baselineFor(root) {
  const path = '0.0.9.627/resources/feapp.dat';
  return { version: '0.0.9.627', files: [{ path, sha256: sha256File(join(root, path)) }] };
}

test('pristine installation is recognized from the clean baseline', () => {
  const root = makeGame(endpoints.map(endpoint => `"${endpoint}"`).join(','));
  assert.equal(classifyInstallation({ gameRoot: root, baseline: baselineFor(root) }).state, 'pristine');
});

test('known local route changes are classified as third-party modified', () => {
  const root = makeGame(endpoints.map(endpoint => `"http://127.0.0.1:27149/toy${endpoint}"`).join(','));
  const baseline = { version: '0.0.9.627', files: [{ path: '0.0.9.627/resources/feapp.dat', sha256: '0'.repeat(64) }] };
  const result = classifyInstallation({ gameRoot: root, baseline });
  assert.equal(result.state, 'modified');
  assert.ok(result.signals.includes('local-routes:11'));
});

test('unrecognized changes are not silently treated as pristine', () => {
  const root = makeGame('"/unrelated-change"');
  const baseline = { version: '0.0.9.627', files: [{ path: '0.0.9.627/resources/feapp.dat', sha256: '0'.repeat(64) }] };
  assert.equal(classifyInstallation({ gameRoot: root, baseline }).state, 'unknown');
});
