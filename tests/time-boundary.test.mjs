import test from 'node:test';
import assert from 'node:assert/strict';
import { createDayBoundary } from '../src/core/time-boundary.js';
import { SqliteStore } from '../src/storage/sqlite-store.js';
import { LetterService } from '../src/letters/letter-service.js';
import { MidiJobService } from '../src/music/midi-job-service.js';

test('信件与 MIDI 在配置时区的午夜同步重置，数据库和内存统计一致', t => {
  const store = new SqliteStore();
  t.after(() => store.close());
  let now = new Date('2026-09-06T15:59:00.000Z');
  const options = { store, clock: () => now, timeZone: 'Asia/Shanghai' };
  const letters = new LetterService(options);
  const midi = new MidiJobService(options);
  const memoryMidi = new MidiJobService({ ...options, store: null });
  const job = { jobId: '昨日曲目', state: 'finished', filename: '样例.mid', createdAt: now.toISOString() };
  store.insertMidiJob(job);
  memoryMidi.jobs.set(job.jobId, job);
  for (let i = 0; i < 3; i++) letters.send({ body: '午夜前的信' });
  assert.equal(letters.remainingToday(), 0);
  assert.throws(() => letters.send({ body: '超过额度' }), { code: 'daily_limit' });
  assert.equal(midi.dailyUsage().generatedToday, 1);
  assert.deepEqual(memoryMidi.dailyUsage(), midi.dailyUsage());

  now = new Date('2026-09-06T16:00:00.000Z');
  assert.equal(letters.remainingToday(), 3);
  assert.equal(midi.dailyUsage().generatedToday, 0);
  assert.deepEqual(memoryMidi.dailyUsage(), midi.dailyUsage());
  letters.send({ body: '午夜后的信' });
  assert.equal(letters.remainingToday(), 2);
  now = new Date('2026-09-07T00:01:00.000Z');
  assert.equal(letters.remainingToday(), 2, 'UTC 午夜不会再次重置');

  now = new Date('2026-09-06T15:59:00.000Z');
  assert.equal(letters.remainingToday(), 0, '查询前一天时不计入未来信件');
});

test('自然日边界支持夏令时的 23/25 小时和午夜跳时', () => {
  const boundary = createDayBoundary('America/New_York');
  const spring = boundary(new Date('2026-03-08T12:00:00Z'));
  const autumn = boundary(new Date('2026-11-01T12:00:00Z'));
  assert.equal(Date.parse(spring.endIso) - Date.parse(spring.startIso), 23 * 3600000);
  assert.equal(Date.parse(autumn.endIso) - Date.parse(autumn.startIso), 25 * 3600000);
  const midnightJump = createDayBoundary('America/Sao_Paulo')(new Date('2018-11-04T12:00:00Z'));
  assert.equal(midnightJump.startIso, '2018-11-04T03:00:00.000Z');
  assert.equal(Date.parse(midnightJump.endIso) - Date.parse(midnightJump.startIso), 23 * 3600000);
  assert.throws(() => createDayBoundary('无效时区'), RangeError);
});
