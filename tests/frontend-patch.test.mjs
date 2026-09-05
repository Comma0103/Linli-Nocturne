import test from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { applyFrontendPatch, applyOfflineMidiFeaturePatch, applyOfflineUserSongPatch, inspectFrontendArchive, OFFLINE_FEATURE_PATCHES, planFrontendPatch } from '../src/patcher/frontend-archive.js';

const endpoints = ['/signIn', '/getUserInfo', '/letter/send', '/letter/list', '/letter/detail', '/letter/unread_count', '/letter/share', '/letter/resend', '/addToPlaylist', '/delFromPlaylist', '/searchPlaylist'];
const midiEndpoints = ['/genObjectUploadUrl', '/midi/generate', '/midi/getGenerateResult', '/midi/cancelGenerate', '/midi/deleteJob', '/midi/listJobs', '/midi/batchGetResult', '/midi/importShareCode', '/searchUserSongs'];
const fixture = zipSync({ 'assets/main-fixture.js': strToU8(endpoints.map(endpoint => `fetch("${endpoint}")`).join(';')), 'assets/keep.txt': strToU8('keep') });

test('frontend patch plan validates the archive contract', () => {
  const plan = planFrontendPatch(fixture, { serviceUrl: 'http://127.0.0.1:27149' });
  assert.equal(plan.mainPath, 'assets/main-fixture.js');
  assert.equal(plan.entryCount, 2);
});

test('frontend patch rewrites routes and preserves unrelated assets', () => {
  const result = applyFrontendPatch(fixture, { serviceUrl: 'http://127.0.0.1:27149/' });
  const inspected = inspectFrontendArchive(result.buffer);
  const source = strFromU8(inspected.entries[inspected.mainPath]);
  assert.match(source, /LinliNocturnePatch:compat-routes-v1/);
  assert.match(source, /http:\/\/127\.0\.0\.1:27149\/toy\/letter\/send/);
  assert.equal(strFromU8(inspected.entries['assets/keep.txt']), 'keep');
});

test('frontend patch refuses a second application', () => {
  const result = applyFrontendPatch(fixture, { serviceUrl: 'http://127.0.0.1:27149' });
  assert.throws(() => planFrontendPatch(result.buffer, { serviceUrl: 'http://127.0.0.1:27149' }), /already contains/);
});

test('frontend patch can opt into the audited MIDI routes', () => {
  const midiFixture = zipSync({ 'assets/main-midi.js': strToU8([...endpoints, ...midiEndpoints].map(endpoint => `fetch("${endpoint}")`).join(';')) });
  const result = applyFrontendPatch(midiFixture, { serviceUrl: 'http://127.0.0.1:27149', includeMidi: true });
  assert.equal(result.needsPatch.length, 20);
  const source = strFromU8(inspectFrontendArchive(result.buffer).entries['assets/main-midi.js']);
  assert.match(source, /http:\/\/127\.0\.0\.1:27149\/toy\/midi\/generate/);
});

