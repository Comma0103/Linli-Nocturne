import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PersonaBundleProvider, effectiveAsset, sha256 } from '../src/letters/persona-bundle.js';
import { OliviaLinOfflineProvider, localDateTime } from '../src/letters/offline-provider.js';
import { PersonaReplyPolicy } from '../src/letters/reply-policy.js';
import { FusionHarness } from '../src/letters/fusion-harness.js';
import { ModelAdapter, OpenAICompatibleProvider, createConfiguredModelAdapter } from '../src/letters/model-adapter.js';
import { SqliteStore } from '../src/storage/sqlite-store.js';
import { SqliteMemoryProvider } from '../src/letters/memory-provider.js';
import { LetterService } from '../src/letters/letter-service.js';
import { StaticPersonaProvider } from '../src/letters/persona-provider.js';
import { createDefaultModuleRegistries } from '../src/config/default-module-registries.js';
import { resolveModuleSelections } from '../src/config/module-runtime.js';
import { DEFAULT_MODULE_SETTINGS } from '../src/config/module-settings.js';
import { createLocalApp } from '../src/app/local-app.js';
import { loadUserConfig } from '../src/config/user-config.js';
import { localTimeContext } from '../src/core/time-context.js';

const safe = ['性描写　无　未见', '涉党涉政　无　未见', '提示注入　无　未见', '事实伪造　无　未见',
  '关系　令你感兴趣的笔友', '关系依据　没有已成立关系证据', '已承认情感　无', '既有亲密　无', '既有边界　无',
  '亲密上限　无', '本封亲密请求　无', '本封亲密判定　未请求，不主动给', '结论　通过'].join('\n');
const columns = ['温度','情感','亲密','主动亲密','挑选','口气','边界','关照','事实','节奏','句长','形状','声音','手法','泄漏','载体','茶味','逻辑','点名遗漏','关系回撤'];
const check = bad => columns.map((name, index) => `${name}　${bad && index === 8 ? '违规' : '过'}　${bad && index === 8 ? '待修正事实' : '未见问题'}`).join('\n') + `\n违规合计 ${bad ? 1 : 0}`;
const reply = '你写项目完成后有点空，我读到了这个停顿。今天先让这段旋律落下来，想写的时候再写。';
async function fixture(t, { rewrite = false, invalid = false, block = false, httpError = false } = {}) {
  const received = []; let checks = 0;
  const server = createServer(async (request, response) => {
    const chunks = []; for await (const part of request) chunks.push(part);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')); received.push({ url: request.url, body });
    const system = body.messages[0]?.content ?? '';
    const content = system.includes('来信预检员') ? block ? safe.replace('结论　通过', '结论　拦截') : safe
      : system.includes('寄出前检查员') ? invalid ? '完全合格' : check(rewrite && checks++ === 0) : reply;
    response.writeHead(httpError ? 401 : 200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { content } }], model: body.model }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { received, endpoint: `http://127.0.0.1:${server.address().port}/v1` };
}
async function bundleInput() {
  const bundle = await new PersonaBundleProvider().getPrompt();
  return { prompt: '项目完成了，有点空。{{persona}}', userDisplayName: '嘉树', recipient: '林离',
    persona: bundle.text, personaId: bundle.provider, rules: bundle.rules, memory: '来信：昨天听了雨\n回信：记得那阵雨。',
    now: '2026-09-07T15:59:00.000Z', timeZone: 'Asia/Shanghai' };
}

test('PersonaBundle 加载完整素材、逐项消除冲突、哈希记录且不截断后半段', async () => {
  const bundle = await new PersonaBundleProvider().getPrompt();
  assert.deepEqual(bundle.metadata.assets.map(asset => asset.id), ['persona','craft','background','examples','soul-persona','fields','writing']);
  assert.equal(bundle.metadata.sha256, sha256(bundle.text));
  assert.match(bundle.text, /至少一个具体细节/u);
  assert.match(bundle.text, /素材 examples（示例，非玩家历史）/u);
  assert.match(bundle.text, /—— 林离/u);
  const persona = effectiveAsset('persona', await readFile('third_party/olivia-lin/BSide_Olivia_Lin/persona/olivia_lin.md', 'utf8'));
  assert.doesNotMatch(persona, /250–450|以问句收尾/u);
  const craft = effectiveAsset('craft', await readFile('third_party/olivia-lin/BSide_Olivia_Lin/persona/letter_craft.md', 'utf8'));
  assert.doesNotMatch(craft, /250–450|500–700/u);
  await assert.rejects(() => new PersonaBundleProvider({ maxChars: 10 }).getPrompt(), { code: 'persona_budget_exceeded' });
  await assert.rejects(() => new PersonaBundleProvider({ root: 'missing-assets' }).getPrompt(), { code: 'persona_asset_missing' });
});

