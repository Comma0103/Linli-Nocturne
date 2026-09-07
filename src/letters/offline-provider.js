import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess, ModelProviderError } from './model-adapter.js';
import { sha256, LIN_COMMIT } from './persona-bundle.js';

export function localDateTime(now, timeZone) {
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

export class OliviaLinOfflineProvider {
  constructor({ python = 'python', timeoutMs = 15_000, runner = runProcess } = {}) {
    this.provider = 'olivia-lin.offline'; this.version = LIN_COMMIT; this.offline = true;
    this.python = python; this.timeoutMs = timeoutMs; this.runner = runner;
  }
  async generate(input) {
    if (input.persona && input.personaId !== 'linli.persona-bundle') throw new ModelProviderError('离线规则引擎只支持内置林离人格；自由文本人格请选择本地或外部模型', 'offline_persona_incompatible', this.provider);
    const directory = await mkdtemp(join(tmpdir(), 'linli-offline-'));
    const engine = fileURLToPath(new URL('../../third_party/olivia-lin/BSide_Olivia_Lin/skill/local_engine.py', import.meta.url));
    const bridge = fileURLToPath(new URL('./offline-engine.py', import.meta.url));
    try {
      const request = join(directory, 'input.json');
      await writeFile(request, JSON.stringify({ engine, prompt: input.prompt,
        displayName: input.userDisplayName, localTime: localDateTime(input.now ?? new Date(), input.timeZone ?? 'Asia/Shanghai'),
        memoryEcho: input.memoryEcho ?? '' }), 'utf8');
      const result = await this.runner(this.python, ['-B', '-X', 'utf8', bridge, request], { cwd: directory, timeoutMs: this.timeoutMs, label: this.provider });
      if (result.code !== 0) throw new ModelProviderError('离线人格引擎执行失败，请检查 Python', 'offline_engine_failed', this.provider);
      let reply;
      try { reply = JSON.parse(result.stdout); } catch { throw new ModelProviderError('离线人格引擎返回格式错误', 'offline_engine_invalid', this.provider); }
      if (typeof reply.reply !== 'string' || !reply.reply.trim()) throw new ModelProviderError('离线人格引擎未返回正文', 'offline_engine_invalid', this.provider);
      return { provider: this.provider, text: reply.reply, metadata: { version: this.version,
        engineSha256: sha256(await readFile(engine)), bridgeSha256: sha256(await readFile(bridge)),
        weather: reply.weather, mood: reply.mood, stages: [{ id: 'offline-generate', status: 'completed' }],
        capabilities: ['scenario-rules', 'linli-persona', 'memory-echo'], model: null } };
    } finally { await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {}); }
  }
}
