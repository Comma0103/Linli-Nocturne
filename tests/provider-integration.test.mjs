import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import {
  createConfiguredModelAdapter,
  HarnessProvider,
  OpenAICompatibleProvider,
  OliviaSoulHarnessProvider,
  runProcess,
} from '../src/letters/model-adapter.js';

test('Harness 子进程会继承 DeepSeek 环境变量', async () => {
  let observed;
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const result = await runProcess('powershell.exe', ['-File', 'run-live.ps1'], {
    cwd: 'D:/reference/OliviaSoul/v18-harness',
    env: { DEEPSEEK_API_KEY: 'local-only', DEEPSEEK_MODEL: 'deepseek-v4-pro' },
    spawnImpl: (_command, _args, options) => {
      observed = options;
      queueMicrotask(() => child.emit('close', 0));
      return child;
    },
  });
  assert.equal(result.code, 0);
  assert.equal(observed.env.DEEPSEEK_API_KEY, 'local-only');
  assert.equal(observed.env.DEEPSEEK_MODEL, 'deepseek-v4-pro');
});

test('自定义 Harness 可以直接插入而不修改信件服务', async () => {
  const customHarness = new HarnessProvider({
    provider: 'community-harness',
    generate: async ({ prompt }) => ({
      text: `自定义 Harness 已处理：${prompt}`,
      metadata: { source: 'test' },
    }),
  });
  const adapter = createConfiguredModelAdapter({ harness: customHarness, fallback: false });
  const result = await adapter.generateReply({ prompt: '你好' });
  assert.equal(result.provider, 'community-harness');
  assert.equal(result.text, '自定义 Harness 已处理：你好');
  assert.equal(result.metadata.providerFailures.length, 0);
});

function readRequest(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
    request.on('error', reject);
  });
}

test('OpenAI 兼容 provider 发送规范请求并返回统一文字', async t => {
  let received;
  const server = createServer(async (request, response) => {
    received = { headers: request.headers, body: await readRequest(request) };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { content: '外部模型回信' } }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const provider = new OpenAICompatibleProvider({
    endpoint: `http://127.0.0.1:${server.address().port}/v1`,
    apiKey: 'secret-key-for-test', model: 'fake-model', systemPrompt: '只输出回信', timeoutMs: 1000,
  });
  const result = await provider.generate({ recipient: '林离', userDisplayName: '嘉树', prompt: '今天很好' });
  assert.equal(result.text, '外部模型回信');
  assert.equal(received.headers.authorization, 'Bearer secret-key-for-test');
  assert.equal(received.body.model, 'fake-model');
  assert.deepEqual(received.body.messages, [
    { role: 'system', content: '只输出回信' },
    { role: 'user', content: '嘉树写给林离的来信：今天很好' },
  ]);
});

test('OpenAI 兼容 provider 接收统一的有限记忆上下文', async () => {
  let received;
  const provider = new OpenAICompatibleProvider({
    endpoint: 'https://model.invalid/v1', model: 'fake-model',
    fetchImpl: async (_url, init) => {
      received = JSON.parse(init.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: '带上下文的回信' } }] }) };
    },
  });
  await provider.generate({ prompt: '今天好吗', memory: '来信：昨天很好\n回信：我也记得。' });
  assert.match(received.messages.at(-1).content, /此前对话记忆/u);
  assert.match(received.messages.at(-1).content, /昨天很好/u);
});

test('OliviaSoul v18 Harness provider 复用现成脚本并清理临时信件', async () => {
  let observed;
  const provider = new OliviaSoulHarnessProvider({
    root: 'D:/reference/OliviaSoul/v18-harness',
    person: '测试用户',
    runner: async (command, args, options) => {
      observed = { command, args, options };
      const outputPath = args[args.indexOf('-OutFile') + 1];
      await writeFile(outputPath, 'Harness 生成的回信', 'utf8');
      return { code: 0, stdout: 'STEP5 done\nHARNESS LIVE DONE\n', stderr: '' };
    },
  });
  const result = await provider.generate({ prompt: '请记得今天的雨' });
  assert.equal(result.provider, 'olivia-soul-harness');
  assert.equal(result.text, 'Harness 生成的回信');
  assert.equal(observed.command, 'powershell.exe');
  assert.ok(observed.args.includes('-File'));
  assert.match(observed.args[observed.args.indexOf('-File') + 1], /run-live\.ps1$/u);
  assert.equal(observed.args[observed.args.indexOf('-Person') + 1], '测试用户');
  const letterPath = observed.args[observed.args.indexOf('-Letter') + 1];
  const replyPath = observed.args[observed.args.indexOf('-OutFile') + 1];
  assert.equal(existsSync(letterPath), false);
  assert.equal(existsSync(replyPath), false);
});

