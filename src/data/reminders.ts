// 提醒的数据结构和日期计算（纯函数，不依赖 React / Supabase，方便测试）
// 日期一律用本地日期字符串 YYYY-MM-DD，时间用 HH:MM，避免时区和夏令时问题。

export type MemberId = 'a' | 'b';
export type ReminderRepeat = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';
export type ReminderAssignee = MemberId | 'both';
/** task 待办：要勾选完成；event 日程：到时间去就行（演唱会、生日、看医生），不用勾选 */
export type ReminderKind = 'task' | 'event';

/** 子任务：属于某条提醒的小步骤。重复提醒每一天的勾选状态分开记录。 */
export type Subtask = {
  id: string;
  title: string;
};

export type Reminder = {
  id: string;
  kind: ReminderKind;
  title: string;
  emoji: string;
  notes: string;
  subtasks: Subtask[];
  dueDate: string;
  dueTime: string | null;
  repeat: ReminderRepeat;
  assignee: ReminderAssignee;
  createdBy: MemberId;
  /**
   * 推送通知：提前多少分钟提醒，null 表示不提醒。
   * 以设定的时间为准；全天（没设时间）的按当天早上 ALL_DAY_ANCHOR 算，比如 1440 = 前一天 9:00。
   */
  remindBefore: number | null;
};

export type ReminderCompletion = {
  reminderId: string;
  occurrenceDate: string;
  doneBy: MemberId;
  doneAt: string;
};

export type SubtaskCheck = {
  reminderId: string;
  subtaskId: string;
  occurrenceDate: string;
  doneBy: MemberId;
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
  weekdays: '工作日',
  weekly: '每周',
  monthly: '每月',
  yearly: '每年',
};

/** 全天的事（没设时间）提醒时按这个时间算 */
export const ALL_DAY_ANCHOR = '09:00';

/** 提醒选项：有具体时间 / 全天，选项不同 */
export const REMIND_OPTIONS_TIMED: readonly (number | null)[] = [null, 0, 10, 60, 1440, 10080];
export const REMIND_OPTIONS_ALL_DAY: readonly (number | null)[] = [null, 0, 1440, 10080];

export function remindLabel(minutes: number | null, timed: boolean) {
  if (minutes === null) return '不提醒';
  if (!timed) {
    if (minutes === 0) return `当天 ${ALL_DAY_ANCHOR}`;
    if (minutes === 1440) return `前一天 ${ALL_DAY_ANCHOR}`;
  }
  if (minutes === 0) return '准时';
  if (minutes % 10080 === 0) return `提前 ${minutes / 10080} 周`;
  if (minutes % 1440 === 0) return `提前 ${minutes / 1440} 天`;
  if (minutes % 60 === 0) return `提前 ${minutes / 60} 小时`;
  return `提前 ${minutes} 分钟`;
}

/** 换了时间（有时间 / 全天）后，原来的提醒选项不一定还有，换成不晚于它的最近一项 */
export function fitRemindBefore(minutes: number | null, timed: boolean) {
  if (minutes === null) return null;
  const options = (timed ? REMIND_OPTIONS_TIMED : REMIND_OPTIONS_ALL_DAY).filter((m): m is number => m !== null);
  if (options.includes(minutes)) return minutes;
  return options.filter((m) => m <= minutes).pop() ?? 0;
}

/** 新建时默认的提醒：日程提前 1 小时（全天的当天早上）；待办有时间就准时提醒，没时间不提醒 */
export function defaultRemindBefore(kind: ReminderKind, dueTime: string | null) {
  if (kind === 'event') return dueTime ? 60 : 0;
  return dueTime ? 0 : null;
}

/** 旧数据（还没有 kind / remindBefore 的缓存或数据库）补默认值：和升级前的行为一致 */
export function withScheduleDefaults<T extends { dueTime: string | null; kind?: string; remindBefore?: number | null }>(reminder: T) {
  return {
    ...reminder,
    kind: (reminder.kind === 'event' ? 'event' : 'task') as ReminderKind,
    remindBefore: reminder.remindBefore === undefined ? (reminder.dueTime ? 0 : null) : reminder.remindBefore,
  };
}

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
  if (reminder.repeat === 'weekdays') return day.getDay() >= 1 && day.getDay() <= 5;
  if (reminder.repeat === 'weekly') return due.getDay() === day.getDay();
  if (reminder.repeat === 'yearly' && due.getMonth() !== day.getMonth()) return false;
  // 每月 / 每年：31 号在小月落到月底那天，2 月 29 日在平年落到 2 月 28 日
  const target = Math.min(due.getDate(), daysInMonth(day.getFullYear(), day.getMonth()));
  return day.getDate() === target;
}

