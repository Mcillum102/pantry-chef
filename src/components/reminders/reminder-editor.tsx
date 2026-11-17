import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientSurface } from '@/components/gradient-surface';
import { KeyboardAware } from '@/components/keyboard-aware';
import { MoreOptions } from '@/components/more-options';
import { KITCHEN_MEMBERS } from '@/constants/members';
import { Colors, Shadows } from '@/constants/theme';
import {
  addDays,
  cleanSubtasks,
  dayLabel,
  REPEAT_LABELS,
  type Reminder,
  type ReminderAssignee,
  type ReminderRepeat,
} from '@/data/reminders';
import { newId } from '@/services/reminders-api';

const EMOJIS = ['📌', '🗑️', '🧺', '🛒', '🧹', '🍳', '💧', '🌿', '💊', '🐱', '📦', '💡'] as const;
const TIMES = ['08:00', '12:00', '18:00', '21:00'] as const;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const QUICK_DAYS = [['今天', 0], ['明天', 1], ['后天', 2]] as const;

export type ReminderDraft = Omit<Reminder, 'id' | 'createdBy'> & { id?: string };

export function blankReminderDraft(dueDate: string, assignee: ReminderAssignee, title = ''): ReminderDraft {
  return { title, emoji: '📌', notes: '', subtasks: [], dueDate, dueTime: null, repeat: 'none', assignee };
}

