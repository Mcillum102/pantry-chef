import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useCloudSync } from '@/context/cloud-sync-context';
import { useLanguage } from '@/context/language-context';

export function CloudSyncStatusPill() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { text } = useLanguage();
  const { status, pendingChanges, lastError, syncNow } = useCloudSync();
  if (!pendingChanges && status !== 'pending' && status !== 'error' && status !== 'conflict') return null;

  const conflict = status === 'conflict';
  const failed = status === 'error' || Boolean(lastError);
  const label = conflict
    ? text('两台设备都有修改，点击处理', 'Changes conflict — tap to review')
    : failed
      ? text('当前离线，修改已安全保存在本机', 'Offline — changes are safe on this device')
      : text('有修改等待同步', 'Changes are waiting to sync');

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: Math.max(insets.top, 10) + 4 }]}>
      <Pressable
        accessibilityRole="button"
        onPress={() => conflict ? router.push('/profile') : void syncNow()}
        style={[styles.pill, conflict && styles.conflictPill, failed && styles.failedPill]}>
        {failed ? <Text style={styles.icon}>☁️</Text> : conflict ? <Text style={styles.icon}>⚠️</Text> : <ActivityIndicator size="small" color={Colors.light.primary} />}
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
        <Text style={styles.action}>{conflict ? text('处理', 'Review') : text('重试', 'Retry')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, zIndex: 600, alignItems: 'center' },
  pill: { maxWidth: 430, minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, borderRadius: 18, borderWidth: 1, borderColor: '#C8DDCF', backgroundColor: '#F3FAF5F2', shadowColor: '#183028', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
  conflictPill: { borderColor: '#E8C37B', backgroundColor: '#FFF8EAF5' },
  failedPill: { borderColor: '#CAD7E2', backgroundColor: '#F6FAFDF5' },
  icon: { fontSize: 16 },
  label: { flexShrink: 1, color: Colors.light.text, fontSize: 11, fontWeight: '800' },
  action: { color: Colors.light.primary, fontSize: 10, fontWeight: '900' },
});
