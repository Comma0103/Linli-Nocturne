import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export const COMPAT_ENDPOINTS = Object.freeze([
  '/signIn', '/getUserInfo', '/letter/send', '/letter/list', '/letter/detail', '/letter/unread_count',
  '/letter/share', '/letter/resend', '/addToPlaylist', '/delFromPlaylist', '/searchPlaylist'
]);

export const MIDI_COMPAT_ENDPOINTS = Object.freeze([
  '/genObjectUploadUrl', '/midi/generate', '/midi/getGenerateResult', '/midi/cancelGenerate',
  '/midi/deleteJob', '/midi/listJobs', '/midi/batchGetResult', '/midi/importShareCode', '/searchUserSongs'
]);

const PATCH_MARKER = '/*LinliNocturnePatch:compat-routes-v1*/';

// The currently deployed OliviaSoul-compatible archive has the normal
// compatibility marker but still lets offline mode suppress the user-song
// tab. These two audited substitutions are kept separate so they can be
// applied safely to that known patched archive without reapplying route work.
export const OFFLINE_USER_SONG_PATCHES = Object.freeze([
  { id: 'offline-user-song-fetch', from: '$e();if(w.value){l.value=!1;return}await xe()', to: '$e();await xe()', expected: 1 },
  { id: 'offline-user-song-priority', from: 'w.value?oe.getSongsByStyle(R.value).filter(q=>f.isDownloaded(q.id)):Q.value?te.value:N.value', to: 'Q.value?te.value:w.value?oe.getSongsByStyle(R.value).filter(q=>f.isDownloaded(q.id)):N.value', expected: 1 },
]);

export const OFFLINE_MIDI_SUBMIT_PATCHES = Object.freeze([
  { id: 'offline-midi-submit-handler', from: 'const p=Lt(),{midiWorkflowState:d,proJobInfo:h,midiUploadKey:f,midiFilToFakeVideoMap:y}=de(p),g=b(""),{proStartMidiJob:w,proCancelMidiJob:x}=p', to: 'const p=Lt(),{midiWorkflowState:d,proJobInfo:h,midiUploadKey:f,midiFilToFakeVideoMap:y}=de(p),g=b(""),{proStartMidiJob:w,liteStartMidiJob:K,proCancelMidiJob:x}=p', expected: 1 },
  { id: 'offline-midi-submit-call', from: 'S?$():await w(f.value,g.value)', to: 'S?$():(await K(f.value,g.value),await p.liteStartPoll())', expected: 1 },
  { id: 'offline-user-song-recovery-dedupe', from: '$e();await xe();await Lt().liteStartPoll();await Lt().liteStartPoll();await Lt().liteStartPoll(),!(q!==c||!Q.value)', to: '$e();await xe();await Lt().liteStartPoll(),!(q!==c||!Q.value)', expected: 1 },
  { id: 'offline-upload-section', from: '!o(w)||o(D).length>0?', to: '!o(w)||o(D).length>0||o(Ss)?', expected: 1 },
  { id: 'offline-user-tab-default', from: 'J=b(R.value),Q=j(()=>J.value===so)', to: 'J=b(w.value?so:R.value),Q=j(()=>J.value===so)', expected: 1 },
  { id: 'offline-user-tab-load', from: 'He(async()=>{if(w.value){await W().finally(()=>{a.value=!1}),Po();return}', to: 'He(async()=>{if(w.value){await P();await W().finally(()=>{a.value=!1}),Po();return}', expected: 1 },
  { id: 'offline-user-tab-empty-state', from: 'o(w)&&o(Ce).length===0?', to: 'o(w)&&!o(Q)&&o(Ce).length===0?', expected: 1 },
  { id: 'offline-user-song-download-bypass', from: 'q.filter(Be=>!f.isDownloaded(Be.id)&&!f.isDownloading(Be.id)).forEach(Be=>f.startDownload(Be))', to: 'q.filter(Be=>!f.isDownloaded(Be.id)&&!f.isDownloading(Be.id)).forEach(Be=>Q.value?f.downloadMap.set(Be.id,{progress:100,state:"completed",totalBytes:0,downloadedBytes:0,downloadSpeed:0,styleType:Be.styleType,name:Be.name,nameKey:Be.nameKey,performanceType:Be.performanceType??""}):f.startDownload(Be))', expected: 1 },
  { id: 'offline-songlist-play-url', from: 'Ct({cmd:"play",song:Le})', to: 'Ct({cmd:"play",url:W,loop:!1,mute:!1})', expected: 1 },
  { id: 'offline-songlist-toggle-url', from: 'Ct({cmd:"play",song:K})', to: 'Ct({cmd:"play",url:K.videoUrl??"",loop:!1,mute:!1})', expected: 1 },
]);

