import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useCloudSync } from '@/context/cloud-sync-context';
import { useMember } from '@/context/member-context';
import {
  addDays,
  otherMember,
  toDateKey,
  type MemberId,
  type Nudge,
  type Reminder,
  type ReminderCompletion,
} from '@/data/reminders';
import { usePersistentState } from '@/hooks/use-persistent-state';
import {
  deleteReminderRow,
  fetchRemindersData,
  markNudgesReadRows,
  newId,
  RemindersNotInstalledError,
  saveReminderRow,
  sendNudgeRow,
  setCompletionRow,
  subscribeReminders,
} from '@/services/reminders-api';

/**
 * local：没有配置云端（开发调试），数据只存在本机
 * needs-setup：数据库还没执行提醒的 migration
 */
export type TasksStatus = 'local' | 'loading' | 'ready' | 'needs-setup' | 'error';

type TasksSnapshot = { reminders: Reminder[]; completions: ReminderCompletion[]; nudges: Nudge[] };

type TasksContextValue = TasksSnapshot & {
  status: TasksStatus;
  me: MemberId;
  saveReminder: (reminder: Omit<Reminder, 'id' | 'createdBy'> & { id?: string }) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  setDone: (reminder: Reminder, date: string, done: boolean) => Promise<void>;
  sendNudge: (message: string, reminderId?: string | null) => Promise<void>;
  markRead: (ids: string[]) => Promise<void>;
  /** 发给我、还没看的「催一下」，最新的在前 */
  unreadForMe: Nudge[];
  refresh: () => void;
};

const TasksContext = createContext<TasksContextValue | null>(null);

const EMPTY: TasksSnapshot = { reminders: [], completions: [], nudges: [] };

export function TasksProvider({ children }: PropsWithChildren) {
  const { configured, household } = useCloudSync();
  const { member } = useMember();
  const me: MemberId = member?.id ?? 'a';
  const householdId = household?.id ?? null;

  // 云端数据的本机缓存：离线时也能先看到上次的内容；未配置云端时它就是唯一的数据源
  const [cache, setCache] = usePersistentState<TasksSnapshot>('tasks-cache-v1', EMPTY);
  const [status, setStatus] = useState<TasksStatus>(configured ? 'loading' : 'local');
  const [nonce, setNonce] = useState(0);
  const cloud = configured && Boolean(householdId);
  const cacheRef = useRef(cache);
  cacheRef.current = cache;

  const load = useCallback(async () => {
    if (!cloud || !householdId) return;
    try {
      const data = await fetchRemindersData(householdId, addDays(toDateKey(new Date()), -45));
      setCache(data);
      setStatus('ready');
    } catch (error) {
      setStatus(error instanceof RemindersNotInstalledError ? 'needs-setup' : 'error');
    }
  }, [cloud, householdId, setCache]);

  useEffect(() => {
    if (!configured) {
      setStatus('local');
      return;
    }
    void load();
  }, [configured, load, nonce]);

  useEffect(() => {
    if (!cloud || !householdId || status === 'needs-setup') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeReminders(householdId, () => {
      // 对方连续改动时合并成一次刷新
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), 250);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [cloud, householdId, load, status]);

  /** 先改本机（界面立刻响应），再写云端；云端失败就恢复原样并抛出错误 */
  const mutate = useCallback(async (apply: (current: TasksSnapshot) => TasksSnapshot, remote?: () => Promise<void>) => {
    const before = cacheRef.current;
    setCache((current) => apply(current));
    if (!cloud || !remote) return;
    try {
      await remote();
    } catch (error) {
      setCache(before);
      if (error instanceof RemindersNotInstalledError) setStatus('needs-setup');
      throw error;
    }
  }, [cloud, setCache]);

  const saveReminder = useCallback<TasksContextValue['saveReminder']>(async (input) => {
    const existing = input.id ? cacheRef.current.reminders.find((r) => r.id === input.id) : undefined;
    const reminder: Reminder = { ...input, id: input.id ?? newId(), createdBy: existing?.createdBy ?? me };
    await mutate(
      (current) => ({
        ...current,
        reminders: existing
          ? current.reminders.map((r) => (r.id === reminder.id ? reminder : r))
          : [...current.reminders, reminder],
      }),
      householdId ? () => saveReminderRow(householdId, reminder) : undefined
    );
  }, [householdId, me, mutate]);

  const deleteReminder = useCallback(async (id: string) => {
    await mutate(
      (current) => ({
        ...current,
        reminders: current.reminders.filter((r) => r.id !== id),
        completions: current.completions.filter((c) => c.reminderId !== id),
      }),
      () => deleteReminderRow(id)
    );
  }, [mutate]);

  const setDone = useCallback(async (reminder: Reminder, date: string, done: boolean) => {
    await mutate(
      (current) => ({
        ...current,
        completions: done
          ? [...current.completions.filter((c) => !(c.reminderId === reminder.id && c.occurrenceDate === date)),
            { reminderId: reminder.id, occurrenceDate: date, doneBy: me, doneAt: new Date().toISOString() }]
          : current.completions.filter((c) => !(c.reminderId === reminder.id && c.occurrenceDate === date)),
      }),
      householdId ? () => setCompletionRow(householdId, reminder.id, date, me, done) : undefined
    );
  }, [householdId, me, mutate]);

  const sendNudge = useCallback(async (message: string, reminderId: string | null = null) => {
    const nudge: Nudge = {
      id: newId(), reminderId, fromMember: me, toMember: otherMember(me), message: message.trim(),
      createdAt: new Date().toISOString(), readAt: null,
    };
    await mutate(
      (current) => ({ ...current, nudges: [nudge, ...current.nudges] }),
      householdId ? () => sendNudgeRow(householdId, nudge) : undefined
    );
  }, [householdId, me, mutate]);

  const markRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const readAt = new Date().toISOString();
    await mutate(
      (current) => ({ ...current, nudges: current.nudges.map((n) => (ids.includes(n.id) ? { ...n, readAt } : n)) }),
      () => markNudgesReadRows(ids)
    ).catch(() => undefined);
  }, [mutate]);

  const unreadForMe = useMemo(
    () => cache.nudges.filter((n) => n.toMember === me && !n.readAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [cache.nudges, me]
  );

  const value = useMemo<TasksContextValue>(() => ({
    ...cache,
    status,
    me,
    saveReminder,
    deleteReminder,
    setDone,
    sendNudge,
    markRead,
    unreadForMe,
    refresh: () => setNonce((n) => n + 1),
  }), [cache, deleteReminder, markRead, me, saveReminder, sendNudge, setDone, status, unreadForMe]);

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasks() {
  const context = useContext(TasksContext);
  if (!context) throw new Error('useTasks must be used inside TasksProvider');
  return context;
}
