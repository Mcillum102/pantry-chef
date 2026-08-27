import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { createEmptyHealthSnapshot, createSampleHealthSnapshot, useHealth } from '@/context/health-context';
import { createEmptyKitchenSnapshot, createSampleKitchenSnapshot, useKitchen } from '@/context/kitchen-context';
import { useLanguage } from '@/context/language-context';
import { useReminders } from '@/context/reminder-context';
import { usePersistentState } from '@/hooks/use-persistent-state';

type OnboardingState = { completed: boolean; keptSamples: boolean };

export function FirstRunOnboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { text } = useLanguage();
  const kitchen = useKitchen();
  const health = useHealth();
  const reminders = useReminders();
  const [state, setState, hydrated] = usePersistentState<OnboardingState>('onboarding-v1', {
    completed: false,
    keptSamples: false,
  });
  const [step, setStep] = useState(0);
  const [keepSamples, setKeepSamples] = useState(false);
  const [expiryPermission, setExpiryPermission] = useState(true);

  if (!hydrated || state.completed) return null;

  async function finish(openAccount = false) {
    kitchen.replaceSnapshot(keepSamples ? createSampleKitchenSnapshot() : createEmptyKitchenSnapshot());
    health.replaceSnapshot(keepSamples ? createSampleHealthSnapshot() : createEmptyHealthSnapshot());

    await reminders.setCategoryEnabled('expiry', expiryPermission);
    setState({ completed: true, keptSamples: keepSamples });
    if (openAccount) router.push('/account');
  }

  return (
    <View
      accessibilityViewIsModal
      style={[
        StyleSheet.absoluteFillObject,
        styles.backdrop,
        { paddingTop: Math.max(insets.top, 18), paddingBottom: Math.max(insets.bottom, 18) },
      ]}>
      <View style={styles.progressRow}>
        {[0, 1, 2].map((index) => (
          <View key={index} style={[styles.progressDot, index === step && styles.progressDotActive]} />
        ))}
      </View>

      <View style={styles.card}>
        {step === 0 ? (
          <>
            <View style={styles.heroIcon}><Text style={styles.heroEmoji}>🥬</Text></View>
            <Text style={styles.eyebrow}>{text('欢迎使用鲜食记', 'WELCOME TO FRESH PANTRY')}</Text>
            <Text style={styles.title}>{text('把家里的食物，真正用起来', 'Make the most of what you already have')}</Text>
            <Text style={styles.description}>
              {text(
                '记录库存与保质期、保存菜谱、安排三餐；登录后还能让家里的设备保持同步。',
                'Track stock and expiry dates, save recipes, plan meals, and keep household devices in sync.'
              )}
            </Text>
            <View style={styles.featureList}>
              <Feature icon="fridge-outline" title={text('库存与临期提醒', 'Inventory & expiry')} />
              <Feature icon="book-open-page-variant-outline" title={text('菜谱与烹饪步骤', 'Recipes & guided cooking')} />
              <Feature icon="account-group-outline" title={text('家庭共享与离线使用', 'Household sync & offline use')} />
            </View>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text style={styles.bigEmoji}>🧺</Text>
            <Text style={styles.eyebrow}>{text('选择起点', 'CHOOSE A STARTING POINT')}</Text>
            <Text style={styles.title}>{text('你的厨房，现在是什么状态？', 'How would you like to begin?')}</Text>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: keepSamples }}
              onPress={() => setKeepSamples(true)}
              style={[styles.choiceCard, keepSamples && styles.choiceCardSelected]}>
              <View style={styles.choiceIcon}><Text style={styles.choiceEmoji}>✨</Text></View>
              <View style={styles.choiceCopy}>
                <Text style={styles.choiceTitle}>{text('先看看示例', 'Explore with samples')}</Text>
                <Text style={styles.choiceText}>{text('保留示例库存、三餐和菜谱，熟悉后可逐项删除。', 'Keep sample stock, meals, and recipes while you explore.')}</Text>
              </View>
              <View style={[styles.radio, keepSamples && styles.radioSelected]} />
            </Pressable>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: !keepSamples }}
              onPress={() => setKeepSamples(false)}
              style={[styles.choiceCard, !keepSamples && styles.choiceCardSelected]}>
              <View style={styles.choiceIcon}><Text style={styles.choiceEmoji}>🪴</Text></View>
              <View style={styles.choiceCopy}>
                <Text style={styles.choiceTitle}>{text('从空厨房开始', 'Start with an empty kitchen')}</Text>
                <Text style={styles.choiceText}>{text('清空示例记录，只保留分类与存放位置。', 'Remove sample records while keeping categories and locations.')}</Text>
              </View>
              <View style={[styles.radio, !keepSamples && styles.radioSelected]} />
            </Pressable>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={styles.bigEmoji}>🔔</Text>
            <Text style={styles.eyebrow}>{text('隐私与权限', 'PRIVACY & PERMISSIONS')}</Text>
            <Text style={styles.title}>{text('只在需要时请求权限', 'Permissions are requested only when needed')}</Text>
            <View style={styles.permissionCard}>
              <View style={styles.permissionRow}>
                <MaterialCommunityIcons name="bell-outline" size={23} color={Colors.light.primary} />
                <View style={styles.permissionCopy}>
                  <Text style={styles.permissionTitle}>{text('临期通知', 'Expiry notifications')}</Text>
                  <Text style={styles.permissionText}>{text('在食物到期前提醒；可随时在设置里关闭。', 'Alerts before food expires; switch it off anytime in Settings.')}</Text>
                </View>
                <Switch value={expiryPermission} onValueChange={setExpiryPermission} />
              </View>
              <View style={styles.divider} />
              <View style={styles.permissionRow}>
                <MaterialCommunityIcons name="camera-outline" size={23} color="#3578A8" />
                <View style={styles.permissionCopy}>
                  <Text style={styles.permissionTitle}>{text('相机与照片', 'Camera & photos')}</Text>
                  <Text style={styles.permissionText}>{text('仅在扫码或识别小票/菜谱时询问，不会后台拍摄。', 'Asked only when scanning a barcode, receipt, or recipe.')}</Text>
                </View>
              </View>
            </View>
            <Text style={styles.privacyNote}>{text('库存默认保存在本机；只有登录并启用同步后才会上传到家庭云端。', 'Data stays on this device unless you sign in and enable household sync.')}</Text>
          </>
        ) : null}

        <View style={styles.actions}>
          {step > 0 ? (
            <Pressable onPress={() => setStep((current) => current - 1)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{text('上一步', 'Back')}</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => step < 2 ? setStep((current) => current + 1) : void finish(false)}
            style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{step < 2 ? text('继续', 'Continue') : text('进入鲜食记', 'Start using Fresh Pantry')}</Text>
          </Pressable>
        </View>
        {step === 2 ? (
          <Pressable onPress={() => void finish(true)} hitSlop={8}>
            <Text style={styles.accountLink}>{text('现在创建账号并同步 →', 'Create an account and sync now →')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Feature({ icon, title }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; title: string }) {
  return (
    <View style={styles.featureRow}>
      <MaterialCommunityIcons name={icon} size={21} color={Colors.light.primary} />
      <Text style={styles.featureText}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { zIndex: 500, elevation: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, backgroundColor: '#183028E8' },
  progressRow: { flexDirection: 'row', gap: 7, marginBottom: 14 },
  progressDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFFFFF55' },
  progressDotActive: { width: 26, backgroundColor: '#FFFFFF' },
  card: { width: '100%', maxWidth: 430, minHeight: 570, justifyContent: 'center', gap: 14, padding: 24, borderRadius: 32, backgroundColor: '#FBFAF6' },
  heroIcon: { width: 92, height: 92, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 30, backgroundColor: Colors.light.primarySoft },
  heroEmoji: { fontSize: 48 },
  bigEmoji: { alignSelf: 'center', fontSize: 52 },
  eyebrow: { color: Colors.light.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1, textAlign: 'center' },
  title: { color: Colors.light.text, fontSize: 25, lineHeight: 33, fontWeight: '900', textAlign: 'center' },
  description: { color: Colors.light.textSecondary, fontSize: 13, lineHeight: 21, textAlign: 'center' },
  featureList: { gap: 10, marginTop: 8, padding: 15, borderRadius: 20, backgroundColor: Colors.light.surface },
  featureRow: { minHeight: 31, flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureText: { color: Colors.light.text, fontSize: 13, fontWeight: '800' },
  choiceCard: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.light.border, backgroundColor: Colors.light.surface },
  choiceCardSelected: { borderColor: Colors.light.primary, backgroundColor: Colors.light.primarySoft },
  choiceIcon: { width: 45, height: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#FFFFFF' },
  choiceEmoji: { fontSize: 23 },
  choiceCopy: { flex: 1, gap: 4 },
  choiceTitle: { color: Colors.light.text, fontSize: 14, fontWeight: '900' },
  choiceText: { color: Colors.light.textSecondary, fontSize: 10.5, lineHeight: 16 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#C8CEC9' },
  radioSelected: { borderWidth: 6, borderColor: Colors.light.primary, backgroundColor: '#FFFFFF' },
  permissionCard: { overflow: 'hidden', borderRadius: 20, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface },
  permissionRow: { minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  permissionCopy: { flex: 1, gap: 4 },
  permissionTitle: { color: Colors.light.text, fontSize: 13.5, fontWeight: '900' },
  permissionText: { color: Colors.light.textSecondary, fontSize: 10.5, lineHeight: 16 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 49, backgroundColor: Colors.light.border },
  privacyNote: { color: Colors.light.textSecondary, fontSize: 10, lineHeight: 16, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  primaryButton: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: Colors.light.primary },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  secondaryButton: { minWidth: 94, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: Colors.light.backgroundElement },
  secondaryButtonText: { color: Colors.light.text, fontSize: 13, fontWeight: '900' },
  accountLink: { color: Colors.light.primary, fontSize: 11, fontWeight: '800', textAlign: 'center' },
});
