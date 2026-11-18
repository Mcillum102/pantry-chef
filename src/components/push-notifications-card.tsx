import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Shadows } from '@/constants/theme';
import { useCloudSync } from '@/context/cloud-sync-context';
import { useMember } from '@/context/member-context';
import {
  ACTIVE_HEARTBEAT_MS,
  currentSubscription,
  disablePush,
  enablePush,
  getPushSupport,
  sendTestPush,
  setDeviceActive,
  syncPushSubscription,
  type PushSupport,
} from '@/services/push';

type State = { support: PushSupport; subscribed: boolean };

/** 「我的」页面里的手机通知开关：开启后，收到消息和到点的提醒会推送到这台 iPhone */
export function PushNotificationsCard() {
  const { configured, household } = useCloudSync();
  const { member } = useMember();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const support = getPushSupport();
    const subscribed = Boolean(await currentSubscription().catch(() => null));
    setState({ support, subscribed });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (Platform.OS !== 'web' || !configured || !household || !member || !state) return null;

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await action());
    } catch {
      setMessage('没成功，请检查网络后再试。');
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  const enable = () => run(async () => {
    const result = await enablePush(household.id, member.id);
    if (result === 'granted') {
      const test = await sendTestPush(member.id).catch(() => null);
      return test && test.sent > 0 ? '已开启，刚发了一条测试通知。' : '已开启。';
    }
    if (result === 'denied') return '通知被拒绝了。请到 iPhone「设置 → 通知」里找到这个 App 打开。';
    return null;
  });

  const test = () => run(async () => {
    const result = await sendTestPush(member.id);
    return result.sent > 0 ? '测试通知已发出，几秒内会收到。' : '没有发出去，请先关闭再重新开启通知。';
  });

  const disable = () => run(async () => {
    await disablePush();
    return '这台手机已关闭通知。';
  });

  const { support, subscribed } = state;
  const on = support === 'granted' && subscribed;
  const detail = on
    ? `${member.name}会收到对方发来的消息，以及设了时间的提醒。`
    : support === 'needs-home-screen'
      ? '请先在 Safari 点「分享 → 添加到主屏幕」，然后从主屏幕图标打开，再回到这里开启。'
      : support === 'denied'
        ? '通知被关闭了。请到 iPhone「设置 → 通知」里找到这个 App 打开。'
        : support === 'unsupported'
          ? '这个浏览器不支持推送通知。'
          : '对方发消息、提醒到点时，像微信一样弹出通知。';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.icon, on && styles.iconOn]}>
          <Text style={styles.iconEmoji}>{on ? '🔔' : '🔕'}</Text>
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{on ? '通知已开启' : '手机通知'}</Text>
          <Text style={styles.detail}>{detail}</Text>
        </View>
      </View>

      {support === 'prompt' || (support === 'granted' && !subscribed) ? (
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void enable()} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>开启通知</Text>}
        </Pressable>
      ) : null}

      {on ? (
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void test()} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            {busy ? <ActivityIndicator color={Colors.light.primary} /> : <Text style={styles.secondaryText}>发一条测试</Text>}
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void disable()} style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}>
            <Text style={styles.ghostText}>关闭</Text>
          </Pressable>
        </View>
      ) : null}

      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

/** App 打开、切换成员时，把这台设备的推送订阅同步到云端（不弹任何东西） */
export function PushSync() {
  const { configured, household } = useCloudSync();
  const { member } = useMember();
  const householdId = household?.id;
  const memberId = member?.id;

  useEffect(() => {
    if (Platform.OS !== 'web' || !configured || !householdId || !memberId) return;
    void syncPushSubscription(householdId, memberId).catch(() => undefined);
  }, [configured, householdId, memberId]);

  // App 在前台时不需要推送：每 30 秒告诉服务器「这台设备在用」；切到后台 / 关掉时告诉它恢复推送
  useEffect(() => {
    if (Platform.OS !== 'web' || !configured || !householdId || typeof document === 'undefined') return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const report = (active: boolean) => void setDeviceActive(active).catch(() => undefined);
    const start = () => {
      report(true);
      if (!timer) timer = setInterval(() => report(true), ACTIVE_HEARTBEAT_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
      report(false);
    };
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', stop);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', stop);
      if (timer) clearInterval(timer);
    };
  }, [configured, householdId]);

  return null;
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 16, borderRadius: 24, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border, boxShadow: Shadows.card },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: Colors.light.backgroundElement },
  iconOn: { backgroundColor: Colors.light.primarySoft },
  iconEmoji: { fontSize: 22 },
  copy: { flex: 1, gap: 3 },
  title: { color: Colors.light.text, fontSize: 16, fontWeight: '600' },
  detail: { color: Colors.light.textSecondary, fontSize: 13, lineHeight: 19 },
  primary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Colors.light.primary },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10 },
  secondary: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Colors.light.primarySoft },
  secondaryText: { color: Colors.light.primary, fontSize: 14, fontWeight: '600' },
  ghost: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 14, backgroundColor: Colors.light.backgroundElement },
  ghostText: { color: Colors.light.text, fontSize: 14, fontWeight: '500' },
  message: { color: Colors.light.primary, fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.8 },
});
