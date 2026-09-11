import { readFileSync, writeFileSync } from 'node:fs';
import { applyOfflineMidiFeaturePatch, applyOfflinePresetPlaylistPatch, applyPlaylistCoverFallbackPatch } from '../src/patcher/frontend-archive.js';

const archivePath = process.argv[2];
if (!archivePath) throw new Error('Usage: node scripts/patch-current-user-songs.mjs <feapp.dat>');
const midi = applyOfflineMidiFeaturePatch(readFileSync(archivePath));
const preset = applyOfflinePresetPlaylistPatch(midi.buffer);
const result = applyPlaylistCoverFallbackPatch(preset.buffer);
const alreadyPatched = midi.alreadyPatched && preset.alreadyPatched && result.alreadyPatched;
if (!alreadyPatched) writeFileSync(archivePath, result.buffer);
console.log(JSON.stringify({ archivePath, ...result, alreadyPatched, buffer: undefined }, null, 2));
