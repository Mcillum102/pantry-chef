import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Colors } from '@/constants/theme';
import { findKitchenMember } from '@/constants/members';
import { remindLabel, REPEAT_LABELS, type MemberId, type Reminder } from '@/data/reminders';

type Props = {
  reminder: Reminder;
  done: boolean;
  doneBy?: MemberId;
  overdueLabel?: string;
  /** 可以「催一下」对方（这条提醒分给了对方、还没做完） */
  canNudge: boolean;
  nudged?: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onNudge: () => void;
  /** 这一天某个子任务是否已勾选 */
  isSubtaskDone?: (subtaskId: string) => boolean;
  onToggleSubtask?: (subtaskId: string, done: boolean) => void;
};

export function ReminderRow({ reminder, done, doneBy, overdueLabel, canNudge, nudged, onToggle, onOpen, onNudge, isSubtaskDone, onToggleSubtask }: Props) {
  const check = useSharedValue(done ? 1 : 0);
  const bell = useSharedValue(0);

  useEffect(() => {
    check.set(withSpring(done ? 1 : 0, { damping: 12, stiffness: 260, reduceMotion: ReduceMotion.System }));
  }, [check, done]);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.6 + check.value * 0.4 }],
    opacity: check.value,
  }));
  const bellStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${bell.value}deg` }] }));

  const assignee = reminder.assignee === 'both' ? null : findKitchenMember(reminder.assignee);
  const doer = doneBy ? findKitchenMember(doneBy) : null;
  const subtasks = reminder.subtasks ?? [];
  const subtasksDone = subtasks.filter((s) => isSubtaskDone?.(s.id)).length;

  return (
    <View style={[styles.wrap, done && styles.rowDone]}>
    <View style={styles.row}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`${done ? '标记为未完成' : '完成'}：${reminder.title}`}
        hitSlop={8}
        onPress={onToggle}
        style={styles.checkHit}>
        <View style={[styles.checkCircle, done && styles.checkCircleOn]}>
          <Animated.View style={checkStyle}>
            <Ionicons name="checkmark" size={18} color="#FFFFFF" />
          </Animated.View>
        </View>
      </Pressable>

      <Pressable accessibilityRole="button" accessibilityLabel={`编辑提醒：${reminder.title}`} onPress={onOpen} style={({ pressed }) => [styles.body, pressed && styles.pressed]}>
        <View style={styles.titleRow}>
          <Text style={styles.emoji}>{reminder.emoji}</Text>
          <Text style={[styles.title, done && styles.titleDone]} numberOfLines={2}>{reminder.title}</Text>
        </View>
        <View style={styles.meta}>
          {overdueLabel ? <Text style={styles.overdue}>{overdueLabel}</Text> : null}
          {reminder.dueTime ? (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={13} color={Colors.light.textSecondary} />
              <Text style={styles.metaText}>{reminder.dueTime}</Text>
            </View>
          ) : null}
          {reminder.remindBefore !== null && reminder.remindBefore !== undefined ? (
            <View style={styles.metaItem} accessibilityLabel={`提醒：${remindLabel(reminder.remindBefore, Boolean(reminder.dueTime))}`}>
              <Ionicons name="notifications-outline" size={13} color={Colors.light.textSecondary} />
              {reminder.remindBefore > 0 ? <Text style={styles.metaText}>{remindLabel(reminder.remindBefore, Boolean(reminder.dueTime)).replace('提前 ', '')}</Text> : null}
            </View>
          ) : null}
          {subtasks.length > 0 ? (
            <View style={styles.metaItem}>
              <Ionicons name="checkbox-outline" size={13} color={Colors.light.textSecondary} />
              <Text style={styles.metaText}>{`${subtasksDone}/${subtasks.length}`}</Text>
            </View>
          ) : null}
          {reminder.repeat !== 'none' ? (
            <View style={styles.metaItem}>
              <Ionicons name="repeat" size={13} color={Colors.light.textSecondary} />
              <Text style={styles.metaText}>{REPEAT_LABELS[reminder.repeat]}</Text>
            </View>
          ) : null}
          <View style={[styles.assigneeChip, assignee?.id === 'b' && styles.assigneeChipB, !assignee && styles.assigneeChipBoth]}>
            <Text style={styles.assigneeText}>{assignee ? `${assignee.emoji} ${assignee.name}` : '👫 一起'}</Text>
          </View>
        </View>
        {done && doer ? <Text style={styles.doneBy}>{`${doer.name} 完成了`}</Text> : null}
      </Pressable>

      {canNudge && !done ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`催一下：${reminder.title}`}
          hitSlop={6}
          onPress={() => {
            bell.set(withSequence(withTiming(-18, { duration: 70 }), withTiming(16, { duration: 90 }), withTiming(-10, { duration: 80 }), withTiming(0, { duration: 90 })));
            onNudge();
          }}
          style={({ pressed }) => [styles.nudgeButton, nudged && styles.nudgeButtonSent, pressed && styles.pressed]}>
          <Animated.View style={bellStyle}>
            <Ionicons name={nudged ? 'notifications' : 'notifications-outline'} size={18} color={nudged ? '#FFFFFF' : '#C26A1E'} />
          </Animated.View>
          <Text style={[styles.nudgeText, nudged && styles.nudgeTextSent]}>{nudged ? '已催' : '催一下'}</Text>
        </Pressable>
      ) : null}
    </View>
      {subtasks.length > 0 ? (
        <View style={styles.subtasks}>
          {subtasks.map((subtask) => {
            const checked = done || Boolean(isSubtaskDone?.(subtask.id));
            return (
              <Pressable
                key={subtask.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked, disabled: done }}
                accessibilityLabel={`子任务：${subtask.title}`}
                disabled={done || !onToggleSubtask}
                onPress={() => onToggleSubtask?.(subtask.id, !checked)}
                style={({ pressed }) => [styles.subtask, pressed && styles.pressed]}>
                <View style={[styles.subtaskBox, checked && styles.subtaskBoxOn]}>
                  {checked ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
                </View>
                <Text style={[styles.subtaskText, checked && styles.titleDone]} numberOfLines={2}>{subtask.title}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border, backgroundColor: Colors.light.surface },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10, paddingLeft: 6, paddingRight: 12 },
  subtasks: { gap: 2, marginTop: -4, paddingBottom: 10, paddingLeft: 54, paddingRight: 12 },
  subtask: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 10 },
  subtaskBox: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 1.5, borderColor: '#BFC5BD' },
  subtaskBoxOn: { borderColor: '#5E9A6F', backgroundColor: '#5E9A6F' },
  subtaskText: { flex: 1, color: Colors.light.text, fontSize: 15 },
  rowDone: { backgroundColor: '#FAFBF8' },
  checkHit: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  checkCircle: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 2, borderColor: '#BFC5BD', backgroundColor: Colors.light.surface },
  checkCircleOn: { borderColor: Colors.light.primary, backgroundColor: Colors.light.primary },
  body: { flex: 1, gap: 5, paddingVertical: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emoji: { fontSize: 20 },
  title: { flex: 1, color: Colors.light.text, fontSize: 16, fontWeight: '500' },
  titleDone: { color: Colors.light.textSecondary, textDecorationLine: 'line-through' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { color: Colors.light.textSecondary, fontSize: 12.5 },
  overdue: { color: Colors.light.danger, fontSize: 12.5, fontWeight: '600' },
  assigneeChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: Colors.light.primarySoft },
  assigneeChipB: { backgroundColor: '#FFEDE0' },
  assigneeChipBoth: { backgroundColor: '#EEE8FB' },
  assigneeText: { color: Colors.light.text, fontSize: 12, fontWeight: '500' },
  doneBy: { color: '#5E9A6F', fontSize: 12, fontWeight: '500' },
  nudgeButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, borderRadius: 20, backgroundColor: '#FFF1E2' },
  nudgeButtonSent: { backgroundColor: '#E09A3A' },
  nudgeText: { color: '#C26A1E', fontSize: 13, fontWeight: '600' },
  nudgeTextSent: { color: '#FFFFFF' },
  pressed: { opacity: 0.7 },
});
