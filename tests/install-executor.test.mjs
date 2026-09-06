import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256File } from '../src/patcher/baseline-verifier.js';
import { createInstallPlan } from '../src/patcher/install-plan.js';
import { executeInstallPlan } from '../src/patcher/install-executor.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'linli-executor-root-'));
  const backupRoot = mkdtempSync(join(tmpdir(), 'linli-executor-backup-'));
  const targets = [
    '0.0.9.627/resources/feapp.dat',
    '0.0.9.627/plugins/Studio/NutStudioUI.dll',
    '0.0.9.627/plugins/Container/NutContainerPlugin.dll',
  ];
  for (const relative of targets) {
    const path = join(root, relative);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, `original:${relative}`);
  }
  writeFileSync(join(root, 'version.json'), JSON.stringify({ client: 'ToyPianist-win-x64-rel-v0.0.9.627' }));
  const baseline = { version: '0.0.9.627', files: targets.map(path => ({ path, sha256: sha256File(join(root, path)) })) };
  return { root, backupRoot, baseline };
}

test('executor backs up and applies a validated plan', () => {
  const { root, backupRoot, baseline } = fixture();
  const plan = createInstallPlan({ gameRoot: root, backupRoot, baseline });
  const result = executeInstallPlan(plan, {
    baseline, backupId: 'test-apply',
    frontendPatchFn: () => ({ buffer: Buffer.from('patched-frontend') }),
    nativePatchFn: () => ({ studio: { buffer: Buffer.from('patched-studio') }, container: { buffer: Buffer.from('patched-container') } }),
  });
  assert.equal(result.backup.manifest.backupId, 'test-apply');
  assert.equal(readFileSync(join(root, plan.targets[0]), 'utf8'), 'patched-frontend');
  assert.equal(readFileSync(join(root, plan.targets[1]), 'utf8'), 'patched-studio');
  assert.equal(readFileSync(join(root, plan.targets[2]), 'utf8'), 'patched-container');
});

test('executor rolls back if a later patch fails', () => {
  const { root, backupRoot, baseline } = fixture();
  const plan = createInstallPlan({ gameRoot: root, backupRoot, baseline });
  assert.throws(() => executeInstallPlan(plan, {
    baseline, backupId: 'test-rollback',
    frontendPatchFn: () => ({ buffer: Buffer.from('patched-frontend') }),
    nativePatchFn: () => { throw new Error('native signature mismatch'); },
  }), /rollback completed/);
  assert.equal(readFileSync(join(root, plan.targets[0]), 'utf8'), `original:${plan.targets[0]}`);
});

test('executor rechecks the installation and rejects a changed directory', () => {
  const { root, backupRoot, baseline } = fixture();
  const plan = createInstallPlan({ gameRoot: root, backupRoot, baseline });
  writeFileSync(join(root, plan.targets[0]), 'changed-after-plan');
  assert.throws(() => executeInstallPlan(plan, { baseline }), /changed after planning/);
});
