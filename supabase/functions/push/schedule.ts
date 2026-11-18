// 到点提醒的计算（纯函数）。重复规则必须和 App 里 src/data/reminders.ts 的 occursOn 一致，
// tests/push-schedule.test.ts 会逐日比对两边的结果。

export type MemberId = 'a' | 'b';

export type ScheduledReminder = {
  id: string;
  householdId: string;
  kind: 'task' | 'event';
  title: string;
  emoji: string;
  dueDate: string;
  dueTime: string | null;
  repeat: 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';
  assignee: MemberId | 'both';
  /** 提前多少分钟推送；null 不推送。全天的按当天 ALL_DAY_ANCHOR 算 */
  remindBefore: number | null;
};

export const DEFAULT_TIME_ZONE = 'America/Vancouver';
/** 和 App 的 ALL_DAY_ANCHOR 一致 */
export const ALL_DAY_ANCHOR = '09:00';

function fromDateKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(key: string, days: number) {
  const date = fromDateKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function occursOn(reminder: Pick<ScheduledReminder, 'dueDate' | 'repeat'>, dateKey: string) {
  if (dateKey < reminder.dueDate) return false;
  if (reminder.repeat === 'none') return dateKey === reminder.dueDate;
  if (reminder.repeat === 'daily') return true;
  const due = fromDateKey(reminder.dueDate);
  const day = fromDateKey(dateKey);
  if (reminder.repeat === 'weekdays') return day.getUTCDay() >= 1 && day.getUTCDay() <= 5;
  if (reminder.repeat === 'weekly') return due.getUTCDay() === day.getUTCDay();
  if (reminder.repeat === 'yearly' && due.getUTCMonth() !== day.getUTCMonth()) return false;
  const daysInMonth = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
  return day.getUTCDate() === Math.min(due.getUTCDate(), daysInMonth);
}

/** 某个时区现在的本地日期（YYYY-MM-DD）和当天的第几分钟 */
export function localClock(now: Date, timeZone: string) {
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone });
  } catch {
    zone = DEFAULT_TIME_ZONE;
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  );
  return { dateKey: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function minutesOf(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export type DueNotification = { reminder: ScheduledReminder; occurrenceDate: string; daysAhead: number };

/**
 * 现在该推给某人的通知：分给了 TA（或两人一起）、设了提醒、「那一次的时间 − 提前量」落在最近 windowMinutes 分钟内，
 * 待办还要没完成。提前量可能跨天（提前 1 天 / 1 周），所以往后看几天找对应的那一次。
 * 窗口留几分钟余量，定时任务偶尔晚跑一次也不会漏；重复发送由数据库的 push_deliveries 去重。
 */
export function dueNotifications(
  reminders: readonly ScheduledReminder[],
  member: MemberId,
  clock: { dateKey: string; minutes: number },
  isCompleted: (reminderId: string, dateKey: string) => boolean,
  windowMinutes = 5
): DueNotification[] {
  const result: DueNotification[] = [];
  for (const reminder of reminders) {
    if (reminder.remindBefore === null || reminder.remindBefore < 0) continue;
    if (reminder.assignee !== 'both' && reminder.assignee !== member) continue;
    const anchor = minutesOf(reminder.dueTime ?? ALL_DAY_ANCHOR);
    const maxDays = Math.ceil(reminder.remindBefore / 1440) + 1;
    for (let daysAhead = 0; daysAhead <= maxDays; daysAhead += 1) {
      // 相对「今天 0 点」的分钟数；可以是负数（昨天深夜）
      const notifyAt = daysAhead * 1440 + anchor - reminder.remindBefore;
      if (notifyAt > clock.minutes || notifyAt <= clock.minutes - windowMinutes) continue;
      const occurrenceDate = addDays(clock.dateKey, daysAhead);
      if (!occursOn(reminder, occurrenceDate)) continue;
      if (reminder.kind === 'task' && isCompleted(reminder.id, occurrenceDate)) continue;
      result.push({ reminder, occurrenceDate, daysAhead });
    }
  }
  return result;
}

/** 通知正文：待办「19:00 该做啦」；日程「明天 19:00」「今天 · 全天」 */
export function notificationBody(reminder: ScheduledReminder, daysAhead: number) {
  const day = daysAhead === 0 ? '今天' : daysAhead === 1 ? '明天' : daysAhead === 2 ? '后天' : `${daysAhead} 天后`;
  const together = reminder.assignee === 'both' ? '（一起）' : '';
  if (reminder.kind === 'event') return `${day} ${reminder.dueTime ?? '· 全天'}${together}`;
  if (daysAhead === 0) return `${reminder.dueTime ? `${reminder.dueTime} ` : ''}该做啦${together}`;
  return `${day}${reminder.dueTime ? ` ${reminder.dueTime}` : ''}要做${together}`;
}
