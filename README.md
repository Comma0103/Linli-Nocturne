# Linli Nocturne（林离·余音）

> An offline-first restoration and extension platform for **BSide: Olivia Lin**.

Linli Nocturne brings back letters, replies, MIDI performance, local music playback, video replies, and a future-ready path to 3D finger-synchronised performances after the original service became unavailable.

## Project status

The project is in active Phase 1 development. The foundation is runnable and tested; game-facing patching and the desktop installer are still under construction.

## Roadmap

- [x] **Phase 0 — Research and design**: inspect the 0.0.9.627 client baseline, document recovered capabilities, freeze contracts, and define the user flow.
- [x] **Phase 1 foundation — Local domain core**: SQLite storage, local gateway, letter rules, offline reply fallback, RenderJob state machine, MIDI parsing, tempo and sustain extraction.
- [x] **Phase 1 music — Local MIDI playback**: offline WAV renderer and local playlist service.
- [ ] **Phase 2 — Game integration**: restore the writing entry point, map the local gateway to the game client, and add safe backup/rollback patching.
- [ ] **Phase 3 — Letter experience**: memory, retries, text replies, imported video replies, and external/local model providers.
- [ ] **Phase 4 — Music experience**: user-facing MIDI upload, preview, audio/video jobs, and playlist UI inside the game flow.
- [ ] **Phase 5 — Improvisation**: model-assisted composition with both online API and fully local execution paths.
- [ ] **Phase 6 — 3D performance**: timing manifests, finger tracks, camera tracks, action tracks, and a replaceable 3D renderer.
- [ ] **Phase 7 — Distribution**: non-technical-user installer, diagnostics, backup/restore, release packaging, and public documentation.

Unchecked items are planned targets. Renderers and model providers are replaceable so the project can improve without rewriting game integration.

## Features

- **Letters** — original-style daily limit and five-minute delay by default, with an advanced bypass switch.
- **Model providers** — offline fallback today; external API and local model adapters share one contract.
- **MIDI** — Standard MIDI File parsing, note/tempo/sustain events, timing manifests, and local WAV rendering.
- **Playlist** — SQLite-backed local playlist entries ready for game-client exposure.
- **Media pipeline** — one RenderJob model for audio, video, and the future 3D renderer.
- **Recovery first** — game files are baselined before patching; user data and generated media live outside the Steam directory.

## Installation

### Current developer build

Requirements: Windows 10/11, Node.js 22+ (Node.js 24 is currently used), pnpm 9+, and an installed copy of BSide: Olivia Lin for later integration phases.

```powershell
git clone https://github.com/Comma0103/Linli-Nocturne.git
cd Linli-Nocturne
pnpm test
```

The current build runs the domain core and tests. It does not yet patch or modify the game automatically.

## Usage today

The current developer API can render a MIDI file and add it to the local playlist:

```js
import { SqliteStore } from './src/storage/sqlite-store.js';
import { MusicService } from './src/music/music-service.js';

const store = new SqliteStore('./data/linli.sqlite');
const music = new MusicService({ store });
const track = music.importMidi({ buffer: midiBytes, sourceName: 'my-song.mid', title: 'My Song' });
music.addToPlaylist(track);
```

For letters, use `LetterService` with `ModelAdapter`; the default rules preserve the original daily limit and delay. The local HTTP gateway is the compatibility layer for the future game client.

## Architecture

```text
Game client
    ↓ compatible local HTTP gateway
Domain services ── SQLite store
    ├─ LetterService + ModelAdapter
    ├─ MusicService + MIDI parser
    └─ RenderJob + Audio/Video/Future3D renderers
```

Design documents live in [`docs/`](./docs/): [requirements](./docs/requirements.md), [architecture](./docs/architecture.md), [ordinary-user flow](./docs/ui-flow.md), [RenderJob state machine](./docs/render-job.md), [Phase 0](./docs/phase0.md), and [Phase 1](./docs/phase1.md).

## Development

```powershell
pnpm test
```

Every feature should ship with its contract, tests, and documentation update. Small commits keep the local tree and public review history easy to follow.

## Scope and preservation

This repository does not distribute original game assets, modified proprietary DLLs, user letters, generated private media, or API keys. The patcher will create a baseline, backup, validation record, and rollback path before touching a game installation.

## License

Code is released under the [MIT License](./LICENSE). Game assets and third-party materials remain subject to their original owners' terms.
