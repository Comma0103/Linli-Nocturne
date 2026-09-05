import test from 'node:test';
import assert from 'node:assert/strict';
import { auditFrontendSource } from '../src/patcher/frontend-audit.js';

test('frontend audit records MIDI upload and polling contracts', () => {
  const source = [
    'Te.post("/genObjectUploadUrl")',
    'Te.post("/midi/generate")',
    'Te.get("/midi/getGenerateResult")',
    'Te.get("/midi/listJobs")',
    'N3=!1,Ss=!1,wa=({onComplete',
    'N3=!0,Ss=!1,wa=({onComplete',
    'e.isOfflineMode&&(l.value.mailWidget!==!1',
    'if(t.isOfflineMode)throw new Ol(e)',
    '!o(w)&&o(Ss)?',
    'o(w)?Y("",!0):(r(),F(on',
  ].join(';');
  const result = auditFrontendSource(source);
  assert.equal(result.conclusions.hasMidiUploadFlow, true);
  assert.equal(result.conclusions.hasMidiPollingFlow, true);
  assert.equal(result.midi['/midi/listJobs'].quotedCount, 1);
  assert.equal(result.offlineFeatures['offline-request-block'].present, true);
});
