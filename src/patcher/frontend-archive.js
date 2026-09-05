import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export const COMPAT_ENDPOINTS = Object.freeze([
  '/signIn', '/getUserInfo', '/letter/send', '/letter/list', '/letter/detail', '/letter/unread_count',
  '/letter/share', '/letter/resend', '/addToPlaylist', '/delFromPlaylist', '/searchPlaylist'
]);

const PATCH_MARKER = '/*LinliNocturnePatch:compat-routes-v1*/';

function findMainEntry(entries) {
  const candidates = Object.keys(entries).filter(path => /^assets\/main-[^/]+\.js$/u.test(path));
  if (candidates.length !== 1) throw new Error(`Expected one frontend main entry, found ${candidates.length}`);
  return candidates[0];
}

function countQuoted(source, value) {
  return (source.split(`"${value}"`).length - 1) + (source.split(`\\"${value}\\"`).length - 1);
}

function routeState(source, endpoint) {
  const remoteCount = countQuoted(source, endpoint);
  const localCount = source.split(`/toy${endpoint}`).length - 1;
  if (remoteCount === 1 && localCount === 0) return { status: 'remote', count: remoteCount };
  if (remoteCount === 0 && localCount === 1) return { status: 'local', count: localCount };
  return { status: 'mismatch', count: remoteCount + localCount };
}

export function inspectFrontendArchive(buffer) {
  const entries = unzipSync(new Uint8Array(buffer));
  const mainPath = findMainEntry(entries);
  const source = strFromU8(entries[mainPath]);
  return { entries, mainPath, source, markerPresent: source.includes(PATCH_MARKER), routes: Object.fromEntries(COMPAT_ENDPOINTS.map(endpoint => [endpoint, routeState(source, endpoint)])) };
}

export function planFrontendPatch(buffer, { serviceUrl }) {
  if (!serviceUrl || !/^https?:\/\/[^/]+/u.test(serviceUrl)) throw new Error('A valid serviceUrl is required');
  const inspected = inspectFrontendArchive(buffer);
  if (inspected.markerPresent) throw new Error('Frontend archive already contains the current patch marker');
  const mismatches = COMPAT_ENDPOINTS.filter(endpoint => inspected.routes[endpoint].status === 'mismatch');
  if (mismatches.length) throw new Error(`Frontend endpoint contract mismatch: ${mismatches.join(', ')}`);
  return { mainPath: inspected.mainPath, entryCount: Object.keys(inspected.entries).length, serviceUrl: serviceUrl.replace(/\/$/u, ''), endpoints: [...COMPAT_ENDPOINTS], alreadyLocal: COMPAT_ENDPOINTS.filter(endpoint => inspected.routes[endpoint].status === 'local'), needsPatch: COMPAT_ENDPOINTS.filter(endpoint => inspected.routes[endpoint].status === 'remote') };
}

export function applyFrontendPatch(buffer, options) {
  const plan = planFrontendPatch(buffer, options);
  const inspected = inspectFrontendArchive(buffer);
  if (plan.needsPatch.length === 0) return { ...plan, alreadyPatched: true, buffer: new Uint8Array(buffer) };
  let source = PATCH_MARKER + inspected.source;
  for (const endpoint of plan.needsPatch) {
    source = source.replace(`"${endpoint}"`, `"${plan.serviceUrl}/toy${endpoint}"`).replace(`\\"${endpoint}\\"`, `\\"${plan.serviceUrl}/toy${endpoint}\\"`);
  }
  const entries = { ...inspected.entries, [plan.mainPath]: strToU8(source) };
  return { ...plan, alreadyPatched: false, buffer: zipSync(entries, { level: 6 }) };
}
