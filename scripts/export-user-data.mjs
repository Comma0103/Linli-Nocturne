import { exportUserData } from '../src/storage/data-transfer.js';
const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const result = await exportUserData({
  dataRoot: arg('--data-root', process.env.LINLI_DATA_ROOT ?? 'data'),
  configPath: arg('--config', process.env.LINLI_USER_CONFIG ?? 'config/user-config.json'),
  output: arg('--output', 'linli-user-data.zip'),
});
console.log('数据已导出：' + result.output + '（密钥不包含在包内）');