test('frontend patch applies audited offline feature gates only when all signatures match', () => {
  const offlineSource = [...endpoints, ...midiEndpoints].map(endpoint => `fetch("${endpoint}")`).concat([
    ...OFFLINE_FEATURE_PATCHES.flatMap(patch => Array.from({ length: patch.expected }, () => patch.from)),
  ]).join(';');
  const fixtureWithOfflineGates = zipSync({ 'assets/main-offline.js': strToU8(offlineSource) });
  const result = applyFrontendPatch(fixtureWithOfflineGates, { serviceUrl: 'http://127.0.0.1:27149', includeMidi: true, includeOfflineFeatures: true });
  const source = strFromU8(inspectFrontendArchive(result.buffer).entries['assets/main-offline.js']);
  assert.match(source, /N3=!0,Ss=!0,wa=\(\{onComplete/);
  assert.doesNotMatch(source, /if\(t\.isOfflineMode\)throw new Ol\(e\)/);
  assert.doesNotMatch(source, /!o\(w\)&&o\(Ss\)\?/);
});

test('known patched archive can re-enable offline user-song fetch and display', () => {
  const source = [
    '/*LinliNocturnePatch:compat-routes-v1*/',
    '$e();if(w.value){l.value=!1;return}await xe()',
    'w.value?oe.getSongsByStyle(R.value).filter(q=>f.isDownloaded(q.id)):Q.value?te.value:N.value',
  ].join(';');
  const archive = zipSync({ 'assets/main-test.js': strToU8(source) });
  const result = applyOfflineUserSongPatch(archive);
  assert.equal(result.alreadyPatched, false);
  const patched = strFromU8(unzipSync(result.buffer)['assets/main-test.js']);
  assert.match(patched, /\$e\(\);await xe\(\)/);
  assert.match(patched, /Q\.value\?te\.value:w\.value\?oe\.getSongsByStyle/);
  assert.equal(applyOfflineUserSongPatch(result.buffer).alreadyPatched, true);
});

test('known patched archive uses the lite MIDI job handler in offline mode', () => {
  const source = [
    '/*LinliNocturnePatch:compat-routes-v1*/',
    '$e();if(w.value){l.value=!1;return}await xe()',
    'w.value?oe.getSongsByStyle(R.value).filter(q=>f.isDownloaded(q.id)):Q.value?te.value:N.value',
    'const p=Lt(),{midiWorkflowState:d,proJobInfo:h,midiUploadKey:f,midiFilToFakeVideoMap:y}=de(p),g=b(""),{proStartMidiJob:w,proCancelMidiJob:x}=p',
    'S?$():await w(f.value,g.value)',
    '$e();await xe();await Lt().liteStartPoll();await Lt().liteStartPoll();await Lt().liteStartPoll(),!(q!==c||!Q.value)',
    '!o(w)||o(D).length>0?',
    'J=b(R.value),Q=j(()=>J.value===so)',
    'He(async()=>{if(w.value){await W().finally(()=>{a.value=!1}),Po();return}',
    'o(w)&&o(Ce).length===0?',
    'q.filter(Be=>!f.isDownloaded(Be.id)&&!f.isDownloading(Be.id)).forEach(Be=>f.startDownload(Be))',
    'Ct({cmd:"play",song:Le})',
    'Ct({cmd:"play",song:K})',
  ].join(';');
  const archive = zipSync({ 'assets/main-test.js': strToU8(source) });
  const result = applyOfflineMidiFeaturePatch(archive);
  assert.equal(result.alreadyPatched, false);
  const patched = strFromU8(unzipSync(result.buffer)['assets/main-test.js']);
  assert.match(patched, /liteStartMidiJob:K/);
  assert.match(patched, /S\?\$\(\):\(await K\(f\.value,g\.value\),await p\.liteStartPoll\(\)\)/);
  assert.match(patched, /\$e\(\);await xe\(\);await Lt\(\)\.liteStartPoll\(\),!\(q!==c\|\|!Q\.value\)/);
  assert.match(patched, /!o\(w\)\|\|o\(D\)\.length>0\|\|o\(Ss\)\?/);
  assert.match(patched, /J=b\(w\.value\?so:R\.value\),Q=j\(\(\)=>J\.value===so\)/);
  assert.match(patched, /if\(w\.value\)\{await P\(\);await W\(\)/);
  assert.match(patched, /o\(w\)&&!o\(Q\)&&o\(Ce\)\.length===0\?/);
  assert.match(patched, /Q\.value\?f\.downloadMap\.set\(Be\.id,\{progress:100,state:"completed"/);
  assert.match(patched, /Ct\(\{cmd:"play",url:W,loop:!1,mute:!1\}\)/);
  assert.match(patched, /Ct\(\{cmd:"play",url:K\.videoUrl\?\?"",loop:!1,mute:!1\}\)/);
});
