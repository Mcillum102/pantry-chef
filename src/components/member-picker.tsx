import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuroraBackdrop } from '@/components/aurora-backdrop';
import { GradientSurface } from '@/components/gradient-surface';
import { Bobbing, FadeInUp } from '@/components/motion';
import { Colors, DisplayText, Radius, Shadows } from '@/constants/theme';
import { useMember } from '@/context/member-context';

const CARD_TINTS = [
  { background: '#E6F3EA', ring: '#CFE7D8' },
  { background: '#FFEDE0', ring: '#FBD9C2' },
] as const;

/** 第一次打开时选「我是谁」，之后记在这台手机上，可以在「我的」里切换 */
export function MemberPicker() {
  const insets = useSafeAreaInsets();
  const { members, setMemberId } = useMember();

  return (
    <View style={styles.page}>
      <AuroraBackdrop height={520} />
      <View style={[styles.content, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 28 }]}>
        <BrandHeader subtitle="这台手机是谁在用？" />
        <View style={styles.choices}>
          {members.map((member, index) => {
            const tint = CARD_TINTS[index % CARD_TINTS.length];
            return (
              <FadeInUp key={member.id} delay={260 + index * 120} style={styles.choiceWrap}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`我是${member.name}`}
                  onPress={() => setMemberId(member.id)}
                  style={({ pressed }) => [styles.choice, pressed && styles.pressed]}>
                  <Bobbing phase={index * 700} amplitude={5}>
                    <View style={[styles.avatar, { backgroundColor: tint.background, borderColor: tint.ring }]}>
                      <Text style={styles.avatarEmoji}>{member.emoji}</Text>
                    </View>
                  </Bobbing>
                  <Text style={[styles.choiceName, DisplayText]}>{member.name}</Text>
                  <View style={styles.choiceCta}>
                    <Text style={styles.choiceCtaText}>就是我</Text>
                    <Text style={styles.choiceArrow}>→</Text>
                  </View>
                </Pressable>
              </FadeInUp>
            );
          })}
        </View>
        <FadeInUp delay={560}>
          <Text style={styles.hint}>之后可以在「我的」里切换</Text>
        </FadeInUp>
      </View>
    </View>
  );
}

/** 选人页、口令页共用的品牌头部：浮动的叶子图标 + 文楷大标题 */
export function BrandHeader({ title = '鲜食记', subtitle }: { title?: string; subtitle?: string }) {
  return (
    <FadeInUp style={styles.header}>
      <Bobbing amplitude={4} duration={3000}>
        <GradientSurface style={styles.brandMark}>
          <Text style={styles.brandEmoji}>🌿</Text>
        </GradientSurface>
      </Bobbing>
      <Text style={[styles.title, DisplayText]}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </FadeInUp>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.background },
  content: { flex: 1, alignItems: 'center', gap: 34, paddingHorizontal: 22 },
  header: { alignItems: 'center', gap: 10 },
  brandMark: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    boxShadow: Shadows.glow,
  },
  brandEmoji: { fontSize: 38 },
  title: { marginTop: 8, color: Colors.light.text, fontSize: 46, lineHeight: 56, textAlign: 'center' },
  subtitle: { color: Colors.light.textSecondary, fontSize: 16, lineHeight: 22, textAlign: 'center' },
  choices: { width: '100%', maxWidth: 440, flexDirection: 'row', gap: 14 },
  choiceWrap: { flex: 1 },
  choice: {
    alignItems: 'center',
    gap: 12,
    paddingTop: 26,
    paddingBottom: 18,
    paddingHorizontal: 12,
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    boxShadow: Shadows.raised,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  avatar: {
    width: 92,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 46,
    borderWidth: 4,
  },
  avatarEmoji: { fontSize: 50 },
  choiceName: { color: Colors.light.text, fontSize: 24, lineHeight: 30 },
  choiceCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.light.primarySoft,
  },
  choiceCtaText: { color: Colors.light.primary, fontSize: 12, fontWeight: '700' },
  choiceArrow: { color: Colors.light.primary, fontSize: 13, fontWeight: '800' },
  hint: { color: Colors.light.textSecondary, fontSize: 12.5 },
});