// These are narrow, version-specific substitutions audited against client
// 0.0.9.627. Each replacement is counted before writing anything.
export const OFFLINE_FEATURE_PATCHES = Object.freeze([
  { id: 'mailbox-entry', from: 'N3=!1,Ss=!1,wa=({onComplete', to: 'N3=!0,Ss=!1,wa=({onComplete', expected: 1 },
  { id: 'offline-widgets', from: 'e.isOfflineMode&&(l.value.mailWidget!==!1&&(l.value.mailWidget=!1),l.value.musicWidget!==!1&&(l.value.musicWidget=!1))', to: 'l.value.mailWidget=!0,l.value.musicWidget=!0', expected: 1 },
  { id: 'offline-request-block', from: 'if(t.isOfflineMode)throw new Ol(e)', to: 'if(!1)throw new Ol(e)', expected: 1 },
  { id: 'write-letter-gate', from: '"hide-write":o(p)||!o(N3)', to: '"hide-write":!1', expected: 1 },
  { id: 'mail-fetch', from: 'He(()=>{p.value||d.fetchMailList(!0)})', to: 'He(()=>{d.fetchMailList(!0)})', expected: 1 },
  { id: 'letter-poll', from: 's.isOfflineMode||(s.appMode===Se.PRO?Lt().proRestoreFromApi():s.appMode===Se.LITE&&(Lt().liteStartPoll(),uo().startPolling()))', to: 's.appMode===Se.PRO?Lt().proRestoreFromApi():s.appMode===Se.LITE&&(s.isOfflineMode?uo().startPolling():(Lt().liteStartPoll(),uo().startPolling()))', expected: 1 },
  { id: 'playlist-visibility', from: 'o(w)?Y("",!0):(r(),_(se,{key:0},[o(a)?(r(),_("div",c4,', to: '(r(),_(se,{key:0},[o(a)?(r(),_("div",c4,', expected: 1 },
  { id: 'song-actions', from: '"hide-actions":o(w)', to: '"hide-actions":!1', expected: 1 },
  { id: 'player-controls', from: 'o(t)?Y("",!0):', to: '', expected: 4 },
  { id: 'midi-card', from: '!o(w)&&o(Ss)?', to: 'o(Ss)?', expected: 1 },
  { id: 'upload-tab', from: 'o(w)?Y("",!0):(r(),F(on,{key:0,index:so,class:"h-fit"},{default:V(()=>[n("div",Y3,v(o(t)("studio_user_upload_tab")),1)]),_:1}))', to: '(r(),F(on,{key:0,index:so,class:"h-fit"},{default:V(()=>[n("div",Y3,v(o(t)("studio_user_upload_tab")),1)]),_:1}))', expected: 1 },
  { id: 'upload-tab-fetch', from: 'P=async()=>{J.value=so,l.value=!0;const q=T();$e(),await xe(),!(q!==c||!Q.value)&&(l.value=!1,await qe(),X(eo(ct.value)))}', to: 'P=async()=>{J.value=so,l.value=!0;const q=T();$e();if(w.value){l.value=!1;return}await xe(),!(q!==c||!Q.value)&&(l.value=!1,await qe(),X(eo(ct.value)))}', expected: 1 },
  { id: 'offline-playlist-fetch', from: 'He(async()=>{if(w.value){a.value=!1;return}await Ua(),await W().finally(()=>{a.value=!1}),Po()});', to: 'He(async()=>{if(w.value){await W().finally(()=>{a.value=!1}),Po();return}await Ua(),await W().finally(()=>{a.value=!1}),Po()});', expected: 1 },
]);

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

function occurrenceCount(source, needle) { return source.split(needle).length - 1; }

export function inspectOfflineUserSongPatches(source) {
  return Object.fromEntries(OFFLINE_USER_SONG_PATCHES.map(patch => [patch.id, {
    expected: patch.expected,
    count: occurrenceCount(source, patch.from),
    status: occurrenceCount(source, patch.from) === patch.expected ? 'ready' : 'mismatch',
  }]));
}

function applyKnownPatchSet(buffer, patches, label) {
  const inspected = inspectFrontendArchive(buffer);
  if (!inspected.markerPresent) throw new Error(`${label} requires the known Linli Nocturne archive marker`);
  const plan = Object.fromEntries(patches.map(patch => [patch.id, {
    expected: patch.expected,
    count: occurrenceCount(inspected.source, patch.from),
    appliedCount: occurrenceCount(inspected.source, patch.to),
    status: occurrenceCount(inspected.source, patch.from) === patch.expected ? 'ready'
      : occurrenceCount(inspected.source, patch.from) === 0 && occurrenceCount(inspected.source, patch.to) === 1 ? 'applied' : 'mismatch',
  }]));
  const invalid = patches.filter(patch => plan[patch.id].status === 'mismatch');
  if (invalid.length) throw new Error(`${label} contract mismatch: ${invalid.map(patch => `${patch.id}(${plan[patch.id].count}/${patch.expected})`).join(', ')}`);
  const ready = patches.filter(patch => plan[patch.id].status === 'ready');
  if (ready.length === 0) return { alreadyPatched: true, mainPath: inspected.mainPath, buffer: new Uint8Array(buffer), plan };
  const source = ready.reduce((text, patch) => text.replace(patch.from, patch.to), inspected.source);
  return { alreadyPatched: false, mainPath: inspected.mainPath, buffer: zipSync({ ...inspected.entries, [inspected.mainPath]: strToU8(source) }), plan };
}

