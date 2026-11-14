import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen, SectionHeader } from '@/components/app-screen';
import { Colors } from '@/constants/theme';
import { MINI_GAMES } from '@/data/games';

export default function GamesScreen() {
  const router = useRouter();

  return (
    <AppScreen
      eyebrow="休息一下"
      title="小游戏"
      subtitle="做饭等水开、饭后放松，随手玩一局。">
      {MINI_GAMES.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>🎮</Text>
          <Text style={styles.emptyTitle}>游戏正在准备中</Text>
          <Text style={styles.emptyText}>第一批小游戏很快就会出现在这里。</Text>
        </View>
      ) : (
        <View style={styles.section}>
          <SectionHeader title="全部游戏" detail={`${MINI_GAMES.length} 个`} />
          <View style={styles.grid}>
            {MINI_GAMES.map((game) => {
              const href = game.href;
              return (
                <Pressable
                  key={game.id}
                  accessibilityRole="button"
                  accessibilityLabel={game.name}
                  disabled={!href}
                  onPress={() => href && router.push(href)}
                  style={({ pressed }) => [styles.gameCard, !href && styles.disabled, pressed && styles.pressed]}>
                  <Text style={styles.gameEmoji}>{game.emoji}</Text>
                  <Text style={styles.gameName}>{game.name}</Text>
                  <Text style={styles.gameDescription} numberOfLines={2}>{game.description}</Text>
                  {!href ? <Text style={styles.comingSoon}>即将上线</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  emptyCard: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 40,
    paddingHorizontal: 24,
    borderRadius: 27,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { color: Colors.light.text, fontSize: 18, fontWeight: '900' },
  emptyText: { color: Colors.light.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gameCard: {
    flexGrow: 1,
    flexBasis: 150,
    minHeight: 150,
    gap: 6,
    padding: 16,
    borderRadius: 23,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  gameEmoji: { fontSize: 34 },
  gameName: { color: Colors.light.text, fontSize: 15, fontWeight: '900' },
  gameDescription: { color: Colors.light.textSecondary, fontSize: 12, lineHeight: 17 },
  comingSoon: { marginTop: 'auto', color: Colors.light.primary, fontSize: 11, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
