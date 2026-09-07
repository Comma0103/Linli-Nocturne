// Only explicitly supported metadata is persisted. Provider payloads/prompts are never copied.
const scalar = value => typeof value === 'string' ? value.slice(0, 160) : typeof value === 'number' || typeof value === 'boolean' || value === null ? value : undefined;
const keys = new Set(['id','version','revision','sha256','effectiveSha256','chars','provider','harness','persona','memory','fallback',
  'model','requestedModel','protocol','engineSha256','bridgeSha256','weather','mood','status','code','sequence','reason','rewriteCount',
  'policy','action','enabled','maxChars','contextChars','signature','sourceLetterId','startedAt','endedAt','violationCount','temporalAction','timeOfDay']);
const nested = new Set(['assets','stages','calls','providerFailures','actualModule','module','base','baseMetadata','execution','harness','outputPolicy','persona','memory','configured','warnings','sources','diagnostics','qualityChecks','failedColumns']);
export function executionTrace(value, depth = 0) {
  if (depth > 8) return undefined;
  if (Array.isArray(value)) return value.slice(0, 100).map(item => executionTrace(item, depth + 1));
  if (!value || typeof value !== 'object') return scalar(value);
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (nested.has(key) && item && typeof item === 'object') result[key] = executionTrace(item, depth + 1);
    else if (keys.has(key)) result[key] = scalar(item);
  }
  return result;
}
