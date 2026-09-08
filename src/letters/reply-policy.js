const TIME_OF_DAY = ['清晨', '午后', '傍晚', '深夜'];
const OPENING_WORD = /^(清晨|早晨|早上|上午|午后|下午|傍晚|晚上|夜里|夜晚|深夜|凌晨)(?=[，,。！？：:\s]|读到|收到)/u;

// 只识别正文开头的显式称呼；玩家名字按字面匹配，引用和正文中的名字不动。
function withoutSalutation(body, name) {
  if (!name || !body.startsWith(name)) return null;
  const suffix = body.slice(name.length);
  const punctuation = /^[，,：:]\s*/u.exec(suffix);
  return punctuation ? suffix.slice(punctuation[0].length) : null;
}

export class PersonaReplyPolicy {
  constructor({ signature } = {}) { this.signature = signature; this.provider = 'persona-contract'; this.version = '1.1.0'; }
  apply(text, { outputContract = {} } = {}, { timeOfDay = '', userDisplayName = '' } = {}) {
    const signature = this.signature ?? outputContract.signature;
    const original = String(text).trim();
    if (!signature) return { text: original, metadata: { policy: this.provider, version: this.version, action: 'none' } };
    if (typeof signature !== 'string' || /[\r\n]/u.test(signature) || signature.length > 100) throw Object.assign(new Error('落款须为 100 字以内的单行文字'), { code: 'reply_signature_invalid' });
    const escaped = signature.trim().split(/\s+/u).map(part => part.replace(/[.*+?^$()|[\]\\{}]/gu, '\\$&')).join('\\s*');
    const ending = new RegExp('(?:^|\\n)\\s*' + escaped + '\\s*$', 'u');
    let body = original;
    let count = 0;
    while (ending.test(body)) { body = body.replace(ending, '').trimEnd(); count++; }
    const name = outputContract.opening === 'salutation' ? String(userDisplayName ?? '').trim().replace(/[\r\n]+/gu, ' ') : '';
    let openingAction = 'unchanged';
    let salutation = '';
    if (name) {
      let remainder = withoutSalutation(body, name);
      if (remainder === null) {
        // 兼容“午后。嘉树，信到了。”，保留原来的时间句和标点。
        const time = OPENING_WORD.exec(body);
        const prefix = time ? /^[，,。！？：:\s]+/u.exec(body.slice(time[0].length)) : null;
        if (prefix) {
          const offset = time[0].length + prefix[0].length;
          const afterTime = withoutSalutation(body.slice(offset), name);
          if (afterTime !== null) remainder = body.slice(0, offset) + afterTime;
        }
      }
      salutation = name + '：\n\n';
      remainder = remainder ?? body;
      openingAction = salutation + remainder === body ? 'unchanged' : 'normalized';
      body = remainder;
    }
    if (!body.trim()) throw Object.assign(new Error('回信不能只有落款或称呼'), { code: 'reply_empty_body' });
    let temporalAction = 'unchanged';
    if (TIME_OF_DAY.includes(timeOfDay)) {
      const opening = OPENING_WORD.exec(body);
      if (opening && opening[1] !== timeOfDay) {
        body = timeOfDay + body.slice(opening[1].length);
        temporalAction = 'normalized';
      }
    }
    const result = salutation + body + '\n\n' + signature.trim();
    const signatureAction = count === 0 ? 'added' : count > 1 ? 'deduplicated' : result === original ? 'unchanged' : 'normalized';
    return { text: result, metadata: { policy: this.provider, version: this.version,
      action: temporalAction === 'normalized' || openingAction === 'normalized' || signatureAction === 'normalized' ? 'normalized' : signatureAction,
      timeOfDay: timeOfDay || undefined, temporalAction, openingAction } };
  }
}

export class NoopReplyPolicy {
  apply(text) { return { text, metadata: { policy: 'none', version: '1.0.0', action: 'none' } }; }
}
