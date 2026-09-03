import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { AppScreen, SectionHeader } from '@/components/app-screen';
import { Colors } from '@/constants/theme';
import { useCloudSync } from '@/context/cloud-sync-context';
import { useLanguage } from '@/context/language-context';
import { useReminders } from '@/context/reminder-context';
import type { ReminderCategory } from '@/data/reminder-utils';
import { usePersistentState } from '@/hooks/use-persistent-state';

type SettingRowProps = {
  emoji: string;
  title: string;
  detail: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

function SettingRow({ emoji, title, detail, value, onValueChange }: SettingRowProps) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}><Text style={styles.settingEmoji}>{emoji}</Text></View>
      <View style={styles.settingCopy}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDetail}>{detail}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#D9D7D0', true: '#A7CFB6' }}
        thumbColor={value ? Colors.light.primary : '#FFFFFF'}
      />
    </View>
  );
}

export default function PreferencesScreen() {
  const router = useRouter();
  const { language, setLanguage, text } = useLanguage();
  const {
    enabled: cloudSync,
    setEnabled: setCloudSync,
    status: cloudSyncStatus,
    session: cloudSession,
    household,
    lastSyncedAt,
    syncNow,
  } = useCloudSync();
  const {
    preferences: reminderPreferences,
    setPreferences: setReminderPreferences,
    setCategoryEnabled,
    sendTestReminder,
  } = useReminders();
  const [autoEstimate, setAutoEstimate] = usePersistentState('setting-auto-estimate', true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function changeReminderCategory(category: ReminderCategory, value: boolean) {
    const result = await setCategoryEnabled(category, value);
    if (result === 'denied') {
      setStatusMessage(text('请先在 iPhone 系统设置中允许通知。', 'Allow notifications in iPhone Settings first.'));
    } else if (result === 'web-saved') {
      setStatusMessage(text('设置已保存；系统级提醒将在原生版或 Expo Go 中生效。', 'Saved; system alerts work in the native app or Expo Go.'));
    } else {
      setStatusMessage(value ? text('这类提醒已开启。', 'This reminder is on.') : text('这类提醒已关闭。', 'This reminder is off.'));
    }
  }

  async function testReminder() {
    const result = await sendTestReminder();
    setStatusMessage(result === 'enabled'
      ? text('测试提醒会在约2秒后出现。', 'A test reminder will appear in about 2 seconds.')
      : result === 'web-saved'
        ? text('网页无法发送后台系统提醒，请在 Expo Go 或原生版测试。', 'Background system alerts must be tested in Expo Go or the native app.')
        : text('通知权限未开启，请先前往系统设置允许通知。', 'Notifications are disabled. Enable them in system settings.'));
  }

  function changeCloudSync(value: boolean) {
    if (!value) {
      setCloudSync(false);
      setStatusMessage(text('云同步已暂停，本机数据仍会保留。', 'Cloud sync paused; local data remains available.'));
      return;
    }
    if (!cloudSession || !household) {
      router.push('/account');
      return;
    }
    setCloudSync(true);
    setStatusMessage(text('正在连接家庭云端…', 'Connecting to your household cloud…'));
    void syncNow();
  }

  const expiryReminders = reminderPreferences.expiryEnabled;
  const reminderLeadDays = reminderPreferences.expiryLeadDays;
  const syncDetail = cloudSyncStatus === 'synced' && lastSyncedAt
    ? text('库存、菜谱与健康记录已同步', 'Inventory, recipes, and health are synced')
    : cloudSyncStatus === 'conflict'
      ? text('两台设备都有修改，需要选择保留版本', 'Both devices changed; choose which version to keep')
      : text('离线可用，联网后自动同步', 'Works offline and syncs when connected');

  return (
    <AppScreen
      eyebrow={text('我的厨房', 'MY KITCHEN')}
      title={text('偏好设置', 'Preferences')}
      subtitle={text('语言、智能建议、同步和提醒都集中在这里。', 'Manage language, smart suggestions, sync, and reminders in one place.')}
      action={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text('返回我的厨房', 'Back to My kitchen')}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="close" size={23} color={Colors.light.text} />
        </Pressable>
      }>
      <View style={styles.section}>
        <SectionHeader title={text('通用', 'General')} />
        <View style={styles.settingsCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingIcon}><Text style={styles.settingEmoji}>🌐</Text></View>
            <View style={styles.settingCopy}>
              <Text style={styles.settingTitle}>{text('语言', 'Language')}</Text>
              <Text style={styles.settingDetail}>{text('整个 App 会立即切换语言', 'Changes the language throughout the app')}</Text>
            </View>
            <View style={styles.languageCard}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={text('切换为中文', 'Switch to Chinese')}
                accessibilityState={{ selected: language === 'zh' }}
                onPress={() => setLanguage('zh')}
                style={[styles.languageOption, language === 'zh' && styles.languageOptionSelected]}>
                <Text style={[styles.languageText, language === 'zh' && styles.languageTextSelected]}>中文</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={text('切换为英文', 'Switch to English')}
                accessibilityState={{ selected: language === 'en' }}
                onPress={() => setLanguage('en')}
                style={[styles.languageOption, language === 'en' && styles.languageOptionSelected]}>
                <Text style={[styles.languageText, language === 'en' && styles.languageTextSelected]}>EN</Text>
              </Pressable>
            </View>
          </View>
          <SettingRow
            emoji="✨"
            title={text('自动估算保质期', 'Estimate shelf life')}
            detail={text('没有包装日期时给出参考时间', 'Suggest a date when no package date is available')}
            value={autoEstimate}
            onValueChange={setAutoEstimate}
          />
          <SettingRow
            emoji="☁️"
            title={text('多端云同步', 'Cloud sync')}
            detail={syncDetail}
            value={cloudSync}
            onValueChange={changeCloudSync}
          />
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title={text('提醒', 'Reminders')} detail={text('按你的作息设置', 'Your schedule')} />
        <View style={styles.settingsCard}>
          <SettingRow
            emoji="🔔"
            title={text('提醒总开关', 'All reminders')}
            detail={text('关闭后保留每一类设置，但不发送通知', 'Keep your rules without sending notifications')}
            value={reminderPreferences.masterEnabled}
            onValueChange={(value) => void changeReminderCategory('master', value)}
          />
          <View style={styles.reminderTestRow}>
            <View style={styles.reminderTimingCopy}>
              <Text style={styles.reminderTimingTitle}>{text('测试当前设备', 'Test this device')}</Text>
              <Text style={styles.reminderTimingDetail}>{text('约2秒后发送一条测试通知', 'Sends a test alert in about 2 seconds')}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => void testReminder()} style={styles.testReminderButton}>
              <Text style={styles.testReminderButtonText}>{text('发送测试', 'Send test')}</Text>
            </Pressable>
          </View>
          <SettingRow
            emoji="🥬"
            title={text('临期库存提醒', 'Expiry reminders')}
            detail={text(`提前${reminderLeadDays}天 · ${reminderPreferences.expiryTime}`, `${reminderLeadDays} days early · ${reminderPreferences.expiryTime}`)}
            value={expiryReminders}
            onValueChange={(value) => void changeReminderCategory('expiry', value)}
          />
          {expiryReminders ? (
            <View style={styles.reminderEditor}>
              <View style={styles.timeFieldWrap}>
                <Text style={styles.timeFieldLabel}>{text('提前天数 0–30', 'Days early 0–30')}</Text>
                <TextInput
                  accessibilityLabel={text('临期提醒提前天数', 'Days before expiry')}
                  value={String(reminderLeadDays)}
                  onChangeText={(value) => {
                    const days = Number(value);
                    if (Number.isFinite(days)) setReminderPreferences((current) => ({ ...current, expiryLeadDays: Math.min(30, Math.max(0, Math.round(days))) }));
                  }}
                  keyboardType="number-pad"
                  maxLength={2}
                  style={styles.timeInput}
                />
              </View>
              <View style={styles.timeFieldWrap}>
                <Text style={styles.timeFieldLabel}>{text('提醒时间', 'Alert time')}</Text>
                <TextInput
                  accessibilityLabel={text('临期提醒时间', 'Expiry reminder time')}
                  value={reminderPreferences.expiryTime}
                  onChangeText={(value) => setReminderPreferences((current) => ({ ...current, expiryTime: value }))}
                  placeholder="09:00"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  style={styles.timeInput}
                />
              </View>
            </View>
          ) : null}
          <SettingRow
            emoji="🍽️"
            title={text('三餐提醒', 'Meal reminders')}
            detail={text('早餐、午餐和晚餐可分别开关', 'Control breakfast, lunch, and dinner separately')}
            value={reminderPreferences.mealsEnabled}
            onValueChange={(value) => void changeReminderCategory('meals', value)}
          />
          {reminderPreferences.mealsEnabled ? (
            <View style={styles.stackedReminderEditor}>
              {([
                ['breakfast', text('早餐', 'Breakfast'), '☀️'],
                ['lunch', text('午餐', 'Lunch'), '🍱'],
                ['dinner', text('晚餐', 'Dinner'), '🌙'],
              ] as const).map(([meal, label, emoji]) => (
                <View key={meal} style={styles.individualReminderRow}>
                  <Text style={styles.individualReminderEmoji}>{emoji}</Text>
                  <Text style={styles.individualReminderLabel}>{label}</Text>
                  <Switch
                    accessibilityLabel={text(`${label}提醒`, `${label} reminder`)}
                    value={reminderPreferences.mealEnabled[meal]}
                    onValueChange={(enabled) => setReminderPreferences((current) => ({
                      ...current,
                      mealEnabled: { ...current.mealEnabled, [meal]: enabled },
                    }))}
                  />
                  <TextInput
                    accessibilityLabel={text(`${label}提醒时间`, `${label} reminder time`)}
                    value={reminderPreferences.mealTimes[meal]}
                    onChangeText={(value) => setReminderPreferences((current) => ({
                      ...current,
                      mealTimes: { ...current.mealTimes, [meal]: value },
                    }))}
                    placeholder="HH:MM"
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    style={styles.compactTimeInput}
                  />
                </View>
              ))}
            </View>
          ) : null}
          <SettingRow
            emoji="💧"
            title={text('饮水提醒', 'Hydration reminders')}
            detail={text(
              `${reminderPreferences.hydrationStart}–${reminderPreferences.hydrationEnd} · 每${reminderPreferences.hydrationIntervalMinutes}分钟`,
              `${reminderPreferences.hydrationStart}–${reminderPreferences.hydrationEnd} · every ${reminderPreferences.hydrationIntervalMinutes} min`
            )}
            value={reminderPreferences.hydrationEnabled}
            onValueChange={(value) => void changeReminderCategory('hydration', value)}
          />
          {reminderPreferences.hydrationEnabled ? (
            <View style={styles.reminderEditor}>
              <View style={styles.timeFieldWrap}>
                <Text style={styles.timeFieldLabel}>{text('开始', 'Start')}</Text>
                <TextInput accessibilityLabel={text('饮水提醒开始时间', 'Hydration reminder start')} value={reminderPreferences.hydrationStart} onChangeText={(value) => setReminderPreferences((current) => ({ ...current, hydrationStart: value }))} placeholder="08:00" keyboardType="numbers-and-punctuation" maxLength={5} style={styles.timeInput} />
              </View>
              <View style={styles.timeFieldWrap}>
                <Text style={styles.timeFieldLabel}>{text('结束', 'End')}</Text>
                <TextInput accessibilityLabel={text('饮水提醒结束时间', 'Hydration reminder end')} value={reminderPreferences.hydrationEnd} onChangeText={(value) => setReminderPreferences((current) => ({ ...current, hydrationEnd: value }))} placeholder="22:00" keyboardType="numbers-and-punctuation" maxLength={5} style={styles.timeInput} />
              </View>
              <View style={styles.timeFieldWrap}>
                <Text style={styles.timeFieldLabel}>{text('间隔 30–360 分钟', 'Interval 30–360 min')}</Text>
                <TextInput
                  accessibilityLabel={text('饮水提醒间隔', 'Hydration reminder interval')}
                  value={String(reminderPreferences.hydrationIntervalMinutes)}
                  onChangeText={(value) => {
                    const minutes = Number(value);
                    if (Number.isFinite(minutes)) setReminderPreferences((current) => ({ ...current, hydrationIntervalMinutes: Math.min(360, Math.max(30, Math.round(minutes))) }));
                  }}
                  keyboardType="number-pad"
                  maxLength={3}
                  style={styles.timeInput}
                />
              </View>
            </View>
          ) : null}
          <SettingRow
            emoji="🛒"
            title={text('购物清单提醒', 'Shopping reminders')}
            detail={text(`${reminderPreferences.shoppingTime} · 仅清单非空时`, `${reminderPreferences.shoppingTime} · only when items remain`)}
            value={reminderPreferences.shoppingEnabled}
            onValueChange={(value) => void changeReminderCategory('shopping', value)}
          />
          {reminderPreferences.shoppingEnabled ? (
            <View style={styles.stackedReminderEditor}>
              <View style={styles.reminderEditorSingle}>
                <Text style={styles.timeFieldLabel}>{text('提醒时间', 'Reminder time')}</Text>
                <TextInput accessibilityLabel={text('购物提醒时间', 'Shopping reminder time')} value={reminderPreferences.shoppingTime} onChangeText={(value) => setReminderPreferences((current) => ({ ...current, shoppingTime: value }))} placeholder="17:30" keyboardType="numbers-and-punctuation" maxLength={5} style={styles.timeInput} />
              </View>
              <View style={styles.weekdayRow}>
                {[
                  [1, text('一', 'M')], [2, text('二', 'T')], [3, text('三', 'W')],
                  [4, text('四', 'T')], [5, text('五', 'F')], [6, text('六', 'S')], [7, text('日', 'S')],
                ].map(([day, label]) => {
                  const selected = reminderPreferences.shoppingWeekdays.includes(Number(day));
                  return (
                    <Pressable
                      key={day}
                      accessibilityRole="checkbox"
                      accessibilityLabel={text(`星期${label}`, `${label}`)}
                      accessibilityState={{ checked: selected }}
                      onPress={() => setReminderPreferences((current) => ({
                        ...current,
                        shoppingWeekdays: selected
                          ? current.shoppingWeekdays.length > 1
                            ? current.shoppingWeekdays.filter((item) => item !== Number(day))
                            : current.shoppingWeekdays
                          : [...current.shoppingWeekdays, Number(day)].sort((a, b) => a - b),
                      }))}
                      style={[styles.weekdayButton, selected && styles.weekdayButtonSelected]}>
                      <Text style={[styles.weekdayText, selected && styles.weekdayTextSelected]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          <SettingRow
            emoji="⏲️"
            title={text('烹饪倒计时提醒', 'Cooking timer alerts')}
            detail={text('离开烹饪页面后，时间到仍会通知', 'Get notified after leaving the cooking screen')}
            value={reminderPreferences.cookingEnabled}
            onValueChange={(value) => void changeReminderCategory('cooking', value)}
          />
        </View>
        {statusMessage ? <Text accessibilityLiveRegion="polite" style={styles.statusMessage}>{statusMessage}</Text> : null}
      </View>

      <View style={styles.footerCard}>
        <Text style={styles.footerEmoji}>🌿</Text>
        <View style={styles.footerCopy}>
          <Text style={styles.footerTitle}>{text('设置会自动保存', 'Settings save automatically')}</Text>
          <Text style={styles.footerText}>{text('修改后无需再点击完成，返回即可。', 'There is no Save button—just go back when you are done.')}</Text>
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  section: { gap: 12 },
  settingsCard: { overflow: 'hidden', borderRadius: 22, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  settingRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  settingIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.backgroundElement },
  settingEmoji: { fontSize: 18 },
  settingCopy: { flex: 1, gap: 3 },
  settingTitle: { color: Colors.light.text, fontSize: 14, fontWeight: '800' },
  settingDetail: { color: Colors.light.textSecondary, fontSize: 10.5, lineHeight: 15 },
  languageCard: { flexDirection: 'row', width: 108, gap: 3, borderRadius: 14, padding: 3, backgroundColor: Colors.light.backgroundElement },
  languageOption: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  languageOptionSelected: { backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  languageText: { color: Colors.light.textSecondary, fontSize: 12, fontWeight: '800' },
  languageTextSelected: { color: Colors.light.primary, fontWeight: '900' },
  reminderTestRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border, backgroundColor: '#F7F8F4' },
  reminderTimingCopy: { flex: 1, gap: 3 },
  reminderTimingTitle: { color: Colors.light.text, fontSize: 13, fontWeight: '800' },
  reminderTimingDetail: { color: Colors.light.textSecondary, fontSize: 9.5, lineHeight: 14 },
  testReminderButton: { minHeight: 36, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Colors.light.primarySoft },
  testReminderButtonText: { color: Colors.light.primary, fontSize: 10, fontWeight: '900' },
  reminderEditor: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border, backgroundColor: '#F7F8F4' },
  reminderEditorSingle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border, backgroundColor: '#F7F8F4' },
  stackedReminderEditor: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border, backgroundColor: '#F7F8F4' },
  timeFieldWrap: { flex: 1, gap: 5 },
  timeFieldLabel: { color: Colors.light.textSecondary, fontSize: 9.5, fontWeight: '800' },
  timeInput: { minWidth: 66, minHeight: 36, paddingHorizontal: 10, borderRadius: 11, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface, color: Colors.light.text, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  individualReminderRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  individualReminderEmoji: { width: 24, fontSize: 17 },
  individualReminderLabel: { flex: 1, color: Colors.light.text, fontSize: 11.5, fontWeight: '800' },
  compactTimeInput: { width: 72, minHeight: 34, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface, color: Colors.light.text, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 5, paddingHorizontal: 14, paddingVertical: 12 },
  weekdayButton: { flex: 1, maxWidth: 40, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface },
  weekdayButtonSelected: { borderColor: Colors.light.primary, backgroundColor: Colors.light.primarySoft },
  weekdayText: { color: Colors.light.textSecondary, fontSize: 10, fontWeight: '900' },
  weekdayTextSelected: { color: Colors.light.primary },
  statusMessage: { paddingHorizontal: 4, color: Colors.light.primary, fontSize: 10.5, lineHeight: 16, fontWeight: '700' },
  footerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 20, backgroundColor: Colors.light.primarySoft, borderWidth: 1, borderColor: '#C7DFCF' },
  footerEmoji: { fontSize: 22 },
  footerCopy: { flex: 1, gap: 3 },
  footerTitle: { color: Colors.light.text, fontSize: 12, fontWeight: '900' },
  footerText: { color: Colors.light.textSecondary, fontSize: 10, lineHeight: 15 },
});
