import test from 'node:test';
import assert from 'node:assert/strict';
import { applyNativeFeaturePatch, NATIVE_OFFLINE_PATCHES } from '../src/patcher/native-feature-patch.js';

function fixture(patches) {
  const chunks = patches.map(({ needle }) => Buffer.from(needle));
  return Buffer.concat([Buffer.from([0x00, 0x7f]), ...chunks.flatMap(chunk => [chunk, Buffer.from([0x55, 0xaa])])]);
}

test('native offline patch changes only audited call sites', () => {
  const studio = fixture(NATIVE_OFFLINE_PATCHES.studio);
  const container = fixture(NATIVE_OFFLINE_PATCHES.container);
  const result = applyNativeFeaturePatch({ studio, container });
  assert.equal(result.studio.patches.length, 4);
  assert.equal(result.container.patches.length, 1);
  assert.notDeepEqual(result.studio.buffer, studio);
  assert.notDeepEqual(result.container.buffer, container);
  for (const patch of NATIVE_OFFLINE_PATCHES.studio) {
    const offset = result.studio.patches.find(item => item.id === patch.id).offset + patch.offset;
    assert.equal(result.studio.buffer.subarray(offset, offset + 6).toString('hex'), '33c090909090');
  }
});

test('native offline patch refuses missing signatures', () => {
  assert.throws(() => applyNativeFeaturePatch({ studio: Buffer.alloc(32), container: Buffer.alloc(32) }), /expected one signature/);
});
