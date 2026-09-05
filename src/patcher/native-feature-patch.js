const NOP = 0x90;
const RETURN_ZERO = Object.freeze([0x33, 0xC0, NOP, NOP, NOP, NOP]);

export const NATIVE_OFFLINE_PATCHES = Object.freeze({
  studio: Object.freeze([
    { id: 'mail-widget-check-1', needle: [0xCB, 0xE8, 0xD2, 0x37, 0x08, 0x00, 0xEB, 0x1E, 0xFF, 0x15, 0xB2, 0xEC, 0x08, 0x00, 0x48, 0x8D, 0x8F, 0xA8], offset: 8 },
    { id: 'mail-widget-check-2', needle: [0xCB, 0xE8, 0x72, 0x34, 0x08, 0x00, 0xEB, 0x1E, 0xFF, 0x15, 0x52, 0xE9, 0x08, 0x00, 0x48, 0x8D, 0x8F, 0xA8], offset: 8 },
    { id: 'music-widget-check-1', needle: [0xCB, 0xE8, 0xB2, 0x1F, 0x08, 0x00, 0xEB, 0x2B, 0xFF, 0x15, 0x92, 0xD4, 0x08, 0x00, 0x84, 0xC0, 0x75, 0x14], offset: 8 },
    { id: 'music-widget-check-2', needle: [0xCB, 0xE8, 0xFF, 0x1D, 0x08, 0x00, 0xEB, 0x1C, 0xFF, 0x15, 0xDF, 0xD2, 0x08, 0x00, 0x48, 0x8D, 0x4F, 0x38], offset: 8 },
  ]),
  container: Object.freeze([
    { id: 'lite-bar-check', needle: [0x48, 0x8B, 0xDA, 0x48, 0x8B, 0xF9, 0xFF, 0x15, 0x61, 0xA4, 0x04, 0x00, 0x84, 0xC0, 0x0F, 0x85], offset: 6 },
  ]),
});

function findUnique(buffer, needle) {
  const bytes = Buffer.from(buffer);
  const target = Buffer.from(needle);
  const first = bytes.indexOf(target);
  if (first < 0) return { offset: -1, count: 0 };
  const second = bytes.indexOf(target, first + 1);
  return { offset: first, count: second < 0 ? 1 : 2 };
}

function applyGroup(buffer, patches, group) {
  const output = Buffer.from(buffer);
  const plan = patches.map(patch => {
    const found = findUnique(output, patch.needle);
    if (found.count !== 1) throw new Error(`Native patch ${group}/${patch.id} expected one signature, got ${found.count}`);
    return { ...patch, offset: found.offset };
  });
  for (const patch of plan) {
    Buffer.from(RETURN_ZERO).copy(output, patch.offset + patch.offsetDelta);
  }
  return { buffer: output, patches: plan.map(({ id, offset }) => ({ id, offset })) };
}

export function applyNativeFeaturePatch({ studio, container }) {
  const studioResult = applyGroup(studio, NATIVE_OFFLINE_PATCHES.studio.map(patch => ({ ...patch, offsetDelta: patch.offset })), 'studio');
  const containerResult = applyGroup(container, NATIVE_OFFLINE_PATCHES.container.map(patch => ({ ...patch, offsetDelta: patch.offset })), 'container');
  return { studio: studioResult, container: containerResult };
}
