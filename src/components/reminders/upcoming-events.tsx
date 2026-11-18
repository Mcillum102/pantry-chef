import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { findKitchenMember } from '@/constants/members';
import { Colors, Shadows } from '@/constants/theme';
import { daysUntilLabel, fromDateKey, REPEAT_LABELS, remindLabel, type Occurrence, type Reminder } from '@/data/reminders';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

/** 首页日历上方的「接下来」：最近的几个日程，一眼看到还有几天 */
export function UpcomingEvents({
  items,
  today,
  onOpen,
  onAdd,
}: {
  items: readonly Occurrence[];
  today: string;
  onOpen: (occurrence: Occurrence) => void;
  onAdd: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>接下来</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="添加日程" hitSlop={8} onPress={onAdd} style={({ pressed }) => [styles.add, pressed && styles.pressed]}>
          <Ionicons name="add" size={16} color={Colors.light.primary} />
          <Text style={styles.addText}>日程</Text>
        </Pressable>
      </View>
      {items.length === 0 ? (
        <Pressable accessibilityRole="button" onPress={onAdd} style={({ pressed }) => [styles.empty, pressed && styles.pressed]}>
          <Text style={styles.emptyText}>还没有日程。演唱会、生日、看医生……记下来，到时候提醒你们。</Text>
        </Pressable>
      ) : (
        <View style={styles.list}>
          {items.map((occurrence) => {
            const { reminder, date } = occurrence;
            const d = fromDateKey(date);
            const soon = daysUntilLabel(date, today);
            return (
              <Pressable
                key={`${reminder.id}-${date}`}
                accessibilityRole="button"
                accessibilityLabel={`${reminder.title}，${d.getMonth() + 1}月${d.getDate()}日，${soon}`}
                onPress={() => onOpen(occurrence)}
                style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
                <View style={[styles.dateBlock, date === today && styles.dateBlockToday]}>
                  <Text style={[styles.dateMonth, date === today && styles.dateTextToday]}>{`${d.getMonth() + 1}月`}</Text>
                  <Text style={[styles.dateDay, date === today && styles.dateTextToday]}>{d.getDate()}</Text>
                </View>
                <View style={styles.itemBody}>
                  <Text style={styles.itemTitle} numberOfLines={1}>{`${reminder.emoji} ${reminder.title}`}</Text>
                  <Text style={styles.itemMeta} numberOfLines={1}>
                    {[WEEKDAYS[d.getDay()], reminder.dueTime ?? '全天', reminder.remindBefore !== null ? '🔔' : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={[styles.soon, (soon === '今天' || soon === '明天') && styles.soonNear]}>{soon}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** 某一天列表里的日程：没有勾选框，显示时间、谁的、提醒设置 */
export function EventRow({ reminder, onOpen }: { reminder: Reminder; onOpen: () => void }) {
  const assignee = reminder.assignee === 'both' ? null : findKitchenMember(reminder.assignee);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`编辑日程：${reminder.title}`} onPress={onOpen} style={({ pressed }) => [styles.eventRow, pressed && styles.pressed]}>
      <View style={styles.eventTime}>
        <Text style={styles.eventTimeText}>{reminder.dueTime ?? '全天'}</Text>
      </View>
      <View style={styles.itemBody}>
        <Text style={styles.itemTitle} numberOfLines={2}>{`${reminder.emoji} ${reminder.title}`}</Text>
        <Text style={styles.itemMeta} numberOfLines={1}>
          {[
            assignee ? `${assignee.emoji} ${assignee.name}` : '👫 一起',
            reminder.repeat !== 'none' ? REPEAT_LABELS[reminder.repeat] : null,
            `🔔 ${remindLabel(reminder.remindBefore, Boolean(reminder.dueTime))}`,
          ].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.light.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, padding: 14, borderRadius: 26, backgroundColor: 'rgba(255, 255, 255, 0.9)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.95)', boxShadow: Shadows.card },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  title: { color: Colors.light.text, fontSize: 17, fontWeight: '600' },
  add: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 10, borderRadius: 16, backgroundColor: Colors.light.primarySoft },
  addText: { color: Colors.light.primary, fontSize: 13, fontWeight: '600' },
  empty: { paddingHorizontal: 4, paddingVertical: 6 },
  emptyText: { color: Colors.light.textSecondary, fontSize: 14, lineHeight: 20 },
  list: { gap: 4 },
  item: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, paddingVertical: 4, borderRadius: 14 },
  dateBlock: { width: 46, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#EAF0FA' },
  dateBlockToday: { backgroundColor: '#4C7FD1' },
  dateMonth: { color: '#4C7FD1', fontSize: 11, fontWeight: '600' },
  dateDay: { color: '#2F5DA8', fontSize: 19, lineHeight: 22, fontWeight: '700' },
  dateTextToday: { color: '#FFFFFF' },
  itemBody: { flex: 1, gap: 2 },
  itemTitle: { color: Colors.light.text, fontSize: 16, fontWeight: '600' },
  itemMeta: { color: Colors.light.textSecondary, fontSize: 13 },
  soon: { color: Colors.light.textSecondary, fontSize: 13, fontWeight: '600' },
  soonNear: { color: '#C26A1E' },
  eventRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border, backgroundColor: Colors.light.surface },
  eventTime: { width: 52, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#EAF0FA' },
  eventTimeText: { color: '#2F5DA8', fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.75 },
});
