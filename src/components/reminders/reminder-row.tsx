import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Colors } from '@/constants/theme';
import { findKitchenMember } from '@/constants/members';
import { REPEAT_LABELS, type MemberId, type Reminder } from '@/data/reminders';

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
};

export function ReminderRow({ reminder, done, doneBy, overdueLabel, canNudge, nudged, onToggle, onOpen, onNudge }: Props) {
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

  return (
    <View style={[styles.row, done && styles.rowDone]}>
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
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10, paddingLeft: 6, paddingRight: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border, backgroundColor: Colors.light.surface },
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
