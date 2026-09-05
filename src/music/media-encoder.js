import { execFileSync } from 'node:child_process';

/**
 * Wraps rendered WAV audio in an audio-only MP4 container. The game's
 * WebPlayer uses a <video> element, so a WAV response is not a reliable
 * playback source even when the browser can decode the audio itself.
 */
export function createAudioOnlyMp4Encoder({ ffmpegPath = 'ffmpeg' } = {}) {
  return (wav) => execFileSync(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error',
    '-i', 'pipe:0',
    '-vn', '-c:a', 'aac', '-b:a', '192k',
    '-movflags', 'frag_keyframe+empty_moov',
    '-f', 'mp4', 'pipe:1',
  ], { input: wav, maxBuffer: 32 * 1024 * 1024 });
}
