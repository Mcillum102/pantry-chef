import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCookingSession } from '@/context/cooking-session-context';
import { useLanguage } from '@/context/language-context';

function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function FloatingCookingTimer() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language, text } = useLanguage();
  const { session, requestCookingResume } = useCookingSession();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!session?.isMinimized || session.timerDeadline === null) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [session?.isMinimized, session?.timerDeadline]);

  if (!session?.isMinimized) return null;

  const timerDeadline = session.timerDeadline;
  const hasTimer = timerDeadline !== null;
  const remaining = timerDeadline === null
    ? 0
    : Math.max(0, Math.ceil((timerDeadline - now) / 1000));
  const timerDone = hasTimer && remaining === 0;
  const recipeName = language === 'zh' ? session.recipeName : session.recipeNameEn;
  const activeStep = Number(session.timerStepIndex ?? session.stepIndex) + 1;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hasTimer
        ? text(
            `继续烹饪${recipeName}，倒计时${timerDone ? '已完成' : formatCountdown(remaining)}`,
            `Resume cooking ${recipeName}, timer ${timerDone ? 'finished' : formatCountdown(remaining)}`
          )
        : text(
            `继续烹饪${recipeName}，当前第 ${activeStep} 步`,
            `Resume cooking ${recipeName}, currently on step ${activeStep}`
          )}
      onPress={() => {
        requestCookingResume();
        router.push('/recipes');
      }}
      style={({ pressed }) => [
        styles.floatingTimer,
        { bottom: Platform.OS === 'web' ? 92 : Math.max(insets.bottom, 10) + 66 },
        timerDone && styles.floatingTimerDone,
        pressed && styles.floatingTimerPressed,
      ]}>
      <View style={[styles.timerIcon, timerDone && styles.timerIconDone]}>
        <Text style={styles.timerEmoji}>{timerDone ? '✓' : session.recipeEmoji}</Text>
      </View>
      <View style={styles.timerCopy}>
        <Text style={styles.timerEyebrow} numberOfLines={1}>
          {timerDone
            ? text('计时完成 · 点击继续', 'Timer done · Tap to resume')
            : hasTimer
              ? text(`第 ${activeStep} 步计时中`, `Timing step ${activeStep}`)
              : text('烹饪进行中 · 点击继续', 'Cooking in progress · Tap to resume')}
        </Text>
        <Text style={styles.timerRecipe} numberOfLines={1}>{recipeName}</Text>
      </View>
      <Text style={[styles.timerValue, timerDone && styles.timerValueDone]}>
        {timerDone
          ? text('完成', 'Done')
          : hasTimer
            ? formatCountdown(remaining)
            : text(`第 ${activeStep} 步`, `Step ${activeStep}`)}
      </Text>
      <Text style={styles.timerChevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  floatingTimer: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 80,
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#FFFFFFB8',
    backgroundColor: '#173D2FF2',
    shadowColor: '#102A20',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 12,
  },
  floatingTimerDone: { backgroundColor: '#3D7F68F2' },
  floatingTimerPressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  timerIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#FFFFFF1F' },
  timerIconDone: { backgroundColor: '#FFFFFF2B' },
  timerEmoji: { fontSize: 24 },
  timerCopy: { flex: 1, gap: 3 },
  timerEyebrow: { color: '#CDE5D6', fontSize: 9.5, fontWeight: '900' },
  timerRecipe: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' },
  timerValue: { color: '#FFFFFF', fontSize: 20, fontVariant: ['tabular-nums'], fontWeight: '900' },
  timerValueDone: { fontSize: 13 },
  timerChevron: { color: '#FFFFFFB8', fontSize: 24, lineHeight: 26 },
});
