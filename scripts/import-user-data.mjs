import { importUserData } from '../src/storage/data-transfer.js';
const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const result = importUserData({
  dataRoot: arg('--data-root', process.env.LINLI_DATA_ROOT ?? 'data'),
  configPath: arg('--config', process.env.LINLI_USER_CONFIG ?? 'config/user-config.json'),
  input: arg('--input', 'linli-user-data.zip'),
});
console.log('数据已导入：' + result.dataRoot + '；请填写外部模型密钥后启动本地服务。');
if (result.backup) console.log('原数据备份：' + result.backup);
