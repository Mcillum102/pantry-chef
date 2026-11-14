import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen, SectionHeader } from '@/components/app-screen';
import { Colors } from '@/constants/theme';
import { useCloudSync } from '@/context/cloud-sync-context';
import { useLanguage } from '@/context/language-context';
import { useMember } from '@/context/member-context';

export default function AccountScreen() {
  const router = useRouter();
  const { text } = useLanguage();
  const { member, members, setMemberId } = useMember();
  const {
    configured,
    status,
    household,
    conflict,
    lastSyncedAt,
    syncNow,
    resolveConflict,
  } = useCloudSync();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const statusText = useMemo(() => {
    if (!configured) return text('本地模式', 'Local only');
    if (status === 'syncing') return text('正在同步', 'Syncing');
    if (status === 'synced') return text('已同步', 'Synced');
    if (status === 'pending') return text('等待联网', 'Waiting for network');
    if (status === 'conflict') return text('需要确认版本', 'Review required');
    if (status === 'paused') return text('同步已暂停', 'Sync paused');
    return text('已连接', 'Connected');
  }, [configured, status, text]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await action();
    } catch {
      setNotice(text('操作没有完成，请检查网络或稍后再试。', 'The action could not be completed. Check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen
      eyebrow={text('同步与身份', 'SYNC & IDENTITY')}
      title={text(`你好，${member?.name ?? ''}`, `Hi, ${member?.name ?? ''}`)}
      subtitle={text('库存、菜谱和健康记录会在我们俩的手机之间同步。', 'Inventory, recipes, and health sync between our phones.')}
      action={(
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text('返回我的页面', 'Back to profile')}
          onPress={() => router.push('/profile')}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="close" size={23} color={Colors.light.text} />
        </Pressable>
      )}>
      <View style={styles.section}>
        <View style={styles.householdHero}>
          <View style={styles.householdHeroTop}>
            <Text style={styles.householdEmoji}>🏡</Text>
            <View style={styles.syncBadge}><View style={styles.syncDot} /><Text style={styles.syncText}>{statusText}</Text></View>
          </View>
          <Text style={styles.householdName}>{household?.name ?? text('我们的厨房', 'Our kitchen')}</Text>
          {lastSyncedAt ? (
            <Text style={styles.householdMeta}>{text('上次同步', 'Last synced')} · {new Date(lastSyncedAt).toLocaleString()}</Text>
          ) : null}
        </View>

        {conflict ? (
          <View style={styles.conflictCard}>
            <Text style={styles.cardTitle}>{text('选择要保留的数据', 'Choose which data to keep')}</Text>
            <Text style={styles.cardText}>
              {text('这台手机和云端在上次同步后都有修改，所以没有自动覆盖。', 'This device and the cloud both changed, so nothing was overwritten.')}
            </Text>
            <View style={styles.conflictActions}>
              <Pressable disabled={busy} onPress={() => void run(() => resolveConflict('remote'))} style={[styles.secondaryButton, styles.flex]}>
                <Text style={styles.secondaryButtonText}>{text('用云端版本', 'Use cloud')}</Text>
              </Pressable>
              <Pressable disabled={busy} onPress={() => void run(() => resolveConflict('local'))} style={[styles.primaryButton, styles.flex]}>
                <Text style={styles.primaryButtonText}>{text('用这台手机的', 'Use this device')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <SectionHeader title={text('这台手机是谁在用', 'Who uses this phone')} />
        <View style={styles.memberList}>
          {members.map((item) => {
            const selected = item.id === member?.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setMemberId(item.id)}
                style={({ pressed }) => [styles.memberRow, pressed && styles.pressed]}>
                <View style={styles.memberAvatar}><Text style={styles.memberEmoji}>{item.emoji}</Text></View>
                <Text style={[styles.memberName, styles.flex]}>{item.name}</Text>
                {selected ? (
                  <MaterialCommunityIcons name="check-circle" size={22} color={Colors.light.primary} />
                ) : (
                  <Text style={styles.switchText}>{text('切换', 'Switch')}</Text>
                )}
              </Pressable>
            );
          })}
        </View>

        {configured ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy || status === 'syncing'}
            onPress={() => void run(syncNow)}
            style={({ pressed }) => [styles.secondaryButton, (busy || status === 'syncing') && styles.disabled, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonText}>{status === 'syncing' ? text('正在同步…', 'Syncing…') : text('立即同步', 'Sync now')}</Text>
          </Pressable>
        ) : null}
      </View>

      {notice ? <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.42 },
  flex: { flex: 1 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  section: { gap: 15 },
  cardTitle: { color: Colors.light.text, fontSize: 14, fontWeight: '900' },
  cardText: { color: Colors.light.textSecondary, fontSize: 10.5, lineHeight: 16 },
  primaryButton: { minHeight: 51, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 16, backgroundColor: Colors.light.primary },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  secondaryButton: { minHeight: 49, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 16, backgroundColor: Colors.light.primarySoft, borderWidth: 1, borderColor: '#C8DDD0' },
  secondaryButtonText: { color: Colors.light.primary, fontSize: 12.5, fontWeight: '900' },
  householdHero: { minHeight: 150, justifyContent: 'flex-end', gap: 6, padding: 20, borderRadius: 27, backgroundColor: Colors.light.primary },
  householdHeroTop: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  householdEmoji: { fontSize: 34 },
  syncBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 11, backgroundColor: '#FFFFFF1F' },
  syncDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#BCE4C7' },
  syncText: { color: '#E1F0E5', fontSize: 8.5, fontWeight: '800' },
  householdName: { color: '#FFFFFF', fontSize: 25, fontWeight: '900' },
  householdMeta: { color: '#D6E9DB', fontSize: 10.5 },
  conflictCard: { gap: 12, padding: 17, borderRadius: 23, backgroundColor: '#FFF5E2', borderWidth: 1, borderColor: '#ECD9B7' },
  conflictActions: { flexDirection: 'row', gap: 10 },
  memberList: { overflow: 'hidden', borderRadius: 22, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  memberRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  memberAvatar: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Colors.light.primarySoft },
  memberEmoji: { fontSize: 22 },
  switchText: { color: Colors.light.primary, fontSize: 11, fontWeight: '900' },
  memberName: { color: Colors.light.text, fontSize: 12.5, fontWeight: '900' },
  notice: { padding: 14, borderRadius: 17, backgroundColor: Colors.light.primarySoft, borderWidth: 1, borderColor: '#C8DDD0' },
  noticeText: { color: Colors.light.primary, fontSize: 10.5, lineHeight: 16, fontWeight: '700' },
});