export function applyOfflineUserSongPatch(buffer) {
  return applyKnownPatchSet(buffer, OFFLINE_USER_SONG_PATCHES, 'Offline user-song patch');
}

export function applyOfflineMidiFeaturePatch(buffer) {
  return applyKnownPatchSet(buffer, [...OFFLINE_USER_SONG_PATCHES, ...OFFLINE_MIDI_SUBMIT_PATCHES], 'Offline MIDI feature patch');
}

export function inspectOfflineFeaturePatches(source) {
  return Object.fromEntries(OFFLINE_FEATURE_PATCHES.map(patch => [patch.id, {
    expected: patch.expected,
    count: occurrenceCount(source, patch.from),
    status: occurrenceCount(source, patch.from) === patch.expected ? 'ready' : 'mismatch',
  }]));
}

function applyOfflineFeaturePatches(source) {
  const inspection = inspectOfflineFeaturePatches(source);
  const invalid = OFFLINE_FEATURE_PATCHES.filter(patch => inspection[patch.id].status !== 'ready');
  if (invalid.length) throw new Error(`Offline feature contract mismatch: ${invalid.map(patch => `${patch.id}(${inspection[patch.id].count}/${patch.expected})`).join(', ')}`);
  let patched = OFFLINE_FEATURE_PATCHES.reduce((text, patch) => text.replace(patch.from, patch.to), source);
  const musicGate = 'N3=!0,Ss=!1,wa=({onComplete';
  if (occurrenceCount(patched, musicGate) !== 1) throw new Error('Offline feature contract mismatch: music-feature-gate');
  patched = patched.replace(musicGate, 'N3=!0,Ss=!0,wa=({onComplete');
  return patched;
}

export function inspectFrontendArchive(buffer) {
  const entries = unzipSync(new Uint8Array(buffer));
  const mainPath = findMainEntry(entries);
  const source = strFromU8(entries[mainPath]);
  return { entries, mainPath, source, markerPresent: source.includes(PATCH_MARKER), routes: Object.fromEntries(COMPAT_ENDPOINTS.map(endpoint => [endpoint, routeState(source, endpoint)])) };
}

export function planFrontendPatch(buffer, { serviceUrl, includeMidi = false, includeOfflineFeatures = false }) {
  if (!serviceUrl || !/^https?:\/\/[^/]+/u.test(serviceUrl)) throw new Error('A valid serviceUrl is required');
  const inspected = inspectFrontendArchive(buffer);
  if (inspected.markerPresent) throw new Error('Frontend archive already contains the current patch marker');
  const endpoints = includeMidi ? [...COMPAT_ENDPOINTS, ...MIDI_COMPAT_ENDPOINTS] : [...COMPAT_ENDPOINTS];
  const routes = Object.fromEntries(endpoints.map(endpoint => [endpoint, routeState(inspected.source, endpoint)]));
  const mismatches = endpoints.filter(endpoint => routes[endpoint].status === 'mismatch');
  if (mismatches.length) throw new Error(`Frontend endpoint contract mismatch: ${mismatches.join(', ')}`);
  const offline = inspectOfflineFeaturePatches(inspected.source);
  if (includeOfflineFeatures) {
    const invalid = Object.values(offline).filter(item => item.status !== 'ready');
    if (invalid.length) throw new Error('Offline feature contract mismatch');
  }
  return { mainPath: inspected.mainPath, entryCount: Object.keys(inspected.entries).length, serviceUrl: serviceUrl.replace(/\/$/u, ''), includeMidi, includeOfflineFeatures, endpoints, offline, alreadyLocal: endpoints.filter(endpoint => routes[endpoint].status === 'local'), needsPatch: endpoints.filter(endpoint => routes[endpoint].status === 'remote') };
}

export function applyFrontendPatch(buffer, options) {
  const plan = planFrontendPatch(buffer, options);
  const inspected = inspectFrontendArchive(buffer);
  if (plan.needsPatch.length === 0 && !plan.includeOfflineFeatures) return { ...plan, alreadyPatched: true, buffer: new Uint8Array(buffer) };
  let source = PATCH_MARKER + inspected.source;
  for (const endpoint of plan.needsPatch) {
    source = source.replace(`"${endpoint}"`, `"${plan.serviceUrl}/toy${endpoint}"`).replace(`\\"${endpoint}\\"`, `\\"${plan.serviceUrl}/toy${endpoint}\\"`);
  }
  if (plan.includeOfflineFeatures) source = applyOfflineFeaturePatches(source);
  const entries = { ...inspected.entries, [plan.mainPath]: strToU8(source) };
  return { ...plan, alreadyPatched: false, buffer: zipSync(entries, { level: 6 }) };
}
