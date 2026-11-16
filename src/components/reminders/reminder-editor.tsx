import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientSurface } from '@/components/gradient-surface';
import { KITCHEN_MEMBERS } from '@/constants/members';
import { Colors, Shadows } from '@/constants/theme';
import { addDays, dayLabel, REPEAT_LABELS, type Reminder, type ReminderAssignee, type ReminderRepeat } from '@/data/reminders';

const EMOJIS = ['📌', '🗑️', '🧺', '🛒', '🧹', '🍳', '💧', '🌿', '💊', '🐱', '📦', '💡'] as const;
const TIMES = ['08:00', '12:00', '18:00', '21:00'] as const;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ReminderDraft = Omit<Reminder, 'id' | 'createdBy'> & { id?: string };

export function ReminderEditor({
  visible,
  initial,
  today,
  defaultAssignee,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  initial: ReminderDraft | null;
  today: string;
  defaultAssignee: ReminderAssignee;
  onClose: () => void;
  onSave: (draft: ReminderDraft) => void;
  onDelete?: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<ReminderDraft>(() => initial ?? blank(today, defaultAssignee));
  const [customTime, setCustomTime] = useState('');

  useEffect(() => {
    if (!visible) return;
    const next = initial ?? blank(today, defaultAssignee);
    setDraft(next);
    setCustomTime(next.dueTime && !TIMES.includes(next.dueTime as (typeof TIMES)[number]) ? next.dueTime : '');
  }, [defaultAssignee, initial, today, visible]);

  const editing = Boolean(draft.id);
  const timeValid = !customTime || TIME_PATTERN.test(customTime);
  const canSave = draft.title.trim().length > 0 && timeValid;
  const update = (patch: Partial<ReminderDraft>) => setDraft((current) => ({ ...current, ...patch }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭" style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.heading}>{editing ? '编辑提醒' : '新提醒'}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="关闭" hitSlop={6} onPress={onClose} style={styles.close}>
              <Ionicons name="close" size={20} color={Colors.light.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.titleInputRow}>
              <Text style={styles.titleEmoji}>{draft.emoji}</Text>
              <TextInput
                accessibilityLabel="提醒内容"
                autoFocus={!editing}
                value={draft.title}
                onChangeText={(title) => update({ title })}
                placeholder="要做什么？比如：倒垃圾"
                placeholderTextColor="#A2A79F"
                maxLength={80}
                returnKeyType="done"
                style={styles.titleInput}
              />
            </View>

            <View style={styles.emojiRow}>
              {EMOJIS.map((emoji) => (
                <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={`图标 ${emoji}`} accessibilityState={{ selected: draft.emoji === emoji }} onPress={() => update({ emoji })} style={[styles.emojiChip, draft.emoji === emoji && styles.emojiChipOn]}>
                  <Text style={styles.emojiText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>

            <Field label="哪天">
              <View style={styles.dateRow}>
                <Pressable accessibilityRole="button" accessibilityLabel="前一天" hitSlop={4} onPress={() => update({ dueDate: addDays(draft.dueDate, -1) })} style={styles.dateArrow}>
                  <Ionicons name="chevron-back" size={18} color={Colors.light.primary} />
                </Pressable>
                <Text style={styles.dateValue}>{dayLabel(draft.dueDate, today)}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="后一天" hitSlop={4} onPress={() => update({ dueDate: addDays(draft.dueDate, 1) })} style={styles.dateArrow}>
                  <Ionicons name="chevron-forward" size={18} color={Colors.light.primary} />
                </Pressable>
              </View>
              <View style={styles.chips}>
                {[['今天', 0], ['明天', 1], ['后天', 2], ['一周后', 7]].map(([label, offset]) => {
                  const value = addDays(today, offset as number);
                  return <Chip key={label} label={label as string} selected={draft.dueDate === value} onPress={() => update({ dueDate: value })} />;
                })}
              </View>
            </Field>

            <Field label="几点">
              <View style={styles.chips}>
                <Chip label="不定时间" selected={!draft.dueTime} onPress={() => { update({ dueTime: null }); setCustomTime(''); }} />
                {TIMES.map((time) => (
                  <Chip key={time} label={time} selected={draft.dueTime === time} onPress={() => { update({ dueTime: time }); setCustomTime(''); }} />
                ))}
                <TextInput
                  accessibilityLabel="自定义时间"
                  value={customTime}
                  onChangeText={(value) => {
                    setCustomTime(value);
                    if (TIME_PATTERN.test(value)) update({ dueTime: value });
                  }}
                  placeholder="其他 19:30"
                  placeholderTextColor="#A2A79F"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  style={[styles.timeInput, customTime && !timeValid && styles.timeInputError]}
                />
              </View>
            </Field>

            <Field label="重复">
              <Segmented
                options={(Object.keys(REPEAT_LABELS) as ReminderRepeat[]).map((key) => ({ key, label: REPEAT_LABELS[key] }))}
                value={draft.repeat}
                onChange={(repeat) => update({ repeat })}
              />
            </Field>

            <Field label="谁来做">
              <Segmented
                options={[
                  ...KITCHEN_MEMBERS.map((member) => ({ key: member.id as ReminderAssignee, label: `${member.emoji} ${member.name}` })),
                  { key: 'both' as ReminderAssignee, label: '👫 一起' },
                ]}
                value={draft.assignee}
                onChange={(assignee) => update({ assignee })}
              />
            </Field>

            <Field label="备注（可选）">
              <TextInput
                accessibilityLabel="备注"
                value={draft.notes}
                onChangeText={(notes) => update({ notes })}
                placeholder="比如：可回收的周三收"
                placeholderTextColor="#A2A79F"
                multiline
                style={styles.notes}
              />
            </Field>
          </ScrollView>

          <View style={styles.footer}>
            {editing && onDelete ? (
              <Pressable accessibilityRole="button" accessibilityLabel="删除这条提醒" onPress={() => draft.id && onDelete(draft.id)} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
                <Ionicons name="trash-outline" size={20} color={Colors.light.danger} />
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" disabled={!canSave} onPress={() => onSave({ ...draft, title: draft.title.trim(), notes: draft.notes.trim() })} style={({ pressed }) => [styles.saveWrap, !canSave && styles.disabled, pressed && styles.pressed]}>
              <GradientSurface sheen={canSave} style={styles.save}>
                <Text style={styles.saveText}>{editing ? '保存' : '添加提醒'}</Text>
              </GradientSurface>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function blank(today: string, assignee: ReminderAssignee): ReminderDraft {
  return { title: '', emoji: '📌', notes: '', dueDate: today, dueTime: null, repeat: 'none', assignee };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.chipOn]}>
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Segmented<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable key={option.key} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onChange(option.key)} style={[styles.segment, selected && styles.segmentOn]}>
            <Text style={[styles.segmentText, selected && styles.segmentTextOn]} numberOfLines={1}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: 'rgba(22, 34, 28, 0.32)' },
  sheet: { width: '100%', maxWidth: 560, maxHeight: '92%', paddingTop: 10, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: Colors.light.surface, boxShadow: '0 -8px 30px rgba(23, 61, 47, 0.16)' },
  handle: { width: 42, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: Colors.light.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 4 },
  heading: { color: Colors.light.text, fontSize: 20, fontWeight: '600' },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: Colors.light.backgroundElement },
  content: { gap: 18, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12 },
  titleInputRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 18, backgroundColor: Colors.light.background, borderWidth: 1, borderColor: Colors.light.border },
  titleEmoji: { fontSize: 24 },
  titleInput: { flex: 1, minHeight: 52, color: Colors.light.text, fontSize: 17 },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  emojiChip: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Colors.light.background },
  emojiChipOn: { backgroundColor: Colors.light.primarySoft, borderWidth: 1.5, borderColor: Colors.light.primary },
  emojiText: { fontSize: 20 },
  field: { gap: 8 },
  fieldLabel: { color: Colors.light.textSecondary, fontSize: 13, fontWeight: '600' },
  dateRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, borderRadius: 16, backgroundColor: Colors.light.background },
  dateArrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dateValue: { color: Colors.light.text, fontSize: 16, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 20, backgroundColor: Colors.light.background, borderWidth: 1, borderColor: Colors.light.border },
  chipOn: { backgroundColor: Colors.light.primary, borderColor: Colors.light.primary },
  chipText: { color: Colors.light.text, fontSize: 14, fontWeight: '500' },
  chipTextOn: { color: '#FFFFFF', fontWeight: '600' },
  timeInput: { minWidth: 104, minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: Colors.light.background, borderWidth: 1, borderColor: Colors.light.border, color: Colors.light.text, fontSize: 14 },
  timeInputError: { borderColor: Colors.light.danger },
  segmented: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 18, backgroundColor: Colors.light.background },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: 14 },
  segmentOn: { backgroundColor: Colors.light.surface, boxShadow: Shadows.card },
  segmentText: { color: Colors.light.textSecondary, fontSize: 14, fontWeight: '500' },
  segmentTextOn: { color: Colors.light.primary, fontWeight: '600' },
  notes: { minHeight: 64, padding: 12, borderRadius: 16, backgroundColor: Colors.light.background, borderWidth: 1, borderColor: Colors.light.border, color: Colors.light.text, fontSize: 15, textAlignVertical: 'top' },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.light.border },
  deleteButton: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: Colors.light.dangerSoft },
  saveWrap: { flex: 1, borderRadius: 18, boxShadow: Shadows.glow },
  save: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  saveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
});
