import { cp, readFile, rm, writeFile, mkdtemp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function withTimeout(task, timeoutMs, label) {
  if (!timeoutMs || timeoutMs <= 0) return task();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${label} provider timeout`), { code: 'provider_timeout' })), timeoutMs);
  });
  return Promise.race([Promise.resolve().then(task), timeout]).finally(() => clearTimeout(timer));
}

async function requestJson(fetchImpl, url, init, timeoutMs, provider) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new ModelProviderError(`${provider} returned HTTP ${response.status}`, 'provider_http_error', provider);
    try { return await response.json(); }
    catch { throw new ModelProviderError(`${provider} returned invalid JSON`, 'provider_invalid_response', provider); }
  } catch (error) {
    if (error instanceof ModelProviderError) throw error;
    if (error?.name === 'AbortError') throw new ModelProviderError(`${provider} request timed out`, 'provider_timeout', provider);
    throw new ModelProviderError(`${provider} request failed`, error?.code ?? 'provider_unavailable', provider);
  } finally {
    clearTimeout(timer);
  }
}

function extractOpenAiText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) return content.map(part => typeof part === 'string' ? part : part?.text ?? '').join('').trim();
  return typeof content === 'string' ? content.trim() : '';
}

function promptWithMemory(prompt, memory) {
  const base = String(prompt ?? '');
  const context = String(memory ?? '').trim();
  return context ? `${base}\n\n此前对话记忆（仅供参考）：\n${context}` : base;
}

function systemWithPersona(systemPrompt, persona) {
  return [String(systemPrompt ?? '').trim(), String(persona ?? '').trim()].filter(Boolean).join('\n\n');
}

function runProcess(command, args, { cwd, timeoutMs, spawnImpl = spawn }) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, { cwd, shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill?.();
      reject(new ModelProviderError('OliviaSoul Harness timed out', 'provider_timeout', 'olivia-soul-harness'));
    }, timeoutMs);
    child.stdout?.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr?.on('data', chunk => { stderr += chunk.toString(); });
    child.once('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new ModelProviderError('OliviaSoul Harness could not start', error?.code ?? 'provider_unavailable', 'olivia-soul-harness'));
    });
    child.once('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

export class ModelProviderError extends Error {
  constructor(message, code = 'provider_failed', provider = 'unknown') {
    super(message); this.name = 'ModelProviderError'; this.code = code; this.provider = provider;
  }
}

class FunctionProvider {
  constructor({ generate, provider, timeoutMs = 30_000 }) {
    if (typeof generate !== 'function') throw new TypeError(`${provider}.generate is required`);
    this.generateFn = generate;
    this.provider = provider;
    this.timeoutMs = timeoutMs;
  }

  async generate(input) {
    try {
      const result = await withTimeout(() => this.generateFn(input), this.timeoutMs, this.provider);
      return { ...result, provider: result?.provider ?? this.provider };
    } catch (error) {
      if (error instanceof ModelProviderError) throw error;
      throw new ModelProviderError(`${this.provider} provider failed`, error?.code ?? 'provider_failed', this.provider);
    }
  }
}

export class ExternalApiProvider extends FunctionProvider {
  constructor(options) { super({ ...options, provider: options.provider ?? 'external-api' }); }
}

export class LocalModelProvider extends FunctionProvider {
  constructor(options) { super({ ...options, provider: options.provider ?? 'local-model' }); }
}

// Harness 是可替换的生成管线：它可以是 OliviaSoul，也可以是其他项目或本项目自己的实现。
export class HarnessProvider extends FunctionProvider {
  constructor(options) { super({ ...options, provider: options.provider ?? 'harness' }); }
}

export class OpenAICompatibleProvider extends FunctionProvider {
  constructor({ endpoint, apiKey = '', model, systemPrompt = '', timeoutMs = 15_000, fetchImpl = globalThis.fetch, provider = 'external-api' }) {
    if (!endpoint) throw new TypeError('model endpoint is required');
    const url = endpoint.replace(/\/$/u, '').endsWith('/chat/completions')
      ? endpoint.replace(/\/$/u, '')
      : `${endpoint.replace(/\/$/u, '')}${endpoint.replace(/\/$/u, '').endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions'}`;
    super({ provider, timeoutMs, generate: async ({ prompt = '', recipient = '林离', memory = '', persona = '' }) => {
      const payload = await requestJson(fetchImpl, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [
          ...(systemWithPersona(systemPrompt, persona) ? [{ role: 'system', content: systemWithPersona(systemPrompt, persona) }] : []),
          { role: 'user', content: `给${recipient}的来信：${promptWithMemory(prompt, memory)}` },
        ] }),
      }, timeoutMs, provider);
      const text = extractOpenAiText(payload);
      if (!text) throw new ModelProviderError(`${provider} returned an empty reply`, 'provider_empty_reply', provider);
      return { text, provider, metadata: { model, protocol: 'openai-compatible' } };
    } });
  }
}

