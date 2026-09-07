export class PersonaReplyPolicy {
  constructor({ signature } = {}) { this.signature = signature; this.provider = 'persona-contract'; this.version = '1.0.0'; }
  apply(text, { outputContract = {} } = {}) {
    const signature = this.signature ?? outputContract.signature;
    const original = String(text).trim();
    if (!signature) return { text: original, metadata: { policy: this.provider, version: this.version, action: 'none' } };
    if (typeof signature !== 'string' || /[\r\n]/u.test(signature) || signature.length > 100) throw Object.assign(new Error('落款须为 100 字以内的单行文字'), { code: 'reply_signature_invalid' });
    const escaped = signature.trim().split(/\s+/u).map(part => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('\\s*');
    const ending = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*$`, 'u');
    let body = original;
    let count = 0;
    while (ending.test(body)) { body = body.replace(ending, '').trimEnd(); count++; }
    if (!body.trim()) throw Object.assign(new Error('回信不能只有落款'), { code: 'reply_empty_body' });
    const result = `${body}\n\n${signature.trim()}`;
    return { text: result, metadata: { policy: this.provider, version: this.version,
      action: count === 0 ? 'added' : count > 1 ? 'deduplicated' : result === original ? 'unchanged' : 'normalized' } };
  }
}

export class NoopReplyPolicy {
  apply(text) { return { text, metadata: { policy: 'none', version: '1.0.0', action: 'none' } }; }
}
