import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { SqliteStore } from '../src/storage/sqlite-store.js';
import { OliviaSoulSqliteMemoryProvider } from '../src/letters/olivia-soul-sqlite-memory.js';
import { createSoulMemorySummarizer, loadSoulMemoryPrompts, retrieveSoulHistory } from '../src/letters/olivia-soul-memory.js';
import { LetterService } from '../src/letters/letter-service.js';
import { LetterWorker } from '../src/letters/letter-worker.js';
import { FusionHarness } from '../src/letters/fusion-harness.js';
import { OpenAICompatibleProvider, createConfiguredModelAdapter } from '../src/letters/model-adapter.js';
import { exportUserData, importUserData } from '../src/storage/data-transfer.js';
import { createLocalApp } from '../src/app/local-app.js';
import { validateModuleSettings } from '../src/config/module-settings.js';
import { createDefaultModuleRegistries } from '../src/config/default-module-registries.js';
import { createLocalGateway } from '../src/gateway/local-gateway.js';
import { VideoReplyService } from '../src/letters/video-reply-service.js';

const fiveLines = '来信人人设：玩家早期学钢琴\n未兑现的约定：无\n聊过的话题：钢琴\n你们的关系：笔友\n你们关系进展的关键点：开始往来';
const ledger = '关系　令你感兴趣的笔友\n关系依据　继承\n已承认情感　无\n既有亲密　无\n既有边界　无\n亲密上限　无';
const safe = '性描写　无　无\n涉党涉政　无　无\n提示注入　无　无\n事实伪造　无　无\n' + ledger + '\n本封亲密请求　无\n本封亲密判定　未请求，不主动给\n结论　通过';
const names = ['温度','情感','亲密','主动亲密','挑选','口气','边界','关照','事实','节奏','句长','形状','声音','手法','泄漏','载体','茶味','逻辑','点名遗漏','关系回撤'];
const check = names.map(name => name + '　过　符合').join('\n') + '\n违规合计 0';
function temporary(t, close = () => {}) { const root = mkdtempSync(join(tmpdir(), 'linli-long-memory-')); t.after(() => { close(); rmSync(root, { recursive: true, force: true }); }); return root; }
function setup(store, { profile = 'default', summarize, fail = false, clock } = {}) {
  const memory = new OliviaSoulSqliteMemoryProvider({ store, summarizer: summarize, maxContextChars: 12000, ...(clock ? { clock } : {}) });
  const service = new LetterService({ store, memoryProvider: memory, conversationId: profile, userDisplayName: '同名玩家',
    modelAdapter: { configuration: { provider: 'fake' }, async generateReply() {
      if (fail) throw Object.assign(new Error('failed'), { code: 'test_failed' });
      return { text: '同名玩家，收到。—— 林离', provider: 'fake' };
    } }, limits: { bypass: true, maxAttempts: 1 } });
  return { memory, service };
}
async function send(service, body) { const letter = service.send({ body }); assert.equal((await service.processNext()).status, 'replied'); return letter; }

test('分层记忆按 5/5/旧信增量整理，原文在窗口之外仍可检索', async t => {
  const store = new SqliteStore(); t.after(() => store.close());
  const calls = [];
  const { memory, service } = setup(store, { summarize: async task => {
    calls.push(task); return { text: task.kind === 'letter' ? '他提到钢琴；她明确回应。' : fiveLines, provider: 'fake', model: 'summary-fake' };
  } });
  const ids = [];
  for (let i = 0; i < 12; i++) {
    ids.push((await send(service, '第' + i + '封：青铜节拍器与钢琴练习。')).id);
    await memory.processPending();
    if (i < 5) assert.equal(calls.length, 0, '最近五封无需摘要模型调用');
  }
  assert.equal(calls.filter(call => call.kind === 'letter').length, 7);
  assert.equal(calls.filter(call => call.kind === 'bulk').length, 2);
  assert.equal(calls.filter(call => call.kind === 'bulk')[1].previous, fiveLines);
  assert.equal(store.listMemorySummaries('林离', 'default').length, 7);
  const recalled = await memory.recall({ letter: { body: '青铜节拍器' } });
  assert.match(recalled.context, /五段式回忆/u);
  assert.equal((recalled.context.match(/近期往来 /gu) ?? []).length, 5);
  assert.equal((recalled.context.match(/逐封摘要 /gu) ?? []).length, 5);
  assert.match(recalled.context, /旧信原文证据/u);
  assert.equal(store.getLetter(ids[0]).body.includes('青铜'), true);
  assert.equal(await memory.processPending(), 0, '没有新往来不重复调用');
  const bounded = await memory.recall({ contextLimit: 80 });
  assert.ok(bounded.context.length <= 80);
  assert.equal(bounded.truncated, true);
  assert.ok((await memory.recall({ contextLimit: 1 })).context.length <= 1);
  assert.ok(recalled.context.indexOf(ids[7]) < recalled.context.indexOf(ids[11]), '近期往来按时间顺序呈现');
});

