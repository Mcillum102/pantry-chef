import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * 添加 / 编辑表单里的「更多选项」。可选的内容默认收起，只露出一行摘要，保持表单简洁。
 * forceOpen：里面有需要用户处理的内容（比如填错了）时自动展开。
 */
export function MoreOptions({
  label = '更多选项',
  summary,
  defaultOpen = false,
  forceOpen = false,
  children,
}: PropsWithChildren<{ label?: string; summary?: string; defaultOpen?: boolean; forceOpen?: boolean }>) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? `收起${label}` : `展开${label}`}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}>
        <Text style={styles.label}>{label}</Text>
        {!open && summary ? <Text style={styles.summary} numberOfLines={1}>{summary}</Text> : <View style={styles.spacer} />}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.light.textSecondary} />
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  header: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: Colors.light.backgroundElement,
  },
  label: { color: Colors.light.text, fontSize: 15, fontWeight: '500' },
  summary: { flex: 1, color: Colors.light.textSecondary, fontSize: 14, textAlign: 'right' },
  spacer: { flex: 1 },
  body: { gap: 16 },
  pressed: { opacity: 0.75 },
});
