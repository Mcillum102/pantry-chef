import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { CloudSyncStatusPill } from '@/components/cloud-sync-status-pill';
import { KitchenPasscode } from '@/components/kitchen-passcode';
import { MemberPicker } from '@/components/member-picker';
import { Colors } from '@/constants/theme';
import { useCloudSync } from '@/context/cloud-sync-context';
import { useLanguage } from '@/context/language-context';
import { useMember } from '@/context/member-context';
import { getKitchenAccessState } from '@/data/app-access-utils';

export function AppAccessGate() {
  const { configured, status, household, lastError, needsPasscode, retryInitialization } = useCloudSync();
  const { member, isHydrated: memberHydrated } = useMember();
  const { text } = useLanguage();

  if (!memberHydrated) return <View style={styles.loadingPage} />;

  const access = getKitchenAccessState({
    hasMember: Boolean(member),
    configured,
    needsPasscode,
    hasHousehold: Boolean(household),
    status,
    hasError: Boolean(lastError),
  });

  if (access === 'choose-member') return <MemberPicker />;
  if (access === 'enter-passcode') return <KitchenPasscode />;

  if (access === 'loading') {
    return (
      <View style={styles.loadingPage} accessibilityLabel={text('正在连接厨房', 'Connecting to the kitchen')}>
        <View style={styles.loadingMark}>
          <Text style={styles.loadingEmoji}>🌿</Text>
        </View>
        <ActivityIndicator color={Colors.light.primary} />
        <Text style={styles.loadingTitle}>{text('正在打开我们的厨房…', 'Opening our kitchen…')}</Text>
      </View>
    );
  }

  if (access === 'error') {
    return (
      <View style={styles.loadingPage} accessibilityLabel={text('厨房加载失败', 'Kitchen loading failed')}>
        <View style={[styles.loadingMark, styles.errorMark]}>
          <Text style={styles.loadingEmoji}>☁️</Text>
        </View>
        <Text style={styles.errorTitle}>{text('暂时连不上我们的厨房', 'Could not open the kitchen')}</Text>
        <Text style={styles.errorText}>
          {text('本机数据仍然安全。请检查网络后重试。', 'Your local data is safe. Check your connection and try again.')}
        </Text>
        {lastError ? <Text style={styles.errorCode} numberOfLines={2}>{lastError}</Text> : null}
        <Pressable accessibilityRole="button" onPress={retryInitialization} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>{text('重新连接', 'Try again')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.appRoot}>
      <AppTabs />
      <CloudSyncStatusPill />
    </View>
  );
}

const styles = StyleSheet.create({
  appRoot: { flex: 1 },
  loadingPage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 24,
    backgroundColor: '#F7F5EF',
  },
  loadingMark: {
    width: 74,
    height: 74,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: '#E3F0E7',
  },
  loadingEmoji: { fontSize: 36 },
  loadingTitle: { color: Colors.light.text, fontSize: 15, fontWeight: '800' },
  errorMark: { backgroundColor: '#FFF0DA' },
  errorTitle: { color: Colors.light.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  errorText: { maxWidth: 320, color: Colors.light.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  errorCode: { maxWidth: 340, color: Colors.light.textSecondary, fontSize: 10, textAlign: 'center' },
  retryButton: { minWidth: 150, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Colors.light.primary },
  retryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