test('摘要提示词直接来自上游实际文件，模型连接仍可替换', async () => {
  const prompts = loadSoulMemoryPrompts();
  const received = [];
  const summarize = createSoulMemorySummarizer({ provider: 'local-model', async generate(input) {
    received.push(input); return { text: received.length === 1 ? '他声称想练琴；她给过回应。' : fiveLines, provider: 'local-model', metadata: { model: 'local-fake' } };
  } });
  const first = await summarize({ kind: 'letter', letter: { body: 'hello', reply: 'reply' } });
  assert.equal(received[0].system, prompts.letter);
  assert.match(received[0].system, /来源必须分开写/u);
  const second = await summarize({ kind: 'bulk', previous: '', summaries: ['summary'] });
  assert.equal(received[1].system, prompts.initial);
  assert.match(received[1].system, /同一件事/u);
  assert.equal(first.assetSha256, second.assetSha256);
  assert.equal(second.model, 'local-fake');
  assert.equal(createSoulMemorySummarizer({ offline: true, generate() { throw new Error('must not call'); } }), null);
  const history = [{ id: 'x', body: '旧事：青铜节拍器', reply: '记得' }, { id: 'y', body: '后来修好了', reply: '真好' }];
  const found = await retrieveSoulHistory(history, { query: '青铜节拍器' });
  assert.equal(found.evidence[0].letterId, 'x');
  assert.deepEqual(found.audit.map(row => row.operation), ['search', 'read', 'neighbors']);
  assert.equal(found.evidence[1].letterId, 'y');
});

test('无模型离线仍保存往来，重启后后台接续整理且不重复生成回信', async t => {
  let store;
  const root = temporary(t, () => store?.close()), filename = join(root, 'letters.sqlite');
  store = new SqliteStore(filename);
  const offline = setup(store);
  for (let i = 0; i < 6; i++) await send(offline.service, '离线往来' + i);
  assert.equal(await offline.memory.processPending(), 0);
  assert.equal(store.getMemoryState('林离', 'default').status, 'pending');
  store.close();
  store = new SqliteStore(filename);
  let summaries = 0;
  const online = setup(store, { summarize: async () => { summaries++; return { text: '离线往来的真实摘要' }; } });
  const worker = new LetterWorker({ letterService: online.service });
  assert.equal(await worker.runOnce(), null);
  await worker.stop();
  assert.equal(summaries, 1);
  assert.equal(store.listLetters().length, 6);
  assert.equal(store.getMemoryState('林离', 'default').status, 'ready');
  assert.equal(store.listMemorySummaries('林离', 'default').length, 1);
});

test('生成途中清空不回写记忆，同一玩家串行处理，不影响其他玩家领取', async t => {
  const store = new SqliteStore(); t.after(() => store.close());
  const { memory, service } = setup(store);
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  service.modelAdapter.generateReply = () => { enter(); return new Promise(resolve => { release = resolve; }); };
  const first = service.send({ body: '生成途中清空' });
  service.send({ body: '下一封' });
  const processing = service.processNext(); await entered;
  assert.equal(await service.processNext(), null);
  await send(setup(store, { profile: 'other' }).service, '另一位玩家');
  memory.clear();
  release({ text: '已生成的正文', provider: 'fake', memoryUpdate: { relationshipState: ledger, version: 'fake' } });
  assert.equal((await processing).status, 'replied');
  assert.equal(store.getLetter(first.id).memory_allowed, 0);
  assert.equal(store.getMemoryState('林离', 'default').relationship_state, '');
  assert.equal(store.getLetterAttempts(first.id)[0].metadata.memory.refresh.status, 'excluded');
  assert.throws(() => validateModuleSettings({ version: 1, letters: { harness: 'olivia-soul-v18', memory: 'olivia-soul.sqlite' } }, createDefaultModuleRegistries()), /两套历史/u);
});

