import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addDays,
  cleanSubtasks,
  daysUntilLabel,
  defaultRemindBefore,
  fitRemindBefore,
  isAssignedTo,
  monthGrid,
  occursOn,
  overdueOccurrences,
  recentMessages,
  remindersOn,
  remindLabel,
  subtaskProgress,
  upcomingEvents,
  weekOf,
  withScheduleDefaults,
  type Reminder,
} from '../src/data/reminders.ts';

const base: Reminder = {
  id: 'r', kind: 'task', title: '倒垃圾', emoji: '🗑️', notes: '', dueDate: '2026-10-26', dueTime: null,
  repeat: 'none', assignee: 'both', createdBy: 'a', subtasks: [], remindBefore: null,
};

test('one-off reminders only happen on their day', () => {
  assert.equal(occursOn(base, '2026-10-26'), true);
  assert.equal(occursOn(base, '2026-10-27'), false);
});

test('weekly reminders repeat on the same weekday', () => {
  const towels = { ...base, repeat: 'weekly' as const };
  assert.equal(occursOn(towels, '2026-11-02'), true);
  assert.equal(occursOn(towels, '2026-11-03'), false);
  assert.equal(occursOn(towels, '2026-10-19'), false); // before start
});

test('monthly reminders on the 31st land on the last day of short months', () => {
  const rent = { ...base, dueDate: '2026-01-31', repeat: 'monthly' as const };
  assert.equal(occursOn(rent, '2026-02-28'), true);
  assert.equal(occursOn(rent, '2026-04-30'), true);
  assert.equal(occursOn(rent, '2026-05-31'), true);
  assert.equal(occursOn(rent, '2026-05-30'), false);
});

test('daily reminders across the DST change keep one occurrence per day', () => {
  const daily = { ...base, dueDate: '2026-10-30', repeat: 'daily' as const };
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-11-01', 1), '2026-11-02');
  assert.equal(occursOn(daily, '2026-11-01'), true);
});

test('completing one week does not affect the next', () => {
  const towels = { ...base, id: 't', repeat: 'weekly' as const };
  const done = [{ reminderId: 't', occurrenceDate: '2026-10-26', doneBy: 'a' as const, doneAt: '' }];
  const overdue = overdueOccurrences([towels], done, '2026-11-03', 10);
  assert.deepEqual(overdue.map((o) => o.date), ['2026-11-02']);
});

test('sorts by time with untimed reminders last', () => {
  const list = remindersOn([
    { ...base, id: '1', title: 'B', dueTime: null },
    { ...base, id: '2', title: 'A', dueTime: '18:00' },
    { ...base, id: '3', title: 'C', dueTime: '08:30' },
  ], '2026-10-26');
  assert.deepEqual(list.map((r) => r.id), ['3', '2', '1']);
});

test('week starts on Monday and month grid has 42 days', () => {
  assert.deepEqual(weekOf('2026-11-15').slice(0, 2), ['2026-11-09', '2026-11-10']);
  const grid = monthGrid(2026, 10);
  assert.equal(grid.length, 42);
  assert.equal(grid[0], '2026-10-26');
});

test('assignment checks', () => {
  assert.equal(isAssignedTo({ assignee: 'both' }, 'a'), true);
  assert.equal(isAssignedTo({ assignee: 'b' }, 'a'), false);
});

test('relative day labels', async () => {
  const { dayLabel, timeAgo } = await import('../src/data/reminders.ts');
  assert.equal(dayLabel('2026-11-15', '2026-11-15'), '今天');
  assert.equal(dayLabel('2026-11-16', '2026-11-15'), '明天');
  assert.equal(dayLabel('2026-11-14', '2026-11-15'), '昨天');
  assert.equal(dayLabel('2026-11-18', '2026-11-15'), '11月18日 周三');
  assert.equal(timeAgo(new Date(Date.now() - 5 * 60_000).toISOString()), '5 分钟前');
});

test('subtask progress is tracked per day for repeating reminders', () => {
  const towels: Reminder = { ...base, repeat: 'weekly', subtasks: [{ id: 's1', title: '收浴巾' }, { id: 's2', title: '放洗衣机' }] };
  const checks = [
    { reminderId: 'r', subtaskId: 's1', occurrenceDate: '2026-10-26', doneBy: 'a' as const },
    { reminderId: 'r', subtaskId: 'gone', occurrenceDate: '2026-10-26', doneBy: 'a' as const },
  ];
  assert.deepEqual(subtaskProgress(towels, checks, '2026-10-26'), { done: 1, total: 2 });
  assert.deepEqual(subtaskProgress(towels, checks, '2026-11-02'), { done: 0, total: 2 });
});

test('cleanSubtasks trims, drops blanks and caps the list', () => {
  const many = Array.from({ length: 25 }, (_, i) => ({ id: `s${i}`, title: ` 第${i}步 ` }));
  const cleaned = cleanSubtasks([{ id: 'x', title: '   ' }, ...many]);
  assert.equal(cleaned.length, 20);
  assert.equal(cleaned[0].title, '第0步');
});

