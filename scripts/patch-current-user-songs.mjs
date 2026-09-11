import { readFileSync, writeFileSync } from 'node:fs';
import { applyOfflineMidiFeaturePatch, applyOfflinePresetPlaylistPatch } from '../src/patcher/frontend-archive.js';

const archivePath = process.argv[2];
if (!archivePath) throw new Error('Usage: node scripts/patch-current-user-songs.mjs <feapp.dat>');
const midi = applyOfflineMidiFeaturePatch(readFileSync(archivePath));
const result = applyOfflinePresetPlaylistPatch(midi.buffer);
if (!midi.alreadyPatched || !result.alreadyPatched) writeFileSync(archivePath, result.buffer);
console.log(JSON.stringify({ archivePath, ...result, alreadyPatched: midi.alreadyPatched && result.alreadyPatched, buffer: undefined }, null, 2));
