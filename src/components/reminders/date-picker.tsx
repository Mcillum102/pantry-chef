import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { fromDateKey, monthGrid, WEEKDAY_LABELS } from '@/data/reminders';

/** 月历选日期：可以翻月，一下就能选到几个月后的某天 */
export function DatePicker({ value, today, onChange }: { value: string; today: string; onChange: (date: string) => void }) {
  const valueDate = fromDateKey(value);
  const [month, setMonth] = useState({ year: valueDate.getFullYear(), index: valueDate.getMonth() });

  // 外面改了日期（比如点了「明天」）时，月历跟着翻到那个月
  useEffect(() => {
    const date = fromDateKey(value);
    setMonth({ year: date.getFullYear(), index: date.getMonth() });
  }, [value]);

  function shift(delta: number) {
    setMonth((current) => {
      const next = new Date(current.year, current.index + delta, 1);
      return { year: next.getFullYear(), index: next.getMonth() };
    });
  }

  const days = monthGrid(month.year, month.index);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="上个月" hitSlop={6} onPress={() => shift(-1)} style={styles.nav}>
          <Ionicons name="chevron-back" size={18} color={Colors.light.primary} />
        </Pressable>
        <Text style={styles.month}>{`${month.year}年${month.index + 1}月`}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="下个月" hitSlop={6} onPress={() => shift(1)} style={styles.nav}>
          <Ionicons name="chevron-forward" size={18} color={Colors.light.primary} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={styles.weekday}>{label}</Text>
        ))}
        {days.map((day) => {
          const date = fromDateKey(day);
          const inMonth = date.getMonth() === month.index;
          const selected = day === value;
          const isToday = day === today;
          return (
            <Pressable
              key={day}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${date.getMonth() + 1}月${date.getDate()}日`}
              onPress={() => onChange(day)}
              style={styles.cell}>
              <View style={[styles.dayCircle, isToday && styles.today, selected && styles.selected]}>
                <Text style={[styles.dayText, !inMonth && styles.outside, selected && styles.selectedText]}>{date.getDate()}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 8, borderRadius: 18, backgroundColor: Colors.light.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4 },
  nav: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  month: { color: Colors.light.text, fontSize: 15, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', color: Colors.light.textSecondary, fontSize: 12, paddingBottom: 4 },
  cell: { width: `${100 / 7}%`, height: 40, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  today: { borderWidth: 1.5, borderColor: Colors.light.primary },
  selected: { backgroundColor: Colors.light.primary, borderColor: Colors.light.primary },
  dayText: { color: Colors.light.text, fontSize: 15 },
  outside: { color: '#B9BDB6' },
  selectedText: { color: '#FFFFFF', fontWeight: '600' },
});
