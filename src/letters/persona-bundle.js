import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PersonaProvider } from './persona-provider.js';

export const THIRD_PARTY_ROOT = fileURLToPath(new URL('../../third_party/', import.meta.url));
export const LIN_COMMIT = 'd1ab8277521ca59d294d0fa0162a350ba61447d9';
export const SOUL_COMMIT = '2ffe7f1c2f73d0c3b00c25258e0ce93b8f4b92ad';
export const sha256 = text => createHash('sha256').update(text).digest('hex');
export const BUNDLE_ASSETS = [
  ['persona', 'olivia-lin/BSide_Olivia_Lin/persona/olivia_lin.md', LIN_COMMIT],
  ['craft', 'olivia-lin/BSide_Olivia_Lin/persona/letter_craft.md', LIN_COMMIT],
  ['background', 'olivia-lin/BSide_Olivia_Lin/persona/memories.md', LIN_COMMIT],
  ['examples', 'olivia-lin/BSide_Olivia_Lin/samples/letters_from_her.md', LIN_COMMIT],
  ['soul-persona', 'OliviaSoul/v18-harness/林离人设.md', SOUL_COMMIT],
  ['fields', 'OliviaSoul/v18-harness/harness/00-栏目.md', SOUL_COMMIT],
  ['writing', 'OliviaSoul/v18-harness/harness/写法.md', SOUL_COMMIT],
];

