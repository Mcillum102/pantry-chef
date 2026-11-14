import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen, SectionHeader } from '@/components/app-screen';
import { MemoryMatch } from '@/components/games/memory-match';
import { Bobbing } from '@/components/motion';
import { Colors, DisplayText, Shadows } from '@/constants/theme';
import { MINI_GAMES, type MiniGame } from '@/data/games';

/** 内置游戏组件：id 对应 MiniGame.screen */
const GAME_SCREENS: Record<NonNullable<MiniGame['screen']>, (props: { onClose: () => void }) => React.JSX.Element> = {
  memory: MemoryMatch,
};

export default function GamesScreen() {
  const router = useRouter();
  const [activeGame, setActiveGame] = useState<MiniGame['screen'] | null>(null);
  const ActiveGame = activeGame ? GAME_SCREENS[activeGame] : null;

  return (
    <>
    <AppScreen
      eyebrow="休息一下"
      title="小游戏"
      subtitle="做饭等水开、饭后放松，随手玩一局。">
      {MINI_GAMES.length === 0 ? (
        <View style={styles.emptyCard}>
          <Bobbing amplitude={7}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyEmoji}>🎮</Text>
            </View>
          </Bobbing>
          <Text style={[styles.emptyTitle, DisplayText]}>游戏正在准备中</Text>
          <Text style={styles.emptyText}>第一批小游戏很快就会出现在这里。</Text>
        </View>
      ) : (
        <View style={styles.section}>
          <SectionHeader title="全部游戏" detail={`${MINI_GAMES.length} 个`} />
          <View style={styles.grid}>
            {MINI_GAMES.map((game) => {
              const playable = Boolean(game.href || game.screen);
              return (
                <Pressable
                  key={game.id}
                  accessibilityRole="button"
                  accessibilityLabel={playable ? `开始${game.name}` : game.name}
                  disabled={!playable}
                  onPress={() => {
                    if (game.screen) setActiveGame(game.screen);
                    else if (game.href) router.push(game.href);
                  }}
                  style={({ pressed }) => [styles.gameCard, !playable && styles.disabled, pressed && styles.pressed]}>
                  <Text style={styles.gameEmoji}>{game.emoji}</Text>
                  <Text style={styles.gameName}>{game.name}</Text>
                  <Text style={styles.gameDescription} numberOfLines={2}>{game.description}</Text>
                  <Text style={styles.comingSoon}>{playable ? '开始玩 →' : '即将上线'}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </AppScreen>
    <Modal visible={Boolean(ActiveGame)} animationType="slide" onRequestClose={() => setActiveGame(null)}>
      {ActiveGame ? <ActiveGame onClose={() => setActiveGame(null)} /> : null}
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  emptyCard: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 40,
    paddingHorizontal: 24,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    boxShadow: Shadows.card,
  },
  emptyIcon: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', marginBottom: 6, borderRadius: 32, backgroundColor: '#EEE8FB' },
  emptyEmoji: { fontSize: 50 },
  emptyTitle: { color: Colors.light.text, fontSize: 24, lineHeight: 32 },
  emptyText: { color: Colors.light.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gameCard: {
    flexGrow: 1,
    flexBasis: 150,
    minHeight: 160,
    gap: 6,
    padding: 16,
    borderRadius: 23,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  gameEmoji: { fontSize: 34 },
  gameName: { color: Colors.light.text, fontSize: 16, fontWeight: '600' },
  gameDescription: { color: Colors.light.textSecondary, fontSize: 12, lineHeight: 17 },
  comingSoon: { marginTop: 'auto', color: Colors.light.primary, fontSize: 12, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
