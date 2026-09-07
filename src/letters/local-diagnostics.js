import { mkdir, writeFile, rename, readdir, stat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const ownedFile = /^[a-f0-9-]{36}\.json$/u;
function bounded(value, fallback, min, max) {
  const number = value ?? fallback;
  if (!Number.isInteger(number) || number < min || number > max) throw new TypeError('diagnostics 配置超出允许范围');
  return number;
}

// 显式开启的本机日志。只接收阶段输出，不接收完整 provider 请求/响应对象。
export class LocalLetterDiagnostics {
  constructor({ enabled = false, directory = 'logs/letter-diagnostics', maxRuns = 20, maxCharsPerStage = 64_000, secrets = [] } = {}) {
    this.enabled = enabled === true;
    this.directory = resolve(directory);
    this.maxRuns = bounded(maxRuns, 20, 1, 1000);
    this.maxCharsPerStage = bounded(maxCharsPerStage, 64_000, 1, 1_000_000);
    this.secrets = secrets.filter(value => typeof value === 'string' && value.length);
  }

  start({ letterId = null, attempt = null, model = null, time = {}, secrets = [] } = {}) {
    if (!this.enabled) return { metadata: { enabled: false }, record: async () => {}, finish: async () => {} };
    const id = randomUUID();
    const metadata = { enabled: true, id, status: 'recording' };
    const document = { schema: 'linli.letter-diagnostics', schemaVersion: 1, id, letterId, attempt, model,
      startedAt: new Date().toISOString(), status: 'recording', time, stages: [] };
    const activePath = join(this.directory, `${id}.active.json`);
    const finalPath = join(this.directory, `${id}.json`);
    const redact = value => {
      let text = String(value ?? '');
      for (const secret of [...this.secrets, ...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) text = text.split(secret).join('[REDACTED]');
      return text.replace(/Bearer\s+[^\s"'<>]+/giu, 'Bearer [REDACTED]');
    };
    const safeWrite = async operation => {
      try { await operation(); }
      catch { metadata.status = 'write-failed'; metadata.code = 'diagnostics_write_failed'; }
    };
    const save = async () => {
      await mkdir(this.directory, { recursive: true });
      await writeFile(`${activePath}.tmp`, JSON.stringify(document, null, 2) + '\n', { mode: 0o600 });
      await rename(`${activePath}.tmp`, activePath);
    };
    return {
      metadata,
      record: async ({ id: stage, sequence, status, text, code }) => safeWrite(async () => {
        const redacted = redact(text);
        document.stages.push({ id: stage, sequence, status, at: new Date().toISOString(),
          text: redacted.slice(0, this.maxCharsPerStage), truncated: redacted.length > this.maxCharsPerStage, code });
        await save();
      }),
      finish: async (status, code) => safeWrite(async () => {
        document.status = status; document.errorCode = code; document.endedAt = new Date().toISOString();
        await save(); await rename(activePath, finalPath);
        if (metadata.status !== 'write-failed') metadata.status = status;
        // 仅清理本模块已完成、固定命名的文件，活动诊断及其他文件不受影响。
        const files = await Promise.all((await readdir(this.directory)).filter(name => ownedFile.test(name)).map(async name => ({
          name, at: (await stat(join(this.directory, name))).mtimeMs,
        })));
        files.sort((a, b) => b.at - a.at);
        for (const file of files.slice(this.maxRuns)) await unlink(join(this.directory, file.name));
      }),
    };
  }
}