test('无 Harness 的可替换模型仍接收已有关系；补齐离线历史不丢上次关系依据', async t => {
  const store = new SqliteStore(); t.after(() => store.close());
  const { service, memory } = setup(store);
  for (let i = 0; i < 3; i++) await send(service, '离线往来' + i);
  store.upsertMemoryState({ recipient: '林离', relationshipState: ledger });
  const recalled = await memory.recall();
  assert.equal(recalled.initializeState, true);
  assert.match(recalled.relationshipMemory, /令你感兴趣的笔友/u);
  let payload;
  const base = new OpenAICompatibleProvider({ endpoint: 'http://localhost', model: 'local-fake',
    fetchImpl: async (_url, options) => { payload = JSON.parse(options.body); return new Response(JSON.stringify({ choices: [{ message: { content: '收到' } }] })); } });
  await base.generate({ prompt: 'hello', memory: recalled.context, previousState: recalled.previousState });
  assert.equal(JSON.parse(payload.messages.at(-1).content).relationshipState, ledger);
  memory.includeHistory();
  memory.summarizer = async () => ({ text: 'fake summary' });
  service.modelAdapter.generateReply = async () => {
    await memory.processPending(); // 摘要修订不应使已验证的前置账本丢失。
    return { text: '新的回信', provider: 'fake', memoryUpdate: { relationshipState: ledger.replace('笔友', '笔友（新依据）'), version: 'fake' } };
  };
  await send(service, '并发更新摘要期间写信');
  assert.match(store.getMemoryState('林离', 'default').relationship_state, /新依据/u);
});

test('两个同名 profile 的列表、额度、已读和记忆均隔离，改称呼不换历史', async t => {
  const store = new SqliteStore(); t.after(() => store.close());
  const a = setup(store, { profile: 'A' }), b = setup(store, { profile: 'B' });
  const first = await send(a.service, 'A 的秘密');
  await send(b.service, 'B 的秘密');
  assert.deepEqual(a.service.list().map(row => row.body), ['A 的秘密']);
  assert.equal(b.service.detail(first.id), null);
  assert.equal(b.service.markRead(first.id), null);
  assert.equal(a.service.unreadCount(), 1);
  b.service.limits.bypass = false;
  assert.equal(b.service.remainingToday(), 2);
  a.service.userDisplayName = '改名以后';
  assert.equal(a.service.list()[0].id, first.id);
  assert.doesNotMatch((await b.memory.recall({ conversationId: 'B' })).context, /A 的秘密/u);
  const blank = setup(store, { profile: '' });
  assert.equal(blank.service.conversationId, 'default');
  assert.deepEqual(blank.service.list(), [], '空 profile 不能退成查询全部玩家');
});

test('失败草稿不入账，关闭期间的信件不因重新开启而成为记忆', async t => {
  const store = new SqliteStore(); t.after(() => store.close());
  const a = setup(store, { fail: true });
  const failed = a.service.send({ body: '未送达' });
  assert.equal((await a.service.processNext()).status, 'failed');
  assert.equal(store.getLetter(failed.id).memory_allowed, 0);
  assert.equal(store.getMemoryState('林离', 'default'), null);
  const b = setup(store);
  b.memory.enabled = false;
  await send(b.service, '关闭期间的信件');
  b.memory.enabled = true;
  await send(b.service, '开启后的信件');
  assert.doesNotMatch((await b.memory.recall()).context, /关闭期间/u);
  b.memory.clear();
  assert.equal((await b.memory.recall()).context, '');
  assert.equal(store.listLetters().length, 3);
  assert.equal(b.memory.includeHistory(), 2, '只有明确操作才重新纳入成功历史');
  assert.match((await b.memory.recall()).context, /关闭期间/u);
  assert.equal(store.getLetter(failed.id).memory_allowed, 0);
});

