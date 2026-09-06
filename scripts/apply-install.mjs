import { readFileSync } from 'node:fs';
import { executeInstallPlan } from '../src/patcher/install-executor.js';
import { createInstallPlan } from '../src/patcher/install-plan.js';
import { parseInstallArgs } from '../src/patcher/install-command.js';

const usage = `用法：
  node scripts/apply-install.mjs <游戏目录> <备份目录>
  node scripts/apply-install.mjs --apply --confirm=Linli-Nocturne <游戏目录> <备份目录>

默认只输出安装计划，不会写入文件。只有显式提供 --apply 和确认标记时才会执行备份与补丁。`;

const options = parseInstallArgs(process.argv.slice(2), process.env);
if (options.help) {
  console.log(usage);
  process.exit(0);
}
if (!options.gameRoot) throw new Error('请提供游戏目录，或设置 LINLI_GAME_ROOT');

const baseline = JSON.parse(readFileSync(new URL('../config/client-baseline-0.0.9.627.json', import.meta.url), 'utf8'));
const plan = createInstallPlan({ ...options, baseline });
if (!options.apply) {
  console.log(JSON.stringify({ mode: 'dry-run', plan }, null, 2));
  process.exitCode = plan.canApply ? 0 : 2;
} else if (!options.confirmed) {
  throw new Error('执行安装必须同时提供 --apply --confirm=Linli-Nocturne');
} else if (!plan.canApply) {
  console.error(JSON.stringify({ mode: 'blocked', blockers: plan.blockers, installation: plan.installation }, null, 2));
  process.exitCode = 2;
} else {
  const result = executeInstallPlan(plan, { baseline });
  console.log(JSON.stringify({ mode: 'applied', gameRoot: result.gameRoot, version: result.version, backup: result.backup }, null, 2));
}
