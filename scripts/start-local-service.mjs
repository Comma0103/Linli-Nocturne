import { createLocalApp } from '../src/app/local-app.js';

const app = createLocalApp({
  dataRoot: process.env.LINLI_DATA_ROOT ?? 'data',
  settingsPath: process.env.LINLI_MODULE_SETTINGS ?? 'config/module-settings.json',
  userConfigPath: process.env.LINLI_USER_CONFIG ?? 'config/user-config.json',
  host: process.env.LINLI_HOST ?? '127.0.0.1',
  port: Number(process.env.LINLI_PORT) || 27149,
});

try {
  const address = await app.start();
  console.log(`林离·余音本地服务已启动：${address.serviceUrl}`);
  console.log(`视频回信管理页：${address.serviceUrl}/letters/videos`);
  console.log('按 Ctrl+C 停止服务。');
} catch (error) {
  console.error(`本地服务启动失败：${error.message}`);
  await app.stop().catch(() => {});
  process.exitCode = 1;
}

const shutdown = async () => { await app.stop(); process.exit(0); };
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
