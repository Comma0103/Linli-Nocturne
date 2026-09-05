import { readFileSync, writeFileSync } from 'node:fs';
import { applyOfflineUserSongPatch } from '../src/patcher/frontend-archive.js';

const archivePath = process.argv[2];
if (!archivePath) throw new Error('Usage: node scripts/patch-current-user-songs.mjs <feapp.dat>');
const result = applyOfflineUserSongPatch(readFileSync(archivePath));
if (!result.alreadyPatched) writeFileSync(archivePath, result.buffer);
console.log(JSON.stringify({ archivePath, ...result, buffer: undefined }, null, 2));
