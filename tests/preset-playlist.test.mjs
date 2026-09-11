import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { createLocalApp } from '../src/app/local-app.js';
import { applyOfflinePresetPlaylistPatch, applyPlaylistCoverFallbackPatch, inspectFrontendArchive } from '../src/patcher/frontend-archive.js';
import { coverSource } from './fixtures/playlist-cover.mjs';

// Audited 0.0.9.627 API functions: both callers originally send/return only IDs.
const source = `/*LinliNocturnePatch:compat-routes-v1*/
async function An(e,t){return Te.post("/toy/addToPlaylist",{itemType:e.itemType,itemId:e.itemId},t).then(s=>{const i=s.data;return{...i,itemId:i.itemId,performanceId:i.performanceId??"",songId:i.songId??"",id:i.itemId}})}
async function Us(e,t){return Te.get("/toy/searchPlaylist",{params:e,...t}).then(s=>({...s.data,list:s.data.list.map(i=>({...i,itemId:i.itemId,performanceId:i.performanceId??"",songId:i.songId??"",id:i.itemId}))}))}`;
const archive = text => zipSync({ 'assets/main-test.js': strToU8(text), 'assets/keep.txt': strToU8('keep') });

test('preset patch preserves assets, is idempotent and rejects missing or duplicate signatures', () => {
  const result = applyOfflinePresetPlaylistPatch(archive(source));
  assert.equal(result.alreadyPatched, false);
  assert.equal(applyOfflinePresetPlaylistPatch(result.buffer).alreadyPatched, true);
  assert.deepEqual(inspectFrontendArchive(result.buffer).entries['assets/keep.txt'], strToU8('keep'));
  assert.throws(() => applyOfflinePresetPlaylistPatch(archive(source.replace('async function Us', 'async function Changed'))), /contract mismatch/);
  assert.throws(() => applyOfflinePresetPlaylistPatch(archive(source + source)), /contract mismatch/);
  assert.throws(() => applyOfflinePresetPlaylistPatch(archive(source.replace('LinliNocturnePatch', 'OtherPatch'))), /marker/);
});

