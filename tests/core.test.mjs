import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderJob, transitionJob, RenderJobStatus } from '../src/core/render-job.js';
import { FallbackLetterProvider, ModelAdapter } from '../src/letters/model-adapter.js';
import { inspectMidi, createTimingManifest } from '../src/music/midi-manifest.js';

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
