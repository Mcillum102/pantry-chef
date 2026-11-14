import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuroraBackdrop } from '@/components/aurora-backdrop';
import { GradientSurface } from '@/components/gradient-surface';
import { BrandHeader } from '@/components/member-picker';
import { FadeInUp, Shake, type ShakeHandle } from '@/components/motion';
import { Colors, Radius, Shadows } from '@/constants/theme';
import { useCloudSync } from '@/context/cloud-sync-context';
import { useMember } from '@/context/member-context';
import {
  lockSecondsLeft,
  MAX_PASSCODE_ATTEMPTS,
  recordPasscodeFailure,
  type PasscodeAttempts,
} from '@/data/passcode-utils';
import { usePersistentState } from '@/hooks/use-persistent-state';

/**
 * 每台手机第一次连接时输入一次「厨房口令」（共享账号的密码）。
 * 口令不保存在代码或本机设置里；登录成功后由 Supabase 在本机保持登录态。
 */
export function KitchenPasscode() {
  const insets = useSafeAreaInsets();
  const { unlockKitchen } = useCloudSync();
  const { member } = useMember();
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const shakeRef = useRef<ShakeHandle>(null);
  // 本机记录连续输错次数；输错太多次暂时锁定，防止被人反复试
  const [attempts, setAttempts] = usePersistentState<PasscodeAttempts>('passcode-attempts-v1', { failures: 0, lockedUntil: null });
  const [now, setNow] = useState(() => Date.now());
  const lockedSeconds = lockSecondsLeft(attempts, now);
  useEffect(() => {
    if (!attempts.lockedUntil) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [attempts.lockedUntil]);

  async function submit() {
    if (busy || !passcode || lockedSeconds > 0) return;
    setBusy(true);
    setError(null);
    try {
      await unlockKitchen(passcode);
      setAttempts({ failures: 0, lockedUntil: null });
    } catch (reason) {
      const wrong = reason instanceof Error && reason.message === 'wrong-passcode';
      if (wrong) {
        const next = recordPasscodeFailure(attempts, Date.now());
        setAttempts(next);
        setNow(Date.now());
        setError(next.lockedUntil
          ? `连续输错 ${MAX_PASSCODE_ATTEMPTS} 次，请稍后再试。`
          : `口令不对，还可以再试 ${MAX_PASSCODE_ATTEMPTS - next.failures} 次。`);
      } else {
        setError('连不上服务器，请检查网络后再试。');
      }
      shakeRef.current?.shake();
      if (wrong) setPasscode('');
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || !passcode || lockedSeconds > 0;

  return (
    <View style={styles.page}>
      <AuroraBackdrop height={520} />
      <View style={[styles.content, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 24 }]}>
        <BrandHeader
          title={member ? `欢迎，${member.name}` : '欢迎回来'}
          subtitle="输入厨房口令，每台手机只需要一次"
        />
        <FadeInUp delay={220} style={styles.formWrap}>
          <Shake ref={shakeRef} style={styles.form}>
            <View style={[styles.inputShell, focused && styles.inputShellFocused, error && styles.inputShellError]}>
              <Text style={styles.inputIcon}>🔑</Text>
              <TextInput
                accessibilityLabel="厨房口令"
                autoCapitalize="none"
                autoComplete="current-password"
                autoCorrect={false}
                autoFocus
                editable={!busy}
                onBlur={() => setFocused(false)}
                onChangeText={(next) => {
                  setPasscode(next);
                  if (error) setError(null);
                }}
                onFocus={() => setFocused(true)}
                onSubmitEditing={() => void submit()}
                placeholder="厨房口令"
                placeholderTextColor="#A2A79F"
                returnKeyType="go"
                secureTextEntry
                style={styles.input}
                textContentType="password"
                value={passcode}
              />
            </View>
            {lockedSeconds > 0 ? (
              <Text style={styles.error}>{`已暂时锁定，${lockedSeconds} 秒后可以再试`}</Text>
            ) : error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => void submit()}
              style={({ pressed }) => [styles.buttonWrap, disabled && styles.disabled, pressed && styles.pressed]}>
              <GradientSurface sheen={!disabled} style={styles.button}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>进入厨房</Text>}
              </GradientSurface>
            </Pressable>
            <Text style={styles.forgotHint}>
              忘了口令？在另一台已经登录的手机上打开「我的 → 同步与身份 → 修改厨房口令」重新设置。
            </Text>
          </Shake>
        </FadeInUp>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.background },
  content: { flex: 1, alignItems: 'center', gap: 34, paddingHorizontal: 22 },
  formWrap: { width: '100%', maxWidth: 400 },
  form: { gap: 12 },
  inputShell: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    backgroundColor: 'rgba(255, 255, 255, 0.86)',
    boxShadow: Shadows.card,
  },
  inputShellFocused: { borderColor: '#9FCDB2', boxShadow: '0 0 0 4px rgba(46, 107, 79, 0.10)' },
  inputShellError: { borderColor: '#E3A497' },
  inputIcon: { fontSize: 18 },
  input: { flex: 1, minHeight: 54, color: Colors.light.text, fontSize: 17, outlineStyle: 'none' } as never,
  error: { color: Colors.light.danger, fontSize: 13, fontWeight: '500', textAlign: 'center' },
  buttonWrap: { borderRadius: Radius.lg, boxShadow: Shadows.glow },
  button: { minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.lg },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', letterSpacing: 1 },
  disabled: { opacity: 0.45 },
  forgotHint: { marginTop: 6, color: Colors.light.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