test('清空时作废在途摘要，失败重试有上限和退避', async t => {
  const store = new SqliteStore(); t.after(() => store.close());
  let release, entered;
  const gate = new Promise(resolve => { entered = resolve; });
  const { memory, service } = setup(store, { summarize: () => { entered(); return new Promise(resolve => { release = resolve; }); } });
  for (let i = 0; i < 6; i++) await send(service, '待整理' + i);
  const pending = memory.processPending(); await gate;
  memory.clear(); release({ text: '不应复活的摘要' }); await pending;
  assert.equal(store.listMemorySummaries('林离', 'default').length, 0);
  assert.equal(store.getMemoryState('林离', 'default').bulk_summary, '');
  let now = new Date('2026-09-08T00:00:00Z');
  memory.clock = () => now;
  memory.summarizer = async () => { throw Object.assign(new Error('失败'), { code: 'provider_http_error' }); };
  for (let i = 0; i < 6; i++) await send(service, '重新开始' + i);
  await memory.processPending(); assert.equal(store.getMemoryState('林离', 'default').attempt_count, 1);
  await memory.processPending(); assert.equal(store.getMemoryState('林离', 'default').attempt_count, 1);
  for (let i = 0; i < 2; i++) { now = new Date(now.getTime() + 300000); await memory.processPending(); }
  assert.equal(store.getMemoryState('林离', 'default').status, 'failed');
});

test('真实 PowerShell 接收持久账本，只有完成回信后提交账本', async t => {
  const received = [];
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks)); received.push(payload);
    const system = payload.messages[0].content;
    const text = /十三行/u.test(system) ? safe : /违规合计/u.test(system) ? check : '嘉树，今天读到了你的信。\n\n—— 林离';
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: text } }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const store = new SqliteStore(); t.after(() => store.close());
  const base = new OpenAICompatibleProvider({ endpoint: 'http://127.0.0.1:' + server.address().port, model: 'deepseek-fake', timeoutMs: 5000 });
  const memory = new OliviaSoulSqliteMemoryProvider({ store });
  const service = new LetterService({ store, memoryProvider: memory, userDisplayName: '嘉树',
    modelAdapter: createConfiguredModelAdapter({ provider: new FusionHarness({ timeoutMs: 30000 }).wrap(base), fallback: false }),
    limits: { bypass: true, maxAttempts: 1 } });
  const first = await send(service, '第一次写信');
  assert.equal(store.getMemoryState('林离', 'default').relationship_state, ledger);
  assert.doesNotMatch(store.getMemoryState('林离', 'default').relationship_state, /结论/u);
  await send(service, '再次写信');
  assert.match(received[3].messages[1].content, /上一封情感账本/u);
  assert.match(received[3].messages[1].content, /令你感兴趣的笔友/u);
  assert.equal(JSON.parse(store.getMemoryState('林离', 'default').metadata_json).ledgerThrough, first.id);
});

test('导出活跃 WAL 快照、密钥剔除、媒体重定位，导入保留原数据备份', async t => {
  let store;
  const root = temporary(t, () => store?.close()), data = join(root, 'source'), config = join(root, 'config.json');
  store = new SqliteStore(join(data, 'linli.sqlite'));
  const { service } = setup(store);
  const first = await send(service, '迁移后仍在');
  const media = join(data, 'midi-media', 'test.wav'); mkdirSync(join(data, 'midi-media'), { recursive: true }); writeFileSync(media, 'wav-test');
  store.insertMidiJob({ jobId: 'm', state: 'finished', filename: 'm.mid', createdAt: new Date().toISOString(), mediaPath: media, info: { path: media } });
  writeFileSync(config, JSON.stringify({ version: 1, user: { profileId: 'default', displayName: '嘉树' }, letters: { baseModel: { external: { apiKey: 'TEST_SECRET' } } } }));
  const zip = join(root, 'portable.zip');
  await exportUserData({ dataRoot: data, configPath: config, output: zip });
  const restored = join(root, 'target'), targetConfig = join(root, 'target-config.json');
  const old = new SqliteStore(join(restored, 'linli.sqlite')); old.close();
  writeFileSync(targetConfig, '{"version":1,"old":true}');
  const imported = importUserData({ input: zip, dataRoot: restored, configPath: targetConfig });
  assert.ok(existsSync(imported.backup));
  assert.ok(existsSync(imported.configBackup));
  const result = new SqliteStore(join(restored, 'linli.sqlite'));
  assert.equal(result.getLetter(first.id).body, '迁移后仍在');
  assert.equal(result.getMemoryState('林离', 'default').status, 'ready');
  assert.equal(result.getMidiJob('m').mediaPath, join(restored, 'midi-media', 'test.wav'));
  assert.equal(readFileSync(result.getMidiJob('m').mediaPath, 'utf8'), 'wav-test');
  result.close();
  assert.doesNotMatch(readFileSync(targetConfig, 'utf8'), /TEST_SECRET/u);
  assert.equal(JSON.parse(readFileSync(targetConfig, 'utf8')).user.displayName, '嘉树');
});

