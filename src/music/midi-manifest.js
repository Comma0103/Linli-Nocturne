const HEADER = [0x4d, 0x54, 0x68, 0x64];
function readUInt32BE(bytes, offset) { return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]; }
function readUInt16BE(bytes, offset) { return (bytes[offset] << 8) | bytes[offset + 1]; }

export function inspectMidi(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 14 || !HEADER.every((value, index) => bytes[index] === value)) throw new Error('Invalid MIDI header');
  const headerLength = readUInt32BE(bytes, 4);
  if (headerLength < 6 || bytes.length < 8 + headerLength) throw new Error('Truncated MIDI header');
  const format = readUInt16BE(bytes, 8), tracks = readUInt16BE(bytes, 10), ticksPerBeat = readUInt16BE(bytes, 12);
  if (format > 2 || tracks < 1 || ticksPerBeat === 0 || (ticksPerBeat & 0x8000)) throw new Error('Unsupported MIDI timing or format');
  return { format, tracks, ticksPerBeat, byteLength: bytes.length };
}

export function createTimingManifest(midiInfo) {
  return { schemaVersion: 1, source: 'midi', format: midiInfo.format, tracks: midiInfo.tracks, ticksPerBeat: midiInfo.ticksPerBeat,
    events: [], sustainPedal: [], extensionPoints: { fingerTrack: null, cameraTrack: null, actionTrack: null } };
}