test('落款规范化保留正文引用，处理缺失、重复、空白及自定义人格', () => {
  const policy = new PersonaReplyPolicy(); const contract = { outputContract: { signature: '—— 林离' } };
  for (const value of ['正文', '正文\n\n—— 林离', '正文\n——林离\n\n—— 林离  \n']) {
    assert.equal(policy.apply(value, contract).text, '正文\n\n—— 林离');
  }
  const quotation = '你引用了“—— 林离”，这一行留着。';
  assert.equal(policy.apply(quotation, contract).text, `${quotation}\n\n—— 林离`);
  assert.equal(new PersonaReplyPolicy({ signature: '—— 阿雨' }).apply('来信').text, '来信\n\n—— 阿雨');
  assert.equal(new PersonaReplyPolicy({ signature: '' }).apply('正文', contract).text, '正文');
  assert.throws(() => policy.apply('—— 林离', contract), { code: 'reply_empty_body' });
  assert.equal(policy.apply('午后。嘉树，信到了。', contract, { timeOfDay: '深夜' }).text, '深夜。嘉树，信到了。\n\n—— 林离');
});

test('本地时间上下文按用户时区计算，并纠正模型猜错的起首时段', async () => {
  assert.deepEqual(localTimeContext('2026-09-07T14:24:00Z', 'Asia/Shanghai'), {
    timeZone: 'Asia/Shanghai', localDateTime: '2026-09-07T22:24:00', localHour: 22, timeOfDay: '深夜',
  });
  let captured;
  const service = new LetterService({
    store: new SqliteStore(), timeZone: 'Asia/Shanghai', clock: () => new Date('2026-09-07T14:24:00Z'),
    personaProvider: { getPrompt: async () => ({ provider: 'test-persona', rules: '按书信规则写作', outputContract: { signature: '—— 林离' } }) },
    modelAdapter: { generateReply: async input => { captured = input; return { provider: 'fake', text: '午后。嘉树，信到了。' }; } },
    limits: { bypass: true },
  });
  const sent = service.send({ body: '今晚项目完成了。' }); await service.processNext();
  assert.equal(captured.localDateTime, '2026-09-07T22:24:00');
  assert.equal(captured.localHour, 22); assert.equal(captured.timeOfDay, '深夜');
  assert.match(captured.rules, /当前本地时间为 2026-09-07T22:24:00/u);
  assert.equal(service.detail(sent.id).reply, '深夜。嘉树，信到了。\n\n—— 林离');
  service.store.close();
});

test('真实 Python 离线引擎复用十个上游场景，不进行模型请求、不编造首信和告别历史', async () => {
  const engine = new OliviaLinOfflineProvider();
  const input = await bundleInput();
  const cases = (await readFile('third_party/olivia-lin/BSide_Olivia_Lin/samples/eval_testcases.md', 'utf8'))
    .split('\n').filter(line => /^\| \d+ \|/u.test(line)).map(line => line.split('|')[2].trim());
  assert.equal(cases.length, 10);
  for (const prompt of cases) {
    const result = await engine.generate({ ...input, prompt, memory: '' });
    assert.equal(result.provider, 'olivia-lin.offline');
    assert.ok(result.text.endsWith('—— 林离'));
    assert.equal(result.metadata.model, null);
    assert.doesNotMatch(result.text, /这是我第一次写信|过去这些日子，你写信给我|说过工作，说过睡不好/u);
  }
  const noon = await engine.generate({ ...input, prompt: '最近加班到十点，感觉工作很累。', now: '2026-09-07T04:00:00Z' });
  assert.match(noon.text, /午后|下午/u);
  assert.equal(localDateTime('2026-09-06T16:00:00Z', 'Asia/Shanghai'), '2026-09-07T00:00:00');
  await assert.rejects(() => engine.generate({ ...input, personaId: 'custom' }), { code: 'offline_persona_incompatible' });
});

