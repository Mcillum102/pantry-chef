// 到点提醒的计算（纯函数）。重复规则必须和 App 里 src/data/reminders.ts 的 occursOn 一致，
// tests/push-schedule.test.ts 会逐日比对两边的结果。

export type MemberId = 'a' | 'b';

export type ScheduledReminder = {
  id: string;
  householdId: string;
  title: string;
  emoji: string;
  dueDate: string;
  dueTime: string | null;
  repeat: 'none' | 'daily' | 'weekly' | 'monthly';
  assignee: MemberId | 'both';
};

export const DEFAULT_TIME_ZONE = 'America/Vancouver';

function fromDateKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function occursOn(reminder: Pick<ScheduledReminder, 'dueDate' | 'repeat'>, dateKey: string) {
  if (dateKey < reminder.dueDate) return false;
  if (reminder.repeat === 'none') return dateKey === reminder.dueDate;
  if (reminder.repeat === 'daily') return true;
  const due = fromDateKey(reminder.dueDate);
  const day = fromDateKey(dateKey);
  if (reminder.repeat === 'weekly') return due.getUTCDay() === day.getUTCDay();
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

/**
 * 现在应该提醒某人的事：今天要做、分给了 TA（或两人一起）、设定时间落在最近 windowMinutes 分钟内、还没完成。
 * 窗口留几分钟余量，定时任务偶尔晚跑一次也不会漏；重复发送由数据库的 push_deliveries 去重。
 */
export function dueReminders(
  reminders: readonly ScheduledReminder[],
  member: MemberId,
  clock: { dateKey: string; minutes: number },
  isCompleted: (reminderId: string, dateKey: string) => boolean,
  windowMinutes = 5
) {
  return reminders.filter((reminder) => {
    if (!reminder.dueTime) return false;
    if (reminder.assignee !== 'both' && reminder.assignee !== member) return false;
    if (!occursOn(reminder, clock.dateKey)) return false;
    const due = minutesOf(reminder.dueTime);
    if (due > clock.minutes || due <= clock.minutes - windowMinutes) return false;
    return !isCompleted(reminder.id, clock.dateKey);
  });
}
