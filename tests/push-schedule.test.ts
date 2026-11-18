import assert from 'node:assert/strict';
import test from 'node:test';

import { addDays, occursOn as appOccursOn } from '../src/data/reminders.ts';
import { dueReminders, localClock, occursOn, type ScheduledReminder } from '../supabase/functions/push/schedule.ts';

const base: ScheduledReminder = {
  id: 'r1', householdId: 'h', title: '倒垃圾', emoji: '🗑️',
  dueDate: '2026-01-31', dueTime: '18:00', repeat: 'none', assignee: 'both',
};

test('server repeat rules match the app for every day of two years', () => {
  for (const repeat of ['none', 'daily', 'weekly', 'monthly'] as const) {
    for (const dueDate of ['2026-01-31', '2026-02-28', '2026-03-08', '2026-11-01']) {
      let day = '2025-12-25';
      for (let i = 0; i < 730; i += 1) {
        assert.equal(occursOn({ dueDate, repeat }, day), appOccursOn({ dueDate, repeat }, day), `${repeat} ${dueDate} ${day}`);
        day = addDays(day, 1);
      }
    }
  }
});

test('localClock reads the wall clock in the phone time zone, across DST', () => {
  // 2026-11-01 是洛杉矶夏令时结束的那天：同一个 UTC 时间前后差一小时
  assert.deepEqual(localClock(new Date('2026-11-01T08:30:00Z'), 'America/Los_Angeles'), { dateKey: '2026-11-01', minutes: 60 + 30 });
  assert.deepEqual(localClock(new Date('2026-11-02T02:00:00Z'), 'America/Los_Angeles'), { dateKey: '2026-11-01', minutes: 18 * 60 });
  assert.deepEqual(localClock(new Date('2026-07-01T01:30:00Z'), 'America/Vancouver'), { dateKey: '2026-06-30', minutes: 18 * 60 + 30 });
  assert.deepEqual(localClock(new Date('2026-07-01T01:30:00Z'), 'Asia/Shanghai'), { dateKey: '2026-07-01', minutes: 9 * 60 + 30 });
  assert.equal(localClock(new Date('2026-07-01T01:30:00Z'), 'Not/AZone').dateKey, '2026-06-30');
});

test('dueReminders picks reminders whose time just arrived for that person', () => {
  const reminders: ScheduledReminder[] = [
    { ...base, id: 'both' },
    { ...base, id: 'mine', assignee: 'a' },
    { ...base, id: 'theirs', assignee: 'b' },
    { ...base, id: 'later', dueTime: '18:30' },
    { ...base, id: 'no-time', dueTime: null },
    { ...base, id: 'done' },
    { ...base, id: 'weekly-other-day', repeat: 'weekly', dueDate: '2026-01-30' },
  ];
  const clock = { dateKey: '2026-01-31', minutes: 18 * 60 + 2 };
  const due = dueReminders(reminders, 'a', clock, (id) => id === 'done').map((r) => r.id);
  assert.deepEqual(due, ['both', 'mine']);
  // 还没到点 / 早就过了窗口
  assert.deepEqual(dueReminders(reminders, 'a', { ...clock, minutes: 17 * 60 + 59 }, () => false), []);
  assert.deepEqual(dueReminders([base], 'a', { ...clock, minutes: 18 * 60 + 5 }, () => false), []);
  assert.equal(dueReminders([base], 'a', { ...clock, minutes: 18 * 60 }, () => false).length, 1);
});
