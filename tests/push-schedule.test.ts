import assert from 'node:assert/strict';
import test from 'node:test';

import { addDays, occursOn as appOccursOn } from '../src/data/reminders.ts';
import { dueNotifications, localClock, notificationBody, occursOn, type ScheduledReminder } from '../supabase/functions/push/schedule.ts';

const base: ScheduledReminder = {
  id: 'r1', householdId: 'h', kind: 'task', title: '倒垃圾', emoji: '🗑️',
  dueDate: '2026-01-31', dueTime: '18:00', repeat: 'none', assignee: 'both', remindBefore: 0,
};

test('server repeat rules match the app for every day of two years', () => {
  for (const repeat of ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as const) {
    for (const dueDate of ['2024-02-29', '2026-01-31', '2026-02-28', '2026-03-08', '2026-11-01']) {
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

const ids = (list: ReturnType<typeof dueNotifications>) => list.map((n) => `${n.reminder.id}:${n.occurrenceDate}`);

test('on-time reminders go to the right person once their time arrives', () => {
  const reminders: ScheduledReminder[] = [
    { ...base, id: 'both' },
    { ...base, id: 'mine', assignee: 'a' },
    { ...base, id: 'theirs', assignee: 'b' },
    { ...base, id: 'later', dueTime: '18:30' },
    { ...base, id: 'silent', remindBefore: null },
    { ...base, id: 'done' },
    { ...base, id: 'weekly-other-day', repeat: 'weekly', dueDate: '2026-01-30' },
  ];
  const clock = { dateKey: '2026-01-31', minutes: 18 * 60 + 2 };
  assert.deepEqual(ids(dueNotifications(reminders, 'a', clock, (id) => id === 'done')), ['both:2026-01-31', 'mine:2026-01-31']);
  // 还没到点 / 早就过了窗口
  assert.deepEqual(dueNotifications(reminders, 'a', { ...clock, minutes: 17 * 60 + 59 }, () => false), []);
  assert.deepEqual(dueNotifications([base], 'a', { ...clock, minutes: 18 * 60 + 5 }, () => false), []);
  assert.equal(dueNotifications([base], 'a', { ...clock, minutes: 18 * 60 }, () => false).length, 1);
});

test('early reminders fire on an earlier day and point at the right occurrence', () => {
  const concert: ScheduledReminder = { ...base, id: 'concert', kind: 'event', dueDate: '2026-11-24', dueTime: '19:30', remindBefore: 1440 };
  assert.deepEqual(ids(dueNotifications([concert], 'a', { dateKey: '2026-11-23', minutes: 19 * 60 + 31 }, () => false)), ['concert:2026-11-24']);
  assert.deepEqual(dueNotifications([concert], 'a', { dateKey: '2026-11-24', minutes: 19 * 60 + 31 }, () => false), []);
  // 一小时前；日程不看「完成」
  const hourBefore = { ...concert, remindBefore: 60 };
  assert.deepEqual(ids(dueNotifications([hourBefore], 'b', { dateKey: '2026-11-24', minutes: 18 * 60 + 30 }, () => true)), ['concert:2026-11-24']);
  // 全天日程：当天 9 点 / 提前一周
  const allDay = { ...concert, dueTime: null, remindBefore: 0 };
  assert.equal(dueNotifications([allDay], 'a', { dateKey: '2026-11-24', minutes: 9 * 60 }, () => false).length, 1);
  const weekBefore = { ...concert, dueTime: null, remindBefore: 10080 };
  assert.deepEqual(ids(dueNotifications([weekBefore], 'a', { dateKey: '2026-11-17', minutes: 9 * 60 + 1 }, () => false)), ['concert:2026-11-24']);
});

test('reminders just after midnight belong to the right day', () => {
  // 00:05 的待办提前 10 分钟 = 前一天 23:55
  const early: ScheduledReminder = { ...base, id: 'pill', dueDate: '2026-11-01', dueTime: '00:05', repeat: 'daily', remindBefore: 10 };
  assert.deepEqual(ids(dueNotifications([early], 'a', { dateKey: '2026-11-17', minutes: 23 * 60 + 56 }, () => false)), ['pill:2026-11-18']);
  // 已经提前完成了明天那次就不推
  assert.deepEqual(dueNotifications([early], 'a', { dateKey: '2026-11-17', minutes: 23 * 60 + 56 }, (id, date) => date === '2026-11-18'), []);
});

test('notification text says when it is', () => {
  const event: ScheduledReminder = { ...base, kind: 'event', dueTime: '19:30' };
  assert.equal(notificationBody(event, 1), '明天 19:30（一起）');
  assert.equal(notificationBody({ ...event, dueTime: null, assignee: 'a' }, 0), '今天 · 全天');
  assert.equal(notificationBody({ ...base, assignee: 'a' }, 0), '18:00 该做啦');
  assert.equal(notificationBody({ ...base, assignee: 'a', dueTime: null }, 1), '明天要做');
});
