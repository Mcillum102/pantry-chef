import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppScreen, SectionHeader } from '@/components/app-screen';
import { PushNotificationsCard } from '@/components/push-notifications-card';
import { readViewport } from '@/components/viewport-guard';
import { Colors, Spacing } from '@/constants/theme';
import { useCloudSync } from '@/context/cloud-sync-context';
import { useHealth } from '@/context/health-context';
import { useKitchen } from '@/context/kitchen-context';
import { useLanguage } from '@/context/language-context';
import { useMember } from '@/context/member-context';
import { clearDiagnostics, readDiagnostics, type DiagnosticEntry } from '@/services/diagnostics';

/** 屏幕读数：不同 iPhone 显示不一致时，截图这一行就能看出差在哪 */
function ScreenInfo() {
  const [info, setInfo] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const v = readViewport();
    setInfo(`屏幕 ${v.screenWidth}×${v.screenHeight} · 页面 ${v.innerWidth}×${v.innerHeight} → ${v.appHeight} · 底部安全区 ${Math.round(v.safeAreaBottom)} · ${v.standalone ? '主屏幕' : '浏览器'}`);
  }, []);
  return info ? <Text style={styles.screenInfo}>{info}</Text> : null;
}

export default function ProfileScreen() {
  const router = useRouter();
  const kitchen = useKitchen();
  const { inventory } = kitchen;
  const health = useHealth();
  const {
    configured: isCloudConfigured,
    status: cloudSyncStatus,
    household,
    pendingChanges,
  } = useCloudSync();
  const { text } = useLanguage();
  const { member: currentMember, members, setMemberId } = useMember();
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
  const householdName = household?.name ?? text('我们的厨房', 'Our kitchen');
  const cloudBadge = !isCloudConfigured
    ? text('本地模式', 'LOCAL')
    : cloudSyncStatus === 'synced'
      ? text('已同步', 'SYNCED')
      : cloudSyncStatus === 'conflict'
        ? text('待确认', 'REVIEW')
        : cloudSyncStatus === 'syncing'
          ? text('连接中', 'CONNECTING')
        : pendingChanges
          ? text('等待同步', 'PENDING')
          : text('云端', 'CLOUD');

  return (
    <AppScreen
      eyebrow={text('我们的厨房', 'OUR KITCHEN')}
      title={text('我的厨房', 'My kitchen')}
      subtitle={text('同步、提醒和数据备份。', 'Sync, reminders, and backups.')}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarEmoji}>{currentMember?.emoji ?? '🏡'}</Text>
        </View>
        <View style={styles.profileCopy}>
          <Text style={styles.profileName}>{householdName}</Text>
          <Text style={styles.profileDetail}>
            {text(
              `${currentMember?.name ?? ''} 在用 · ${activeItems} 种库存`,
              `${currentMember?.name ?? ''} · ${activeItems} items`
            )}
          </Text>
        </View>
        <View style={styles.prototypeBadge}>
          <Text style={styles.prototypeText}>{cloudBadge}</Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={text('同步与身份', 'Sync & identity')}
        onPress={() => router.push('/account')}
        style={({ pressed }) => [styles.accountEntryCard, pressed && styles.pressed]}>
        <View style={styles.accountEntryIcon}>
          <Text style={styles.accountEntryEmoji}>☁️</Text>
        </View>
        <View style={styles.accountEntryCopy}>
          <Text style={styles.accountEntryTitle}>
            {text('同步与身份', 'Sync & identity')}
          </Text>
          <Text style={styles.accountEntryText}>
            {isCloudConfigured
              ? text('两台手机自动同步，冲突在这里处理', 'Both phones sync automatically')
              : text('仅本机模式', 'Local only')}
          </Text>
        </View>
        <Text style={styles.accountEntryBadge}>{text('管理', 'MANAGE')}</Text>
        <Text style={styles.accountEntryChevron}>›</Text>
      </Pressable>

      <PushNotificationsCard />

      <View style={styles.section}>
        <SectionHeader
          title={text('我们俩', 'The two of us')}
          detail={text('共同管理库存', 'Shared inventory')}
        />
        <View style={styles.householdCard}>
          {members.map((member) => (
            <Pressable
              key={member.id}
              accessibilityRole="button"
              accessibilityLabel={member.id === currentMember?.id ? member.name : text(`切换成${member.name}`, `Switch to ${member.name}`)}
              onPress={() => setMemberId(member.id)}
              style={({ pressed }) => [styles.memberRow, pressed && styles.pressed]}>
              <View style={styles.smallAvatar}>
                <Text style={styles.smallAvatarEmoji}>{member.emoji}</Text>
              </View>
              <View style={styles.memberCopy}>
                <Text style={styles.memberName} numberOfLines={1}>{member.name}</Text>
              </View>
              {member.id === currentMember?.id ? (
                <Text style={styles.youBadge}>{text('你', 'YOU')}</Text>
              ) : (
                <Text style={styles.switchText}>{text('切换', 'Switch')}</Text>
              )}
            </Pressable>
          ))}
        </View>
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

      <Text style={styles.footer}>{text('鲜食记 · 我们俩的厨房', 'Fresh Pantry')}</Text>
      <ScreenInfo />

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
  avatarEmoji: { fontSize: 28 },
  profileCopy: { flex: 1, gap: 4 },
  profileName: { color: Colors.light.text, fontSize: 17, fontWeight: '600' },
  profileDetail: { color: Colors.light.textSecondary, fontSize: 12 },
  prototypeBadge: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: Colors.light.primarySoft },
  prototypeText: { color: Colors.light.primary, fontSize: 11.5, fontWeight: '600' },
  accountEntryCard: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderRadius: 22, backgroundColor: '#EDF6F0', borderWidth: 1, borderColor: '#CEE2D4' },
  accountEntryIcon: { width: 47, height: 47, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#FFFFFFB8' },
  accountEntryEmoji: { fontSize: 24 },
  accountEntryCopy: { flex: 1, gap: 4 },
  accountEntryTitle: { color: Colors.light.text, fontSize: 13.5, fontWeight: '600' },
  accountEntryText: { color: Colors.light.textSecondary, fontSize: 11, lineHeight: 14 },
  accountEntryBadge: { color: Colors.light.primary, fontSize: 10, fontWeight: '600', letterSpacing: 0.45 },
  accountEntryChevron: { color: Colors.light.primary, fontSize: 25, fontWeight: '500' },
  section: { gap: Spacing.three },
  backupCard: { gap: 14, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface },
  backupCopy: { gap: 5 },
  backupActions: { flexDirection: 'row', gap: 9 },
  backupPrimary: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Colors.light.primary },
  backupPrimaryText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '600' },
  backupSecondary: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Colors.light.backgroundElement },
  backupSecondaryText: { color: Colors.light.text, fontSize: 12.5, fontWeight: '600' },
  backupModalCard: { width: '100%', maxWidth: 430, gap: 14, padding: 20, borderRadius: 25, backgroundColor: Colors.light.surface },
  backupInput: { minHeight: 190, textAlignVertical: 'top', paddingTop: 14 },
  diagnosticsButton: { minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, borderRadius: 14, backgroundColor: Colors.light.backgroundElement },
  diagnosticsButtonText: { color: Colors.light.text, fontSize: 12.5, fontWeight: '600' },
  diagnosticsList: { maxHeight: 330 },
  diagnosticRow: { gap: 4, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  diagnosticArea: { color: Colors.light.primary, fontSize: 11, fontWeight: '600' },
  diagnosticMessage: { color: Colors.light.textSecondary, fontSize: 12, lineHeight: 16 },
  troubleshootingEmpty: { color: Colors.light.textSecondary, fontSize: 12, lineHeight: 17, paddingVertical: 30, textAlign: 'center' },
  householdCard: { overflow: 'hidden', borderRadius: 20, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  memberRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  smallAvatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9D7BC' },
  smallAvatarEmoji: { fontSize: 20 },
  memberCopy: { flex: 1, gap: 3 },
  memberName: { color: Colors.light.text, fontSize: 14, fontWeight: '600' },
  switchText: { color: Colors.light.primary, fontSize: 12, fontWeight: '600' },
  youBadge: { color: Colors.light.primary, fontSize: 12, fontWeight: '600', backgroundColor: Colors.light.primarySoft, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  settingTitle: { color: Colors.light.text, fontSize: 14, fontWeight: '600' },
  settingDetail: { color: Colors.light.textSecondary, fontSize: 12, lineHeight: 16 },
  footer: { color: Colors.light.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 2 },
  screenInfo: { color: '#A9ADA6', fontSize: 10.5, textAlign: 'center' },
  cloudStatus: { paddingHorizontal: 4, color: Colors.light.primary, fontSize: 12, lineHeight: 16, fontWeight: '500' },
  widgetSettingsCard: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 22, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  widgetSettingsIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Colors.light.primarySoft },
  widgetSettingsEmoji: { fontSize: 23 },
  widgetSettingsCopy: { flex: 1, gap: 4 },
  widgetSettingsTitle: { color: Colors.light.text, fontSize: 14, fontWeight: '600' },
  widgetSettingsText: { color: Colors.light.textSecondary, fontSize: 12, lineHeight: 16 },
  widgetSettingsBadge: { color: Colors.light.primary, fontSize: 10, fontWeight: '600', letterSpacing: 0.4 },
  widgetSettingsChevron: { color: Colors.light.textSecondary, fontSize: 23 },
  cloudModalBackdrop: { flex: 1, backgroundColor: 'rgba(24, 35, 29, 0.3)' },
  cloudModalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  cloudModalTitle: { color: Colors.light.text, fontSize: 19, fontWeight: '600' },
  cloudModalClose: { color: Colors.light.textSecondary, fontSize: 25, lineHeight: 27 },
  cloudInput: { minHeight: 50, paddingHorizontal: 14, borderRadius: 15, borderWidth: 1, borderColor: Colors.light.border, color: Colors.light.text, backgroundColor: Colors.light.background },
  cloudButtonDisabled: { opacity: 0.35 },
});
