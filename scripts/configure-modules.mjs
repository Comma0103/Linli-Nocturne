import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createDefaultModuleRegistries } from '../src/config/default-module-registries.js';
import { ModuleSettingsStore } from '../src/config/module-settings.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { applySelectionsToUserConfig } from '../src/config/configure-selections.js';
import { loadUserConfig } from '../src/config/user-config.js';
import { DEFAULT_MODULE_SETTINGS } from '../src/config/module-settings.js';

const userMode = process.argv[2] === '--user-config' || (!process.argv[2] && existsSync('config/user-config.json'));
const filename = userMode ? process.argv[3] ?? 'config/user-config.json' : process.argv[2] ?? 'config/module-settings.json';
const registries = createDefaultModuleRegistries();
const store = new ModuleSettingsStore({ filename, registries });
const currentUser = userMode ? JSON.parse(readFileSync(filename, 'utf8')) : null;
const current = userMode ? loadUserConfig(filename, { defaultSettings: DEFAULT_MODULE_SETTINGS, validateAccess: false }).settings : store.load();
const readline = createInterface({ input, output });

async function choose(label, registry, currentId, { allowNone = false } = {}) {
  const modules = registry.list();
  console.log(`\n${label}`);
  modules.forEach((module, index) => console.log(`  ${index + 1}. ${module.label} (${module.id})`));
  if (allowNone) console.log('  0. 不使用');
  const answer = (await readline.question(`选择 [回车保留 ${currentId ?? '不使用'}]：`)).trim();
  if (!answer) return currentId ?? null;
  const index = Number(answer);
  if (allowNone && index === 0) return null;
  if (!Number.isInteger(index) || index < 1 || index > modules.length) throw new Error(`无效选择：${answer}`);
  return modules[index - 1].id;
}

async function chooseBoolean(label, currentValue) {
  const answer = (await readline.question(`${label} y/n [回车保留 ${currentValue ? 'y' : 'n'}]：`)).trim().toLowerCase();
  if (!answer) return Boolean(currentValue);
  if (!['y', 'n'].includes(answer)) throw new Error('请输入 y 或 n');
  return answer === 'y';
}

try {
  const settings = {
    version: 1,
    letters: {
      provider: await choose('信件回复实现', registries.provider, current.letters.provider),
      harness: await choose('可选 Harness', registries.harness, current.letters.harness, { allowNone: true }),
      persona: await choose('人格实现', registries.persona, current.letters.persona),
      memory: await choose('记忆实现', registries.memory, current.letters.memory),
      outputPolicy: await choose('落款校验', registries.outputPolicy, current.letters.outputPolicy ?? 'persona-contract'),
      fallback: await chooseBoolean('生成失败时启用最简离线降级？', current.letters.fallback !== false),
    },
    music: {
      renderer: await choose('音乐 Renderer', registries.renderer, current.music.renderer),
      playbackAdapter: await choose('播放适配器', registries.playback, current.music.playbackAdapter),
      encoder: await choose('媒体编码器', registries.encoder, current.music.encoder),
    },
    media: { ...current.media, renderer: await choose('媒体 Renderer', registries.renderer, current.media.renderer) },
    threeD: { renderer: await choose('未来 3D Renderer', registries.renderer, current.threeD.renderer, { allowNone: true }) },
  };
  if (userMode) {
    if (settings.letters.provider === 'external.openai-compatible') {
      currentUser.privacy ??= {};
      currentUser.privacy.allowExternalModelRequests = await chooseBoolean('允许将来信及启用的记忆发送给所选外部模型？', currentUser.privacy.allowExternalModelRequests === true);
    }
    writeFileSync(filename, `${JSON.stringify(applySelectionsToUserConfig(currentUser, settings), null, 2)}\n`, 'utf8');
  }
  else store.save(settings);
  console.log(`\n模块设置已保存：${filename}`);
} finally {
  readline.close();
}
