// 提醒的数据结构和日期计算（纯函数，不依赖 React / Supabase，方便测试）
// 日期一律用本地日期字符串 YYYY-MM-DD，时间用 HH:MM，避免时区和夏令时问题。

export type MemberId = 'a' | 'b';
export type ReminderRepeat = 'none' | 'daily' | 'weekly' | 'monthly';
export type ReminderAssignee = MemberId | 'both';

export type Reminder = {
  id: string;
  title: string;
  emoji: string;
  notes: string;
  dueDate: string;
  dueTime: string | null;
  repeat: ReminderRepeat;
  assignee: ReminderAssignee;
  createdBy: MemberId;
};

export type ReminderCompletion = {
  reminderId: string;
  occurrenceDate: string;
  doneBy: MemberId;
  doneAt: string;
};

export type Nudge = {
  id: string;
  reminderId: string | null;
  fromMember: MemberId;
  toMember: MemberId;
  message: string;
  createdAt: string;
  readAt: string | null;
};

export const REPEAT_LABELS: Record<ReminderRepeat, string> = {
  none: '不重复',
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
};

export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function fromDateKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, days: number) {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** 这条提醒在某一天是否要做 */
export function occursOn(reminder: Pick<Reminder, 'dueDate' | 'repeat'>, dateKey: string) {
  if (dateKey < reminder.dueDate) return false;
  if (reminder.repeat === 'none') return dateKey === reminder.dueDate;
  if (reminder.repeat === 'daily') return true;
  const due = fromDateKey(reminder.dueDate);
  const day = fromDateKey(dateKey);
  if (reminder.repeat === 'weekly') return due.getDay() === day.getDay();
  // 每月：31 号的提醒在小月落到月底那天
  const target = Math.min(due.getDate(), daysInMonth(day.getFullYear(), day.getMonth()));
  return day.getDate() === target;
}

export function isDone(completions: readonly ReminderCompletion[], reminderId: string, dateKey: string) {
  return completions.some((c) => c.reminderId === reminderId && c.occurrenceDate === dateKey);
}

/** 某一天要做的提醒，有时间的按时间排，没时间的排在最后 */
export function remindersOn(reminders: readonly Reminder[], dateKey: string) {
  return reminders
    .filter((reminder) => occursOn(reminder, dateKey))
    .sort((a, b) => (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99') || a.title.localeCompare(b.title));
}

export type Occurrence = { reminder: Reminder; date: string };

/** 过去 lookbackDays 天里没完成的（不含今天），最近的在前 */
export function overdueOccurrences(
  reminders: readonly Reminder[],
  completions: readonly ReminderCompletion[],
  today: string,
  lookbackDays = 7
): Occurrence[] {
  const result: Occurrence[] = [];
  for (let offset = 1; offset <= lookbackDays; offset += 1) {
    const date = addDays(today, -offset);
    remindersOn(reminders, date).forEach((reminder) => {
      if (!isDone(completions, reminder.id, date)) result.push({ reminder, date });
    });
  }
  return result;
}

/** 以某天为中心的一周（周一开始） */
export function weekOf(dateKey: string) {
  const date = fromDateKey(dateKey);
  const mondayOffset = (date.getDay() + 6) % 7;
  const monday = addDays(dateKey, -mondayOffset);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** 月历：6 行 × 7 列，周一开始；不在本月的日期也返回，便于画灰色格子 */
export function monthGrid(year: number, monthIndex: number) {
  const first = toDateKey(new Date(year, monthIndex, 1));
  const start = weekOf(first)[0];
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function otherMember(member: MemberId): MemberId {
  return member === 'a' ? 'b' : 'a';
}

/** 这条提醒是不是（也）分给了某人 */
export function isAssignedTo(reminder: Pick<Reminder, 'assignee'>, member: MemberId) {
  return reminder.assignee === 'both' || reminder.assignee === member;
}

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

/** 今天 / 明天 / 昨天 / 后天，其余显示「11月18日 周三」 */
export function dayLabel(dateKey: string, today: string) {
  const relative: Record<number, string> = { 0: '今天', 1: '明天', 2: '后天', [-1]: '昨天' };
  const diff = Math.round((fromDateKey(dateKey).getTime() - fromDateKey(today).getTime()) / 86_400_000);
  if (relative[diff]) return relative[diff];
  const date = fromDateKey(dateKey);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAY_NAMES[date.getDay()]}`;
}

/** 「3 分钟前」这类相对时间，用于「催一下」消息 */
export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}
