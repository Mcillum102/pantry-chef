import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { AppScreen, SectionHeader } from '@/components/app-screen';
import { Colors, Spacing } from '@/constants/theme';
import { useKitchen } from '@/context/kitchen-context';
import { useLanguage } from '@/context/language-context';
import { usePersistentState } from '@/hooks/use-persistent-state';
import {
  disableExpiryNotifications,
  enableExpiryNotifications,
  refreshExpiryNotifications,
} from '@/services/expiry-notifications';
import { isCloudConfigured, sendMagicLink } from '@/services/cloud-sync';

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
  const { inventory } = useKitchen();
  const { language, setLanguage, text } = useLanguage();
  const [expiryReminders, setExpiryReminders] = usePersistentState('setting-expiry-reminders', true);
  const [reminderLeadDays, setReminderLeadDays] = usePersistentState('setting-reminder-lead-days', 3);
  const [autoEstimate, setAutoEstimate] = usePersistentState('setting-auto-estimate', true);
  const [cloudSync, setCloudSync] = usePersistentState('setting-cloud-sync', false);
  const [reminderStatus, setReminderStatus] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState<string | null>(null);
  const [cloudEmail, setCloudEmail] = useState('');
  const [isCloudSetupOpen, setIsCloudSetupOpen] = useState(false);

  const activeItems = inventory.filter((item) => item.quantity > 0).length;

  useEffect(() => {
    if (!expiryReminders) return;
    void refreshExpiryNotifications(inventory, reminderLeadDays, language);
  }, [expiryReminders, inventory, language, reminderLeadDays]);

  async function changeExpiryReminders(value: boolean) {
    if (!value) {
      await disableExpiryNotifications();
      setExpiryReminders(false);
      setReminderStatus(text('到期通知已关闭。', 'Expiry notifications are off.'));
      return;
    }

    const enabled = await enableExpiryNotifications(inventory, reminderLeadDays, language);
    setExpiryReminders(enabled);
    setReminderStatus(
      enabled
        ? text(`已开启，将提前${reminderLeadDays}天提醒。`, `Enabled ${reminderLeadDays} days before expiry.`)
        : text('请在 iPhone 上允许通知后再开启。', 'Allow notifications on iPhone to enable reminders.')
    );
  }

  async function changeReminderLeadDays(days: number) {
    setReminderLeadDays(days);
    if (expiryReminders) {
      await refreshExpiryNotifications(inventory, days, language);
      setReminderStatus(text(`提醒时间已改为提前${days}天。`, `Reminder changed to ${days} days before expiry.`));
    }
  }

  function changeCloudSync(value: boolean) {
    if (!value) {
      setCloudSync(false);
      setCloudStatus(text('云同步已暂停，本机数据仍会保留。', 'Cloud sync paused; local data remains available.'));
      return;
    }
    setIsCloudSetupOpen(true);
    if (!isCloudConfigured) {
      setCloudSync(false);
      setCloudStatus(text('需要先配置 Supabase 项目。', 'Configure a Supabase project first.'));
    }
  }

  async function requestCloudSignIn() {
    const email = cloudEmail.trim();
    if (!email.includes('@') || !isCloudConfigured) return;
    try {
      await sendMagicLink(email);
      setCloudStatus(text('登录链接已发送，请到邮箱中确认。', 'Sign-in link sent. Check your email.'));
      setIsCloudSetupOpen(false);
      setCloudSync(true);
    } catch {
      setCloudStatus(text('登录链接发送失败，请检查云端配置。', 'Could not send the sign-in link. Check cloud configuration.'));
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
          <Text style={styles.profileName}>{text('Marti 的家', "Marti's home")}</Text>
          <Text style={styles.profileDetail}>
            {text(`1 位成员 · ${activeItems} 种库存`, `1 member · ${activeItems} items`)}
          </Text>
        </View>
        <View style={styles.prototypeBadge}>
          <Text style={styles.prototypeText}>{text('本地雏形', 'LOCAL PROTOTYPE')}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader
          title={text('家庭成员', 'Household')}
          detail={text('共同管理库存', 'Shared inventory')}
        />
        <View style={styles.householdCard}>
          <View style={styles.memberRow}>
            <View style={styles.smallAvatar}>
              <Text style={styles.smallAvatarText}>M</Text>
            </View>
            <View style={styles.memberCopy}>
              <Text style={styles.memberName}>Marti</Text>
              <Text style={styles.memberRole}>{text('家庭管理员', 'Household admin')}</Text>
            </View>
            <Text style={styles.youBadge}>{text('你', 'YOU')}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setIsCloudSetupOpen(true)}
            style={({ pressed }) => [styles.inviteButton, pressed && styles.pressed]}>
            <Text style={styles.inviteIcon}>＋</Text>
            <Text style={styles.inviteText}>{text('邀请家人加入', 'Invite a household member')}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
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
            title={text('到期提醒', 'Expiry reminders')}
            detail={text('提前3天提醒需要处理的食材', 'Remind me 3 days before an item expires')}
            value={expiryReminders}
            onValueChange={(value) => void changeExpiryReminders(value)}
          />
          <View style={styles.reminderTimingRow}>
            <View style={styles.reminderTimingCopy}>
              <Text style={styles.reminderTimingTitle}>{text('提前多久提醒', 'Reminder timing')}</Text>
              <Text style={styles.reminderTimingDetail}>{text('修改后会重新安排所有到期通知', 'All expiry alerts will be rescheduled')}</Text>
            </View>
            <View style={styles.reminderTimingOptions}>
              {[1, 3, 7].map((days) => (
                <Pressable
                  key={days}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: reminderLeadDays === days }}
                  onPress={() => void changeReminderLeadDays(days)}
                  style={[
                    styles.reminderTimingOption,
                    reminderLeadDays === days && styles.reminderTimingOptionSelected,
                  ]}>
                  <Text
                    style={[
                      styles.reminderTimingText,
                      reminderLeadDays === days && styles.reminderTimingTextSelected,
                    ]}>
                    {text(`${days}天`, `${days}d`)}
                  </Text>
                </Pressable>
              ))}
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
            detail={text('接入 Supabase 后可正式启用', 'Available after Supabase is connected')}
            value={cloudSync}
            onValueChange={changeCloudSync}
          />
        </View>
        {reminderStatus ? <Text style={styles.reminderStatus}>{reminderStatus}</Text> : null}
        {cloudStatus ? <Text style={styles.cloudStatus}>{cloudStatus}</Text> : null}
      </View>

      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <View>
            <Text style={styles.progressEyebrow}>{text('雏形完成度', 'PROTOTYPE PROGRESS')}</Text>
            <Text style={styles.progressTitle}>{text('本地功能框架', 'Local feature framework')}</Text>
          </View>
          <Text style={styles.progressPercent}>82%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: '82%' }]} />
        </View>
        <Text style={styles.progressText}>
          {text(
            '本地持久化、库存批次、烹饪闭环、健康历史和提醒已经完成；配置 Supabase 后即可启用家庭云同步。',
            'Local persistence, stock batches, cooking flow, health history, and reminders are ready. Configure Supabase to enable household cloud sync.'
          )}
        </Text>
      </View>

      <Text style={styles.footer}>{text('鲜食记 · Expo 原型 0.1', 'Fresh Pantry · Expo prototype 0.1')}</Text>

      <Modal
        visible={isCloudSetupOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsCloudSetupOpen(false)}>
        <View style={styles.cloudModalBackdrop}>
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

            {isCloudConfigured ? (
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
                  <Text style={styles.cloudPrimaryButtonText}>{text('发送登录链接', 'Send sign-in link')}</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.cloudSetupHint}>
                <Text style={styles.cloudSetupHintTitle}>.env</Text>
                <Text style={styles.cloudSetupHintText}>EXPO_PUBLIC_SUPABASE_URL</Text>
                <Text style={styles.cloudSetupHintText}>EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY</Text>
                <Text style={styles.cloudSetupCaption}>
                  {text('配置示例和数据库结构已经放入项目。', 'A configuration example and database schema are included in the project.')}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
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
  section: { gap: Spacing.three },
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
  cloudModalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(24, 35, 29, 0.3)' },
  cloudModalCard: { width: '100%', maxWidth: 460, gap: 14, padding: 20, borderRadius: 25, backgroundColor: Colors.light.surface },
  cloudModalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  cloudModalTitle: { color: Colors.light.text, fontSize: 19, fontWeight: '900' },
  cloudModalSubtitle: { maxWidth: 330, color: Colors.light.textSecondary, fontSize: 10.5, lineHeight: 16, marginTop: 4 },
  cloudModalClose: { color: Colors.light.textSecondary, fontSize: 25, lineHeight: 27 },
  cloudInput: { minHeight: 50, paddingHorizontal: 14, borderRadius: 15, borderWidth: 1, borderColor: Colors.light.border, color: Colors.light.text, backgroundColor: Colors.light.background },
  cloudPrimaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Colors.light.primary },
  cloudPrimaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  cloudButtonDisabled: { opacity: 0.35 },
  cloudSetupHint: { gap: 7, padding: 14, borderRadius: 17, backgroundColor: Colors.light.backgroundElement },
  cloudSetupHintTitle: { color: Colors.light.primary, fontSize: 13, fontWeight: '900' },
  cloudSetupHintText: { color: Colors.light.text, fontSize: 10.5, fontWeight: '700' },
  cloudSetupCaption: { color: Colors.light.textSecondary, fontSize: 10, lineHeight: 15, marginTop: 4 },
});
