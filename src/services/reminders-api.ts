// 提醒 / 完成记录 / 「催一下」的 Supabase 读写。表结构见 supabase/migrations/20261115000000_reminders_and_nudges.sql
import type { RealtimeChannel } from '@supabase/supabase-js';

import { MESSAGE_LIMIT, type MemberId, type Nudge, type Reminder, type ReminderCompletion, type Subtask, type SubtaskCheck } from '@/data/reminders';
import { uniqueChannelName } from '@/data/realtime-utils';
import { supabase } from '@/services/cloud-sync';

export class RemindersNotInstalledError extends Error {
  constructor() {
    super('reminders-not-installed');
  }
}

function client() {
  if (!supabase) throw new Error('cloud-not-configured');
  return supabase;
}

/** 子任务的 migration（20261116000000_reminder_subtasks.sql）还没执行 */
export class SubtasksNotInstalledError extends Error {
  constructor() {
    super('subtasks-not-installed');
  }
}

function isSubtaskSchemaError(error: { code?: string; message?: string } | null) {
  return Boolean(error && /subtask/i.test(error.message ?? '') && (
    error.code === '42703' || error.code === 'PGRST204' || error.code === 'PGRST205' || error.code === '42P01'
    || /does not exist|schema cache|could not find/i.test(error.message ?? '')
  ));
}

/** 表还没建（migration 没执行）时 PostgREST 返回 PGRST205 / 42P01 */
function check(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (isSubtaskSchemaError(error)) throw new SubtasksNotInstalledError();
  if (error.code === 'PGRST205' || error.code === '42P01' || /does not exist|schema cache/i.test(error.message ?? '')) {
    throw new RemindersNotInstalledError();
  }
  throw error;
}

type ReminderRow = {
  id: string; title: string; emoji: string; notes: string; due_date: string; due_time: string | null;
  repeat: Reminder['repeat']; assignee: Reminder['assignee']; created_by: MemberId; subtasks?: unknown;
};
type SubtaskCheckRow = { reminder_id: string; subtask_id: string; occurrence_date: string; done_by: MemberId };

function parseSubtasks(value: unknown): Subtask[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is { id: unknown; title: unknown } => Boolean(item) && typeof item === 'object')
    .map((item) => ({ id: String(item.id ?? ''), title: String(item.title ?? '') }))
    .filter((item) => item.id && item.title);
}
type CompletionRow = { reminder_id: string; occurrence_date: string; done_by: MemberId; done_at: string };
type NudgeRow = {
  id: string; reminder_id: string | null; from_member: MemberId; to_member: MemberId;
  message: string; created_at: string; read_at: string | null;
};

const toReminder = (row: ReminderRow): Reminder => ({
  id: row.id, title: row.title, emoji: row.emoji, notes: row.notes, dueDate: row.due_date,
  dueTime: row.due_time, repeat: row.repeat, assignee: row.assignee, createdBy: row.created_by,
  subtasks: parseSubtasks(row.subtasks),
});
const toSubtaskCheck = (row: SubtaskCheckRow): SubtaskCheck => ({
  reminderId: row.reminder_id, subtaskId: row.subtask_id, occurrenceDate: row.occurrence_date, doneBy: row.done_by,
});
const toCompletion = (row: CompletionRow): ReminderCompletion => ({
  reminderId: row.reminder_id, occurrenceDate: row.occurrence_date, doneBy: row.done_by, doneAt: row.done_at,
});
const toNudge = (row: NudgeRow): Nudge => ({
  id: row.id, reminderId: row.reminder_id, fromMember: row.from_member, toMember: row.to_member,
  message: row.message, createdAt: row.created_at, readAt: row.read_at,
});

const REMINDER_COLUMNS = 'id,title,emoji,notes,due_date,due_time,repeat,assignee,created_by';