for (const snakeCase of [false, true]) test(`patched preset playlist restores legacy rows and persists playable metadata (${snakeCase ? 'Steam snake_case wire format' : 'camelCase'})`, async () => {
  const root = mkdtempSync(join(tmpdir(), 'linli-preset-playlist-'));
  const options = { dataRoot: root, settingsPath: join(root, 'missing.json'), port: 0, env: {} };
  let app = createLocalApp(options);
  let base;
  const toWire = value => Array.isArray(value) ? value.map(toWire)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/[A-Z]/gu, char => '_' + char.toLowerCase()), toWire(item)])) : value;
  const transport = async (path, body) => {
    // Steam's request interceptor converts keys recursively before sending JSON.
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(snakeCase ? toWire(body) : body) : undefined });
    assert.equal(response.status, 200);
    return response.json();
  };
  const view = { isOfflineMode: true };
  const song = { id: '1016', name: 'Preset test', nameKey: 'Solo_Test', iconUrl: 'test.png', audioDuration: 162, videoDuration: 165,
    performanceType: 'Solo', videoUrl: 'https://example.invalid/Solo_Test_TOD1730_NI_L.mp4',
    videoByTodView: [1200, 1730, 2000].map(tod => ({ tod, view: 'NI', url: `https://example.invalid/Solo_Test_TOD${tod}_NI_L.mp4`, coverUrl: 'cover.png', duration: 165 })) };
  let loads = 0;
  const catalog = { songs: [], async load() { loads++; await Promise.resolve(); this.songs = [song]; } };
  const patched = inspectFrontendArchive(applyOfflinePresetPlaylistPatch(archive(source)).buffer).source;
  const api = new Function('Te', 'Yn', 'Ie', 'pt', patched + ';return {add:An,list:Us};')(
    { post: transport, get: path => transport(path) }, () => catalog, () => view, { PGC_SONG: 2 });
  const check = item => {
    assert.equal(item.itemId, '1016');
    assert.equal(item.id, '1016');
    assert.equal(item.songId, '1016');
    assert.equal(item.name, song.name);
    assert.equal(item.nameKey, song.nameKey);
    assert.equal(item.iconUrl, song.iconUrl);
    assert.equal(item.videoDuration, 165);
    assert.equal(item.duration, 162);
    assert.equal(item.performanceType, 'Solo');
    assert.equal(item.videoUrl, song.videoUrl);
    assert.deepEqual(item.videoByTodView, song.videoByTodView);
  };
  try {
    await app.start(); base = `http://127.0.0.1:${app.server.address().port}`;
    const legacy = app.store.addCompatPlaylistItem({ itemType: 2, itemId: '1016', createdAt: '2026-09-10T00:00:00Z' });
    const restored = (await api.list()).list[0];
    check(restored);
    assert.equal(restored.createdAt, legacy.createdAt);
    assert.equal(loads, 1); // Wait for a cold catalog before mapping old rows.
    check(await api.add({ itemType: 2, itemId: '1016' }));
    check(await api.add({ itemType: 2, itemId: '1016' }));
    assert.equal(app.store.compatPlaylist().length, 1);
    check(app.store.compatPlaylist()[0]);
    assert.equal(app.store.compatPlaylist()[0].createdAt, legacy.createdAt);

    // Same ID in a different item type must never become the preset.
    app.store.addCompatPlaylistItem({ itemType: 3, itemId: '1016', name: 'Uploaded MIDI', videoUrl: base + '/uploaded.mp4', createdAt: '2026-09-10T00:00:01Z' });
    assert.equal((await api.list()).list.find(x => x.itemType === 3).name, 'Uploaded MIDI');
    assert.equal((await api.add({ itemType: 2, itemId: 'unknown' })).name, 'unknown');
    view.isOfflineMode = false;
    const before = loads;
    assert.equal((await api.add({ itemType: 2, itemId: 'online-only' })).name, 'online-only');
    await api.list();
    assert.equal(loads, before);

    await app.stop(); app = createLocalApp(options);
    await app.start(); base = `http://127.0.0.1:${app.server.address().port}`;
    check(app.store.compatPlaylist().find(x => x.itemType === 2 && x.itemId === '1016'));
    await transport('/toy/delFromPlaylist', { itemType: 2, itemId: '1016' });
    assert.equal(app.store.compatPlaylist().some(x => x.itemType === 2 && x.itemId === '1016'), false);
    assert.equal(app.store.compatPlaylist().find(x => x.itemType === 3).name, 'Uploaded MIDI');
  } finally { await app.stop(); rmSync(root, { recursive: true, force: true }); }
});

test('playlist cover retains available images and shows the same note for missing or failed images', () => {
  const original = '/*LinliNocturnePatch:compat-routes-v1*/' + coverSource;
  const result = applyPlaylistCoverFallbackPatch(archive(original));
  assert.equal(applyPlaylistCoverFallbackPatch(result.buffer).alreadyPatched, true);
  assert.throws(() => applyPlaylistCoverFallbackPatch(archive(original + coverSource)), /contract mismatch/);
  assert.throws(() => applyPlaylistCoverFallbackPatch(archive(original.replace('src:o(d)', 'src:changed'))), /contract mismatch/);
  const node = (type, props, children) => ({ type, props, children });
  const api = new Function('o', 'r', '_', 'ae', 'Y', 'F', 'w', 'sx', 'k', 'x', 'V', 'n', 'Ue',
    inspectFrontendArchive(result.buffer).source + ';return {imageError,playlistCover};')(
    value => value, () => {}, node, value => value, () => null, node, 'BaseImage', {}, node, 'Icon', value => value, node, (slots, name) => slots[name]?.());
  const missing = api.playlistCover('', { song: { name: 'Missing' } });
  const present = api.playlistCover('cover.png', { song: { name: 'Available' } });
  assert.equal(present.type, 'BaseImage');
  assert.equal(present.props.src, 'cover.png');
  assert.equal(api.imageError(false, { $slots: present.children }), null);
  const failed = api.imageError(true, { $slots: present.children });
  assert.deepEqual(failed.children[0][0].children[0], missing.children[0]);
  assert.equal(missing.children[0].props.type, 'perform');
  assert.equal(api.imageError(true, { $slots: {} }).children[0], undefined); // Other image callers keep their existing fallback.
});
