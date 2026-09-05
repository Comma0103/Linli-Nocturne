import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderJob, transitionJob, RenderJobStatus } from '../src/core/render-job.js';
import { FallbackLetterProvider, ModelAdapter } from '../src/letters/model-adapter.js';
import { inspectMidi, parseMidi, createTimingManifest } from '../src/music/midi-manifest.js';
import { renderMidiToWav } from '../src/music/audio-renderer.js';

test('RenderJob follows the frozen state machine', () => {
  const job = createRenderJob({ kind: 'audio', rendererId: 'builtin.audio', rendererVersion: '0.1.0' });
  const validating = transitionJob(job, RenderJobStatus.VALIDATING);
  const rendering = transitionJob(validating, RenderJobStatus.RENDERING);
  const produced = transitionJob(rendering, RenderJobStatus.PRODUCED, { progress: 1 });
  assert.equal(produced.status, 'produced');
  assert.throws(() => transitionJob(produced, RenderJobStatus.RENDERING), /Invalid RenderJob/);
});

test('offline model provider returns a normalized reply', async () => {
  const adapter = new ModelAdapter(new FallbackLetterProvider());
  const reply = await adapter.generateReply({ recipient: '林离', prompt: '你好' });
  assert.equal(reply.provider, 'offline-fallback');
  assert.match(reply.text, /林离/);
});

test('MIDI inspection produces a future-compatible timing manifest', () => {
  const header = Uint8Array.from([0x4d,0x54,0x68,0x64, 0,0,0,6, 0,0, 0,1, 1,0]);
  const info = inspectMidi(header);
  const manifest = createTimingManifest(info);
  assert.equal(info.ticksPerBeat, 256);
  assert.deepEqual(manifest.extensionPoints, { fingerTrack: null, cameraTrack: null, actionTrack: null });
});

test('MIDI parser extracts notes, sustain pedal and tempo', () => {
  const bytes = Uint8Array.from([
    0x4d,0x54,0x68,0x64, 0,0,0,6, 0,0, 0,1, 0x01,0x00,
    0x4d,0x54,0x72,0x6b, 0,0,0,27,
    0x00,0xff,0x51,0x03,0x07,0xa1,0x20,
    0x00,0x90,0x3c,0x64,
    0x10,0xb0,0x40,0x7f,
    0x10,0x80,0x3c,0x40,
    0x00,0xb0,0x40,0x00,
    0x00,0xff,0x2f,0x00
  ]);
  const parsed = parseMidi(bytes);
  const manifest = createTimingManifest(parsed);
  assert.equal(parsed.events.filter(event => event.type === 'noteOn').length, 1);
  assert.equal(manifest.sustainPedal.length, 2);
  assert.equal(parsed.events.find(event => event.type === 'tempo').microsecondsPerBeat, 500000);
});

test('offline audio renderer produces a valid WAV and keeps timing data', () => {
  const bytes = Uint8Array.from([
    0x4d,0x54,0x68,0x64, 0,0,0,6, 0,0, 0,1, 0x01,0x00,
    0x4d,0x54,0x72,0x6b, 0,0,0,12,
    0x00,0x90,0x3c,0x64, 0x40,0x80,0x3c,0x40, 0x00,0xff,0x2f,0x00
  ]);
  const result = renderMidiToWav(bytes);
  assert.equal(result.wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(result.wav.toString('ascii', 8, 12), 'WAVE');
  assert.ok(result.wav.length > 44);
  assert.ok(result.timingManifest.events.some(event => event.type === 'noteOn'));
});
