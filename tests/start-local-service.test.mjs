import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('launcher resolves default config and data against its project even from another working directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'linli-launcher-'));
  const project = join(root, 'project'), cwd = join(root, 'other');
  try {
    mkdirSync(join(project, 'scripts'), { recursive: true });
    mkdirSync(join(project, 'src/app'), { recursive: true });
    mkdirSync(cwd);
    writeFileSync(join(project, 'package.json'), '{"type":"module"}');
    copyFileSync(new URL('../scripts/start-local-service.mjs', import.meta.url), join(project, 'scripts/start-local-service.mjs'));
    // Capture startup options at the app boundary; no user config, DB or port is touched.
    writeFileSync(join(project, 'src/app/local-app.js'), 'export function createLocalApp(options){console.log(JSON.stringify(options));return {start:async()=>({serviceUrl:"http://localhost:27149"}),stop:async()=>{}}}');
    const env = { ...process.env };
    for (const key of ['LINLI_DATA_ROOT', 'LINLI_MODULE_SETTINGS', 'LINLI_USER_CONFIG']) delete env[key];
    const run = overrides => {
      const child = spawnSync(process.execPath, [join(project, 'scripts/start-local-service.mjs')], { cwd, env: { ...env, ...overrides }, encoding: 'utf8', windowsHide: true });
      assert.equal(child.status, 0, child.stderr);
      return JSON.parse(child.stdout.split(/\r?\n/u)[0]);
    };
    const defaults = run({});
    assert.equal(defaults.dataRoot, join(project, 'data'));
    assert.equal(defaults.settingsPath, join(project, 'config/module-settings.json'));
    assert.equal(defaults.userConfigPath, join(project, 'config/user-config.json'));
    const custom = run({ LINLI_DATA_ROOT: 'isolated-data', LINLI_MODULE_SETTINGS: 'custom-modules.json', LINLI_USER_CONFIG: 'custom-user.json' });
    assert.equal(custom.dataRoot, 'isolated-data');
    assert.equal(custom.settingsPath, 'custom-modules.json');
    assert.equal(custom.userConfigPath, 'custom-user.json');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
