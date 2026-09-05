export const RenderJobStatus = Object.freeze({
  QUEUED: 'queued', VALIDATING: 'validating', RENDERING: 'rendering', RETRY_WAIT: 'retry_wait',
  PRODUCED: 'produced', PUBLISHED: 'published', FAILED: 'failed', CANCELLED: 'cancelled', ARCHIVED: 'archived'
});

const transitions = new Map([
  ['queued', new Set(['validating', 'cancelled'])], ['validating', new Set(['rendering', 'failed', 'cancelled'])],
  ['rendering', new Set(['produced', 'retry_wait', 'failed', 'cancelled'])], ['retry_wait', new Set(['rendering', 'failed', 'cancelled'])],
  ['produced', new Set(['published', 'failed'])], ['published', new Set(['archived'])],
  ['failed', new Set(['queued', 'archived'])], ['cancelled', new Set(['archived'])], ['archived', new Set()]
]);

export function canTransition(from, to) { return transitions.get(from)?.has(to) ?? false; }

export function transitionJob(job, nextStatus, patch = {}) {
  if (!canTransition(job.status, nextStatus)) throw new Error(`Invalid RenderJob transition: ${job.status} -> ${nextStatus}`);
  return { ...job, ...patch, status: nextStatus, updatedAt: new Date().toISOString() };
}

export function createRenderJob({ kind, inputAssetIds = [], rendererId, rendererVersion }) {
  if (!kind || !rendererId || !rendererVersion) throw new Error('kind, rendererId and rendererVersion are required');
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), kind, inputAssetIds: [...inputAssetIds], rendererId, rendererVersion,
    status: RenderJobStatus.QUEUED, progress: 0, attempt: 0, errorCode: null, createdAt: now, updatedAt: now };
}
