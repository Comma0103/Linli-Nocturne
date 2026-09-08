import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { THIRD_PARTY_ROOT, SOUL_COMMIT } from './persona-bundle.js';
import { runProcess } from './model-adapter.js';

export const MEMORY_VERSION = 'olivia-soul-v18-sqlite-1';
export function exchangeHash(letter) {
  return createHash('md5').update(String(letter.body).trim() + '\n---\n' + String(letter.reply).trim()).digest('hex');
}

// 直接读取上游现有提示词，不维护另一份摘要规则副本。
export function loadSoulMemoryPrompts(root = join(THIRD_PARTY_ROOT, 'OliviaSoul/v18-harness')) {
  const source = readFileSync(join(root, 'scripts/memory-lib.ps1'), 'utf8');
  const letterSection = source.split('function Get-LetterSummary {')[1]?.split('function Get-BulkSummary {')[0];
  const rollingSection = source.split('function Get-RollingBulkSummary {')[1]?.split('function Format-Exchange {')[0];
  const letter = letterSection?.match(/\$sys = @"\r?\n([\s\S]*?)\r?\n"@/u)?.[1];
  const rolling = [...(rollingSection ?? '').matchAll(/\$system = @"\r?\n([\s\S]*?)\r?\n"@/gu)].map(match => match[1]);
  if (!letter || rolling.length !== 2) throw Object.assign(new Error('OliviaSoul 记忆规则缺失或结构已变化'), { code: 'memory_asset_invalid' });
  return { letter, incremental: rolling[0], initial: rolling[1],
    sha256: createHash('sha256').update(source).digest('hex'), revision: SOUL_COMMIT };
}

export function createSoulMemorySummarizer(base, options = {}) {
  if (!base?.generate || base.offline) return null;
  let prompts;
  return async input => {
    prompts ??= loadSoulMemoryPrompts(options.root);
    const letterTask = input.kind === 'letter';
    const system = letterTask ? prompts.letter : input.previous ? prompts.incremental : prompts.initial;
    const prompt = letterTask
      ? '他（来信）：\n' + input.letter.body + '\n\n她（回信）：\n' + input.letter.reply
      : (input.previous ? '已有旧信总结：\n' + input.previous + '\n\n新进入旧区的信：\n' : '') + input.summaries.join('\n');
    const result = await base.generate({ system, prompt, persona: '', memory: '', userDisplayName: '' });
    const text = String(result?.text ?? '').trim();
    if (!text) throw Object.assign(new Error('记忆整理未返回正文'), { code: 'memory_empty_summary' });
    if (!letterTask) {
      const labels = ['来信人人设', '未兑现的约定', '聊过的话题', '你们的关系', '你们关系进展的关键点'];
      const lines = text.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
      if (lines.length !== 5 || !labels.every((label, index) => lines[index].startsWith(label + '：'))) {
        throw Object.assign(new Error('五段式记忆格式不符'), { code: 'memory_summary_invalid' });
      }
    }
    return { text, provider: result.provider, model: result.metadata?.model ?? base.model ?? null,
      version: MEMORY_VERSION, sourceRevision: prompts.revision, assetSha256: prompts.sha256 };
  };
}

// 直接复用上游快照校验、search/read/neighbors 和查询预算；不落长期索引。
export async function retrieveSoulHistory(exchanges, { query = '', lookups, person = 'default',
  root = join(THIRD_PARTY_ROOT, 'OliviaSoul/v18-harness'), powershell = 'powershell.exe', runner = runProcess } = {}) {
  if (!exchanges.length || (!query.trim() && !lookups?.length)) return { evidence: [], audit: [] };
  const directory = await mkdtemp(join(tmpdir(), 'linli-memory-'));
  try {
    const snapshot = { schema: 'olivia-history.snapshot', version: 1, person, maxOrder: exchanges.length,
      exchanges: exchanges.map((row, index) => ({ letterId: row.id, order: index + 1,
        date: String(row.created_at ?? '').slice(0, 10), time: String(row.created_at ?? '').slice(11, 16),
        incoming: row.body, reply: row.reply, summary: '', contentMd5: exchangeHash(row),
        exactSha256: createHash('sha256').update(row.body.trim() + '\n---\n' + row.reply.trim()).digest('hex') })) };
    const input = join(directory, 'input.json'), output = join(directory, 'output.json');
    await writeFile(input, JSON.stringify({ root, snapshot, output, autoRead: !lookups,
      lookups: lookups ?? [{ operation: 'search', query: query.trim().slice(0, 120), side: 'any' }] }));
    const result = await runner(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      fileURLToPath(new URL('../../scripts/olivia-soul-memory-retrieval.ps1', import.meta.url)), '-InputFile', input],
    { cwd: directory, timeoutMs: 50_000, label: 'memory-retrieval' });
    if (result.code !== 0) throw Object.assign(new Error('原文检索执行失败'), { code: 'memory_retrieval_failed' });
    const found = JSON.parse(await readFile(output, 'utf8'));
    return { ...found, assetSha256: createHash('sha256').update(readFileSync(join(root, 'scripts/history-retrieval.ps1'))).digest('hex') };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
