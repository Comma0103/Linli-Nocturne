import { readFileSync } from 'node:fs';
import { validateModuleSettings } from '../src/config/module-settings.js';
import { createDefaultModuleRegistries } from '../src/config/default-module-registries.js';

const filename = process.argv[2] ?? 'config/module-settings.example.json';
const settings = JSON.parse(readFileSync(filename, 'utf8'));
validateModuleSettings(settings, createDefaultModuleRegistries());
console.log(`模块设置有效：${filename}`);
