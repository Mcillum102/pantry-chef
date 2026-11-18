import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useCloudSync } from '@/context/cloud-sync-context';
import { useMember } from '@/context/member-context';
import {
  addDays,
  otherMember,
  toDateKey,
  withScheduleDefaults,
  type MemberId,
  type Nudge,
  type Reminder,
  type ReminderCompletion,
  type SubtaskCheck,
} from '@/data/reminders';
import { useAppResume, useForegroundInterval } from '@/hooks/use-app-resume';
import { usePersistentState } from '@/hooks/use-persistent-state';
import {
  deleteReminderRow,
  fetchRemindersData,
  markNudgesReadRows,
  newId,
  RemindersNotInstalledError,
  saveReminderRow,
  SchedulesNotInstalledError,
  sendNudgeRow,
  deleteNudgeRows,
  setCompletionRow,
  setSubtaskCheckRow,
  SubtasksNotInstalledError,
  subscribeReminders,
} from '@/services/reminders-api';

/**
 * local：没有配置云端（开发调试），数据只存在本机
 * needs-setup：数据库还没执行提醒的 migration
 */
export type TasksStatus = 'local' | 'loading' | 'ready' | 'needs-setup' | 'error';

type TasksSnapshot = { reminders: Reminder[]; completions: ReminderCompletion[]; nudges: Nudge[]; subtaskChecks: SubtaskCheck[] };

type TasksContextValue = TasksSnapshot & {
  status: TasksStatus;
  /** 云端已经执行了子任务的 migration（本机模式下总是 true） */
  subtasksReady: boolean;
  /** 云端已经执行了日程的 migration（本机模式下总是 true） */
  schedulesReady: boolean;
  me: MemberId;
  saveReminder: (reminder: Omit<Reminder, 'id' | 'createdBy'> & { id?: string }) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  setDone: (reminder: Reminder, date: string, done: boolean) => Promise<void>;
  setSubtaskDone: (reminder: Reminder, subtaskId: string, date: string, done: boolean) => Promise<void>;
  sendNudge: (message: string, reminderId?: string | null) => Promise<void>;
  /** 删除消息（两边都消失）；'all' 清空全部 */
  deleteMessages: (ids: string[] | 'all') => Promise<void>;
  markRead: (ids: string[]) => Promise<void>;
  /** 发给我、还没看的「催一下」，最新的在前 */
  unreadForMe: Nudge[];
  refresh: () => void;
};

const TasksContext = createContext<TasksContextValue | null>(null);

const EMPTY: TasksSnapshot = { reminders: [], completions: [], nudges: [], subtaskChecks: [] };

/** 旧版本缓存里没有子任务字段，读出来时补齐 */
function normalizeSnapshot(snapshot: Partial<TasksSnapshot> | null | undefined): TasksSnapshot {
  return {
    reminders: (snapshot?.reminders ?? []).map((r) => withScheduleDefaults({ ...r, subtasks: Array.isArray(r.subtasks) ? r.subtasks : [] })),
    completions: snapshot?.completions ?? [],
    nudges: snapshot?.nudges ?? [],
    subtaskChecks: snapshot?.subtaskChecks ?? [],
  };
}

