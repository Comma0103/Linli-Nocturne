import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runProcess, ModelProviderError, safeErrorCode } from './model-adapter.js';
import { THIRD_PARTY_ROOT, sha256, SOUL_COMMIT } from './persona-bundle.js';

const SCRIPT_ASSETS = ['scripts/harness-4step.ps1', 'scripts/fusion-explicit.ps1', 'scripts/ds-call.ps1',
  'harness/00-栏目.md', 'harness/01-预检.md', 'harness/03-中段生成.md', 'harness/04-尾端检查.md', 'harness/05-反馈重写.md'];

export class FusionHarness {
  constructor({ root = join(THIRD_PARTY_ROOT, 'OliviaSoul/v18-harness'), powershell = 'powershell.exe', timeoutMs = 15 * 60_000, maxRewrites = 1, runner = runProcess } = {}) {
    this.root = resolve(root); this.powershell = powershell; this.timeoutMs = timeoutMs;
    if (![0, 1].includes(maxRewrites)) throw new TypeError('harness.maxRewrites 只能是 0 或 1');
    this.maxRewrites = maxRewrites; this.runner = runner; this.provider = 'linli.fusion-v1'; this.version = '1.0.0-exp';
  }
  wrap(base) {
    if (!base?.generate) throw new TypeError('融合 Harness 需要基础模型');
    return { provider: this.provider, moduleInfo: this.moduleInfo, generate: input => this.generate(base, input) };
  }
  async generate(base, input) {
    const calls = [];
    const metadata = { harness: { id: this.provider, version: this.version, revision: SOUL_COMMIT },
      base: base.moduleInfo ?? { id: base.provider, version: base.version ?? 'unknown' }, calls, stages: [], rewriteCount: 0 };
    if (base.offline) {
      try {
        const reply = await base.generate(input);
        return { ...reply, metadata: { ...reply.metadata, ...metadata, model: null,
          baseMetadata: reply.metadata, stages: [{ id: 'precheck', status: 'skipped', reason: 'offline-rules-engine' },
            ...(reply.metadata?.stages ?? []), { id: 'model-check', status: 'skipped', reason: 'offline-rules-engine' }] } };
      } catch (error) { throw Object.assign(error, { execution: metadata }); }
    }
    const directory = await mkdtemp(join(tmpdir(), 'linli-fusion-'));
    const token = randomUUID();
    let stopped = false;
    const server = createServer(async (request, response) => {
      if (stopped || request.method !== 'POST' || request.url !== '/chat/completions' || request.headers.authorization !== `Bearer ${token}`) { response.writeHead(403).end(); return; }
      let call;
      try {
        let bytes = 0; const chunks = [];
        for await (const chunk of request) { bytes += chunk.length; if (bytes > 1_000_000) throw new Error('too large'); chunks.push(chunk); }
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const messages = payload.messages;
        if (!Array.isArray(messages) || messages.length !== 2 || messages[0].role !== 'system' || messages[1].role !== 'user') throw new Error('invalid input');
        call = { sequence: calls.length + 1, provider: base.provider, module: base.moduleInfo, model: base.model ?? null, status: 'processing' };
        calls.push(call);
        input.onExecution?.(metadata);
        const result = await base.generate({ ...input, persona: '', memory: '',
          system: messages[0].content, prompt: messages[1].content });
        if (!result?.text?.trim()) throw new ModelProviderError('模型未返回正文', 'provider_empty_reply', base.provider);
        call.provider = result.provider ?? base.provider;
        call.model = result.metadata?.model ?? base.model ?? null;
        call.status = 'completed';
        input.onExecution?.(metadata);
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ choices: [{ message: { content: result.text }, finish_reason: 'stop' }] }));
      } catch (error) {
        if (call) { call.status = 'failed'; call.code = safeErrorCode(error); }
        input.onExecution?.(metadata);
        response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: safeErrorCode(error) }));
      }
    });
    try {
      metadata.assets = [];
      for (const path of SCRIPT_ASSETS) metadata.assets.push({ id: path, sha256: sha256(await readFile(join(this.root, path))) });
      const fields = await readFile(join(this.root, 'harness/00-栏目.md'), 'utf8');
      await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
      const filename = join(directory, 'input.json'); const output = join(directory, 'output.json');
      await writeFile(filename, JSON.stringify({ root: this.root,
        endpoint: `http://127.0.0.1:${server.address().port}/chat/completions`, token, output,
        persona: input.persona || '使用所选基础模型的人格设置，不加载其它人格档案。',
        rules: input.rules || '采用所选人格的书信规则，素材与用户正文分开。', fields,
          context: JSON.stringify({ currentLetter: { sender: input.userDisplayName, recipient: input.recipient, body: input.prompt },
          history: input.memory || '', now: input.now, timeZone: input.timeZone, localDateTime: input.localDateTime,
          localHour: input.localHour, timeOfDay: input.timeOfDay }), maxRewrites: this.maxRewrites }), 'utf8');
      const run = await this.runner(this.powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(this.root, 'scripts/harness-4step.ps1'), '-ExplicitInput', filename],
        { cwd: directory, timeoutMs: this.timeoutMs, label: this.provider });
      if (run.code !== 0) throw new ModelProviderError('融合 Harness 脚本执行失败', 'harness_process_failed', this.provider);
      let result;
      try { result = JSON.parse(await readFile(output, 'utf8')); } catch { throw new ModelProviderError('融合 Harness 输出无效', 'harness_output_invalid', this.provider); }
      metadata.stages = result.stages; metadata.rewriteCount = result.rewriteCount;
      if (result.status !== 'completed' || !result.text?.trim()) throw new ModelProviderError('融合 Harness 未通过检查', safeErrorCode({ code: result.errorCode }), this.provider);
      return { provider: base.provider, text: result.text, metadata: { ...metadata, model: calls.at(-1)?.model ?? null } };
    } catch (error) {
      throw Object.assign(new ModelProviderError('融合 Harness 处理失败，请查看本封执行记录', safeErrorCode(error), this.provider), { execution: metadata });
    } finally {
      stopped = true; server.closeAllConnections();
      if (server.listening) await new Promise(accept => server.close(accept));
      await rm(directory, { recursive: true, force: true });
    }
  }
}
