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

function readVarLen(bytes, offset) {
  let value = 0;
  let cursor = offset;
  for (let count = 0; count < 4; count += 1) {
    if (cursor >= bytes.length) throw new Error('Truncated MIDI variable length value');
    const byte = bytes[cursor++];
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, next: cursor };
  }
  throw new Error('Invalid MIDI variable length value');
}

function readChunk(bytes, offset) {
  if (offset + 8 > bytes.length) throw new Error('Truncated MIDI track chunk');
  const type = String.fromCharCode(...bytes.slice(offset, offset + 4));
  const length = readUInt32BE(bytes, offset + 4);
  const start = offset + 8;
  const end = start + length;
  if (end > bytes.length) throw new Error('Truncated MIDI track data');
  return { type, start, end, next: end };
}

export function parseMidi(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const info = inspectMidi(bytes);
  let cursor = 8 + readUInt32BE(bytes, 4);
  const events = [];
  for (let trackIndex = 0; trackIndex < info.tracks; trackIndex += 1) {
    const chunk = readChunk(bytes, cursor);
    if (chunk.type !== 'MTrk') throw new Error(`Unexpected MIDI chunk: ${chunk.type}`);
    cursor = chunk.next;
    let offset = chunk.start;
    let tick = 0;
    let runningStatus = null;
    while (offset < chunk.end) {
      const delta = readVarLen(bytes, offset);
      tick += delta.value;
      offset = delta.next;
      let status = bytes[offset];
      if (status < 0x80) {
        if (runningStatus === null) throw new Error('MIDI data byte without running status');
        status = runningStatus;
      } else {
        offset += 1;
        if (status < 0xf0) runningStatus = status;
      }
      if (status === 0xff) {
        if (offset >= chunk.end) throw new Error('Truncated MIDI meta event');
        const metaType = bytes[offset++];
        const length = readVarLen(bytes, offset);
        offset = length.next + length.value;
        if (offset > chunk.end) throw new Error('Truncated MIDI meta payload');
        if (metaType === 0x2f) break;
        if (metaType === 0x51 && length.value === 3) {
          const start = length.next;
          events.push({ type: 'tempo', track: trackIndex, tick, microsecondsPerBeat: (bytes[start] << 16) | (bytes[start + 1] << 8) | bytes[start + 2] });
        }
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        const length = readVarLen(bytes, offset);
        offset = length.next + length.value;
        continue;
      }
      const command = status & 0xf0;
      const channel = status & 0x0f;
      const data1 = bytes[offset++];
      if (command === 0xc0 || command === 0xd0) continue;
      const data2 = bytes[offset++];
      if (command === 0x80 || (command === 0x90 && data2 === 0)) events.push({ type: 'noteOff', track: trackIndex, channel, tick, note: data1, velocity: data2 });
      else if (command === 0x90) events.push({ type: 'noteOn', track: trackIndex, channel, tick, note: data1, velocity: data2 });
      else if (command === 0xb0 && data1 === 64) events.push({ type: data2 >= 64 ? 'sustainOn' : 'sustainOff', track: trackIndex, channel, tick, value: data2 });
    }
  }
  events.sort((a, b) => a.tick - b.tick || a.track - b.track);
  return { ...info, events };
}

export function createTimingManifest(midiInfo) {
  return { schemaVersion: 1, source: 'midi', format: midiInfo.format, tracks: midiInfo.tracks, ticksPerBeat: midiInfo.ticksPerBeat,
    events: midiInfo.events ?? [], sustainPedal: (midiInfo.events ?? []).filter(event => event.type === 'sustainOn' || event.type === 'sustainOff'),
    extensionPoints: { fingerTrack: null, cameraTrack: null, actionTrack: null } };
}