test('recentMessages keeps the newest 20 in chat order', () => {
  const messages = Array.from({ length: 30 }, (_, i) => ({ id: String(i), createdAt: `2026-11-16T10:${String(i).padStart(2, '0')}:00Z` }));
  const shown = recentMessages(messages.slice().reverse());
  assert.equal(shown.length, 20);
  assert.equal(shown[0].id, '10');
  assert.equal(shown[19].id, '29');
});

test('weekday reminders skip weekends; yearly ones come back on the same date', () => {
  const work = { ...base, dueDate: '2026-11-16', repeat: 'weekdays' as const };
  assert.equal(occursOn(work, '2026-11-20'), true); // Fri
  assert.equal(occursOn(work, '2026-11-21'), false); // Sat
  assert.equal(occursOn(work, '2026-11-23'), true); // Mon
  const birthday = { ...base, dueDate: '2024-02-29', repeat: 'yearly' as const };
  assert.equal(occursOn(birthday, '2026-02-28'), true); // 平年落到 2 月 28 日
  assert.equal(occursOn(birthday, '2028-02-29'), true);
  assert.equal(occursOn(birthday, '2028-02-28'), false);
  assert.equal(occursOn(birthday, '2026-03-29'), false);
});

test('missed daily chores do not pile up; other repeats show only the latest miss', () => {
  const daily = { ...base, id: 'd', repeat: 'daily' as const, dueDate: '2026-10-01' };
  const weekly = { ...base, id: 'w', repeat: 'weekly' as const, dueDate: '2026-10-05' };
  const once = { ...base, id: 'o', dueDate: '2026-11-14' };
  const concert = { ...base, id: 'e', kind: 'event' as const, dueDate: '2026-11-13' };
  const overdue = overdueOccurrences([daily, weekly, once, concert], [], '2026-11-17', 14);
  assert.deepEqual(overdue.map((o) => `${o.reminder.id}:${o.date}`), ['w:2026-11-16', 'o:2026-11-14']);
  // 最近一次已经补做了：更早漏掉的那次不再翻出来
  const done = [{ reminderId: 'w', occurrenceDate: '2026-11-16', doneBy: 'a' as const, doneAt: '' }];
  assert.deepEqual(overdueOccurrences([weekly], done, '2026-11-17', 14), []);
});

test('upcoming events: next occurrence of each, past times today are skipped', () => {
  const concert = { ...base, id: 'concert', kind: 'event' as const, dueDate: '2026-11-24', dueTime: '19:30' };
  const lunch = { ...base, id: 'lunch', kind: 'event' as const, dueDate: '2026-11-17', dueTime: '12:00' };
  const allDay = { ...base, id: 'all-day', kind: 'event' as const, dueDate: '2026-11-17' };
  const birthday = { ...base, id: 'bday', kind: 'event' as const, dueDate: '1995-03-02', repeat: 'yearly' as const };
  const chore = { ...base, id: 'chore', dueDate: '2026-11-18' };
  const list = upcomingEvents([concert, lunch, allDay, birthday, chore], '2026-11-17', 13 * 60);
  assert.deepEqual(list.map((o) => `${o.reminder.id}:${o.date}`), ['all-day:2026-11-17', 'concert:2026-11-24', 'bday:2027-03-02']);
  assert.equal(upcomingEvents([concert, birthday], '2026-11-17', 0, 1).length, 1);
});

test('remind options: labels, defaults and switching between timed and all-day', () => {
  assert.equal(remindLabel(null, true), '不提醒');
  assert.equal(remindLabel(0, true), '准时');
  assert.equal(remindLabel(60, true), '提前 1 小时');
  assert.equal(remindLabel(1440, false), '前一天 09:00');
  assert.equal(remindLabel(10080, true), '提前 1 周');
  assert.equal(defaultRemindBefore('event', '19:30'), 60);
  assert.equal(defaultRemindBefore('event', null), 0);
  assert.equal(defaultRemindBefore('task', '18:00'), 0);
  assert.equal(defaultRemindBefore('task', null), null);
  assert.equal(fitRemindBefore(60, false), 0); // 全天没有「提前 1 小时」
  assert.equal(fitRemindBefore(1440, false), 1440);
  assert.equal(fitRemindBefore(null, false), null);
  assert.equal(daysUntilLabel('2026-11-24', '2026-11-17'), '7 天后');
  assert.equal(daysUntilLabel('2026-11-18', '2026-11-17'), '明天');
});

test('old cached reminders keep their previous push behaviour', () => {
  assert.deepEqual(
    [withScheduleDefaults({ dueTime: '18:00' }), withScheduleDefaults({ dueTime: null })].map((r) => [r.kind, r.remindBefore]),
    [['task', 0], ['task', null]]
  );
  assert.equal(withScheduleDefaults({ dueTime: '18:00', kind: 'event', remindBefore: null }).remindBefore, null);
});
