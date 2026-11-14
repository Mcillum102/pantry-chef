import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuroraBackdrop } from '@/components/aurora-backdrop';
import { GradientSurface } from '@/components/gradient-surface';
import { FadeInUp } from '@/components/motion';
import { Colors, DisplayText, Shadows } from '@/constants/theme';
import {
  betterMemoryResult,
  createMemoryDeck,
  isMemoryComplete,
  resolvePair,
  type MemoryBest,
  type MemoryCard,
} from '@/data/memory-game';
import { usePersistentState } from '@/hooks/use-persistent-state';

const COLUMNS = 4;
const PAIRS = 6;

/** 食材记忆翻牌：翻开两张一样的食材就配对成功，步数越少越好 */
export function MemoryMatch({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [deck, setDeck] = useState<MemoryCard[]>(() => createMemoryDeck(PAIRS));
  const [faceUp, setFaceUp] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [finishedSeconds, setFinishedSeconds] = useState<number | null>(null);
  const [best, setBest] = usePersistentState<MemoryBest>('game-memory-best-v1', null);
  const [newRecord, setNewRecord] = useState(false);
  const lockRef = useRef(false);

  const complete = isMemoryComplete(deck);
  const seconds = finishedSeconds ?? (startedAt ? Math.floor((now - startedAt) / 1000) : 0);

  useEffect(() => {
    if (!startedAt || complete) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [complete, startedAt]);

  function flip(index: number) {
    if (lockRef.current || complete || deck[index].matched || faceUp.includes(index)) return;
    if (!startedAt) setStartedAt(Date.now());
    const next = [...faceUp, index];
    setFaceUp(next);
    if (next.length < 2) return;

    setMoves((value) => value + 1);
    const result = resolvePair(deck, next[0], next[1]);
    if (result.matched) {
      setDeck(result.deck);
      setFaceUp([]);
      if (isMemoryComplete(result.deck)) {
        const total = Math.max(1, Math.floor((Date.now() - (startedAt ?? Date.now())) / 1000));
        const finalMoves = moves + 1;
        setFinishedSeconds(total);
        const record = betterMemoryResult(best, finalMoves, total);
        setNewRecord(record);
        if (record) setBest({ moves: finalMoves, seconds: total });
      }
      return;
    }
    // 没配对：给一点时间看清楚再翻回去
    lockRef.current = true;
    setTimeout(() => {
      setFaceUp([]);
      lockRef.current = false;
    }, 750);
  }

  function restart() {
    setDeck(createMemoryDeck(PAIRS));
    setFaceUp([]);
    setMoves(0);
    setStartedAt(null);
    setFinishedSeconds(null);
    setNewRecord(false);
    lockRef.current = false;
  }

  const gap = 10;
  const boardWidth = Math.min(width - 32, 440);
  const cardSize = Math.floor((boardWidth - gap * (COLUMNS - 1)) / COLUMNS);

  return (
    <View style={styles.page}>
      <AuroraBackdrop height={420} />
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭游戏"
          onPress={onClose}
          hitSlop={6}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons name="close" size={22} color={Colors.light.text} />
        </Pressable>
        <Text style={[styles.title, DisplayText]}>食材记忆翻牌</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="重新开始"
          onPress={restart}
          hitSlop={6}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons name="refresh" size={20} color={Colors.light.text} />
        </Pressable>
      </View>

      <View style={styles.stats}>
        <Stat label="步数" value={String(moves)} />
        <Stat label="用时" value={`${seconds}秒`} />
        <Stat label="最好" value={best ? `${best.moves}步` : '—'} />
      </View>

      <View style={[styles.board, { width: boardWidth, gap }]}>
        {deck.map((card, index) => (
          <FlipCard
            key={`${card.id}-${card.food}`}
            card={card}
            size={cardSize}
            open={card.matched || faceUp.includes(index)}
            onPress={() => flip(index)}
          />
        ))}
      </View>

      <Text style={styles.hint}>翻开两张一样的食材就能配对，步数越少越厉害。</Text>

      {complete ? (
        <View style={styles.winOverlay}>
          <FadeInUp style={styles.winCard}>
            <Text style={styles.winEmoji}>{newRecord ? '🏆' : '🎉'}</Text>
            <Text style={[styles.winTitle, DisplayText]}>{newRecord ? '新纪录！' : '全部配对成功'}</Text>
            <Text style={styles.winText}>{`用了 ${moves} 步、${finishedSeconds ?? seconds} 秒`}</Text>
            <Pressable accessibilityRole="button" onPress={restart} style={({ pressed }) => [styles.winButtonWrap, pressed && styles.pressed]}>
              <GradientSurface style={styles.winButton}>
                <Text style={styles.winButtonText}>再来一局</Text>
              </GradientSurface>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.winSecondary, pressed && styles.pressed]}>
              <Text style={styles.winSecondaryText}>回到游戏列表</Text>
            </Pressable>
          </FadeInUp>
        </View>
      ) : null}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function FlipCard({ card, size, open, onPress }: { card: MemoryCard; size: number; open: boolean; onPress: () => void }) {
  const progress = useSharedValue(open ? 1 : 0);
  const pop = useSharedValue(1);

  useEffect(() => {
    progress.set(withTiming(open ? 1 : 0, { duration: 260, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }));
  }, [open, progress]);

  useEffect(() => {
    if (!card.matched) return;
    pop.set(1.12);
    pop.set(withSpring(1, { damping: 8, stiffness: 220, reduceMotion: ReduceMotion.System }));
  }, [card.matched, pop]);

  const backStyle = useAnimatedStyle(() => ({
    opacity: progress.value < 0.5 ? 1 : 0,
    transform: [{ perspective: 600 }, { rotateY: `${interpolate(progress.value, [0, 1], [0, 180])}deg` }, { scale: pop.value }],
  }));
  const frontStyle = useAnimatedStyle(() => ({
    opacity: progress.value >= 0.5 ? 1 : 0,
    transform: [{ perspective: 600 }, { rotateY: `${interpolate(progress.value, [0, 1], [180, 360])}deg` }, { scale: pop.value }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={open ? `已翻开：${card.food}` : '翻开这张牌'}
      accessibilityState={{ disabled: card.matched }}
      onPress={onPress}
      style={{ width: size, height: size * 1.2 }}>
      <Animated.View style={[styles.cardFace, styles.cardBack, backStyle]}>
        <Text style={styles.cardBackMark}>🌿</Text>
      </Animated.View>
      <Animated.View style={[styles.cardFace, styles.cardFront, card.matched && styles.cardMatched, frontStyle]}>
        <Text style={[styles.cardFood, { fontSize: Math.round(size * 0.46) }]}>{card.food}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', backgroundColor: Colors.light.background },
  header: { width: '100%', maxWidth: 480, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(255, 255, 255, 0.85)', boxShadow: Shadows.card },
  title: { color: Colors.light.text, fontSize: 22 },
  stats: { width: '100%', maxWidth: 440, flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 8, marginBottom: 18 },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 10, borderRadius: 18, backgroundColor: 'rgba(255, 255, 255, 0.85)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.95)' },
  statValue: { color: Colors.light.text, fontSize: 20, fontWeight: '600' },
  statLabel: { color: Colors.light.textSecondary, fontSize: 12 },
  board: { flexDirection: 'row', flexWrap: 'wrap' },
  cardFace: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backfaceVisibility: 'hidden' },
  cardBack: { backgroundColor: Colors.light.primary, boxShadow: '0 6px 14px rgba(46, 107, 79, 0.25)' },
  cardBackMark: { fontSize: 22, opacity: 0.85 },
  cardFront: { backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border, boxShadow: Shadows.card },
  cardMatched: { backgroundColor: Colors.light.primarySoft, borderColor: '#BFE0CB' },
  cardFood: { textAlign: 'center' },
  hint: { marginTop: 18, paddingHorizontal: 24, color: Colors.light.textSecondary, fontSize: 13, textAlign: 'center' },
  winOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(22, 34, 28, 0.35)' },
  winCard: { width: '100%', maxWidth: 340, alignItems: 'center', gap: 8, padding: 24, borderRadius: 28, backgroundColor: Colors.light.surface, boxShadow: Shadows.raised },
  winEmoji: { fontSize: 52 },
  winTitle: { color: Colors.light.text, fontSize: 26 },
  winText: { color: Colors.light.textSecondary, fontSize: 15, marginBottom: 8 },
  winButtonWrap: { width: '100%', borderRadius: 18, boxShadow: Shadows.glow },
  winButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  winButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  winSecondary: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  winSecondaryText: { color: Colors.light.primary, fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
});
