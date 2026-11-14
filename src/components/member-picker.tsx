import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useMember } from '@/context/member-context';

/** 第一次打开时选「我是谁」，之后记在这台手机上，可以在「我的」里切换 */
export function MemberPicker() {
  const insets = useSafeAreaInsets();
  const { members, setMemberId } = useMember();

  return (
    <View style={[styles.page, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.header}>
        <Text style={styles.logo}>🌿</Text>
        <Text style={styles.title}>鲜食记</Text>
        <Text style={styles.subtitle}>这台手机是谁在用？</Text>
      </View>
      <View style={styles.choices}>
        {members.map((member) => (
          <Pressable
            key={member.id}
            accessibilityRole="button"
            accessibilityLabel={`我是${member.name}`}
            onPress={() => setMemberId(member.id)}
            style={({ pressed }) => [styles.choice, pressed && styles.pressed]}>
            <Text style={styles.choiceEmoji}>{member.emoji}</Text>
            <Text style={styles.choiceName}>{member.name}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>之后可以在「我的」里切换</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', gap: 36, paddingHorizontal: 24, backgroundColor: '#F7F5EF' },
  header: { alignItems: 'center', gap: 8 },
  logo: { fontSize: 44 },
  title: { color: Colors.light.text, fontSize: 30, fontWeight: '900' },
  subtitle: { color: Colors.light.textSecondary, fontSize: 15 },
  choices: { width: '100%', maxWidth: 420, flexDirection: 'row', gap: 14 },
  choice: { flex: 1, aspectRatio: 0.85, alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: 28, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
  choiceEmoji: { fontSize: 52 },
  choiceName: { color: Colors.light.text, fontSize: 18, fontWeight: '900' },
  hint: { color: Colors.light.textSecondary, fontSize: 12 },
});
