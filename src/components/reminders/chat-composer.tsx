import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, MaxContentWidth } from '@/constants/theme';
import { useKeyboardInsets } from '@/hooks/use-keyboard-insets';

/** 底部 Tab 栏的高度（含边框），见 app-tab-bar.tsx 的 innerContainer */
const TAB_BAR_HEIGHT = 68;
const GAP = 8;
/** 输入栏本身大约多高，页面底部要多留这么多空白 */
export const CHAT_COMPOSER_SPACE = 64;

/**
 * 首页底部的输入栏（类似微信）：直接打字发给对方；点左边的闹钟把这句话记成提醒。
 * 平时停在 Tab 栏上方，键盘弹出时贴着键盘。
 */
export function ChatComposer({
  placeholder,
  onSend,
  onMakeReminder,
}: {
  placeholder: string;
  onSend: (message: string) => Promise<boolean>;
  /** 用输入框里的文字新建提醒（文字为空时打开空白的新提醒） */
  onMakeReminder: (text: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInsets();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const tabBarBottom = Platform.OS === 'web' ? Math.max(insets.bottom, 8) : Math.max(insets.bottom - 6, 8);
  const keyboardOpen = keyboard.bottom > 0;
  const bottom = keyboardOpen ? keyboard.bottom + GAP : tabBarBottom + TAB_BAR_HEIGHT + GAP;
  const canSend = message.trim().length > 0 && !sending;

  async function send() {
    if (!canSend) return;
    setSending(true);
    const ok = await onSend(message.trim());
    setSending(false);
    if (ok) setMessage('');
  }

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={message.trim() ? `把「${message.trim()}」设为提醒` : '新提醒'}
          hitSlop={4}
          onPress={() => {
            onMakeReminder(message.trim());
            setMessage('');
          }}
          style={({ pressed }) => [styles.reminderButton, pressed && styles.pressed]}>
          <Ionicons name="alarm-outline" size={22} color={Colors.light.primary} />
        </Pressable>
        <TextInput
          accessibilityLabel="输入消息"
          value={message}
          onChangeText={setMessage}
          placeholder={placeholder}
          placeholderTextColor="#9AA097"
          maxLength={200}
          returnKeyType="send"
          enterKeyHint="send"
          blurOnSubmit={false}
          onSubmitEditing={() => void send()}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="发送"
          disabled={!canSend}
          onPress={() => void send()}
          style={({ pressed }) => [styles.sendButton, !canSend && styles.sendDisabled, pressed && styles.pressed]}>
          <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, zIndex: 30, alignItems: 'center', paddingHorizontal: 14 },
  bar: {
    width: '100%',
    maxWidth: Math.min(MaxContentWidth, 430),
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 5,
    borderRadius: 27,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderWidth: 1,
    borderColor: Colors.light.border,
    boxShadow: '0 8px 26px rgba(44, 55, 48, 0.14)',
  },
  reminderButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: Colors.light.primarySoft },
  input: { flex: 1, minHeight: 42, paddingHorizontal: 8, color: Colors.light.text, fontSize: 16 },
  sendButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: Colors.light.primary },
  sendDisabled: { backgroundColor: '#C9CEC7' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
});
