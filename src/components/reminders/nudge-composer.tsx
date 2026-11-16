import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientSurface } from '@/components/gradient-surface';
import { Colors, Shadows } from '@/constants/theme';
import type { KitchenMember } from '@/constants/members';

const QUICK_PHRASES = [
  '有件事还没做哦',
  '记得倒垃圾',
  '冰箱里有东西快过期了',
  '下班顺路买点菜',
  '今天谁做饭？',
  '早点回来呀',
] as const;

/** 给对方发一条「催一下」消息，对方手机会立刻弹出提示 */
export function NudgeComposer({
  visible,
  to,
  onClose,
  onSend,
}: {
  visible: boolean;
  to: KitchenMember | null;
  onClose: () => void;
  onSend: (message: string) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setMessage('');
      setError(null);
    }
  }, [visible]);

  async function send(text: string) {
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(text.trim());
      onClose();
    } catch {
      setError('没发出去，请检查网络后再试。');
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭" style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.avatar}><Text style={styles.avatarEmoji}>{to?.emoji ?? '👋'}</Text></View>
            <View style={styles.headerCopy}>
              <Text style={styles.heading}>{`给${to?.name ?? '对方'}发消息`}</Text>
              <Text style={styles.subheading}>对方的手机会马上收到提示</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="关闭" hitSlop={6} onPress={onClose} style={styles.close}>
              <Ionicons name="close" size={20} color={Colors.light.text} />
            </Pressable>
          </View>

          <View style={styles.phrases}>
            {QUICK_PHRASES.map((phrase) => (
              <Pressable key={phrase} accessibilityRole="button" accessibilityLabel={`发送：${phrase}`} disabled={sending} onPress={() => void send(phrase)} style={({ pressed }) => [styles.phrase, pressed && styles.pressed]}>
                <Text style={styles.phraseText}>{phrase}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.inputRow}>
            <TextInput
              accessibilityLabel="消息内容"
              value={message}
              onChangeText={setMessage}
              placeholder="或者自己写一句…"
              placeholderTextColor="#A2A79F"
              maxLength={200}
              returnKeyType="send"
              onSubmitEditing={() => void send(message)}
              style={styles.input}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="发送" disabled={!message.trim() || sending} onPress={() => void send(message)} style={({ pressed }) => [styles.sendWrap, (!message.trim() || sending) && styles.disabled, pressed && styles.pressed]}>
              <GradientSurface sheen={false} style={styles.send}>
                <Ionicons name="paper-plane" size={20} color="#FFFFFF" />
              </GradientSurface>
            </Pressable>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: 'rgba(22, 34, 28, 0.32)' },
  sheet: { width: '100%', maxWidth: 560, gap: 16, paddingTop: 10, paddingHorizontal: 18, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: Colors.light.surface, boxShadow: '0 -8px 30px rgba(23, 61, 47, 0.16)' },
  handle: { width: 42, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: Colors.light.border },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: '#FFEDE0' },
  avatarEmoji: { fontSize: 26 },
  headerCopy: { flex: 1, gap: 2 },
  heading: { color: Colors.light.text, fontSize: 19, fontWeight: '600' },
  subheading: { color: Colors.light.textSecondary, fontSize: 13 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: Colors.light.backgroundElement },
  phrases: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  phrase: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 21, backgroundColor: '#FFF4E8', borderWidth: 1, borderColor: '#F6DDC2' },
  phraseText: { color: '#8F502E', fontSize: 14, fontWeight: '500' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, minHeight: 52, paddingHorizontal: 16, borderRadius: 26, backgroundColor: Colors.light.background, borderWidth: 1, borderColor: Colors.light.border, color: Colors.light.text, fontSize: 16 },
  sendWrap: { borderRadius: 26, boxShadow: Shadows.glow },
  send: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 26 },
  error: { color: Colors.light.danger, fontSize: 13, fontWeight: '500' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
});
