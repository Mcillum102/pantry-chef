import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expoWeekday,
  hydrationReminderTimes,
  normalizeReminderPreferences,
  parseReminderTime,
} from '../src/data/reminder-utils.ts';

test('parses valid reminder times', () => {
  assert.deepEqual(parseReminderTime('08:05'), { hour: 8, minute: 5 });
  assert.deepEqual(parseReminderTime('23:59'), { hour: 23, minute: 59 });
});

test('rejects malformed or out-of-range reminder times', () => {
  assert.equal(parseReminderTime('24:00'), null);
  assert.equal(parseReminderTime('12:60'), null);
  assert.equal(parseReminderTime('noon'), null);
});

test('builds hydration reminders inside the selected daily window', () => {
  assert.deepEqual(hydrationReminderTimes('08:00', '14:00', 120), [
    { hour: 10, minute: 0 },
    { hour: 12, minute: 0 },
    { hour: 14, minute: 0 },
  ]);
});

test('does not create hydration reminders for an invalid window', () => {
  assert.deepEqual(hydrationReminderTimes('22:00', '08:00', 120), []);
  assert.deepEqual(hydrationReminderTimes('08:00', '22:00', 0), []);
});

test('migrates the previous hourly interval preference', () => {
  const preferences = normalizeReminderPreferences({ hydrationIntervalHours: 3 });
  assert.equal(preferences.hydrationIntervalMinutes, 180);
  assert.equal(preferences.expiryTime, '09:00');
  assert.deepEqual(preferences.mealEnabled, { breakfast: true, lunch: true, dinner: true });
});

test('converts ISO weekdays to Expo weekly trigger weekdays', () => {
  assert.equal(expoWeekday(1), 2);
  assert.equal(expoWeekday(6), 7);
  assert.equal(expoWeekday(7), 1);
});
