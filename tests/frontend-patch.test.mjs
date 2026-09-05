import test from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, strToU8, zipSync } from 'fflate';
import { applyFrontendPatch, inspectFrontendArchive, planFrontendPatch } from '../src/patcher/frontend-archive.js';

const endpoints = ['/signIn', '/getUserInfo', '/letter/send', '/letter/list', '/letter/detail', '/letter/unread_count', '/letter/share', '/letter/resend', '/addToPlaylist', '/delFromPlaylist', '/searchPlaylist'];
const fixture = zipSync({ 'assets/main-fixture.js': strToU8(endpoints.map(endpoint => `fetch("${endpoint}")`).join(';')), 'assets/keep.txt': strToU8('keep') });

test('frontend patch plan validates the archive contract', () => {
  const plan = planFrontendPatch(fixture, { serviceUrl: 'http://127.0.0.1:27149' });
  assert.equal(plan.mainPath, 'assets/main-fixture.js');
  assert.equal(plan.entryCount, 2);
});

test('frontend patch rewrites routes and preserves unrelated assets', () => {
  const result = applyFrontendPatch(fixture, { serviceUrl: 'http://127.0.0.1:27149/' });
  const inspected = inspectFrontendArchive(result.buffer);
  const source = strFromU8(inspected.entries[inspected.mainPath]);
  assert.match(source, /LinliNocturnePatch:compat-routes-v1/);
  assert.match(source, /http:\/\/127\.0\.0\.1:27149\/toy\/letter\/send/);
  assert.equal(strFromU8(inspected.entries['assets/keep.txt']), 'keep');
});

test('frontend patch refuses a second application', () => {
  const result = applyFrontendPatch(fixture, { serviceUrl: 'http://127.0.0.1:27149' });
  assert.throws(() => planFrontendPatch(result.buffer, { serviceUrl: 'http://127.0.0.1:27149' }), /already contains/);
});
