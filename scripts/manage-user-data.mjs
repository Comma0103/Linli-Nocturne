import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { SqliteStore } from '../src/storage/sqlite-store.js';
import { OliviaSoulSqliteMemoryProvider } from '../src/letters/olivia-soul-sqlite-memory.js';
import { assertServiceStopped, exportUserData, importUserData } from '../src/storage/data-transfer.js';

const configPath = resolve(process.argv[2] ?? process.env.LINLI_USER_CONFIG ?? 'config/user-config.json');
const dataRoot = resolve(process.env.LINLI_DATA_ROOT ?? 'data');
if (!existsSync(configPath)) throw new Error('请先复制 config/user-config.example.json 为 config/user-config.json。');
const user = JSON.parse(readFileSync(configPath, 'utf8'));
const scope = String(user.user?.profileId ?? '').trim() || 'default';
const reader = createInterface({ input: stdin, output: stdout });
let store;
try {
  console.log('当前玩家：' + (user.user?.displayName || '未命名') + '\n');
  console.log('1. 切换玩家\n2. 创建玩家\n3. 修改当前称呼\n4. 查看记忆和更新状态\n5. 忘记指定信件或清空记忆\n6. 导出数据包\n7. 导入数据包\n8. 重试失败的记忆整理\n9. 将旧信重新纳入记忆\n0. 退出');
  const choice = (await reader.question('选择：')).trim();
  if (!choice || choice === '0') process.exitCode = 0;
  else if (choice === '6') {
    const output = (await reader.question('数据包保存位置 [linli-user-data.zip]：')).trim() || 'linli-user-data.zip';
    const result = await exportUserData({ dataRoot, configPath, output });
    console.log('已导出：' + result.output + '。模型密钥不会随包导出。');
  } else {
    assertServiceStopped(dataRoot);
    if (choice === '7') {
      const input = (await reader.question('选择要导入的数据包路径：')).trim();
      const result = importUserData({ input, dataRoot, configPath });
      console.log('导入完成。原数据备份：' + (result.backup ?? '无') + '。填写模型密钥后启动服务即可。');
    } else {
      if (!existsSync(join(dataRoot, 'linli.sqlite'))) throw new Error('请先启动一次本地服务以建立数据目录。');
      store = new SqliteStore(join(dataRoot, 'linli.sqlite'));
      user.user ??= {};
      user.user.profiles = { ...(user.user.profiles ?? {}), [scope]: user.user.displayName ?? '' };
      const save = () => writeFileSync(configPath, JSON.stringify(user, null, 2) + '\n', 'utf8');
      if (choice === '1') {
        const ids = [...new Set([scope, ...Object.keys(user.user.profiles), ...store.db.prepare('SELECT DISTINCT conversation_id FROM letters').all().map(row => row.conversation_id)])];
        ids.forEach((id, i) => console.log((i + 1) + '. ' + (user.user.profiles[id] || '未命名') + ' [' + id + ']'));
        const index = Number(await reader.question('选择玩家编号：')) - 1;
        if (!Number.isInteger(index) || !ids[index]) throw new Error('无效编号。');
        user.user.profileId = ids[index];
        user.user.displayName = user.user.profiles[ids[index]] ?? (await reader.question('这位玩家的称呼：')).trim();
        save(); console.log('玩家已切换，启动服务后生效。');
      } else if (choice === '2') {
        const name = (await reader.question('新玩家的称呼：')).trim();
        if (!name) throw new Error('称呼不能为空。');
        const id = randomUUID();
        user.user.profileId = id; user.user.displayName = name; user.user.profiles[id] = name;
        save(); console.log('已创建独立玩家档案，启动服务后生效。');
      } else if (choice === '3') {
        const name = (await reader.question('新的称呼：')).trim();
        if (!name) throw new Error('称呼不能为空。');
        user.user.displayName = name; user.user.profiles[scope] = name;
        save(); console.log('称呼已修改，历史和关系保持原档案。');
      } else if (choice === '4') {
        const states = store.db.prepare('SELECT recipient, bulk_summary, relationship_state, status, attempt_count, last_error, updated_at FROM memory_states WHERE conversation_id = ?').all(scope);
        const labels = { pending: '等待整理（需要已配置的模型）', processing: '正在整理', ready: '整理完成', failed: '整理失败，可选择重试' };
        for (const state of states) {
          console.log('收信人：' + state.recipient + '\n整理状态：' + (labels[state.status] ?? state.status) + '\n关系账本：\n' + (state.relationship_state || '尚未由模型建立') + '\n旧信回忆：\n' + (state.bulk_summary || '尚未生成；最近十封不需要旧信回忆'));
          if (state.last_error && state.last_error !== 'memory_refresh_queued') console.log('错误码：' + state.last_error);
        }
        const rows = store.listLetters(50, scope);
        console.log('\n最近信件（ID 用于查看或遗忘）：');
        for (const row of rows) console.log(row.id + '  ' + row.created_at + '  ' + (row.memory_allowed ? '已纳入' : '未纳入') + '\n' + row.body.slice(0, 120));
      } else if (choice === '5') {
        const id = (await reader.question('输入信件 ID，或输入 ALL 清空当前玩家记忆（原信件保留）：')).trim();
        if (!id) throw new Error('未选择要遗忘的内容。');
        if (id !== 'ALL' && store.getLetter(id)?.conversation_id !== scope) throw new Error('当前玩家没有这封信。');
        new OliviaSoulSqliteMemoryProvider({ store }).clear({ conversationId: scope, sourceLetterId: id === 'ALL' ? null : id });
        console.log('记忆已清除，保留的原信不会自动再次进入记忆。');
      } else if (choice === '8') {
        store.db.prepare("UPDATE memory_states SET status = 'pending', attempt_count = 0, next_attempt_at = NULL WHERE conversation_id = ? AND status = 'failed'").run(scope);
        console.log('已安排重试；启动配置了模型的服务后自动执行。');
      } else if (choice === '9') {
        const id = (await reader.question('输入已回复信件 ID，或输入 ALL 重新纳入当前玩家的全部成功往来（含曾关闭或遗忘的信件）：')).trim();
        if (!id || (id !== 'ALL' && store.getLetter(id)?.conversation_id !== scope)) throw new Error('未选择当前玩家的有效信件。');
        const count = new OliviaSoulSqliteMemoryProvider({ store }).includeHistory({ conversationId: scope, sourceLetterId: id === 'ALL' ? null : id });
        console.log('已纳入 ' + count + ' 封成功往来，后续按当前记忆和模型设置处理。');
      } else throw new Error('无效选择。');
    }
  }
} finally { store?.close(); reader.close(); }
