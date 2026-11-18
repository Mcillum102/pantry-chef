import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppScreen, SectionHeader } from '@/components/app-screen';
import { CountUp } from '@/components/count-up';
import { GradientSurface } from '@/components/gradient-surface';
import { CHAT_COMPOSER_SPACE, ChatComposer } from '@/components/reminders/chat-composer';
import { ReminderCalendar } from '@/components/reminders/reminder-calendar';
import { blankReminderDraft, ReminderEditor, type ReminderDraft } from '@/components/reminders/reminder-editor';
import { ReminderRow } from '@/components/reminders/reminder-row';
import { findKitchenMember, KITCHEN_MEMBERS } from '@/constants/members';
import { Colors, DisplayText, Shadows } from '@/constants/theme';
import { useTasks } from '@/context/tasks-context';
import {
  dayLabel,
  isAssignedTo,
  isDone,
  isSubtaskDone,
  otherMember,
  overdueOccurrences,
  recentMessages,
  remindersOn,
  timeAgo,
  toDateKey,
  type Reminder,
} from '@/data/reminders';

type Filter = 'all' | 'mine' | 'theirs';

/** 默认首页：日历 + 提醒清单，两人共用；发现对方有事没做可以「催一下」 */
export default function RemindersScreen() {
  const insets = useSafeAreaInsets();
  const {
    reminders, completions, nudges, subtaskChecks, status, subtasksReady, me,
    saveReminder, deleteReminder, setDone, setSubtaskDone, sendNudge, deleteMessages,
  } = useTasks();
  const today = toDateKey(new Date());
  const [selected, setSelected] = useState(today);
  const [filter, setFilter] = useState<Filter>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ReminderDraft | null>(null);
  const [scrollToEndKey, setScrollToEndKey] = useState(0);
  const [nudged, setNudged] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  // 点一下（或长按）消息 → 显示「删除」；「清空」要点两次才生效
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const meMember = findKitchenMember(me);
  const other = findKitchenMember(otherMember(me));

  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmClear]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const matchesFilter = (reminder: Reminder) =>
    filter === 'all' ? true : filter === 'mine' ? isAssignedTo(reminder, me) : isAssignedTo(reminder, otherMember(me));

  const dayList = remindersOn(reminders, selected).filter(matchesFilter);
  const overdue = selected === today ? overdueOccurrences(reminders, completions, today).filter((o) => matchesFilter(o.reminder)) : [];
  const doneCount = dayList.filter((r) => isDone(completions, r.id, selected)).length;

  // 今天每个人还剩几件（主卡片用）
  const todayList = remindersOn(reminders, today);
  const remainingToday = todayList.filter((r) => !isDone(completions, r.id, today));
  const remainingFor = (member: 'a' | 'b') => remainingToday.filter((r) => isAssignedTo(r, member)).length;
  const messages = useMemo(() => recentMessages(nudges), [nudges]);

  function openNew(title = '') {
    setEditing(blankReminderDraft(selected, filter === 'theirs' ? otherMember(me) : 'both', title));
    setEditorOpen(true);
  }

  async function sendMessage(message: string) {
    try {
      await sendNudge(message);
      setScrollToEndKey((key) => key + 1);
      return true;
    } catch {
      setToast('没发出去，请检查网络后再试');
      return false;
    }
  }

  function removeMessage(id: string) {
    setSelectedMessage(null);
    void run(() => deleteMessages([id]), '已删除');
  }

  function clearMessages() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    setSelectedMessage(null);
    void run(() => deleteMessages('all'), '消息已清空');
  }

  function openEdit(reminder: Reminder) {
    setEditing({ ...reminder });
    setEditorOpen(true);
  }

  async function run(action: () => Promise<void>, success?: string) {
    try {
      await action();
      if (success) setToast(success);
    } catch (error) {
      setToast(error instanceof Error && error.message === 'subtasks-not-installed'
        ? '子任务需要先升级数据库'
        : '没同步成功，请检查网络后再试');
    }
  }

  const subtaskProps = (reminder: Reminder, date: string) => ({
    isSubtaskDone: (subtaskId: string) => isSubtaskDone(subtaskChecks, reminder.id, subtaskId, date),
    onToggleSubtask: (subtaskId: string, done: boolean) => void run(() => setSubtaskDone(reminder, subtaskId, date, done)),
  });

  function nudge(reminder: Reminder) {
    setNudged((current) => [...current, reminder.id]);
    void run(() => sendNudge(`「${reminder.title}」还没做哦`, reminder.id), `已提醒${other?.name ?? '对方'}`);
  }

  const doneByFor = (reminder: Reminder, date: string) =>
    completions.find((c) => c.reminderId === reminder.id && c.occurrenceDate === date)?.doneBy;

  return (
    <>
      <AppScreen
        eyebrow={dayLabel(today, today) + ' · ' + new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())}
        title="提醒"
        subtitle={`${meMember?.name ?? ''}和${other?.name ?? ''}的日常小事，一起记、一起做。`}
        bottomSpace={CHAT_COMPOSER_SPACE}
        scrollToEndKey={scrollToEndKey}>
        {status === 'needs-setup' ? (
          <View style={styles.setupCard}>
            <Text style={styles.setupTitle}>🛠️ 还差一步：升级数据库</Text>
            <Text style={styles.setupText}>
              提醒需要在 Supabase 里执行一次 supabase/migrations/20261115000000_reminders_and_nudges.sql，执行后两台手机就能同步提醒和互相「催一下」。
            </Text>
          </View>
        ) : null}
        {status !== 'needs-setup' && !subtasksReady ? (
          <View style={styles.setupCard}>
            <Text style={styles.setupTitle}>🛠️ 子任务需要升级数据库</Text>
            <Text style={styles.setupText}>
              在 Supabase 里执行一次 supabase/migrations/20261116000000_reminder_subtasks.sql 后，就能给提醒添加子任务。其他功能不受影响。
            </Text>
          </View>
        ) : null}

        <GradientSurface style={styles.hero}>
          <Text style={styles.heroEyebrow}>今天</Text>
          <View style={styles.heroMain}>
            <CountUp style={styles.heroNumber} value={remainingToday.length} />
            <Text style={[styles.heroTitle, DisplayText]}>
              {todayList.length === 0 ? '件事，轻松的一天 ☕️' : remainingToday.length === 0 ? '件待办，全部完成 🎉' : '件事还没做'}
            </Text>
          </View>
          <View style={styles.heroMembers}>
            {KITCHEN_MEMBERS.map((member) => (
              <View key={member.id} style={styles.heroMember}>
                <Text style={styles.heroMemberEmoji}>{member.emoji}</Text>
                <Text style={styles.heroMemberName}>{member.name}</Text>
                <Text style={styles.heroMemberCount}>{`还剩 ${remainingFor(member.id)}`}</Text>
              </View>
            ))}
          </View>
        </GradientSurface>

        <ReminderCalendar selected={selected} today={today} reminders={reminders} completions={completions} onSelect={setSelected} />

        <View style={styles.filters}>
          {([
            ['all', '全部'],
            ['mine', `${meMember?.name ?? '我'}的`],
            ['theirs', `${other?.name ?? '对方'}的`],
          ] as const).map(([key, label]) => (
            <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: filter === key }} onPress={() => setFilter(key)} style={[styles.filterChip, filter === key && styles.filterChipOn]}>
              <Text style={[styles.filterText, filter === key && styles.filterTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {overdue.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="还没完成" detail={`${overdue.length} 件`} />
            <View style={[styles.listCard, styles.overdueCard]}>
              {overdue.map(({ reminder, date }) => (
                <ReminderRow
                  key={`${reminder.id}-${date}`}
                  reminder={reminder}
                  done={false}
                  overdueLabel={dayLabel(date, today)}
                  canNudge={isAssignedTo(reminder, otherMember(me))}
                  nudged={nudged.includes(reminder.id)}
                  onToggle={() => void run(() => setDone(reminder, date, true))}
                  onOpen={() => openEdit(reminder)}
                  onNudge={() => nudge(reminder)}
                  {...subtaskProps(reminder, date)}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionHeader title={dayLabel(selected, today)} detail={dayList.length ? `已完成 ${doneCount}/${dayList.length}` : undefined} />
          {dayList.length > 0 ? (
            <>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${(doneCount / dayList.length) * 100}%` as `${number}%` }]} />
              </View>
              <View style={styles.listCard}>
                {dayList.map((reminder) => {
                  const done = isDone(completions, reminder.id, selected);
                  return (
                    <ReminderRow
                      key={reminder.id}
                      reminder={reminder}
                      done={done}
                      doneBy={doneByFor(reminder, selected)}
                      canNudge={selected <= today && isAssignedTo(reminder, otherMember(me))}
                      nudged={nudged.includes(reminder.id)}
                      onToggle={() => void run(() => setDone(reminder, selected, !done))}
                      onOpen={() => openEdit(reminder)}
                      onNudge={() => nudge(reminder)}
                      {...subtaskProps(reminder, selected)}
                    />
                  );
                })}
              </View>
            </>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🗓️</Text>
              <Text style={styles.emptyTitle}>这天还没有安排</Text>
              <Text style={styles.emptyText}>在下面的输入框写一句，点 ⏰ 就能记成提醒。</Text>
              <Pressable accessibilityRole="button" onPress={() => openNew()} style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}>
                <Ionicons name="add" size={18} color={Colors.light.primary} />
                <Text style={styles.emptyButtonText}>添加提醒</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="消息"
            detail={messages.length ? `最近 ${messages.length} 条` : undefined}
            action={messages.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={confirmClear ? '确定清空全部消息' : '清空全部消息'}
                hitSlop={8}
                onPress={clearMessages}
                style={({ pressed }) => [styles.clearMessages, confirmClear && styles.clearMessagesConfirm, pressed && styles.pressed]}>
                <Text style={[styles.clearMessagesText, confirmClear && styles.clearMessagesTextConfirm]}>
                  {confirmClear ? '确定清空？' : '清空'}
                </Text>
              </Pressable>
            ) : undefined}
          />
          {messages.length > 0 ? (
            <View style={styles.messages}>
              {messages.map((n) => {
                const mine = n.fromMember === me;
                const from = findKitchenMember(n.fromMember);
                const selected = selectedMessage === n.id;
                const toggle = () => setSelectedMessage((current) => (current === n.id ? null : n.id));
                return (
                  <View key={n.id} style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityHint="点一下显示删除"
                      onPress={toggle}
                      onLongPress={() => setSelectedMessage(n.id)}
                      delayLongPress={350}
                      style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, selected && styles.bubbleSelected]}>
                      <Text selectable={false} style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{n.message}</Text>
                    </Pressable>
                    <View style={[styles.bubbleMetaRow, mine && styles.bubbleMetaRowMine]}>
                      <Text style={styles.bubbleMeta}>{`${mine ? '我' : from?.name ?? ''} · ${timeAgo(n.createdAt)}${mine ? (n.readAt ? ' · 已读' : ' · 未读') : ''}`}</Text>
                      {selected ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`删除「${n.message}」`}
                          hitSlop={8}
                          onPress={() => removeMessage(n.id)}
                          style={({ pressed }) => [styles.deleteMessage, pressed && styles.pressed]}>
                          <Ionicons name="trash-outline" size={13} color={Colors.light.danger} />
                          <Text style={styles.deleteMessageText}>删除</Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`把「${n.message}」设为提醒`}
                        hitSlop={8}
                        onPress={() => openNew(n.message.slice(0, 80))}
                        style={({ pressed }) => [styles.makeReminder, pressed && styles.pressed]}>
                        <Ionicons name="alarm-outline" size={13} color={Colors.light.primary} />
                        <Text style={styles.makeReminderText}>设为提醒</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.messagesEmpty}>{`在下面输入，发给${other?.name ?? '对方'}；对方手机会马上收到。`}</Text>
          )}
        </View>
      </AppScreen>

      <ReminderEditor
        visible={editorOpen}
        initial={editing}
        today={today}
        defaultAssignee="both"
        subtasksEnabled={subtasksReady}
        onClose={() => setEditorOpen(false)}
        onSave={(draft) => {
          setEditorOpen(false);
          setSelected(draft.dueDate);
          void run(() => saveReminder(draft), draft.id ? '已保存' : '已添加提醒');
        }}
        onDelete={(id) => {
          setEditorOpen(false);
          void run(() => deleteReminder(id), '已删除');
        }}
      />

      {!editorOpen ? (
        <ChatComposer
          placeholder={`发消息给${other?.name ?? '对方'}…`}
          onSend={sendMessage}
          onMakeReminder={(text) => openNew(text.slice(0, 80))}
        />
      ) : null}

      {toast ? (
        <View pointerEvents="none" style={[styles.toast, { top: Math.max(insets.top, 10) + 10 }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  setupCard: { gap: 6, padding: 16, borderRadius: 22, backgroundColor: '#FFF6E6', borderWidth: 1, borderColor: '#F1DDB5' },
  setupTitle: { color: Colors.light.text, fontSize: 15, fontWeight: '600' },
  setupText: { color: '#7A5A22', fontSize: 13, lineHeight: 19 },
  hero: { gap: 12, padding: 20, borderRadius: 30, boxShadow: Shadows.glow },
  heroEyebrow: { color: '#DDEEE3', fontSize: 12, fontWeight: '600', letterSpacing: 0.4 },
  heroMain: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 },
  heroNumber: { color: '#FFFFFF', fontSize: 48, lineHeight: 54, fontWeight: '600', letterSpacing: -1 },
  heroTitle: { color: '#FFFFFF', fontSize: 20 },
  heroMembers: { flexDirection: 'row', gap: 10 },
  heroMember: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, backgroundColor: 'rgba(255, 255, 255, 0.13)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.14)' },
  heroMemberEmoji: { fontSize: 18 },
  heroMemberName: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  heroMemberCount: { color: '#CFE6D7', fontSize: 13, fontWeight: '500' },
  filters: { flexDirection: 'row', gap: 8 },
  filterChip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.8)', borderWidth: 1, borderColor: Colors.light.border },
  filterChipOn: { backgroundColor: Colors.light.text, borderColor: Colors.light.text },
  filterText: { color: Colors.light.text, fontSize: 14, fontWeight: '500' },
  filterTextOn: { color: '#FFFFFF', fontWeight: '600' },
  section: { gap: 12 },
  progressTrack: { height: 6, overflow: 'hidden', borderRadius: 3, backgroundColor: Colors.light.backgroundElement },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: '#5E9A6F' },
  listCard: { overflow: 'hidden', borderRadius: 24, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border, boxShadow: Shadows.card },
  overdueCard: { borderColor: '#F0CFC7' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 28, paddingHorizontal: 24, borderRadius: 24, backgroundColor: 'rgba(255, 255, 255, 0.85)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.95)' },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { color: Colors.light.text, fontSize: 17, fontWeight: '600' },
  emptyText: { color: Colors.light.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  emptyButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, paddingHorizontal: 16, borderRadius: 22, backgroundColor: Colors.light.primarySoft },
  emptyButtonText: { color: Colors.light.primary, fontSize: 14, fontWeight: '600' },
  messages: { gap: 10 },
  bubbleRow: { alignItems: 'flex-start', gap: 4 },
  bubbleRowMine: { alignItems: 'flex-end' },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleMine: { backgroundColor: Colors.light.primary, borderBottomRightRadius: 6 },
  bubbleTheirs: { backgroundColor: Colors.light.surface, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: Colors.light.border },
  bubbleText: { color: Colors.light.text, fontSize: 15, lineHeight: 21 },
  bubbleTextMine: { color: '#FFFFFF' },
  bubbleMeta: { color: Colors.light.textSecondary, fontSize: 12 },
  bubbleMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bubbleMetaRowMine: { flexDirection: 'row-reverse' },
  makeReminder: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 3 },
  makeReminderText: { color: Colors.light.primary, fontSize: 12, fontWeight: '600' },
  bubbleSelected: { opacity: 0.72 },
  deleteMessage: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 3 },
  deleteMessageText: { color: Colors.light.danger, fontSize: 12, fontWeight: '600' },
  clearMessages: { minHeight: 28, paddingHorizontal: 10, borderRadius: 14, justifyContent: 'center' },
  clearMessagesConfirm: { backgroundColor: Colors.light.dangerSoft },
  clearMessagesText: { color: Colors.light.textSecondary, fontSize: 13, fontWeight: '600' },
  clearMessagesTextConfirm: { color: Colors.light.danger },
  messagesEmpty: { color: Colors.light.textSecondary, fontSize: 14, lineHeight: 20 },
  toast: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 18, backgroundColor: '#1E2420', boxShadow: '0 10px 30px rgba(0, 0, 0, 0.22)' },
  toastText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' },
});
