import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { applyFrontendPatch } from './frontend-archive.js';
import { classifyInstallation } from './installation-provenance.js';
import { applyNativeFeaturePatch } from './native-feature-patch.js';
import { createBackup, restoreBackup } from './backup-manager.js';
import { resolveUnderRoot } from './path-guard.js';
import { sha256File } from './baseline-verifier.js';

function assertPlan(plan) {
  if (!plan || plan.schema !== 'linli-nocturne.install-plan' || plan.schemaVersion !== 1) {
    throw new Error('Unsupported installation plan');
  }
  if (plan.dryRun !== true || plan.canApply !== true || plan.blockers?.length) {
    throw new Error(`Installation plan is not applicable: ${(plan.blockers ?? []).join(', ') || 'unknown blocker'}`);
  }
  if (!Array.isArray(plan.targets) || plan.targets.length < 3) throw new Error('Installation plan has incomplete targets');
}

function atomicReplace(path, bytes) {
  const temporary = `${path}.linli-nocturne.tmp`;
  writeFileSync(temporary, bytes);
  try {
    renameSync(temporary, path);
  } catch (error) {
    try { unlinkSync(temporary); } catch {}
    throw error;
  }
}

function patchSummary(patch) {
  if (!patch || typeof patch !== 'object') return patch;
  const summary = { ...patch };
  delete summary.buffer;
  delete summary.studio;
  delete summary.container;
  return summary;
}

/** Apply a validated plan and automatically restore its backup on failure. */
export function executeInstallPlan(plan, {
  baseline,
  backupId,
  createBackupFn = createBackup,
  restoreBackupFn = restoreBackup,
  frontendPatchFn = applyFrontendPatch,
  nativePatchFn = applyNativeFeaturePatch,
} = {}) {
  assertPlan(plan);
  if (!baseline) throw new Error('baseline is required');
  const current = classifyInstallation({ gameRoot: plan.gameRoot, baseline, expectedVersion: plan.version });
  if (current.state !== 'pristine') throw new Error(`Installation changed after planning: ${current.state}`);

  const backup = createBackupFn(plan.gameRoot, plan.targets, plan.backupRoot, backupId);
  try {
    const frontendPath = resolveUnderRoot(plan.gameRoot, plan.targets[0]);
    const studioPath = resolveUnderRoot(plan.gameRoot, plan.targets[1]);
    const containerPath = resolveUnderRoot(plan.gameRoot, plan.targets[2]);
    const frontend = frontendPatchFn(readFileSync(frontendPath), {
      serviceUrl: plan.serviceUrl,
      includeMidi: true,
      includeOfflineFeatures: true,
    });
    atomicReplace(frontendPath, frontend.buffer);
    const native = nativePatchFn({ studio: readFileSync(studioPath), container: readFileSync(containerPath) });
    atomicReplace(studioPath, native.studio.buffer);
    atomicReplace(containerPath, native.container.buffer);
    const written = [frontendPath, studioPath, containerPath].map(path => ({
      path,
      sha256: sha256File(path),
    }));
    return {
      schema: 'linli-nocturne.install-result', schemaVersion: 1,
      gameRoot: plan.gameRoot, version: plan.version,
      backup: { destination: backup.destination, manifest: backup.manifest },
      frontend: { path: plan.targets[0], patches: patchSummary(frontend) },
      native: { paths: plan.targets.slice(1), patches: {
        studio: patchSummary(native.studio),
        container: patchSummary(native.container),
      } },
      written,
    };
  } catch (error) {
    try {
      restoreBackupFn(backup.destination, plan.gameRoot);
    } catch (rollbackError) {
      throw new Error(`Installation failed and rollback failed: ${error.message}; ${rollbackError.message}`, { cause: error });
    }
    throw new Error(`Installation failed; rollback completed: ${error.message}`, { cause: error });
  }
}