export function TasksProvider({ children }: PropsWithChildren) {
  const { configured, household } = useCloudSync();
  const { member } = useMember();
  const me: MemberId = member?.id ?? 'a';
  const householdId = household?.id ?? null;

  // 云端数据的本机缓存：离线时也能先看到上次的内容；未配置云端时它就是唯一的数据源
  const [storedCache, setCache] = usePersistentState<TasksSnapshot>('tasks-cache-v1', EMPTY);
  const cache = useMemo(() => normalizeSnapshot(storedCache), [storedCache]);
  const [subtasksReady, setSubtasksReady] = useState(true);
  const [schedulesReady, setSchedulesReady] = useState(true);
  const [status, setStatus] = useState<TasksStatus>(configured ? 'loading' : 'local');
  const [nonce, setNonce] = useState(0);
  const cloud = configured && Boolean(householdId);
  const cacheRef = useRef(cache);
  cacheRef.current = cache;
  // 上一次从云端拉到的数据。实时通知、回到前台、每分钟兜底都会重新拉，大多数时候数据没变，
  // 没变就不更新——否则每次都整页重绘，两个人来回发几条消息手机就卡住
  const lastFetchedRef = useRef('');

  const load = useCallback(async () => {
    if (!cloud || !householdId) return;
    try {
      const { subtasksReady: ready, schedulesReady: schedulesOk, ...data } = await fetchRemindersData(householdId, addDays(toDateKey(new Date()), -45));
      const signature = JSON.stringify(data);
      if (signature !== lastFetchedRef.current) {
        lastFetchedRef.current = signature;
        setCache(data);
      }
      setSubtasksReady(ready);
      setSchedulesReady(schedulesOk);
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

  const needsSetup = status === 'needs-setup';
  useEffect(() => {
    if (!cloud || !householdId || needsSetup) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeReminders(householdId, () => {
      // 对方连续改动时合并成一次刷新
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), 600);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [cloud, householdId, load, needsSetup]);

  // iPhone 把 App 放到后台时会断开实时连接，回来时重新拉一次；另外每分钟兜底检查一次
  useAppResume(() => void load(), cloud);
  useForegroundInterval(() => void load(), 60_000, cloud && !needsSetup);

  /** 先改本机（界面立刻响应），再写云端；云端失败就恢复原样并抛出错误 */
  const mutate = useCallback(async (apply: (current: TasksSnapshot) => TasksSnapshot, remote?: () => Promise<void>) => {
    const before = cacheRef.current;
    setCache((current) => apply(normalizeSnapshot(current)));
    if (!cloud || !remote) return;
    try {
      await remote();
    } catch (error) {
      setCache(before);
      if (error instanceof RemindersNotInstalledError) setStatus('needs-setup');
      if (error instanceof SubtasksNotInstalledError) setSubtasksReady(false);
      if (error instanceof SchedulesNotInstalledError) setSchedulesReady(false);
      throw error;
    }
  }, [cloud, setCache]);

  const saveReminder = useCallback<TasksContextValue['saveReminder']>(async (input) => {
    const existing = input.id ? cacheRef.current.reminders.find((r) => r.id === input.id) : undefined;
    const reminder: Reminder = { ...input, subtasks: input.subtasks ?? [], id: input.id ?? newId(), createdBy: existing?.createdBy ?? me };
    if (cloud && !subtasksReady && reminder.subtasks.length > 0) throw new SubtasksNotInstalledError();
    // 数据库升级前只能存「待办 + 原来的重复方式」；提醒方式沿用旧规则（有时间就准时提醒）
    if (cloud && !schedulesReady && (
      reminder.kind === 'event'
      || reminder.repeat === 'weekdays'
      || reminder.repeat === 'yearly'
      || reminder.remindBefore !== (reminder.dueTime ? 0 : null)
    )) throw new SchedulesNotInstalledError();
    await mutate(
      (current) => ({
        ...current,
        reminders: existing
          ? current.reminders.map((r) => (r.id === reminder.id ? reminder : r))
          : [...current.reminders, reminder],
      }),
      householdId ? () => saveReminderRow(householdId, reminder, { subtasks: subtasksReady, schedules: schedulesReady }) : undefined
    );
  }, [cloud, householdId, me, mutate, schedulesReady, subtasksReady]);

  const deleteReminder = useCallback(async (id: string) => {
    await mutate(
      (current) => ({
        ...current,
        reminders: current.reminders.filter((r) => r.id !== id),
        completions: current.completions.filter((c) => c.reminderId !== id),
        subtaskChecks: current.subtaskChecks.filter((c) => c.reminderId !== id),
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

  const setSubtaskDone = useCallback(async (reminder: Reminder, subtaskId: string, date: string, done: boolean) => {
    const same = (c: SubtaskCheck) => c.reminderId === reminder.id && c.subtaskId === subtaskId && c.occurrenceDate === date;
    await mutate(
      (current) => ({
        ...current,
        subtaskChecks: done
          ? [...current.subtaskChecks.filter((c) => !same(c)), { reminderId: reminder.id, subtaskId, occurrenceDate: date, doneBy: me }]
          : current.subtaskChecks.filter((c) => !same(c)),
      }),
      householdId ? () => setSubtaskCheckRow(householdId, reminder.id, subtaskId, date, me, done) : undefined
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

  const deleteMessages = useCallback(async (ids: string[] | 'all') => {
    await mutate(
      (current) => ({ ...current, nudges: ids === 'all' ? [] : current.nudges.filter((n) => !ids.includes(n.id)) }),
      householdId ? () => deleteNudgeRows(householdId, ids) : undefined
    );
  }, [householdId, mutate]);

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
    subtasksReady: !cloud || subtasksReady,
    schedulesReady: !cloud || schedulesReady,
    me,
    saveReminder,
    deleteReminder,
    setDone,
    setSubtaskDone,
    sendNudge,
    deleteMessages,
    markRead,
    unreadForMe,
    refresh: () => setNonce((n) => n + 1),
  }), [cache, cloud, deleteMessages, deleteReminder, markRead, me, saveReminder, schedulesReady, sendNudge, setDone, setSubtaskDone, status, subtasksReady, unreadForMe]);

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasks() {
  const context = useContext(TasksContext);
  if (!context) throw new Error('useTasks must be used inside TasksProvider');
  return context;
}
