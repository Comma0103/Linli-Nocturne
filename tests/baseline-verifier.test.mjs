import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGameVersion, requireSupportedVersion, sha256File, verifyBaseline } from '../src/patcher/baseline-verifier.js';

test('baseline verifier detects unchanged and changed client files', () => {
  const root = mkdtempSync(join(tmpdir(), 'linli-baseline-'));
  mkdirSync(join(root, '0.0.9.627', 'resources'), { recursive: true });
  const file = join(root, '0.0.9.627', 'resources', 'feapp.dat');
  writeFileSync(file, 'original');
  const baseline = { version: '0.0.9.627', files: [{ path: '0.0.9.627/resources/feapp.dat', sha256: sha256File(file) }] };
  assert.equal(verifyBaseline(root, baseline).ok, true);
  writeFileSync(file, 'modified');
  const result = verifyBaseline(root, baseline);
  assert.equal(result.ok, false);
  assert.equal(result.files[0].status, 'changed');
});

test('unknown game versions are rejected before patching', () => {
  assert.equal(requireSupportedVersion('0.0.9.627', ['0.0.9.627']), '0.0.9.627');
  assert.throws(() => requireSupportedVersion('0.0.9.999', ['0.0.9.627']), /Unsupported game version/);
});

test('game metadata accepts the four-part client version format', () => {
  const root = mkdtempSync(join(tmpdir(), 'linli-version-'));
  writeFileSync(join(root, 'version.json'), JSON.stringify({ client: 'ToyPianist-win-x64-rel-v0.0.9.627' }));
  assert.equal(readGameVersion(root).version, '0.0.9.627');
});