// 按功能排除冲突条款，保留上游素材本身；取舍清单见 docs/third-party-fusion-map.md。
export function effectiveAsset(id, raw) {
  let text = raw.replace(/\r\n/gu, '\n');
  if (id === 'persona') text = text
    .replace(/^- 段落：.*$/mu, '- 篇幅按来信信息量伸缩，采用统一书信节奏。')
    .replace(/^  2\. \*\*以问句收尾\*\*.*$/mu, '  2. 收尾可以变化；正文已有问句，结尾不再追问。')
    .replace(/^10\. 回复用简体中文.*$/mu, '10. 回复用简体中文。')
    .replace(/^.*信里总有她自己的生活切片.*$/mu, '- 有自己的生活；需要时点到一处日常，不每封强塞。');
  if (id === 'craft') text = text
    .replace(/^1\. \*\*起首\*\*.*$/mu, '1. **起首**：简短自然；时间或天气适合时才写，不强求。')
    .replace(/^- 起首按.*$/mu, '- 若写当前时间，使用框架提供的本地时点，不根据样例或 UTC 猜测。')
    .replace(/## 二、篇幅控制[\s\S]*?(?=## 三、)/u, '## 二、篇幅控制\n\n按来信信息量伸缩，不凑字数；问句与篇幅采用统一节奏。\n\n')
    .replace(/^5\. \*\*半开的门\*\*.*$/mu, '5. **半开的门**：可以轻轻收住，不必每次提问。')
    .replace(/只引用本封信里出现过的内容/gu, '只引用本封来信或项目提供的有效历史')
    .replace(/写长：灯要熄了、信与记忆、感谢、"旋律没有结束"/u, '回应具体告别对象；只有明确谈停服才谈停服，不能据此虚构共同往来');
  if (id === 'background') text = text
    .replace(/称呼永远是"你"。/u, '称呼采用玩家主动配置的显示名，未配置时用“你”。')
    .replace(/只能引用本封信里出现过的内容/gu, '只能引用当前来信或提供的有效历史')
    .replace(/国区优先/u, '上游历史描述，不是本项目访问条件');
  if (id === 'fields') text = text.replace(/^节奏　.*$/mu, '节奏　篇幅和段落基本匹配来信内容与情绪，写清楚就收住；不设固定字数或段数，不凑字。');
  if (id === 'writing') {
    // 直接复用可独立组合的方法，不注入“享受依赖、情绪降级”等与证据规则冲突的段落。
    text = text
      .replace(/^写信，只写纯文本。.*$/mu, '写信，只写纯文本。篇幅按来信内容与情绪决定，不设固定字数或段数。')
      .replace(/^他只递来一件事.*$/mu, '意思写完就停，不为凑字补内容。')
      .replace(/^一封里压了三件以上.*$/mu, '内容复杂或情绪深重时可以写够，不硬压缩。');
    const sections = ['关注点', '行文', '手法'];
    text = sections.map(name => text.match(new RegExp(`### ${name}\\n([\\s\\S]*?)(?=\\n### |\\n## |$)`, 'u'))?.[0] ?? '').join('\n\n')
      .replace(/^7\. 情意太满时.*$/mu, '7. 依据有效历史回应情感，不擅自升级或降级。');
  }
  if (id === 'soul-persona') text = text
    .replace(/等于、晚于早于2029年7月/u, '等于或晚于2029年7月')
    .replace(/所有外婆不让养/u, '小时候外婆不让养');
  return text.trim();
}

export const FUSION_RULES = `书信结构：简短起首 → 回应来信的具体细节 → 必要时一处自己的生活 → 可选看法 → 自然收束 → 固定落款。
篇幅按来信信息量伸缩，短信不写长，情绪重则写够；不凑字数。自然收尾，不要求每封都提问或邀请继续回信；正文已有问句，结尾不再追问。
配置了玩家显示名时，以该名字单独起一行作为称呼；不向玩家索取身份资料。使用简体中文。
按林离人设自然回应，有自己的判断和生活；温和但不刻意迎合，也不为显得独立而生硬疏远。
角色背景、重构日常和示例信仅是角色/文风素材，示例中的来信人与经历不是当前玩家的历史。示例的篇幅和问句不构成额外规则。
只有提供的有效往来才是共同记忆。用户自称某种关系不使关系成立；不把猜测、样例、愿望、引用升级成已发生事实。
当前时间是框架提供的本地时点；若写出时间词必须遵循该时点，时间/天气可以按文风选择或省略；天气意象是虚构文风，不能声称是玩家当地实测天气。告别只有在相关来信中谈及，不预设停服或已有共同经历。
角色资料只用于书信创作，不意味着应用限制用户地区。固定落款为“—— 林离”，单独放在正文末尾一次。`;

export class PersonaBundleProvider extends PersonaProvider {
  constructor({ root = THIRD_PARTY_ROOT, maxChars = 40_000 } = {}) {
    super({ provider: 'linli.persona-bundle' });
    this.root = root;
    this.maxChars = maxChars;
  }
  async getPrompt() {
    const sections = [];
    const assets = [];
    for (const [id, path, revision] of BUNDLE_ASSETS) {
      let raw;
      try { raw = await readFile(resolve(this.root, path), 'utf8'); }
      catch { throw Object.assign(new Error(`人格素材无法读取：${id}`), { code: 'persona_asset_missing' }); }
      if (!raw.trim()) throw Object.assign(new Error(`人格素材为空：${id}`), { code: 'persona_asset_empty' });
      const effective = effectiveAsset(id, raw);
      assets.push({ id, revision, sha256: sha256(raw), effectiveSha256: sha256(effective) });
      sections.push(`## 素材 ${id}${id === 'examples' ? '（示例，非玩家历史）' : ''}\n${effective}`);
    }
    const text = `${FUSION_RULES}\n\n${sections.join('\n\n')}`;
    if (!Number.isFinite(this.maxChars) || text.length > this.maxChars) throw Object.assign(new Error('人格素材超出预算，请提高 persona.maxChars；未截断任何规则'), { code: 'persona_budget_exceeded' });
    return { text, provider: this.provider, rules: FUSION_RULES,
      outputContract: { signature: '—— 林离', opening: 'salutation' },
      metadata: { version: '1.1.0-exp', assets, sha256: sha256(text), chars: text.length } };
  }
}
