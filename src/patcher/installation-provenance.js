import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inspectFrontendArchive } from './frontend-archive.js';
import { readGameVersion, verifyBaseline } from './baseline-verifier.js';

/**
 * Classifies a game directory before any patch is applied.
 *
 * The pristine baseline is deliberately supplied by the caller. It must come
 * from a clean Steam installation or a verified original backup, never from a
 * directory that may already contain a third-party patch.
 */
export function classifyInstallation({ gameRoot, baseline, expectedVersion = baseline?.version }) {
  const metadata = readGameVersion(gameRoot);
  if (expectedVersion && metadata.version !== expectedVersion) {
    return {
      state: 'unsupported-version',
      version: metadata.version,
      expectedVersion,
      baseline: null,
      signals: [],
    };
  }

  const baselineResult = verifyBaseline(gameRoot, baseline);
  const signals = [];
  const feappPath = join(gameRoot, `${metadata.version}/resources/feapp.dat`);
  if (existsSync(feappPath)) {
    try {
      const frontend = inspectFrontendArchive(readFileSync(feappPath));
      const localRoutes = Object.entries(frontend.routes)
        .filter(([, route]) => route.status === 'local')
        .map(([path]) => path);
      if (frontend.markerPresent) signals.push('known-patch-marker');
      if (localRoutes.length > 0) signals.push(`local-routes:${localRoutes.length}`);
    } catch {
      signals.push('frontend-unreadable');
    }
  }

  let state = 'pristine';
  if (!baselineResult.ok) state = signals.length > 0 ? 'modified' : 'unknown';
  return { state, version: metadata.version, baseline: baselineResult, signals };
}
