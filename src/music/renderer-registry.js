import { ModuleRegistry } from '../config/module-registry.js';
import { BuiltinAudioRenderer } from './audio-renderer.js';

export function createRendererRegistry() {
  return new ModuleRegistry('renderer')
    .register({ id: 'builtin.audio', version: '0.1.0', label: '内置音频渲染器', description: '将 MIDI 渲染为 WAV', create: options => new BuiltinAudioRenderer(options) });
}