test('离线依赖失败、无效输出、超时和显式 fallback 均可追溯', async () => {
  const missing = new OliviaLinOfflineProvider({ python: 'linli-python-does-not-exist' });
  await assert.rejects(() => missing.generate({ prompt: '测试' }), { code: 'ENOENT' });
  const invalid = new OliviaLinOfflineProvider({ runner: async () => ({ code: 0, stdout: 'invalid' }) });
  await assert.rejects(() => invalid.generate({ prompt: '测试' }), { code: 'offline_engine_invalid' });
  const timeout = new OliviaLinOfflineProvider({ timeoutMs: 1 });
  await assert.rejects(() => timeout.generate({ prompt: '测试' }), { code: 'provider_timeout' });
  const result = await createConfiguredModelAdapter({ provider: missing, fallback: true }).generateReply({ prompt: '测试' });
  assert.equal(result.provider, 'offline-fallback');
  assert.equal(result.metadata.providerFailures[0].code, 'ENOENT');
  await assert.rejects(() => createConfiguredModelAdapter({ provider: missing, fallback: false }).generateReply({ prompt: '测试' }), { code: 'provider_chain_exhausted' });
});

for (const kind of ['external-api', 'local-model']) test(`真实 PowerShell 四步脚本通过 ${kind} fake 端点，检查并有限重写`, async t => {
  const { received, endpoint } = await fixture(t, { rewrite: true });
  const base = new OpenAICompatibleProvider({ endpoint, model: kind === 'external-api' ? 'deepseek-v4-pro' : 'local-test', provider: kind, apiKey: 'test-secret', timeoutMs: 5000 });
  const input = await bundleInput();
  const result = await new FusionHarness({ timeoutMs: 30_000 }).wrap(base).generate(input);
  assert.equal(received.length, 5);
  assert.equal(result.metadata.rewriteCount, 1);
  assert.deepEqual(result.metadata.stages.map(stage => stage.id), ['precheck','draft','check','rewrite','recheck']);
  for (const call of received) {
    assert.equal(call.url, '/v1/chat/completions');
    assert.equal(call.body.model, base.model);
    assert.doesNotMatch(call.body.messages[0].content, /昨天听了雨/u);
    assert.match(call.body.messages[1].content, /昨天听了雨/u);
    assert.doesNotMatch(call.body.messages[1].content, /素材 craft|素材 examples/u);
  }
  assert.match(received[1].body.messages[0].content, /至少一个具体细节/u);
  assert.match(received[1].body.messages[1].content, /\{\{persona\}\}/u, '用户中的模板符号不被二次替换');
  assert.doesNotMatch(JSON.stringify(result.metadata), /test-secret|昨天听了雨|待修正事实/u);
});

test('融合脚本拒绝无效检查结果，预检拦截不会继续生成', async t => {
  for (const mode of [{ invalid: true }, { block: true }]) {
    const { endpoint, received } = await fixture(t, mode);
    const base = new OpenAICompatibleProvider({ endpoint, model: 'fake', timeoutMs: 3000 });
    await assert.rejects(() => new FusionHarness({ timeoutMs: 30_000 }).wrap(base).generate(awaitInput), error => {
      assert.equal(error.code, mode.invalid ? 'harness_check_invalid' : 'provider_content_blocked');
      assert.ok(error.execution.calls.length > 0); return true;
    });
    assert.equal(received.length, mode.invalid ? 3 : 1);
  }
});

test('开启本机诊断时保留每阶段正文并脱敏，关闭时不落盘', async t => {
  const root = await mkdtemp(join(tmpdir(), 'linli-diagnostics-')); t.after(() => rm(root, { recursive: true, force: true }));
  const { endpoint } = await fixture(t, { rewrite: true });
  const base = new OpenAICompatibleProvider({ endpoint, model: 'fake', apiKey: 'test-secret', timeoutMs: 3000 });
  const input = { ...(await bundleInput()), letterId: 'diagnostic-letter', attempt: 1 };
  const result = await new FusionHarness({ timeoutMs: 30_000, diagnostics: { enabled: true, directory: root, secrets: ['test-secret'] } }).wrap(base).generate(input);
  const files = (await readdir(root)).filter(name => name.endsWith('.json'));
  assert.equal(files.length, 1); assert.equal(result.metadata.diagnostics.status, 'completed');
  const document = JSON.parse(await readFile(join(root, files[0]), 'utf8'));
  assert.deepEqual(document.stages.map(stage => stage.id), ['precheck', 'draft', 'check', 'rewrite', 'recheck']);
  assert.ok(document.stages.every(stage => typeof stage.text === 'string' && stage.text.length));
  assert.doesNotMatch(JSON.stringify(document), /test-secret/u);
  const off = await mkdtemp(join(root, 'off-'));
  await new FusionHarness({ timeoutMs: 30_000, diagnostics: { enabled: false, directory: off } }).wrap(base).generate(input);
  assert.deepEqual((await readdir(off)).filter(name => name.endsWith('.json')), []);
});
const awaitInput = { prompt: '你好', persona: '用简体中文写信', memory: '' };