export async function fetchRemindersData(householdId: string, sinceDate: string) {
  const db = client();
  const [reminders, completions, nudges, checks] = await Promise.all([
    db.from('reminders').select(`${REMINDER_COLUMNS},subtasks`).eq('household_id', householdId),
    db.from('reminder_completions').select('reminder_id,occurrence_date,done_by,done_at').eq('household_id', householdId).gte('occurrence_date', sinceDate),
    db.from('nudges').select('id,reminder_id,from_member,to_member,message,created_at,read_at').eq('household_id', householdId).order('created_at', { ascending: false }).limit(MESSAGE_LIMIT),
    db.from('reminder_subtask_checks').select('reminder_id,subtask_id,occurrence_date,done_by').eq('household_id', householdId).gte('occurrence_date', sinceDate),
  ]);

  // 子任务的 migration 还没执行：提醒照常加载，只是没有子任务
  let reminderData: unknown[] | null = reminders.data;
  let reminderError = reminders.error;
  const subtasksReady = !isSubtaskSchemaError(reminders.error) && !isSubtaskSchemaError(checks.error);
  if (isSubtaskSchemaError(reminders.error)) {
    const fallback = await db.from('reminders').select(REMINDER_COLUMNS).eq('household_id', householdId);
    reminderData = fallback.data;
    reminderError = fallback.error;
  }
  check(reminderError);
  check(completions.error);
  check(nudges.error);
  if (subtasksReady) check(checks.error);
  return {
    reminders: ((reminderData ?? []) as ReminderRow[]).map(toReminder),
    completions: ((completions.data ?? []) as CompletionRow[]).map(toCompletion),
    nudges: ((nudges.data ?? []) as NudgeRow[]).map(toNudge),
    subtaskChecks: subtasksReady ? ((checks.data ?? []) as SubtaskCheckRow[]).map(toSubtaskCheck) : [],
    subtasksReady,
  };
}

export async function saveReminderRow(householdId: string, reminder: Reminder, includeSubtasks: boolean) {
  const { error } = await client().from('reminders').upsert({
    ...(includeSubtasks ? { subtasks: reminder.subtasks } : {}),
    id: reminder.id,
    household_id: householdId,
    title: reminder.title.trim(),
    emoji: reminder.emoji,
    notes: reminder.notes,
    due_date: reminder.dueDate,
    due_time: reminder.dueTime,
    repeat: reminder.repeat,
    assignee: reminder.assignee,
    created_by: reminder.createdBy,
  });
  check(error);
}

export async function deleteReminderRow(id: string) {
  const { error } = await client().from('reminders').delete().eq('id', id);
  check(error);
}

export async function setCompletionRow(householdId: string, reminderId: string, date: string, member: MemberId, done: boolean) {
  const db = client();
  const { error } = done
    ? await db.from('reminder_completions').upsert({ household_id: householdId, reminder_id: reminderId, occurrence_date: date, done_by: member })
    : await db.from('reminder_completions').delete().eq('reminder_id', reminderId).eq('occurrence_date', date);
  check(error);
}

export async function setSubtaskCheckRow(
  householdId: string,
  reminderId: string,
  subtaskId: string,
  date: string,
  member: MemberId,
  done: boolean
) {
  const db = client();
  const { error } = done
    ? await db.from('reminder_subtask_checks').upsert({ household_id: householdId, reminder_id: reminderId, subtask_id: subtaskId, occurrence_date: date, done_by: member })
    : await db.from('reminder_subtask_checks').delete().eq('reminder_id', reminderId).eq('subtask_id', subtaskId).eq('occurrence_date', date);
  check(error);
}

export async function sendNudgeRow(householdId: string, nudge: Pick<Nudge, 'id' | 'reminderId' | 'fromMember' | 'toMember' | 'message'>) {
  const { error } = await client().from('nudges').insert({
    id: nudge.id,
    household_id: householdId,
    reminder_id: nudge.reminderId,
    from_member: nudge.fromMember,
    to_member: nudge.toMember,
    message: nudge.message.trim(),
  });
  check(error);
}

export async function markNudgesReadRows(ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await client().from('nudges').update({ read_at: new Date().toISOString() }).in('id', ids);
  check(error);
}

/** 任何一张表有变化就回调（由调用方重新拉取，简单可靠）；连上 / 重连成功时也回调一次，补上断线期间漏掉的改动 */
export function subscribeReminders(householdId: string, onChange: () => void) {
  const db = supabase;
  if (!db) return () => undefined;
  const channel: RealtimeChannel = db.channel(uniqueChannelName(`reminders-${householdId}`));
  ['reminders', 'reminder_completions', 'nudges', 'reminder_subtask_checks'].forEach((table) => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` }, onChange);
  });
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') onChange();
  });
  return () => {
    void db.removeChannel(channel);
  };
}

export function newId() {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  // 兜底：符合 UUID v4 格式
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