export const isEvent = (reminder: Pick<Reminder, 'kind'>) => reminder.kind === 'event';
export const isTask = (reminder: Pick<Reminder, 'kind'>) => reminder.kind !== 'event';

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

/**
 * 过去 lookbackDays 天里没完成的待办（不含今天），最近的在前。
 * 日程不算（过去就过去了）；每天 / 工作日重复的不算（今天又有一次，补做昨天的没意义）；
 * 其他重复的只看最近的那一次，不会一件事堆好几条。
 */
export function overdueOccurrences(
  reminders: readonly Reminder[],
  completions: readonly ReminderCompletion[],
  today: string,
  lookbackDays = 7
): Occurrence[] {
  const result: Occurrence[] = [];
  const seen = new Set<string>();
  const candidates = reminders.filter((r) => isTask(r) && r.repeat !== 'daily' && r.repeat !== 'weekdays');
  for (let offset = 1; offset <= lookbackDays; offset += 1) {
    const date = addDays(today, -offset);
    remindersOn(candidates, date).forEach((reminder) => {
      if (seen.has(reminder.id)) return;
      seen.add(reminder.id);
      if (!isDone(completions, reminder.id, date)) result.push({ reminder, date });
    });
  }
  return result;
}

/** 从 from 开始（含）这条提醒下一次在哪天；horizonDays 天内没有就返回 null */
export function nextOccurrence(reminder: Pick<Reminder, 'dueDate' | 'repeat'>, from: string, horizonDays = 400) {
  if (reminder.repeat === 'none') return reminder.dueDate >= from ? reminder.dueDate : null;
  let day = from < reminder.dueDate ? reminder.dueDate : from;
  const last = addDays(from, horizonDays);
  while (day <= last) {
    if (occursOn(reminder, day)) return day;
    day = addDays(day, 1);
  }
  return null;
}

export function minutesOf(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * 接下来的日程（首页「接下来」小卡片）：每条日程只取下一次，按日期和时间排。
 * 今天已经过了时间的不再显示；全天的今天一整天都显示。
 */
export function upcomingEvents(reminders: readonly Reminder[], today: string, nowMinutes: number, limit = 4): Occurrence[] {
  return reminders
    .filter(isEvent)
    .map((reminder) => {
      let date = nextOccurrence(reminder, today);
      if (date === today && reminder.dueTime && minutesOf(reminder.dueTime) < nowMinutes) {
        date = nextOccurrence(reminder, addDays(today, 1));
      }
      return date ? { reminder, date } : null;
    })
    .filter((o): o is Occurrence => o !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.reminder.dueTime ?? '00:00').localeCompare(b.reminder.dueTime ?? '00:00'))
    .slice(0, limit);
}

/** 距离某天还有几天：「今天」「明天」「后天」「3 天后」 */
export function daysUntilLabel(dateKey: string, today: string) {
  const diff = Math.round((fromDateKey(dateKey).getTime() - fromDateKey(today).getTime()) / 86_400_000);
  if (diff <= 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === 2) return '后天';
  return `${diff} 天后`;
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

/** 首页最多显示多少条消息 */
export const MESSAGE_LIMIT = 20;

/** 最新的 limit 条消息，按时间从旧到新排（像聊天一样，新的在下面） */
export function recentMessages<T extends { createdAt: string }>(messages: readonly T[], limit = MESSAGE_LIMIT): T[] {
  return [...messages]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .reverse();
}

export function isSubtaskDone(checks: readonly SubtaskCheck[], reminderId: string, subtaskId: string, dateKey: string) {
  return checks.some((c) => c.reminderId === reminderId && c.subtaskId === subtaskId && c.occurrenceDate === dateKey);
}

/** 某一天这条提醒的子任务完成了几个（只数现在还存在的子任务） */
export function subtaskProgress(reminder: Pick<Reminder, 'id' | 'subtasks'>, checks: readonly SubtaskCheck[], dateKey: string) {
  const subtasks = reminder.subtasks ?? [];
  const done = subtasks.filter((s) => isSubtaskDone(checks, reminder.id, s.id, dateKey)).length;
  return { done, total: subtasks.length };
}

/** 清理子任务输入：去空白、去空行、最多 20 个、每个最多 80 字 */
export function cleanSubtasks(subtasks: readonly Subtask[]): Subtask[] {
  return subtasks
    .map((s) => ({ id: s.id, title: s.title.trim().slice(0, 80) }))
    .filter((s) => s.title.length > 0)
    .slice(0, 20);
}