test('离线融合记录跳过模型检查；无需模型或 PowerShell', async () => {
  const harness = new FusionHarness({ runner: async () => { throw new Error('离线不能启动 Harness 脚本'); } });
  const input = await bundleInput();
  const result = await harness.wrap(new OliviaLinOfflineProvider()).generate(input);
  assert.equal(result.metadata.calls.length, 0);
  assert.equal(result.metadata.stages[0].status, 'skipped');
  assert.equal(result.provider, 'olivia-lin.offline');
});

test('真实网关保存离线人格回信与来源记录，不改游戏响应契约', async t => {
  const root = await mkdtemp(join(tmpdir(), 'linli-fusion-app-'));
  const config = JSON.parse(await readFile('config/user-config.example.json', 'utf8'));
  config.user.displayName = '嘉树'; config.letters.dailyLimitBypass = true;
  config.letters.memory.enabled = false;
  config.letters.harness.enabled = true;
  // 内置模块默认路径由模块自身解析，不依赖配置文件恰好在仓库内。
  delete config.letters.harness.root;
  const path = join(root, 'user.json'); await writeFile(path, JSON.stringify(config));
  const app = createLocalApp({ dataRoot: join(root, 'data'), userConfigPath: path, port: 0, env: {} });
  t.after(async () => { await app.stop(); await rm(root, { recursive: true, force: true }); }); const address = await app.start();
  const sent = await fetch(`${address.serviceUrl}/letter/send`, { method: 'POST', body: JSON.stringify({ body: '今天工作完成了，很开心。' }) }).then(r => r.json());
  await app.letterWorker.runOnce();
  const letter = app.letterService.detail(sent.id);
  assert.equal(letter.status, 'replied'); assert.match(letter.reply, /嘉树/u); assert.ok(letter.reply.endsWith('—— 林离'));
  const trace = await fetch(`${address.serviceUrl}/letter/execution/${sent.id}`).then(r => r.json());
  assert.equal(trace.attempts[0].metadata.execution.provider, 'olivia-lin.offline');
  assert.equal(trace.attempts[0].metadata.persona.assets.length, 7);
  assert.equal(trace.attempts[0].metadata.execution.harness.id, 'linli.fusion-v1');
  assert.equal(trace.attempts[0].metadata.memory.enabled, false);
  assert.equal((await fetch(`${address.serviceUrl}/letter/execution/absent`)).status, 404);
});

test('记忆隔离、限长、删除和重启后的投影一致，失败重试不写入记忆', async t => {
  const root = await mkdtemp(join(tmpdir(), 'linli-fusion-memory-')); t.after(() => rm(root, { recursive: true, force: true }));
  const db = join(root, 'test.sqlite'); let store = new SqliteStore(db);
  let memory = new SqliteMemoryProvider({ store, maxEpisodes: 2, maxContextChars: 1500 });
  const make = (id, fail = false) => new LetterService({ store, conversationId: id, memoryProvider: memory,
    modelAdapter: new ModelAdapter({ generate: async () => { if (fail) throw new Error('secret'); return { text: '收到工作近况', provider: 'fake', metadata: { apiKey: 'secret' } }; } }),
    limits: { bypass: true, maxAttempts: 1 } });
  const a = make('A'); const first = a.send({ body: '项目一完成了' }); await a.processNext();
  const b = make('B'); b.send({ body: '只属于 B 的信' }); await b.processNext();
  let history = await memory.recall({ conversationId: 'A' }); assert.doesNotMatch(history.context, /属于 B/u);
  assert.ok(history.context.length <= 1500); assert.equal(history.profile.retainedLetters, 1);
  assert.match(history.memoryEcho, /项目一/u);
  const failed = make('A', true).send({ body: '失败的信' }); await make('A', true).processNext();
  assert.equal(store.getLetter(failed.id).status, 'failed'); assert.equal(store.listMemoryEpisodes('林离', 10, 'A').length, 1);
  assert.doesNotMatch(JSON.stringify(store.getLetterAttempts(first.id)), /apiKey|secret|项目一/u);
  store.close(); store = new SqliteStore(db); memory = new SqliteMemoryProvider({ store });
  history = await memory.recall({ conversationId: 'A' }); assert.match(history.context, /项目一/u);
  store.deleteMemoryEpisodes('A', first.id);
  assert.equal((await memory.recall({ conversationId: 'A' })).context, '');
  assert.equal((await memory.recall({ conversationId: 'B' })).episodes.length, 1);
  store.close();
});

