import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useCloudSync } from '@/context/cloud-sync-context';
import { useMember } from '@/context/member-context';

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

  async function submit() {
    if (busy || !passcode) return;
    setBusy(true);
    setError(null);
    try {
      await unlockKitchen(passcode);
    } catch (reason) {
      const wrong = reason instanceof Error && reason.message === 'wrong-passcode';
      setError(wrong ? '口令不对，再试一次。' : '连不上服务器，请检查网络后再试。');
      if (wrong) setPasscode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.header}>
        <Text style={styles.logo}>🔐</Text>
        <Text style={styles.title}>{member ? `${member.name}，输入厨房口令` : '输入厨房口令'}</Text>
        <Text style={styles.subtitle}>每台手机只需要输入一次</Text>
      </View>
      <View style={styles.form}>
        <TextInput
          accessibilityLabel="厨房口令"
          autoCapitalize="none"
          autoComplete="current-password"
          autoCorrect={false}
          autoFocus
          editable={!busy}
          onChangeText={setPasscode}
          onSubmitEditing={() => void submit()}
          placeholder="厨房口令"
          placeholderTextColor={Colors.light.textSecondary}
          returnKeyType="go"
          secureTextEntry
          style={styles.input}
          textContentType="password"
          value={passcode}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={busy || !passcode}
          onPress={() => void submit()}
          style={({ pressed }) => [styles.button, (busy || !passcode) && styles.disabled, pressed && styles.pressed]}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>进入厨房</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', gap: 32, paddingHorizontal: 24, backgroundColor: '#F7F5EF' },
  header: { alignItems: 'center', gap: 8 },
  logo: { fontSize: 44 },
  title: { color: Colors.light.text, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: Colors.light.textSecondary, fontSize: 14 },
  form: { width: '100%', maxWidth: 380, gap: 12 },
  input: { minHeight: 54, paddingHorizontal: 18, borderRadius: 18, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface, color: Colors.light.text, fontSize: 16 },
  error: { color: '#B5462F', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  button: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: Colors.light.primary },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
