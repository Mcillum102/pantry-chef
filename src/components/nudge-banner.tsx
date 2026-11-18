import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ReduceMotion, SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { findKitchenMember } from '@/constants/members';
import { Colors } from '@/constants/theme';
import { useTasks } from '@/context/tasks-context';
import { timeAgo } from '@/data/reminders';

/**
 * 收到「催一下」时，在任何页面顶部滑下来的提示。
 * App 开着时实时出现；App 没开时由推送通知（supabase/functions/push）提醒。
 */
export function NudgeBanner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { unreadForMe, markRead } = useTasks();
  const latest = unreadForMe[0];

  if (!latest) return null;
  const from = findKitchenMember(latest.fromMember);
  const more = unreadForMe.length - 1;

  return (
    <Animated.View
      key={latest.id}
      entering={SlideInUp.springify().damping(16).reduceMotion(ReduceMotion.System)}
      exiting={SlideOutUp.duration(200)}
      pointerEvents="box-none"
      style={[styles.wrap, { top: Math.max(insets.top, 10) + 6 }]}>
      <View style={styles.card} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <View style={styles.icon}><Text style={styles.iconEmoji}>🔔</Text></View>
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>{`${from?.name ?? '对方'}提醒你 · ${timeAgo(latest.createdAt)}`}</Text>
          <Text style={styles.message} numberOfLines={2}>{latest.message}</Text>
          {more > 0 ? <Text style={styles.more}>{`还有 ${more} 条`}</Text> : null}
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="去提醒页看看"
            hitSlop={4}
            onPress={() => {
              void markRead(unreadForMe.map((n) => n.id));
              router.navigate('/');
            }}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>去看看</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="知道了" hitSlop={6} onPress={() => void markRead([latest.id])} style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}>
            <Ionicons name="close" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 50, alignItems: 'center' },
  card: { width: '100%', maxWidth: 480, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingLeft: 14, borderRadius: 22, backgroundColor: '#2A2F2B', boxShadow: '0 16px 40px rgba(0, 0, 0, 0.28)' },
  icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#E09A3A' },
  iconEmoji: { fontSize: 22 },
  copy: { flex: 1, gap: 2 },
  title: { color: '#F1C894', fontSize: 12.5, fontWeight: '600' },
  message: { color: '#FFFFFF', fontSize: 15, fontWeight: '500', lineHeight: 20 },
  more: { color: 'rgba(255, 255, 255, 0.6)', fontSize: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  primary: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 19, backgroundColor: Colors.light.primarySoft },
  primaryText: { color: Colors.light.primary, fontSize: 13, fontWeight: '600' },
  dismiss: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: 'rgba(255, 255, 255, 0.12)' },
  pressed: { opacity: 0.75 },
});