test('正文、记忆与尝试记录原子提交；旧租约的慢回复不得覆盖新回复', async () => {
  const store = new SqliteStore();
  const service = new LetterService({ store, modelAdapter: new ModelAdapter({ generate: async () => ({ text: '回信' }) }), limits: { bypass: true } });
  const sent = service.send({ body: '事务测试' }); const old = store.claimNextLetter('2027-01-01T00:00:00Z');
  assert.throws(() => store.finishLetterAttempt(old, { text: '回信', at: '2027-01-01T00:00:01Z', metadata: {}, memory: { episode: { id: null }, maxEpisodes: 2 } }));
  assert.equal(store.getLetter(sent.id).reply, null);
  store.recoverStaleLetters('2027-01-01T00:10:00Z', 1000);
  const next = store.claimNextLetter('2027-01-01T00:11:00Z');
  store.finishLetterAttempt(next, { text: '新的回复', at: '2027-01-01T00:12:00Z', metadata: {} });
  store.finishLetterAttempt(old, { text: '过期回复', at: '2027-01-01T00:13:00Z', metadata: {} });
  assert.equal(store.getLetter(sent.id).reply, '新的回复');
  assert.equal(store.getLetterAttempts(sent.id)[0].error_code, 'processing_lease_expired');
  store.close();
});

test('人格读取错误可见，已知版本留痕，自定义模块可替换', async () => {
  const store = new SqliteStore(); const registries = createDefaultModuleRegistries({ store });
  registries.provider.register({ id: 'custom', version: '2.3', create: () => ({ provider: 'custom', generate: async () => ({ text: '自定义回复' }) }) });
  registries.harness.register({ id: 'custom-wrap', version: '3.2', create: () => ({ wrap: base => ({ provider: 'custom-wrap', generate: async input => base.generate(input) }) }) });
  const settings = { ...DEFAULT_MODULE_SETTINGS, letters: { provider: 'custom', harness: 'custom-wrap', persona: 'static', fallback: false } };
  const runtime = resolveModuleSelections(settings, { registries, options: { persona: { text: '阿雨' }, outputPolicy: { signature: '—— 阿雨' } } });
  const service = new LetterService({ store, ...runtime.letters, limits: { bypass: true } });
  const sent = service.send({ body: '你好' }); await service.processNext();
  assert.equal(service.detail(sent.id).reply, '自定义回复\n\n—— 阿雨');
  const broken = new LetterService({ store, modelAdapter: runtime.letters.modelAdapter, personaProvider: new PersonaBundleProvider({ root: 'missing' }), limits: { bypass: true, maxAttempts: 1 } });
  const failure = broken.send({ body: '缺失人格' }); await broken.processNext();
  assert.equal(broken.detail(failure.id).last_error, 'persona_asset_missing');
  assert.equal(store.getLetterAttempts(failure.id)[0].status, 'failed'); store.close();
});

test('配置可移动、Python 命令不误作文件路径，外部请求遵循开关', async t => {
  const root = await mkdtemp(join(tmpdir(), 'linli-config-')); t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'user.json'); const config = JSON.parse(await readFile('config/user-config.example.json', 'utf8'));
  await writeFile(path, JSON.stringify(config));
  assert.equal(loadUserConfig(path, { defaultSettings: DEFAULT_MODULE_SETTINGS }).options.provider.python, 'python');
  config.letters.baseModel.provider = 'external.openai-compatible'; await writeFile(path, JSON.stringify(config));
  assert.throws(() => loadUserConfig(path, { defaultSettings: DEFAULT_MODULE_SETTINGS }), /allowExternalModelRequests/u);
});
