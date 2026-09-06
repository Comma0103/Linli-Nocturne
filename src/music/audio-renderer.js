import { parseMidi } from './midi-manifest.js';

const DEFAULT_TEMPO = 500000;
const SAMPLE_RATE = 44100;

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function collectNotes(parsed) {
  const notes = [];
  const active = new Map();
  const sustained = new Map();
  const pedal = new Map();
  let tempo = DEFAULT_TEMPO;
  let lastTick = 0;
  let elapsed = 0;

  const close = (key, end) => {
    const note = active.get(key);
    if (!note) return;
    notes.push({ ...note, end: Math.max(end, note.start + 0.01) });
    active.delete(key);
  };

  for (const event of parsed.events) {
    const deltaTicks = event.tick - lastTick;
    elapsed += (deltaTicks / parsed.ticksPerBeat) * (tempo / 1_000_000);
    lastTick = event.tick;
    if (event.type === 'tempo') { tempo = event.microsecondsPerBeat; continue; }
    const key = `${event.channel ?? 0}:${event.note ?? ''}`;
    if (event.type === 'noteOn') {
      if (event.velocity === 0) { close(key, elapsed); continue; }
      if (active.has(key)) close(key, elapsed);
      active.set(key, { channel: event.channel, note: event.note, velocity: event.velocity, start: elapsed });
    } else if (event.type === 'noteOff') {
      if (pedal.get(event.channel)) sustained.set(key, true); else close(key, elapsed);
    } else if (event.type === 'sustainOn') {
      pedal.set(event.channel, true);
    } else if (event.type === 'sustainOff') {
      pedal.set(event.channel, false);
      for (const pending of sustained.keys()) { if (pending.startsWith(`${event.channel}:`)) { sustained.delete(pending); close(pending, elapsed); } }
    }
  }
  for (const key of active.keys()) close(key, elapsed + 0.5);
  return { notes, duration: Math.max(elapsed + 0.5, 0.5) };
}

function writeUInt32LE(buffer, offset, value) { buffer.writeUInt32LE(value >>> 0, offset); }
function writeUInt16LE(buffer, offset, value) { buffer.writeUInt16LE(value, offset); }

export function encodeWav(samples, sampleRate = SAMPLE_RATE) {
  const dataSize = samples.length * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0); writeUInt32LE(wav, 4, 36 + dataSize); wav.write('WAVE', 8);
  wav.write('fmt ', 12); writeUInt32LE(wav, 16, 16); writeUInt16LE(wav, 20, 1); writeUInt16LE(wav, 22, 1);
  writeUInt32LE(wav, 24, sampleRate); writeUInt32LE(wav, 28, sampleRate * 2); writeUInt16LE(wav, 32, 2); writeUInt16LE(wav, 34, 16);
  wav.write('data', 36); writeUInt32LE(wav, 40, dataSize);
  for (let index = 0; index < samples.length; index += 1) wav.writeInt16LE(clamp(Math.round(samples[index] * 32767), -32768, 32767), 44 + index * 2);
  return wav;
}

export function renderMidiToWav(buffer, { sampleRate = SAMPLE_RATE } = {}) {
  const parsed = parseMidi(buffer);
  const { notes, duration } = collectNotes(parsed);
  const sampleCount = Math.ceil(duration * sampleRate);
  const samples = new Float32Array(sampleCount);
  for (const note of notes) {
    const start = Math.floor(note.start * sampleRate);
    const end = Math.min(sampleCount, Math.ceil(note.end * sampleRate));
    const frequency = 440 * 2 ** ((note.note - 69) / 12);
    const amplitude = (note.velocity / 127) * 0.18;
    for (let index = start; index < end; index += 1) {
      const time = index / sampleRate - note.start;
      const release = note.end - index / sampleRate;
      const envelope = Math.min(1, time / 0.015, Math.max(0, release / 0.08));
      samples[index] += Math.sin(2 * Math.PI * frequency * time) * amplitude * envelope;
    }
  }
  for (let index = 0; index < samples.length; index += 1) samples[index] = clamp(samples[index], -0.95, 0.95);
  return { wav: encodeWav(samples, sampleRate), duration, timingManifest: { ...parsed, events: parsed.events } };
}

export class AudioRenderer {
  constructor({ id = 'audio.renderer', version = '1.0.0' } = {}) { this.id = id; this.version = version; }
  render() { throw new Error('AudioRenderer.render must be implemented'); }
}

export class BuiltinAudioRenderer extends AudioRenderer {
  constructor(options = {}) { super({ id: 'builtin.audio', version: '0.1.0', ...options }); }
  render(buffer, options = {}) { return renderMidiToWav(buffer, options); }
}
