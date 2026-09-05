import { readFileSync, writeFileSync } from 'node:fs';
import { applyWebplayerAudioPatch } from '../src/patcher/frontend-archive.js';

const archivePath = process.argv[2];
if (!archivePath) throw new Error('Usage: node scripts/patch-current-webplayer-audio.mjs <webplayer.dat>');
const result = applyWebplayerAudioPatch(readFileSync(archivePath));
if (!result.alreadyPatched) writeFileSync(archivePath, result.buffer);
console.log(JSON.stringify({ archivePath, ...result, buffer: undefined }, null, 2));
