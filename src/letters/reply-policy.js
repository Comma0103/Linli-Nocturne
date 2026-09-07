export class PersonaReplyPolicy {
  constructor({ signature } = {}) { this.signature = signature; this.provider = 'persona-contract'; this.version = '1.0.0'; }
  apply(text, { outputContract = {} } = {}, { timeOfDay = '' } = {}) {
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
    let temporalBody = body;
    let temporalAction = 'unchanged';
    if (timeOfDay && ['清晨', '午后', '傍晚', '深夜'].includes(timeOfDay)) {
      const opening = /^(清晨|早晨|早上|上午|午后|下午|傍晚|晚上|夜里|夜晚|深夜|凌晨)(?=[，,。！？：:\s])/u.exec(temporalBody);
      if (opening && opening[1] !== timeOfDay) {
        temporalBody = `${timeOfDay}${temporalBody.slice(opening[1].length)}`;
        temporalAction = 'normalized';
      }
    }
    const result = `${temporalBody}\n\n${signature.trim()}`;
    const signatureAction = count === 0 ? 'added' : count > 1 ? 'deduplicated' : result === original ? 'unchanged' : 'normalized';
    return { text: result, metadata: { policy: this.provider, version: this.version,
      action: temporalAction === 'normalized' || signatureAction === 'normalized' ? 'normalized' : signatureAction,
      timeOfDay: timeOfDay || undefined, temporalAction } };
  }
}

export class NoopReplyPolicy {
  apply(text) { return { text, metadata: { policy: 'none', version: '1.0.0', action: 'none' } }; }
}
