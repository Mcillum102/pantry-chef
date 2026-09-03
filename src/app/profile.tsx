import { useEffect, useState } from 'react';
import { type Href, useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { AppScreen, SectionHeader } from '@/components/app-screen';
import { Colors, Spacing } from '@/constants/theme';
import { useCloudSync } from '@/context/cloud-sync-context';
import { useHealth } from '@/context/health-context';
import { useKitchen } from '@/context/kitchen-context';
import { useLanguage } from '@/context/language-context';
import { useReminders } from '@/context/reminder-context';
import type { ReminderCategory } from '@/data/reminder-utils';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { clearDiagnostics, readDiagnostics, type DiagnosticEntry } from '@/services/diagnostics';

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
      <View style={styles.settingIcon}>
        <Text style={styles.settingEmoji}>{emoji}</Text>
      </View>
      <View style={styles.settingCopy}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDetail}>{detail}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#D9D7D0', true: '#A7CFB6' }}
        thumbColor={value ? Colors.light.primary : '#FFFFFF'}
      />
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const kitchen = useKitchen();
  const { inventory } = kitchen;
  const health = useHealth();
  const {
    configured: isCloudConfigured,
    enabled: cloudSync,
    setEnabled: setCloudSync,
    status: cloudSyncStatus,
    session: cloudSession,
    household,
    pendingChanges,
    conflict,
    lastSyncedAt,
    sendSignInLink,
    verifyOtp,
    signOut,
    syncNow,
    inviteMember,
    acceptInvite,
    resolveConflict,
  } = useCloudSync();
  const { language, setLanguage, text } = useLanguage();
  const {
    preferences: reminderPreferences,
    setPreferences: setReminderPreferences,
    setCategoryEnabled,
    sendTestReminder,
  } = useReminders();
  const expiryReminders = reminderPreferences.expiryEnabled;
  const reminderLeadDays = reminderPreferences.expiryLeadDays;
  const [autoEstimate, setAutoEstimate] = usePersistentState('setting-auto-estimate', true);
  const [reminderStatus, setReminderStatus] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState<string | null>(null);
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudOtp, setCloudOtp] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [latestInviteCode, setLatestInviteCode] = useState<string | null>(null);
  const [isCloudSetupOpen, setIsCloudSetupOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [backupInput, setBackupInput] = useState('');
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>([]);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);

  useEffect(() => {
    void readDiagnostics().then(setDiagnostics);
  }, [isDiagnosticsOpen]);

  async function exportBackup() {
    const payload = JSON.stringify({
      format: 'fresh-pantry-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      kitchen: kitchen.snapshot,
      health: health.snapshot,
    });
    await Share.share({ message: payload, title: text('鲜食记数据备份', 'Fresh Pantry data backup') });
  }

  function importBackup() {
    try {
      const parsed = JSON.parse(backupInput) as { format?: string; kitchen?: typeof kitchen.snapshot; health?: typeof health.snapshot };
      if (parsed.format !== 'fresh-pantry-backup' || !parsed.kitchen || !parsed.health) throw new Error('invalid');
      if (!Array.isArray(parsed.kitchen.inventory) || !Array.isArray(parsed.health.mealRecords)) throw new Error('invalid');
      kitchen.replaceSnapshot(parsed.kitchen);
      health.replaceSnapshot(parsed.health);
      setBackupInput('');
      setBackupStatus(text('备份已恢复，并会在启用云同步时上传。', 'Backup restored and ready to sync.'));
      setIsBackupOpen(false);
    } catch {
      setBackupStatus(text('无法读取这份备份，请确认复制了完整内容。', 'Could not read this backup. Make sure the full content was pasted.'));
    }
  }

  async function removeDiagnostics() {
    await clearDiagnostics();
    setDiagnostics([]);
  }

  const activeItems = inventory.filter((item) => item.quantity > 0).length;
  const householdMembers = household?.members ?? [];
  const householdName = household?.name ?? text('Marti 的家', "Marti's home");
  const cloudBadge = !isCloudConfigured
    ? text('本地模式', 'LOCAL')
    : cloudSyncStatus === 'synced'
      ? text('已同步', 'SYNCED')
      : cloudSyncStatus === 'conflict'
        ? text('待确认', 'REVIEW')
        : cloudSyncStatus === 'needs-household'
          ? text('待创建家庭', 'SET UP HOME')
        : pendingChanges
          ? text('等待同步', 'PENDING')
          : cloudSession
            ? text('云端账户', 'CLOUD')
            : text('未登录', 'SIGNED OUT');

  async function changeExpiryReminders(value: boolean) {
    await changeReminderCategory('expiry', value);
  }

  async function changeReminderLeadDays(days: number) {
    setReminderPreferences((current) => ({ ...current, expiryLeadDays: days }));
    setReminderStatus(text(`提醒时间已改为提前${days}天。`, `Reminder changed to ${days} days before expiry.`));
  }

  async function changeReminderCategory(category: ReminderCategory, value: boolean) {
    const result = await setCategoryEnabled(category, value);
    if (result === 'denied') {
      setReminderStatus(text('请先在 iPhone 系统设置中允许通知。', 'Allow notifications in iPhone Settings first.'));
    } else if (result === 'web-saved') {
      setReminderStatus(text('设置已保存；系统级提醒将在原生版或 Expo Go 中生效。', 'Saved; system alerts work in the native app or Expo Go.'));
    } else {
      setReminderStatus(value ? text('这类提醒已开启。', 'This reminder is on.') : text('这类提醒已关闭。', 'This reminder is off.'));
    }
  }

  async function testReminder() {
    const result = await sendTestReminder();
    setReminderStatus(result === 'enabled'
      ? text('测试提醒会在约2秒后出现。', 'A test reminder will appear in about 2 seconds.')
      : result === 'web-saved'
        ? text('网页无法发送后台系统提醒，请在 Expo Go 或原生版测试。', 'Background system alerts must be tested in Expo Go or the native app.')
        : text('通知权限未开启，请先前往系统设置允许通知。', 'Notifications are disabled. Enable them in system settings.'));
  }

  function changeCloudSync(value: boolean) {
    if (!value) {
      setCloudSync(false);
      setCloudStatus(text('云同步已暂停，本机数据仍会保留。', 'Cloud sync paused; local data remains available.'));
      return;
    }
    if (cloudSession && household) {
      setCloudSync(true);
      setCloudStatus(text('正在连接家庭云端…', 'Connecting to your household cloud…'));
      void syncNow();
      return;
    }
    router.push('/account');
    if (!isCloudConfigured) {
      setCloudSync(false);
      setCloudStatus(text('需要先配置 Supabase 项目。', 'Configure a Supabase project first.'));
    }
  }

  async function requestCloudSignIn() {
    const email = cloudEmail.trim();
    if (!email.includes('@') || !isCloudConfigured) return;
    try {
      await sendSignInLink(email);
      setCloudStatus(text('登录链接和验证码已发送，请查看邮箱。', 'Sign-in link and code sent. Check your email.'));
    } catch {
      setCloudStatus(text('登录链接发送失败，请检查云端配置。', 'Could not send the sign-in link. Check cloud configuration.'));
    }
  }

  async function confirmCloudOtp() {
    if (!cloudEmail.includes('@') || cloudOtp.trim().length < 6) return;
    try {
      await verifyOtp(cloudEmail, cloudOtp);
      setCloudOtp('');
      setCloudStatus(text('登录成功，正在同步家庭数据。', 'Signed in. Syncing household data.'));
    } catch {
      setCloudStatus(text('验证码无效或已过期，请重新发送。', 'The code is invalid or expired. Send a new one.'));
    }
  }

  async function sendHouseholdInvite() {
    if (!inviteEmail.includes('@')) return;
    try {
      const invite = await inviteMember(inviteEmail);
      setLatestInviteCode(invite.code);
      setInviteEmail('');
      setCloudStatus(text('邀请已创建，把邀请码发给家人即可。', 'Invite created. Share the code with your household member.'));
    } catch {
      setCloudStatus(text('暂时无法创建邀请，请确认你是家庭管理员。', 'Could not create the invite. Confirm that you are the household owner.'));
    }
  }

  async function joinHousehold() {
    if (inviteCode.trim().length < 6) return;
    try {
      await acceptInvite(inviteCode);
      setInviteCode('');
      setCloudStatus(text('已加入家庭，正在拉取共享数据。', 'Household joined. Downloading shared data.'));
    } catch {
      setCloudStatus(text('邀请码无效、已过期，或登录邮箱不匹配。', 'The invite is invalid, expired, or belongs to another email.'));
    }
  }

  return (
    <AppScreen
      eyebrow={text('账户与家庭', 'ACCOUNT & HOUSEHOLD')}
      title={text('我的厨房', 'My kitchen')}
      subtitle={text('管理家庭成员、同步和提醒偏好。', 'Manage your household, sync, and reminder preferences.')}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>M</Text>
        </View>
        <View style={styles.profileCopy}>
          <Text style={styles.profileName}>{householdName}</Text>
          <Text style={styles.profileDetail}>
            {text(
              `${Math.max(householdMembers.length, 1)} 位成员 · ${activeItems} 种库存`,
              `${Math.max(householdMembers.length, 1)} member${householdMembers.length === 1 ? '' : 's'} · ${activeItems} items`
            )}
          </Text>
        </View>
        <View style={styles.prototypeBadge}>
          <Text style={styles.prototypeText}>{cloudBadge}</Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={cloudSession ? text('管理账号与家庭', 'Manage account and household') : text('创建账号或登录', 'Create account or sign in')}
        onPress={() => router.push('/account')}
        style={({ pressed }) => [styles.accountEntryCard, pressed && styles.pressed]}>
        <View style={styles.accountEntryIcon}>
          <Text style={styles.accountEntryEmoji}>{cloudSession ? '🔐' : '👤'}</Text>
        </View>
        <View style={styles.accountEntryCopy}>
          <Text style={styles.accountEntryTitle}>
            {cloudSession ? text('账号与家庭', 'Account & household') : text('创建账号', 'Create an account')}
          </Text>
          <Text style={styles.accountEntryText}>
            {cloudSession
              ? household
                ? text(`${cloudSession.user.email} · ${household.name}`, `${cloudSession.user.email} · ${household.name}`)
                : text('账号已登录，下一步创建或加入家庭', 'Signed in; create or join a household next')
              : text('在多台设备同步，并邀请家人共同管理', 'Sync across devices and invite household members')}
          </Text>
        </View>
        <Text style={styles.accountEntryBadge}>{cloudSession ? text('管理', 'MANAGE') : text('开始', 'START')}</Text>
        <Text style={styles.accountEntryChevron}>›</Text>
      </Pressable>

      <View style={styles.section}>
        <SectionHeader
          title={text('家庭成员', 'Household')}
          detail={text('共同管理库存', 'Shared inventory')}
        />
        <View style={styles.householdCard}>
          {(householdMembers.length > 0
            ? householdMembers
            : [{ userId: 'local', email: 'Marti', displayName: 'Marti', role: 'owner' as const, joinedAt: '' }]
          ).map((member) => (
            <View key={member.userId} style={styles.memberRow}>
              <View style={styles.smallAvatar}>
                <Text style={styles.smallAvatarText}>{member.email.slice(0, 1).toLocaleUpperCase()}</Text>
              </View>
              <View style={styles.memberCopy}>
                <Text style={styles.memberName} numberOfLines={1}>{member.displayName || member.email}</Text>
                <Text style={styles.memberRole}>
                  {member.role === 'owner'
                    ? text('家庭管理员', 'Household admin')
                    : text('家庭成员', 'Household member')}
                </Text>
              </View>
              {member.userId === cloudSession?.user.id || member.userId === 'local' ? (
                <Text style={styles.youBadge}>{text('你', 'YOU')}</Text>
              ) : null}
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/account')}
            style={({ pressed }) => [styles.inviteButton, pressed && styles.pressed]}>
            <Text style={styles.inviteIcon}>＋</Text>
            <Text style={styles.inviteText}>{text('邀请家人加入', 'Invite a household member')}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title={text('偏好设置', 'Preferences')} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text('打开偏好设置', 'Open preferences')}
          onPress={() => router.push('/preferences' as Href)}
          style={({ pressed }) => [styles.widgetSettingsCard, pressed && styles.pressed]}>
          <View style={styles.widgetSettingsIcon}><Text style={styles.widgetSettingsEmoji}>⚙️</Text></View>
          <View style={styles.widgetSettingsCopy}>
            <Text style={styles.widgetSettingsTitle}>{text('语言、提醒与同步', 'Language, reminders & sync')}</Text>
            <Text style={styles.widgetSettingsText}>{text('集中调整通知时间、保质期建议和多端同步', 'Manage alert times, shelf-life suggestions, and device sync')}</Text>
          </View>
          <Text style={styles.widgetSettingsBadge}>{text('设置', 'OPEN')}</Text>
          <Text style={styles.widgetSettingsChevron}>›</Text>
        </Pressable>
      </View>

      <View style={styles.hiddenPreferences}>
        <SectionHeader title={text('偏好设置', 'Preferences')} />
        <View style={styles.settingsCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingIcon}>
              <Text style={styles.settingEmoji}>🌐</Text>
            </View>
            <View style={styles.settingCopy}>
              <Text style={styles.settingTitle}>{text('语言', 'Language')}</Text>
              <Text style={styles.settingDetail}>
                {text('默认使用中文，也可手动切换', 'Chinese by default; switch anytime')}
              </Text>
            </View>
            <View style={styles.languageCard}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={text('切换为中文', 'Switch to Chinese')}
                accessibilityState={{ selected: language === 'zh' }}
                onPress={() => setLanguage('zh')}
                style={[
                  styles.languageOption,
                  language === 'zh' && styles.languageOptionSelected,
                ]}>
                <Text
                  style={[
                    styles.languageText,
                    language === 'zh' && styles.languageTextSelected,
                  ]}>
                  中文
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={text('切换为英文', 'Switch to English')}
                accessibilityState={{ selected: language === 'en' }}
                onPress={() => setLanguage('en')}
                style={[
                  styles.languageOption,
                  language === 'en' && styles.languageOptionSelected,
                ]}>
                <Text
                  style={[
                    styles.languageText,
                    language === 'en' && styles.languageTextSelected,
                  ]}>
                  EN
                </Text>
              </Pressable>
            </View>
          </View>
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
            onValueChange={(value) => void changeExpiryReminders(value)}
          />
          {expiryReminders ? (
            <View style={styles.reminderEditor}>
              <View style={styles.timeFieldWrap}>
                <Text style={styles.timeFieldLabel}>{text('提前天数 0–30', 'Days early 0–30')}</Text>
                <TextInput
                  value={String(reminderLeadDays)}
                  onChangeText={(value) => {
                    const days = Number(value);
                    if (Number.isFinite(days)) void changeReminderLeadDays(Math.min(30, Math.max(0, Math.round(days))));
                  }}
                  keyboardType="number-pad"
                  maxLength={2}
                  style={styles.timeInput}
                />
              </View>
              <View style={styles.timeFieldWrap}>
                <Text style={styles.timeFieldLabel}>{text('提醒时间', 'Alert time')}</Text>
                <TextInput
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
                <TextInput value={reminderPreferences.hydrationStart} onChangeText={(value) => setReminderPreferences((current) => ({ ...current, hydrationStart: value }))} placeholder="08:00" keyboardType="numbers-and-punctuation" maxLength={5} style={styles.timeInput} />
              </View>
              <View style={styles.timeFieldWrap}>
                <Text style={styles.timeFieldLabel}>{text('结束', 'End')}</Text>
                <TextInput value={reminderPreferences.hydrationEnd} onChangeText={(value) => setReminderPreferences((current) => ({ ...current, hydrationEnd: value }))} placeholder="22:00" keyboardType="numbers-and-punctuation" maxLength={5} style={styles.timeInput} />
              </View>
              <View style={styles.timeFieldWrap}>
                <Text style={styles.timeFieldLabel}>{text('间隔 30–360 分钟', 'Interval 30–360 min')}</Text>
                <TextInput
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
                <TextInput value={reminderPreferences.shoppingTime} onChangeText={(value) => setReminderPreferences((current) => ({ ...current, shoppingTime: value }))} placeholder="17:30" keyboardType="numbers-and-punctuation" maxLength={5} style={styles.timeInput} />
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
          <SettingRow emoji="⏲️" title={text('烹饪倒计时提醒', 'Cooking timer alerts')} detail={text('离开烹饪页面后，时间到仍会通知', 'Get notified after leaving the cooking screen')} value={reminderPreferences.cookingEnabled} onValueChange={(value) => void changeReminderCategory('cooking', value)} />
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
            detail={cloudSyncStatus === 'synced' && lastSyncedAt
              ? text('库存、菜谱与健康记录已同步', 'Inventory, recipes, and health are synced')
              : cloudSyncStatus === 'conflict'
                ? text('两台设备都有修改，需要选择保留版本', 'Both devices changed; choose which version to keep')
                : text('离线可用，联网后自动同步', 'Works offline and syncs when connected')}
            value={cloudSync}
            onValueChange={changeCloudSync}
          />
        </View>
        {reminderStatus ? <Text style={styles.reminderStatus}>{reminderStatus}</Text> : null}
        {cloudStatus ? <Text style={styles.cloudStatus}>{cloudStatus}</Text> : null}
      </View>

      <View style={styles.section}>
        <SectionHeader title={text('桌面与锁屏', 'Home & Lock Screen')} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text('打开小组件中心', 'Open widget center')}
          onPress={() => router.push('/widgets')}
          style={({ pressed }) => [styles.widgetSettingsCard, pressed && styles.pressed]}>
          <View style={styles.widgetSettingsIcon}><Text style={styles.widgetSettingsEmoji}>📱</Text></View>
          <View style={styles.widgetSettingsCopy}>
            <Text style={styles.widgetSettingsTitle}>{text('iOS 小组件', 'iOS widgets')}</Text>
            <Text style={styles.widgetSettingsText}>{text('预览并选择临期库存、饮水量和烹饪倒计时', 'Preview expiry, hydration, and cooking timer widgets')}</Text>
          </View>
          <Text style={styles.widgetSettingsBadge}>{text('已准备', 'READY')}</Text>
          <Text style={styles.widgetSettingsChevron}>›</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <SectionHeader title={text('数据与恢复', 'Data & recovery')} />
        <View style={styles.backupCard}>
          <View style={styles.backupCopy}>
            <Text style={styles.settingTitle}>{text('本地完整备份', 'Full local backup')}</Text>
            <Text style={styles.settingDetail}>{text('导出库存、菜谱、健康与家庭同步快照；恢复前会先校验格式。', 'Export inventory, recipes, health, and sync data; imports are validated first.')}</Text>
          </View>
          <View style={styles.backupActions}>
            <Pressable accessibilityRole="button" onPress={() => void exportBackup()} style={styles.backupPrimary}>
              <Text style={styles.backupPrimaryText}>{text('导出', 'Export')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setIsBackupOpen(true)} style={styles.backupSecondary}>
              <Text style={styles.backupSecondaryText}>{text('恢复', 'Restore')}</Text>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" onPress={() => setIsDiagnosticsOpen(true)} style={styles.diagnosticsButton}>
            <Text style={styles.diagnosticsButtonText}>{text(`诊断记录 · ${diagnostics.length}`, `Diagnostics · ${diagnostics.length}`)}</Text>
            <Text style={styles.accountEntryChevron}>›</Text>
          </Pressable>
        </View>
        {backupStatus ? <Text style={styles.cloudStatus}>{backupStatus}</Text> : null}
      </View>

      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <View>
            <Text style={styles.progressEyebrow}>{text('产品完成度', 'PRODUCT PROGRESS')}</Text>
            <Text style={styles.progressTitle}>{text('本地优先 · 家庭互通', 'Local-first household sync')}</Text>
          </View>
          <Text style={styles.progressPercent}>94%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: '94%' }]} />
        </View>
        <Text style={styles.progressText}>
          {text(
            '库存、菜单、购物、健康与家庭同步已经形成闭环；下一阶段将启用原生 iOS 小组件并进入 TestFlight 测试。',
            'Inventory, recipes, and health now use an offline queue and version checks for household sync. Shopping lists are next.'
          )}
        </Text>
      </View>

      <Text style={styles.footer}>{text('鲜食记 · Expo 原型 0.1', 'Fresh Pantry · Expo prototype 0.1')}</Text>

      <Modal visible={isBackupOpen} transparent animationType="fade" onRequestClose={() => setIsBackupOpen(false)}>
        <View style={styles.cloudModalBackdrop}>
          <View style={styles.backupModalCard}>
            <Text style={styles.cloudModalTitle}>{text('恢复本地备份', 'Restore local backup')}</Text>
            <Text style={styles.settingDetail}>{text('粘贴由鲜食记导出的完整 JSON。恢复会替换本机当前数据，但不会删除云端历史版本。', 'Paste a complete Fresh Pantry JSON export. This replaces local data but does not delete cloud history.')}</Text>
            <TextInput
              accessibilityLabel={text('备份内容', 'Backup content')}
              value={backupInput}
              onChangeText={setBackupInput}
              multiline
              autoCapitalize="none"
              placeholder={'{"format":"fresh-pantry-backup", ...}'}
              placeholderTextColor={Colors.light.textSecondary}
              style={[styles.cloudInput, styles.backupInput]}
            />
            <View style={styles.backupActions}>
              <Pressable onPress={() => setIsBackupOpen(false)} style={styles.backupSecondary}><Text style={styles.backupSecondaryText}>{text('取消', 'Cancel')}</Text></Pressable>
              <Pressable disabled={!backupInput.trim()} onPress={importBackup} style={[styles.backupPrimary, !backupInput.trim() && styles.cloudButtonDisabled]}><Text style={styles.backupPrimaryText}>{text('校验并恢复', 'Validate & restore')}</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isDiagnosticsOpen} transparent animationType="fade" onRequestClose={() => setIsDiagnosticsOpen(false)}>
        <View style={styles.cloudModalBackdrop}>
          <View style={styles.backupModalCard}>
            <View style={styles.cloudModalHeader}>
              <View><Text style={styles.cloudModalTitle}>{text('本机诊断记录', 'On-device diagnostics')}</Text><Text style={styles.settingDetail}>{text('最多保留 50 条错误摘要，不包含密码或库存内容。', 'Stores up to 50 error summaries without passwords or inventory contents.')}</Text></View>
              <Pressable onPress={() => setIsDiagnosticsOpen(false)} hitSlop={10}><Text style={styles.cloudModalClose}>×</Text></Pressable>
            </View>
            <ScrollView style={styles.diagnosticsList}>
              {diagnostics.length ? diagnostics.map((entry) => (
                <View key={entry.id} style={styles.diagnosticRow}>
                  <Text style={styles.diagnosticArea}>{entry.area} · {new Date(entry.createdAt).toLocaleString()}</Text>
                  <Text style={styles.diagnosticMessage} numberOfLines={3}>{entry.message}</Text>
                </View>
              )) : <Text style={styles.troubleshootingEmpty}>{text('目前没有错误记录。', 'No errors have been recorded.')}</Text>}
            </ScrollView>
            <View style={styles.backupActions}>
              <Pressable onPress={() => setIsDiagnosticsOpen(false)} style={styles.backupSecondary}><Text style={styles.backupSecondaryText}>{text('完成', 'Done')}</Text></Pressable>
              <Pressable disabled={!diagnostics.length} onPress={() => void removeDiagnostics()} style={[styles.backupPrimary, !diagnostics.length && styles.cloudButtonDisabled]}><Text style={styles.backupPrimaryText}>{text('清除记录', 'Clear')}</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isCloudSetupOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsCloudSetupOpen(false)}>
        <View style={styles.cloudModalBackdrop}>
          <ScrollView
            contentContainerStyle={styles.cloudModalScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
          <View style={styles.cloudModalCard}>
            <View style={styles.cloudModalHeader}>
              <View>
                <Text style={styles.cloudModalTitle}>{text('家庭云同步', 'Household cloud sync')}</Text>
                <Text style={styles.cloudModalSubtitle}>
                  {isCloudConfigured
                    ? text('使用邮箱登录后邀请家人共同管理。', 'Sign in by email, then invite household members.')
                    : text('云端接口已经准备好，还需要 Supabase 配置。', 'The cloud interface is ready; Supabase configuration is still required.')}
                </Text>
              </View>
              <Pressable onPress={() => setIsCloudSetupOpen(false)} hitSlop={10}>
                <Text style={styles.cloudModalClose}>×</Text>
              </Pressable>
            </View>

            {!isCloudConfigured ? (
              <View style={styles.cloudSetupHint}>
                <Text style={styles.cloudSetupHintTitle}>1 · .env</Text>
                <Text style={styles.cloudSetupHintText}>EXPO_PUBLIC_SUPABASE_URL</Text>
                <Text style={styles.cloudSetupHintText}>EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY</Text>
                <Text style={styles.cloudSetupHintTitle}>2 · Supabase SQL Editor</Text>
                <Text style={styles.cloudSetupHintText}>supabase/schema.sql</Text>
                <Text style={styles.cloudSetupCaption}>
                  {text(
                    '填写配置并运行数据库结构后重启 Expo。本机数据在配置期间仍会安全保留。',
                    'Add the configuration, run the schema, and restart Expo. Local data remains safe while cloud setup is incomplete.'
                  )}
                </Text>
              </View>
            ) : !cloudSession ? (
              <>
                <Text style={styles.settingTitle}>{text('登录邮箱', 'Sign-in email')}</Text>
                <TextInput
                  value={cloudEmail}
                  onChangeText={setCloudEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="name@example.com"
                  placeholderTextColor={Colors.light.textSecondary}
                  style={styles.cloudInput}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={!cloudEmail.includes('@')}
                  onPress={() => void requestCloudSignIn()}
                  style={[styles.cloudPrimaryButton, !cloudEmail.includes('@') && styles.cloudButtonDisabled]}>
                  <Text style={styles.cloudPrimaryButtonText}>{text('发送登录链接与验证码', 'Send sign-in link and code')}</Text>
                </Pressable>

                <View style={styles.cloudDivider} />
                <Text style={styles.settingTitle}>{text('输入邮件中的验证码', 'Enter the email code')}</Text>
                <TextInput
                  accessibilityLabel={text('邮箱验证码', 'Email verification code')}
                  value={cloudOtp}
                  onChangeText={setCloudOtp}
                  autoCapitalize="none"
                  keyboardType="number-pad"
                  maxLength={8}
                  placeholder="123456"
                  placeholderTextColor={Colors.light.textSecondary}
                  style={styles.cloudInput}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={!cloudEmail.includes('@') || cloudOtp.trim().length < 6}
                  onPress={() => void confirmCloudOtp()}
                  style={[
                    styles.cloudSecondaryButton,
                    (!cloudEmail.includes('@') || cloudOtp.trim().length < 6) && styles.cloudButtonDisabled,
                  ]}>
                  <Text style={styles.cloudSecondaryButtonText}>{text('确认登录', 'Confirm sign in')}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.cloudAccountCard}>
                  <View style={styles.cloudAccountAvatar}>
                    <Text style={styles.cloudAccountAvatarText}>
                      {(cloudSession.user.email ?? 'M').slice(0, 1).toLocaleUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.cloudAccountCopy}>
                    <Text style={styles.cloudAccountEmail} numberOfLines={1}>{cloudSession.user.email}</Text>
                    <Text style={styles.cloudAccountStatus}>
                      {cloudSyncStatus === 'synced'
                        ? text('全部数据已同步', 'Everything is synced')
                        : cloudSyncStatus === 'conflict'
                          ? text('发现多端修改冲突', 'Multi-device conflict found')
                          : pendingChanges
                            ? text('有更改等待上传', 'Changes are waiting to upload')
                            : text('云端账户已连接', 'Cloud account connected')}
                    </Text>
                  </View>
                  <View style={[styles.syncDot, cloudSyncStatus === 'synced' && styles.syncDotReady]} />
                </View>

                {conflict ? (
                  <View style={styles.conflictCard}>
                    <Text style={styles.conflictTitle}>{text('选择要保留的数据', 'Choose which data to keep')}</Text>
                    <Text style={styles.conflictText}>
                      {text(
                        '这台设备和云端在上次同步后都有修改，因此没有自动覆盖。',
                        'This device and the cloud both changed after the last sync, so nothing was overwritten automatically.'
                      )}
                    </Text>
                    <View style={styles.conflictActions}>
                      <Pressable onPress={() => void resolveConflict('remote')} style={styles.conflictSecondary}>
                        <Text style={styles.conflictSecondaryText}>{text('使用云端版本', 'Use cloud')}</Text>
                      </Pressable>
                      <Pressable onPress={() => void resolveConflict('local')} style={styles.conflictPrimary}>
                        <Text style={styles.conflictPrimaryText}>{text('使用本机版本', 'Use this device')}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                <Pressable accessibilityRole="button" onPress={() => void syncNow()} style={styles.cloudPrimaryButton}>
                  <Text style={styles.cloudPrimaryButtonText}>
                    {cloudSyncStatus === 'syncing' ? text('正在同步…', 'Syncing…') : text('立即同步', 'Sync now')}
                  </Text>
                </Pressable>
                {lastSyncedAt ? (
                  <Text style={styles.lastSyncText}>
                    {text('上次同步', 'Last synced')} · {new Date(lastSyncedAt).toLocaleString()}
                  </Text>
                ) : null}

                {household?.role === 'owner' ? (
                  <View style={styles.cloudFormSection}>
                    <Text style={styles.cloudFormTitle}>{text('邀请家人', 'Invite a household member')}</Text>
                    <TextInput
                      value={inviteEmail}
                      onChangeText={setInviteEmail}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      placeholder="family@example.com"
                      placeholderTextColor={Colors.light.textSecondary}
                      style={styles.cloudInput}
                    />
                    <Pressable
                      accessibilityRole="button"
                      disabled={!inviteEmail.includes('@')}
                      onPress={() => void sendHouseholdInvite()}
                      style={[styles.cloudSecondaryButton, !inviteEmail.includes('@') && styles.cloudButtonDisabled]}>
                      <Text style={styles.cloudSecondaryButtonText}>{text('生成家庭邀请码', 'Create invite code')}</Text>
                    </Pressable>
                    {latestInviteCode ? (
                      <View style={styles.inviteCodeCard}>
                        <Text style={styles.inviteCodeLabel}>{text('家庭邀请码 · 7 天有效', 'INVITE CODE · VALID 7 DAYS')}</Text>
                        <Text selectable style={styles.inviteCodeValue}>{latestInviteCode}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.cloudFormSection}>
                  <Text style={styles.cloudFormTitle}>{text('使用邀请码加入其他家庭', 'Join another household')}</Text>
                  <TextInput
                    value={inviteCode}
                    onChangeText={setInviteCode}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder={text('输入家庭邀请码', 'Enter invite code')}
                    placeholderTextColor={Colors.light.textSecondary}
                    style={styles.cloudInput}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={inviteCode.trim().length < 6}
                    onPress={() => void joinHousehold()}
                    style={[styles.cloudSecondaryButton, inviteCode.trim().length < 6 && styles.cloudButtonDisabled]}>
                    <Text style={styles.cloudSecondaryButtonText}>{text('加入家庭', 'Join household')}</Text>
                  </Pressable>
                </View>

                <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signOutButton}>
                  <Text style={styles.signOutButtonText}>{text('退出云端账户', 'Sign out of cloud')}</Text>
                </Pressable>
              </>
            )}
          </View>
          </ScrollView>
        </View>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  hiddenPreferences: { display: 'none' },
  pressed: { opacity: 0.72 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderRadius: 22,
    padding: 16,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  avatar: { width: 55, height: 55, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9D7BC' },
  avatarText: { color: '#8D4A27', fontSize: 21, fontWeight: '900' },
  profileCopy: { flex: 1, gap: 4 },
  profileName: { color: Colors.light.text, fontSize: 17, fontWeight: '900' },
  profileDetail: { color: Colors.light.textSecondary, fontSize: 12 },
  prototypeBadge: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: Colors.light.primarySoft },
  prototypeText: { color: Colors.light.primary, fontSize: 10, fontWeight: '800' },
  accountEntryCard: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderRadius: 22, backgroundColor: '#EDF6F0', borderWidth: 1, borderColor: '#CEE2D4' },
  accountEntryIcon: { width: 47, height: 47, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#FFFFFFB8' },
  accountEntryEmoji: { fontSize: 24 },
  accountEntryCopy: { flex: 1, gap: 4 },
  accountEntryTitle: { color: Colors.light.text, fontSize: 13.5, fontWeight: '900' },
  accountEntryText: { color: Colors.light.textSecondary, fontSize: 9.5, lineHeight: 14 },
  accountEntryBadge: { color: Colors.light.primary, fontSize: 8, fontWeight: '900', letterSpacing: 0.45 },
  accountEntryChevron: { color: Colors.light.primary, fontSize: 25, fontWeight: '500' },
  section: { gap: Spacing.three },
  backupCard: { gap: 14, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface },
  backupCopy: { gap: 5 },
  backupActions: { flexDirection: 'row', gap: 9 },
  backupPrimary: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Colors.light.primary },
  backupPrimaryText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '900' },
  backupSecondary: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Colors.light.backgroundElement },
  backupSecondaryText: { color: Colors.light.text, fontSize: 11.5, fontWeight: '900' },
  backupModalCard: { width: '100%', maxWidth: 430, gap: 14, padding: 20, borderRadius: 25, backgroundColor: Colors.light.surface },
  backupInput: { minHeight: 190, textAlignVertical: 'top', paddingTop: 14 },
  diagnosticsButton: { minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, borderRadius: 14, backgroundColor: Colors.light.backgroundElement },
  diagnosticsButtonText: { color: Colors.light.text, fontSize: 11.5, fontWeight: '800' },
  diagnosticsList: { maxHeight: 330 },
  diagnosticRow: { gap: 4, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  diagnosticArea: { color: Colors.light.primary, fontSize: 9.5, fontWeight: '900' },
  diagnosticMessage: { color: Colors.light.textSecondary, fontSize: 10.5, lineHeight: 16 },
  troubleshootingEmpty: { color: Colors.light.textSecondary, fontSize: 11, lineHeight: 17, paddingVertical: 30, textAlign: 'center' },
  languageCard: {
    flexDirection: 'row',
    width: 108,
    gap: 3,
    borderRadius: 14,
    padding: 3,
    backgroundColor: Colors.light.backgroundElement,
  },
  languageOption: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  languageOptionSelected: {
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  languageText: { color: Colors.light.textSecondary, fontSize: 12, fontWeight: '800' },
  languageTextSelected: { color: Colors.light.primary, fontWeight: '900' },
  householdCard: { overflow: 'hidden', borderRadius: 20, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  memberRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  smallAvatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9D7BC' },
  smallAvatarText: { color: '#8D4A27', fontWeight: '900' },
  memberCopy: { flex: 1, gap: 3 },
  memberName: { color: Colors.light.text, fontSize: 14, fontWeight: '800' },
  memberRole: { color: Colors.light.textSecondary, fontSize: 11 },
  youBadge: { color: Colors.light.primary, fontSize: 11, fontWeight: '800', backgroundColor: Colors.light.primarySoft, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  inviteButton: { minHeight: 51, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  inviteIcon: { color: Colors.light.primary, fontSize: 19, fontWeight: '700' },
  inviteText: { color: Colors.light.primary, fontSize: 13, fontWeight: '800' },
  settingsCard: { overflow: 'hidden', borderRadius: 20, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  settingRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  settingIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.backgroundElement },
  settingEmoji: { fontSize: 18 },
  settingCopy: { flex: 1, gap: 3 },
  settingTitle: { color: Colors.light.text, fontSize: 14, fontWeight: '800' },
  settingDetail: { color: Colors.light.textSecondary, fontSize: 11, lineHeight: 16 },
  reminderTimingRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  reminderTimingCopy: { flex: 1, gap: 3 },
  reminderTimingTitle: { color: Colors.light.text, fontSize: 13, fontWeight: '800' },
  reminderTimingDetail: { color: Colors.light.textSecondary, fontSize: 9.5, lineHeight: 14 },
  reminderTimingOptions: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 12, backgroundColor: Colors.light.backgroundElement },
  reminderTimingOption: { minWidth: 38, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  reminderTimingOptionSelected: { backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  reminderTimingText: { color: Colors.light.textSecondary, fontSize: 10, fontWeight: '800' },
  reminderTimingTextSelected: { color: Colors.light.primary },
  reminderEditor: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border, backgroundColor: '#F7F8F4' },
  reminderEditorSingle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border, backgroundColor: '#F7F8F4' },
  stackedReminderEditor: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border, backgroundColor: '#F7F8F4' },
  reminderTestRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border, backgroundColor: '#F7F8F4' },
  testReminderButton: { minHeight: 36, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Colors.light.primarySoft },
  testReminderButtonText: { color: Colors.light.primary, fontSize: 10, fontWeight: '900' },
  individualReminderRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  individualReminderEmoji: { width: 24, fontSize: 17 },
  individualReminderLabel: { flex: 1, color: Colors.light.text, fontSize: 11.5, fontWeight: '800' },
  timeFieldWrap: { flex: 1, gap: 5 },
  timeFieldLabel: { color: Colors.light.textSecondary, fontSize: 9.5, fontWeight: '800' },
  timeInput: { minWidth: 66, minHeight: 36, paddingHorizontal: 10, borderRadius: 11, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface, color: Colors.light.text, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  compactTimeInput: { width: 72, minHeight: 34, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface, color: Colors.light.text, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 5, paddingHorizontal: 14, paddingVertical: 12 },
  weekdayButton: { flex: 1, maxWidth: 40, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface },
  weekdayButtonSelected: { borderColor: Colors.light.primary, backgroundColor: Colors.light.primarySoft },
  weekdayText: { color: Colors.light.textSecondary, fontSize: 10, fontWeight: '900' },
  weekdayTextSelected: { color: Colors.light.primary },
  intervalWrap: { flex: 1.35, gap: 5 },
  reminderStatus: { marginTop: -8, paddingHorizontal: 4, color: Colors.light.primary, fontSize: 10.5, lineHeight: 16, fontWeight: '700' },
  progressCard: { gap: 13, borderRadius: 21, padding: 18, backgroundColor: Colors.light.primary },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  progressEyebrow: { color: '#CDE5D6', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  progressTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', marginTop: 4 },
  progressPercent: { color: '#FFFFFF', fontSize: 25, fontWeight: '900' },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#FFFFFF2E' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: '#FFFFFF' },
  progressText: { color: '#DCECE2', fontSize: 12, lineHeight: 19 },
  footer: { color: Colors.light.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 2 },
  cloudStatus: { paddingHorizontal: 4, color: Colors.light.primary, fontSize: 10.5, lineHeight: 16, fontWeight: '700' },
  widgetSettingsCard: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 22, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  widgetSettingsIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Colors.light.primarySoft },
  widgetSettingsEmoji: { fontSize: 23 },
  widgetSettingsCopy: { flex: 1, gap: 4 },
  widgetSettingsTitle: { color: Colors.light.text, fontSize: 14, fontWeight: '900' },
  widgetSettingsText: { color: Colors.light.textSecondary, fontSize: 10.5, lineHeight: 15 },
  widgetSettingsBadge: { color: Colors.light.primary, fontSize: 8, fontWeight: '900', letterSpacing: 0.4 },
  widgetSettingsChevron: { color: Colors.light.textSecondary, fontSize: 23 },
  cloudModalBackdrop: { flex: 1, backgroundColor: 'rgba(24, 35, 29, 0.3)' },
  cloudModalScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  cloudModalCard: { width: '100%', maxWidth: 460, gap: 14, padding: 20, borderRadius: 25, backgroundColor: Colors.light.surface },
  cloudModalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  cloudModalTitle: { color: Colors.light.text, fontSize: 19, fontWeight: '900' },
  cloudModalSubtitle: { maxWidth: 330, color: Colors.light.textSecondary, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
  cloudModalClose: { color: Colors.light.textSecondary, fontSize: 25, lineHeight: 27 },
  cloudInput: { minHeight: 50, paddingHorizontal: 14, borderRadius: 15, borderWidth: 1, borderColor: Colors.light.border, color: Colors.light.text, backgroundColor: Colors.light.background },
  cloudPrimaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Colors.light.primary },
  cloudPrimaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  cloudSecondaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Colors.light.primarySoft },
  cloudSecondaryButtonText: { color: Colors.light.primary, fontSize: 13, fontWeight: '900' },
  cloudButtonDisabled: { opacity: 0.35 },
  cloudDivider: { height: StyleSheet.hairlineWidth, marginVertical: 3, backgroundColor: Colors.light.border },
  cloudSetupHint: { gap: 7, padding: 14, borderRadius: 17, backgroundColor: Colors.light.backgroundElement },
  cloudSetupHintTitle: { color: Colors.light.primary, fontSize: 13, fontWeight: '900' },
  cloudSetupHintText: { color: Colors.light.text, fontSize: 10.5, fontWeight: '700' },
  cloudSetupCaption: { color: Colors.light.textSecondary, fontSize: 10, lineHeight: 15, marginTop: 4 },
  cloudAccountCard: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderRadius: 18, backgroundColor: Colors.light.background },
  cloudAccountAvatar: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#F9D7BC' },
  cloudAccountAvatarText: { color: '#8D4A27', fontSize: 16, fontWeight: '900' },
  cloudAccountCopy: { flex: 1, gap: 3 },
  cloudAccountEmail: { color: Colors.light.text, fontSize: 12.5, fontWeight: '900' },
  cloudAccountStatus: { color: Colors.light.textSecondary, fontSize: 10 },
  syncDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.light.warning },
  syncDotReady: { backgroundColor: Colors.light.primary },
  lastSyncText: { marginTop: -6, color: Colors.light.textSecondary, fontSize: 9.5, textAlign: 'center' },
  cloudFormSection: { gap: 10, paddingTop: 5 },
  cloudFormTitle: { color: Colors.light.text, fontSize: 12.5, fontWeight: '900' },
  inviteCodeCard: { alignItems: 'center', gap: 7, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#B9D8C4', backgroundColor: Colors.light.primarySoft },
  inviteCodeLabel: { color: Colors.light.primary, fontSize: 8.5, fontWeight: '900', letterSpacing: 0.5 },
  inviteCodeValue: { color: Colors.light.primary, fontSize: 20, fontWeight: '900', letterSpacing: 2 },
  signOutButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  signOutButtonText: { color: Colors.light.danger, fontSize: 11.5, fontWeight: '800' },
  conflictCard: { gap: 10, padding: 14, borderRadius: 17, borderWidth: 1, borderColor: '#E8C37B', backgroundColor: Colors.light.warningSoft },
  conflictTitle: { color: Colors.light.warning, fontSize: 13, fontWeight: '900' },
  conflictText: { color: '#7C632E', fontSize: 10.5, lineHeight: 16 },
  conflictActions: { flexDirection: 'row', gap: 8 },
  conflictSecondary: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#FFFFFFA8' },
  conflictSecondaryText: { color: Colors.light.warning, fontSize: 10.5, fontWeight: '900' },
  conflictPrimary: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Colors.light.warning },
  conflictPrimaryText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '900' },
});