export class OliviaSoulHarnessProvider extends HarnessProvider {
  constructor({ root, runtimeRoot = '', person = 'linli-local-user', powershell = 'powershell.exe', timeoutMs = 60 * 60 * 1000, runner = runProcess, environment = {} }) {
    if (!root) throw new TypeError('OliviaSoul Harness root is required');
    super({ provider: 'olivia-soul-harness', timeoutMs, generate: async ({ prompt = '', memory = '', persona = '' }) => {
      const executionRoot = runtimeRoot || root;
      if (runtimeRoot) {
        await cp(root, runtimeRoot, { recursive: true, force: true, filter: source => !/[\\/](_probe|信件往来|\.cursor)(?:[\\/]|$)/u.test(source) });
      }
      const tempDir = await mkdtemp(join(tmpdir(), 'linli-olivia-soul-'));
      const letterFile = join(tempDir, 'incoming.txt');
      const replyFile = join(tempDir, 'reply.txt');
      const script = join(executionRoot, 'run-live.ps1');
      await writeFile(letterFile, promptWithMemory(promptWithMemory(prompt, memory), persona), 'utf8');
      try {
        const result = await runner(powershell, [
          '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
          '-Person', person, '-Letter', letterFile, '-OutFile', replyFile,
        ], { cwd: executionRoot, timeoutMs, env: { ...process.env, ...environment } });
        if (result.code !== 0 || !String(result.stdout ?? '').includes('HARNESS LIVE DONE')) {
          throw new ModelProviderError('OliviaSoul Harness returned no completed reply', 'provider_harness_failed', 'olivia-soul-harness');
        }
        const text = (await readFile(replyFile, 'utf8')).trim();
        if (!text) throw new ModelProviderError('OliviaSoul Harness returned an empty reply', 'provider_empty_reply', 'olivia-soul-harness');
        if (text.startsWith('[BLOCKED]')) throw new ModelProviderError('OliviaSoul Harness blocked the letter', 'provider_content_blocked', 'olivia-soul-harness');
        return { text, provider: 'olivia-soul-harness', metadata: { harness: 'v18' } };
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    } });
    this.mode = 'standalone';
  }
}

export class ModelProviderChain {
  constructor({ providers = null, external = null, harness = null, local = null, fallback = new FallbackLetterProvider() } = {}) {
    this.providers = providers ? providers.filter(Boolean) : [external, harness, local, fallback].filter(Boolean);
  }

  async generate(input) {
    const failures = [];
    for (const provider of this.providers) {
      try {
        const result = await provider.generate(input);
        return { ...result, metadata: { ...(result?.metadata ?? {}), providerFailures: failures } };
      } catch (error) {
        failures.push({ provider: provider.provider ?? provider.constructor.name, code: error?.code ?? 'provider_failed' });
      }
    }
    throw new ModelProviderError('No model provider could generate a reply', 'provider_chain_exhausted', 'chain');
  }
}

export function createConfiguredModelAdapter(config = {}) {
  const external = config.external?.generate
    ? config.external
    : config.external?.endpoint
      ? new OpenAICompatibleProvider(config.external)
      : null;
  let harness = config.harness?.generate || config.harness?.wrap ? config.harness : null;
  if (!harness && (config.harness?.kind === 'olivia-soul-harness' || config.harness?.kind === 'olivia-soul-v18')) {
    harness = new OliviaSoulHarnessProvider(config.harness);
  }
  // 保留 local.kind 的兼容写法，新的配置应把 Harness 放到独立的 harness 插槽。
  if (!harness && config.local?.kind === 'olivia-soul-harness') harness = new OliviaSoulHarnessProvider(config.local);
  let local = config.local?.generate ? config.local : null;
  if (!local && config.local?.endpoint) local = new OpenAICompatibleProvider({ ...config.local, provider: 'local-model' });
  const fallback = config.fallback === false ? null : new FallbackLetterProvider();
  if (config.provider?.generate) return new ModelAdapter(new ModelProviderChain({ providers: [config.provider, harness, fallback] }));
  return new ModelAdapter(new ModelProviderChain({ external, harness, local, fallback }));
}

export class ModelAdapter {
  constructor(provider) {
    if (!provider || typeof provider.generate !== 'function') throw new TypeError('provider.generate is required');
    this.provider = provider;
  }

  async generateReply(input) {
    const result = await this.provider.generate(input);
    if (!result || typeof result.text !== 'string' || !result.text.trim()) throw new ModelProviderError('Model provider returned an invalid reply', 'invalid_provider_reply', result?.provider ?? 'unknown');
    return { text: result.text.trim(), provider: result.provider ?? 'unknown', metadata: result.metadata ?? {} };
  }
}

export class FallbackLetterProvider {
  constructor({ provider = 'offline-fallback' } = {}) { this.provider = provider; }

  async generate({ recipient = '你', prompt = '' } = {}) {
    return { provider: this.provider, text: `${recipient}，我收到了你的信。谢谢你把这些话告诉我。${prompt ? '我会记得你写下的心情。' : ''}` };
  }
}
