import { inspectFrontendArchive } from './frontend-archive.js';

export const MIDI_ENDPOINTS = Object.freeze([
  '/genObjectUploadUrl',
  '/midi/generate',
  '/midi/getGenerateResult',
  '/midi/cancelGenerate',
  '/midi/deleteJob',
  '/midi/listJobs',
  '/midi/batchGetResult',
  '/midi/importShareCode',
  '/searchUserSongs',
]);

export const OFFLINE_FEATURE_SIGNATURES = Object.freeze([
  { id: 'entry-feature-gate', meaning: '信箱和音乐入口的共享功能开关', needle: 'N3=!1,Ss=!1,wa=({onComplete' },
  { id: 'offline-widget-lock', meaning: '离线模式锁定信箱和音乐小组件', needle: 'e.isOfflineMode&&(l.value.mailWidget!==!1' },
  { id: 'offline-request-block', meaning: '离线模式阻止 HTTP 请求', needle: 'if(t.isOfflineMode)throw new Ol(e)' },
  { id: 'offline-midi-card', meaning: '离线模式隐藏 MIDI 上传卡片', needle: '!o(w)&&o(Ss)?' },
  { id: 'offline-upload-tab', meaning: '离线模式隐藏用户上传页签', needle: 'o(w)?Y("",!0):(r(),F(on' },
  { id: 'midi-job-list', meaning: 'MIDI 任务列表接口', needle: 'Te.get("/midi/listJobs"' },
  { id: 'midi-job-result', meaning: 'MIDI 任务结果接口', needle: 'Te.get("/midi/getGenerateResult"' },
  { id: 'midi-upload-url', meaning: '对象存储上传地址接口', needle: 'Te.post("/genObjectUploadUrl"' },
]);

function count(source, needle) { return source.split(needle).length - 1; }

export function auditFrontendSource(source) {
  const midi = Object.fromEntries(MIDI_ENDPOINTS.map(endpoint => [endpoint, {
    quotedCount: count(source, `"${endpoint}"`),
    present: source.includes(endpoint),
  }]));
  const offlineFeatures = Object.fromEntries(OFFLINE_FEATURE_SIGNATURES.map(signature => [signature.id, {
    meaning: signature.meaning,
    present: source.includes(signature.needle),
    occurrences: count(source, signature.needle),
  }]));
  return {
    schema: 'linli-nocturne.frontend-audit.v1',
    midi,
    offlineFeatures,
    conclusions: {
      hasMidiUploadFlow: midi['/genObjectUploadUrl'].present && midi['/midi/generate'].present,
      hasMidiPollingFlow: midi['/midi/getGenerateResult'].present && midi['/midi/listJobs'].present,
      offlineUiGatesPresent: Object.entries(offlineFeatures)
        .filter(([id]) => id.startsWith('offline-'))
        .every(([, feature]) => feature.present),
    },
  };
}

export function auditFrontendArchive(buffer) {
  const inspected = inspectFrontendArchive(buffer);
  return { mainPath: inspected.mainPath, entryCount: Object.keys(inspected.entries).length, ...auditFrontendSource(inspected.source) };
}
