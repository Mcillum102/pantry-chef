import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { Colors, Shadows } from '@/constants/theme';
import {
  fromDateKey,
  isDone,
  monthGrid,
  remindersOn,
  weekOf,
  WEEKDAY_LABELS,
  type Reminder,
  type ReminderCompletion,
} from '@/data/reminders';

type DayState = 'none' | 'pending' | 'done';

/** 一周日历条，可展开成整月。每天下面的小点：橙色有未完成，绿色全部完成 */
export function ReminderCalendar({
  selected,
  today,
  reminders,
  completions,
  onSelect,
}: {
  selected: string;
  today: string;
  reminders: readonly Reminder[];
  completions: readonly ReminderCompletion[];
  onSelect: (date: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const selectedDate = fromDateKey(selected);
  const [month, setMonth] = useState({ year: selectedDate.getFullYear(), index: selectedDate.getMonth() });

  const dayState = useMemo(() => {
    const cache = new Map<string, DayState>();
    return (date: string): DayState => {
      const hit = cache.get(date);
      if (hit) return hit;
      const list = remindersOn(reminders, date);
      const state: DayState = list.length === 0 ? 'none' : list.every((r) => isDone(completions, r.id, date)) ? 'done' : 'pending';
      cache.set(date, state);
      return state;
    };
  }, [completions, reminders]);

  const days = expanded ? monthGrid(month.year, month.index) : weekOf(selected);
  const headerDate = expanded ? new Date(month.year, month.index, 1) : selectedDate;

  function shiftMonth(delta: number) {
    setMonth((current) => {
      const next = new Date(current.year, current.index + delta, 1);
      return { year: next.getFullYear(), index: next.getMonth() };
    });
  }

  return (
    <Animated.View layout={LinearTransition.duration(220)} style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.monthLabel}>{`${headerDate.getFullYear()}年${headerDate.getMonth() + 1}月`}</Text>
        <View style={styles.headerActions}>
          {expanded ? (
            <>
              <Pressable accessibilityRole="button" accessibilityLabel="上个月" hitSlop={6} onPress={() => shiftMonth(-1)} style={styles.navButton}>
                <Ionicons name="chevron-back" size={18} color={Colors.light.text} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="下个月" hitSlop={6} onPress={() => shiftMonth(1)} style={styles.navButton}>
                <Ionicons name="chevron-forward" size={18} color={Colors.light.text} />
              </Pressable>
            </>
          ) : null}
          {selected !== today ? (
            <Pressable accessibilityRole="button" accessibilityLabel="回到今天" onPress={() => {
              onSelect(today);
              const t = fromDateKey(today);
              setMonth({ year: t.getFullYear(), index: t.getMonth() });
            }} style={styles.todayButton}>
              <Text style={styles.todayButtonText}>今天</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? '收起月历' : '展开月历'}
            hitSlop={6}
            onPress={() => {
              setMonth({ year: selectedDate.getFullYear(), index: selectedDate.getMonth() });
              setExpanded((value) => !value);
            }}
            style={styles.navButton}>
            <Ionicons name={expanded ? 'chevron-up' : 'calendar-outline'} size={18} color={Colors.light.primary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.weekdays}>
        {WEEKDAY_LABELS.map((label) => <Text key={label} style={styles.weekday}>{label}</Text>)}
      </View>

      <Animated.View key={expanded ? `m-${month.year}-${month.index}` : 'week'} entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.grid}>
        {days.map((date) => {
          const d = fromDateKey(date);
          const isSelected = date === selected;
          const isToday = date === today;
          const outside = expanded && d.getMonth() !== month.index;
          const state = dayState(date);
          return (
            <Pressable
              key={date}
              accessibilityRole="button"
              accessibilityLabel={`${d.getMonth() + 1}月${d.getDate()}日${state === 'pending' ? '，有待办' : state === 'done' ? '，已全部完成' : ''}`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(date)}
              style={styles.cell}>
              <View style={[styles.day, isToday && !isSelected && styles.dayToday, isSelected && styles.daySelected]}>
                <Text style={[styles.dayText, outside && styles.dayOutside, isSelected && styles.dayTextSelected]}>{d.getDate()}</Text>
              </View>
              <View style={[styles.dot, state === 'pending' && styles.dotPending, state === 'done' && styles.dotDone]} />
            </Pressable>
          );
        })}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, padding: 14, borderRadius: 26, backgroundColor: 'rgba(255, 255, 255, 0.9)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.95)', boxShadow: Shadows.card, overflow: 'hidden' },
  header: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  monthLabel: { color: Colors.light.text, fontSize: 17, fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: Colors.light.backgroundElement },
  todayButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 18, backgroundColor: Colors.light.primarySoft },
  todayButtonText: { color: Colors.light.primary, fontSize: 13, fontWeight: '600' },
  weekdays: { flexDirection: 'row' },
  weekday: { flex: 1, color: Colors.light.textSecondary, fontSize: 12, fontWeight: '500', textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 2 },
  cell: { width: `${100 / 7}%`, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 4 },
  day: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  dayToday: { borderWidth: 1.5, borderColor: Colors.light.primary },
  daySelected: { backgroundColor: Colors.light.primary, boxShadow: '0 6px 14px rgba(46, 107, 79, 0.28)' },
  dayText: { color: Colors.light.text, fontSize: 16, fontWeight: '500' },
  dayTextSelected: { color: '#FFFFFF', fontWeight: '600' },
  dayOutside: { color: '#B8BCB4' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'transparent' },
  dotPending: { backgroundColor: '#E09A3A' },
  dotDone: { backgroundColor: '#5E9A6F' },
});