test('OliviaSoul Harness 输入包含玩家显示名和游戏收信人', async () => {
  let letterContent;
  const provider = new OliviaSoulHarnessProvider({
    root: 'D:/reference/OliviaSoul/v18-harness',
    runner: async (_command, args) => {
      letterContent = await import('node:fs/promises').then(({ readFile }) => readFile(args[args.indexOf('-Letter') + 1], 'utf8'));
      await writeFile(args[args.indexOf('-OutFile') + 1], 'Harness 生成的回信', 'utf8');
      return { code: 0, stdout: 'HARNESS LIVE DONE', stderr: '' };
    },
  });
  await provider.generate({ recipient: '林离', userDisplayName: '嘉树', prompt: '最近好吗' });
  assert.match(letterContent, /来信人：嘉树/u);
  assert.match(letterContent, /收信人：林离/u);
  assert.match(letterContent, /最近好吗/u);
});

test('OliviaSoul Harness 使用绝对脚本路径避免工作目录重复拼接', async () => {
  let observed;
  const provider = new OliviaSoulHarnessProvider({
    root: 'third_party/OliviaSoul/v18-harness',
    runtimeRoot: 'data/test-harness-runtime',
    runner: async (_command, args, options) => {
      observed = { args, options };
      await writeFile(args[args.indexOf('-OutFile') + 1], '路径测试回信', 'utf8');
      return { code: 0, stdout: 'HARNESS LIVE DONE', stderr: '' };
    },
  });
  await provider.generate({ prompt: '路径测试' });
  const script = observed.args[observed.args.indexOf('-File') + 1];
  assert.equal(script, resolve('data/test-harness-runtime/run-live.ps1'));
  assert.equal(observed.options.cwd, resolve('data/test-harness-runtime'));
});

test('外部 provider 失败时切换到 OliviaSoul Harness，禁用 fallback 时不泄漏密钥', async () => {
  const local = {
    kind: 'olivia-soul-harness', root: 'D:/reference/OliviaSoul/v18-harness', timeoutMs: 1000,
    runner: async (command, args) => {
      await writeFile(args[args.indexOf('-OutFile') + 1], '本地 Harness 回信', 'utf8');
      return { code: 0, stdout: 'HARNESS LIVE DONE', stderr: '' };
    },
  };
  const adapter = createConfiguredModelAdapter({
    external: { endpoint: 'https://model.invalid/v1', apiKey: 'do-not-log', model: 'fake', fetchImpl: async () => ({ ok: false, status: 500 }) },
    local,
    fallback: true,
  });
  const result = await adapter.generateReply({ prompt: '你好' });
  assert.equal(result.provider, 'olivia-soul-harness');

  const failing = createConfiguredModelAdapter({
    external: { endpoint: 'https://model.invalid/v1', apiKey: 'do-not-log', model: 'fake', fetchImpl: async () => ({ ok: false, status: 500 }) },
    local: { kind: 'olivia-soul-harness', root: 'D:/reference/OliviaSoul/v18-harness', runner: async () => ({ code: 1, stdout: '', stderr: 'private text' }) },
    fallback: false,
  });
  await assert.rejects(() => failing.generateReply({ prompt: '你好' }), error => {
    assert.equal(error.code, 'provider_chain_exhausted');
    assert.equal(error.message.includes('do-not-log'), false);
    assert.equal(error.message.includes('private text'), false);
    return true;
  });
});

test('组合设置把基础模型配置交给完整 OliviaSoul Harness，而不是把 Harness 当备用模型', async () => {
  let environment;
  const harness = new OliviaSoulHarnessProvider({
    root: 'D:/reference/OliviaSoul/v18-harness',
    environment: { DEEPSEEK_MODEL: 'deepseek-v4-pro', DEEPSEEK_API_KEY: 'local-only' },
    runner: async (_command, args, options) => {
      environment = options.env;
      await writeFile(args[args.indexOf('-OutFile') + 1], '组合 Harness 回信', 'utf8');
      return { code: 0, stdout: 'HARNESS LIVE DONE', stderr: '' };
    },
  });
  const adapter = createConfiguredModelAdapter({ provider: harness, fallback: false });
  const result = await adapter.generateReply({ prompt: '组合测试' });
  assert.equal(result.provider, 'olivia-soul-harness');
  assert.equal(environment.DEEPSEEK_MODEL, 'deepseek-v4-pro');
  assert.equal(environment.DEEPSEEK_API_KEY, 'local-only');
});