/** 新建 / 编辑提醒。只露出最常用的：做什么、子任务、哪天、谁做；其余放在「更多选项」里 */
export function ReminderEditor({
  visible,
  initial,
  today,
  defaultAssignee,
  subtasksEnabled = true,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  initial: ReminderDraft | null;
  today: string;
  defaultAssignee: ReminderAssignee;
  /** 云端还没升级数据库时，子任务暂时不能保存 */
  subtasksEnabled?: boolean;
  onClose: () => void;
  onSave: (draft: ReminderDraft) => void;
  onDelete?: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<ReminderDraft>(() => initial ?? blankReminderDraft(today, defaultAssignee));
  const [customTime, setCustomTime] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  const [pickingDate, setPickingDate] = useState(false);
  const subtaskInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    const next = initial ?? blankReminderDraft(today, defaultAssignee);
    setDraft({ ...next, subtasks: next.subtasks ?? [] });
    setCustomTime(next.dueTime && !TIMES.includes(next.dueTime as (typeof TIMES)[number]) ? next.dueTime : '');
    setNewSubtask('');
    setPickingDate(!QUICK_DAYS.some(([, offset]) => addDays(today, offset) === next.dueDate));
  }, [defaultAssignee, initial, today, visible]);

  const editing = Boolean(draft.id);
  const timeValid = !customTime || TIME_PATTERN.test(customTime);
  const canSave = draft.title.trim().length > 0 && timeValid;
  const update = (patch: Partial<ReminderDraft>) => setDraft((current) => ({ ...current, ...patch }));

  function addSubtask() {
    const title = newSubtask.trim();
    if (!title) return;
    update({ subtasks: [...draft.subtasks, { id: newId(), title }] });
    setNewSubtask('');
    subtaskInputRef.current?.focus();
  }

  function save() {
    if (!canSave) return;
    const pending = newSubtask.trim() ? [...draft.subtasks, { id: newId(), title: newSubtask.trim() }] : draft.subtasks;
    onSave({ ...draft, title: draft.title.trim(), notes: draft.notes.trim(), subtasks: cleanSubtasks(pending) });
  }

  const moreSummary = [
    draft.dueTime,
    draft.repeat !== 'none' ? REPEAT_LABELS[draft.repeat] : null,
    draft.notes.trim() ? '有备注' : null,
  ].filter(Boolean).join(' · ') || '时间、重复、图标、备注';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAware style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭" style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 10 }]}>
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
                autoFocus={!editing && !draft.title}
                value={draft.title}
                onChangeText={(title) => update({ title })}
                placeholder="要做什么？比如：倒垃圾"
                placeholderTextColor="#A2A79F"
                maxLength={80}
                returnKeyType="done"
                style={styles.titleInput}
              />
            </View>

            {/* 子任务 */}
            <View style={styles.subtasks}>
              {draft.subtasks.map((subtask, index) => (
                <View key={subtask.id} style={styles.subtaskRow}>
                  <View style={styles.subtaskDot} />
                  <TextInput
                    accessibilityLabel={`子任务 ${index + 1}`}
                    value={subtask.title}
                    onChangeText={(title) => update({ subtasks: draft.subtasks.map((s) => (s.id === subtask.id ? { ...s, title } : s)) })}
                    maxLength={80}
                    style={styles.subtaskInput}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`删除子任务：${subtask.title}`}
                    hitSlop={8}
                    onPress={() => update({ subtasks: draft.subtasks.filter((s) => s.id !== subtask.id) })}
                    style={styles.subtaskRemove}>
                    <Ionicons name="close" size={16} color={Colors.light.textSecondary} />
                  </Pressable>
                </View>
              ))}
              {subtasksEnabled ? (
                draft.subtasks.length < 20 ? (
                  <View style={styles.subtaskRow}>
                    <Ionicons name="add" size={18} color={Colors.light.primary} />
                    <TextInput
                      ref={subtaskInputRef}
                      accessibilityLabel="添加子任务"
                      value={newSubtask}
                      onChangeText={setNewSubtask}
                      onSubmitEditing={addSubtask}
                      blurOnSubmit={false}
                      placeholder="添加子任务（可选）"
                      placeholderTextColor="#A2A79F"
                      maxLength={80}
                      returnKeyType="done"
                      style={styles.subtaskInput}
                    />
                    {newSubtask.trim() ? (
                      <Pressable accessibilityRole="button" accessibilityLabel="添加这个子任务" hitSlop={8} onPress={addSubtask} style={styles.subtaskAdd}>
                        <Text style={styles.subtaskAddText}>添加</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null
              ) : (
                <Text style={styles.hint}>子任务需要先升级数据库（见首页提示）。</Text>
              )}
            </View>

            <Field label="哪天">
              <View style={styles.chips}>
                {QUICK_DAYS.map(([label, offset]) => {
                  const value = addDays(today, offset);
                  return <Chip key={label} label={label} selected={!pickingDate && draft.dueDate === value} onPress={() => { setPickingDate(false); update({ dueDate: value }); }} />;
                })}
                <Chip label="其他日期" selected={pickingDate} onPress={() => setPickingDate(true)} />
              </View>
              {pickingDate ? (
                <View style={styles.dateRow}>
                  <Pressable accessibilityRole="button" accessibilityLabel="前一天" hitSlop={4} onPress={() => update({ dueDate: addDays(draft.dueDate, -1) })} style={styles.dateArrow}>
                    <Ionicons name="chevron-back" size={18} color={Colors.light.primary} />
                  </Pressable>
                  <Text style={styles.dateValue}>{dayLabel(draft.dueDate, today)}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="后一天" hitSlop={4} onPress={() => update({ dueDate: addDays(draft.dueDate, 1) })} style={styles.dateArrow}>
                    <Ionicons name="chevron-forward" size={18} color={Colors.light.primary} />
                  </Pressable>
                </View>
              ) : null}
            </Field>

            <Field label="谁来做">
              <Segmented
                options={[
                  ...KITCHEN_MEMBERS.map((member) => ({ key: member.id as ReminderAssignee, label: member.name })),
                  { key: 'both' as ReminderAssignee, label: '一起' },
                ]}
                value={draft.assignee}
                onChange={(assignee) => update({ assignee })}
              />
            </Field>

            <MoreOptions summary={moreSummary} forceOpen={!timeValid}>
              <Field label="几点">
                <View style={styles.chips}>
                  <Chip label="不定" selected={!draft.dueTime} onPress={() => { update({ dueTime: null }); setCustomTime(''); }} />
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
                    placeholder="19:30"
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

              <Field label="图标">
                <View style={styles.emojiRow}>
                  {EMOJIS.map((emoji) => (
                    <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={`图标 ${emoji}`} accessibilityState={{ selected: draft.emoji === emoji }} onPress={() => update({ emoji })} style={[styles.emojiChip, draft.emoji === emoji && styles.emojiChipOn]}>
                      <Text style={styles.emojiText}>{emoji}</Text>
                    </Pressable>
                  ))}
                </View>
              </Field>

              <Field label="备注">
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
            </MoreOptions>
          </ScrollView>

          <View style={styles.footer}>
            {editing && onDelete ? (
              <Pressable accessibilityRole="button" accessibilityLabel="删除这条提醒" onPress={() => draft.id && onDelete(draft.id)} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
                <Ionicons name="trash-outline" size={20} color={Colors.light.danger} />
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" disabled={!canSave} onPress={save} style={({ pressed }) => [styles.saveWrap, !canSave && styles.disabled, pressed && styles.pressed]}>
              <GradientSurface sheen={canSave} style={styles.save}>
                <Text style={styles.saveText}>{editing ? '保存' : '添加提醒'}</Text>
              </GradientSurface>
            </Pressable>
          </View>
        </View>
      </KeyboardAware>
    </Modal>
  );
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
  titleEmoji: { fontSize: 22 },
  titleInput: { flex: 1, minHeight: 52, color: Colors.light.text, fontSize: 17 },
  subtasks: { gap: 2, marginTop: -8, paddingLeft: 6 },
  subtaskRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 8, paddingRight: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  subtaskDot: { width: 8, height: 8, marginHorizontal: 5, borderRadius: 4, borderWidth: 1.5, borderColor: Colors.light.textSecondary },
  subtaskInput: { flex: 1, minHeight: 42, color: Colors.light.text, fontSize: 16 },
  subtaskRemove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  subtaskAdd: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 16, backgroundColor: Colors.light.primarySoft },
  subtaskAddText: { color: Colors.light.primary, fontSize: 14, fontWeight: '600' },
  hint: { color: Colors.light.textSecondary, fontSize: 13, paddingVertical: 8 },
  field: { gap: 8 },
  fieldLabel: { color: Colors.light.textSecondary, fontSize: 13, fontWeight: '600' },
  dateRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, borderRadius: 16, backgroundColor: Colors.light.background },
  dateArrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dateValue: { color: Colors.light.text, fontSize: 16, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 20, backgroundColor: Colors.light.background, borderWidth: 1, borderColor: Colors.light.border },
  chipOn: { backgroundColor: Colors.light.primary, borderColor: Colors.light.primary },
  chipText: { color: Colors.light.text, fontSize: 14, fontWeight: '500' },
  chipTextOn: { color: '#FFFFFF', fontWeight: '600' },
  timeInput: { width: 84, minHeight: 40, paddingHorizontal: 12, borderRadius: 20, backgroundColor: Colors.light.background, borderWidth: 1, borderColor: Colors.light.border, color: Colors.light.text, fontSize: 16 },
  timeInputError: { borderColor: Colors.light.danger },
  segmented: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 18, backgroundColor: Colors.light.background },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: 14 },
  segmentOn: { backgroundColor: Colors.light.surface, boxShadow: Shadows.card },
  segmentText: { color: Colors.light.textSecondary, fontSize: 14, fontWeight: '500' },
  segmentTextOn: { color: Colors.light.primary, fontWeight: '600' },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  emojiChip: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Colors.light.background },
  emojiChipOn: { backgroundColor: Colors.light.primarySoft, borderWidth: 1.5, borderColor: Colors.light.primary },
  emojiText: { fontSize: 20 },
  notes: { minHeight: 64, padding: 12, borderRadius: 16, backgroundColor: Colors.light.background, borderWidth: 1, borderColor: Colors.light.border, color: Colors.light.text, fontSize: 16, textAlignVertical: 'top' },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.light.border },
  deleteButton: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: Colors.light.dangerSoft },
  saveWrap: { flex: 1, borderRadius: 18, boxShadow: Shadows.glow },
  save: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  saveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
});