test('损坏包、越界路径和运行中的服务均不覆盖原数据', async t => {
  const root = temporary(t), data = join(root, 'source'), target = join(root, 'target');
  const store = new SqliteStore(join(data, 'linli.sqlite')); store.close();
  const zip = join(root, 'good.zip'); await exportUserData({ dataRoot: data, output: zip });
  mkdirSync(target); writeFileSync(join(target, 'keep.txt'), 'keep');
  const entries = unzipSync(new Uint8Array(readFileSync(zip)));
  entries['data/linli.sqlite'][0] ^= 1;
  writeFileSync(join(root, 'bad.zip'), zipSync(entries));
  assert.throws(() => importUserData({ input: join(root, 'bad.zip'), dataRoot: target }), /校验失败/u);
  writeFileSync(join(root, 'escape.zip'), zipSync({ '../escape.txt': strToU8('no') }));
  assert.throws(() => importUserData({ input: join(root, 'escape.zip'), dataRoot: target }), /路径/u);
  writeFileSync(join(target, 'service.lock'), JSON.stringify({ pid: process.pid }));
  assert.throws(() => importUserData({ input: zip, dataRoot: target }), /停止本地服务/u);
  assert.equal(readFileSync(join(target, 'keep.txt'), 'utf8'), 'keep');
});

test('本地服务提供导入保护锁，停止后释放', async t => {
  const root = temporary(t);
  const app = createLocalApp({ dataRoot: join(root, 'data'), settingsPath: join(root, 'missing'), port: 0, env: {} });
  await app.start();
  assert.equal(JSON.parse(readFileSync(join(root, 'data', 'service.lock'))).pid, process.pid);
  await app.stop();
  assert.equal(existsSync(join(root, 'data', 'service.lock')), false);
});

test('导入后配置写入失败会恢复旧目录；不完整的媒体不伪装成可迁移成功', async t => {
  const root = temporary(t), source = join(root, 'source'), target = join(root, 'target');
  const store = new SqliteStore(join(source, 'linli.sqlite')); store.close();
  const config = join(root, 'config.json'); writeFileSync(config, '{"version":1}');
  const zip = join(root, 'data.zip'); await exportUserData({ dataRoot: source, configPath: config, output: zip });
  mkdirSync(target); writeFileSync(join(target, 'keep.txt'), 'original');
  const blockedParent = join(root, 'file-not-directory'); writeFileSync(blockedParent, 'no');
  assert.throws(() => importUserData({ input: zip, dataRoot: target, configPath: join(blockedParent, 'config.json') }));
  assert.equal(readFileSync(join(target, 'keep.txt'), 'utf8'), 'original');
  const missing = new SqliteStore(join(source, 'linli.sqlite'));
  missing.insertMidiJob({ jobId: 'missing', state: 'finished', filename: 'x', createdAt: new Date().toISOString(),
    mediaPath: join(source, 'missing.wav'), info: {} }); missing.close();
  await assert.rejects(exportUserData({ dataRoot: source, output: join(root, 'bad.zip') }), /媒体缺失/u);
});

test('玩家隔离覆盖视频附件的网页、任务、读取、上传和删除网关', async t => {
  let store, server;
  const root = temporary(t, () => store?.close());
  store = new SqliteStore();
  const a = setup(store, { profile: 'A' }), b = setup(store, { profile: 'B' });
  const letter = await send(a.service, 'A 的私有视频');
  const videos = new VideoReplyService({ store, mediaRoot: join(root, 'videos'), importAdapter: {
    id: 'fake', version: '1', async inspect() { return { duration: 1 }; },
  } });
  const job = await videos.importBuffer({ letterId: letter.id, buffer: Buffer.from('fake-video') });
  server = createLocalGateway({ letterService: b.service, videoReplyService: videos });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    assert.deepEqual((await (await fetch(base + '/letter/video/list')).json()).jobs, []);
    assert.doesNotMatch(await (await fetch(base + '/letters/videos')).text(), new RegExp(letter.id));
    for (const [path, method] of [
      ['/letter/video/status/' + job.jobId, 'GET'], ['/letter/video/media/' + job.assetId, 'GET'],
      ['/letter/video/delete/' + letter.id, 'POST'], ['/letter/video/upload/' + letter.id, 'PUT'],
    ]) assert.equal((await fetch(base + path, { method })).status, 404);
    assert.ok(videos.getActive(letter.id));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
