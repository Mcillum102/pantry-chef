import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import AccountScreen from '@/app/account';
import AppTabs from '@/components/app-tabs';
import { CloudSyncStatusPill } from '@/components/cloud-sync-status-pill';
import { FirstRunOnboarding } from '@/components/first-run-onboarding';
import { Colors } from '@/constants/theme';
import { useCloudSync } from '@/context/cloud-sync-context';
import { useLanguage } from '@/context/language-context';
import { shouldShowKitchenLoading } from '@/data/app-access-utils';

export function AppAccessGate() {
  const { configured, status, session, household, lastError, retryInitialization } = useCloudSync();
  const { text } = useLanguage();

  if (shouldShowKitchenLoading({
    configured,
    status,
    hasSession: Boolean(session),
    hasHousehold: Boolean(household),
  })) {
    return (
      <View style={styles.loadingPage} accessibilityLabel={text('正在检查账号状态', 'Checking account status')}>
        <View style={styles.loadingMark}>
          <Text style={styles.loadingEmoji}>🌿</Text>
        </View>
        <ActivityIndicator color={Colors.light.primary} />
        <Text style={styles.loadingTitle}>{text('正在打开你的厨房…', 'Opening your kitchen…')}</Text>
      </View>
    );
  }

  if (configured && session && !household && status === 'error') {
    return (
      <View style={styles.loadingPage} accessibilityLabel={text('厨房加载失败', 'Kitchen loading failed')}>
        <View style={[styles.loadingMark, styles.errorMark]}>
          <Text style={styles.loadingEmoji}>☁️</Text>
        </View>
        <Text style={styles.errorTitle}>{text('暂时连不上家庭厨房', 'Could not open your household')}</Text>
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

  if (!configured || !session || !household) {
    return <AccountScreen requiredSetup />;
  }

  return (
    <View style={styles.appRoot}>
      <AppTabs />
      <CloudSyncStatusPill />
      <FirstRunOnboarding />
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
  errorTitle: { color: Colors.light.text, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  errorText: { maxWidth: 320, color: Colors.light.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  errorCode: { maxWidth: 340, color: Colors.light.textSecondary, fontSize: 10, textAlign: 'center' },
  retryButton: { minWidth: 150, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Colors.light.primary },
  retryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
});
