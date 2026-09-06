import { canonicalPath, isWithin, uniquePaths } from './path-guard.js';
import { classifyInstallation } from './installation-provenance.js';

export const INSTALL_TARGETS = Object.freeze([
  '0.0.9.627/resources/feapp.dat',
  '0.0.9.627/plugins/Studio/NutStudioUI.dll',
  '0.0.9.627/plugins/Container/NutContainerPlugin.dll',
]);

function normalizeServiceUrl(serviceUrl) {
  if (!serviceUrl || !/^https?:\/\/[^/]+/u.test(serviceUrl)) throw new Error('A valid serviceUrl is required');
  return serviceUrl.replace(/\/$/u, '');
}

/**
 * Build a write-free installation plan. The returned plan is the contract an
 * installer can later execute; this function never creates backups or writes
 * to the game directory.
 */
export function createInstallPlan({ gameRoot, baseline, backupRoot, serviceUrl = 'http://127.0.0.1:27149', targets = INSTALL_TARGETS } = {}) {
  if (!gameRoot || !baseline) throw new Error('gameRoot and baseline are required');
  const root = canonicalPath(gameRoot);
  const backup = canonicalPath(backupRoot ?? `${root}-backups`);
  const normalizedTargets = uniquePaths(targets);
  const classification = classifyInstallation({ gameRoot: root, baseline });
  const blockers = [];
  if (isWithin(root, backup) || isWithin(backup, root)) blockers.push('backup-root-must-be-outside-game-root');
  if (classification.state !== 'pristine') blockers.push(`installation-state:${classification.state}`);
  const url = normalizeServiceUrl(serviceUrl);
  return {
    schema: 'linli-nocturne.install-plan',
    schemaVersion: 1,
    dryRun: true,
    canApply: blockers.length === 0,
    blockers,
    gameRoot: root,
    backupRoot: backup,
    version: classification.version,
    installation: classification,
    serviceUrl: url,
    targets: normalizedTargets,
    steps: [
      { id: 'verify-pristine', writes: false },
      { id: 'create-backup', writes: true, paths: normalizedTargets },
      { id: 'patch-frontend', writes: true, path: normalizedTargets[0] },
      { id: 'patch-native-entrypoints', writes: true, paths: normalizedTargets.slice(1) },
      { id: 'verify-patched-files', writes: false },
      { id: 'rollback-from-backup', writes: true, paths: normalizedTargets },
    ],
  };
}
