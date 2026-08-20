import { useEffect, useRef } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { AppLanguage } from '@/context/language-context';

type RecipeCompletionCelebrationProps = {
  emoji: string;
  recipeName: string;
  language: AppLanguage;
  onComplete: () => void;
};

export function RecipeCompletionCelebration({
  emoji,
  recipeName,
  language,
  onComplete,
}: RecipeCompletionCelebrationProps) {
  const backdrop = useSharedValue(0);
  const scene = useSharedValue(0);
  const lid = useSharedValue(0);
  const dish = useSharedValue(0);
  const steam = useSharedValue(0);
  const confetti = useSharedValue(0);
  const success = useSharedValue(0);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  function finishCelebration() {
    onCompleteRef.current();
  }

  useEffect(() => {
    backdrop.set(
      withTiming(1, {
        duration: 180,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.System,
      })
    );
    scene.set(withSpring(1, { damping: 13, stiffness: 145, reduceMotion: ReduceMotion.System }));
    lid.set(
      withDelay(
        380,
        withTiming(1, {
          duration: 620,
          easing: Easing.out(Easing.cubic),
          reduceMotion: ReduceMotion.System,
        })
      )
    );
    dish.set(
      withDelay(
        660,
        withSpring(1, { damping: 8, stiffness: 175, reduceMotion: ReduceMotion.System })
      )
    );
    steam.set(
      withDelay(
        910,
        withSequence(
          withTiming(1, { duration: 430, reduceMotion: ReduceMotion.System }),
          withDelay(620, withTiming(0.18, { duration: 350, reduceMotion: ReduceMotion.System }))
        )
      )
    );
    confetti.set(
      withDelay(
        1050,
        withSequence(
          withSpring(1, { damping: 8, stiffness: 190, reduceMotion: ReduceMotion.System }),
          withDelay(520, withTiming(0, { duration: 240, reduceMotion: ReduceMotion.System }))
        )
      )
    );
    success.set(
      withDelay(
        1280,
        withSpring(1, { damping: 10, stiffness: 165, reduceMotion: ReduceMotion.System })
      )
    );

    const exitTimer = setTimeout(() => {
      backdrop.set(
        withTiming(
          0,
          { duration: 260, reduceMotion: ReduceMotion.System },
          (finished) => {
            if (finished) runOnJS(finishCelebration)();
          }
        )
      );
    }, 2650);

    return () => clearTimeout(exitTimer);
  }, [backdrop, confetti, dish, lid, scene, steam, success]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const sceneStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scene.value, [0, 0.2, 1], [0, 1, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(scene.value, [0, 1], [24, 0], Extrapolation.CLAMP) },
      { scale: interpolate(scene.value, [0, 1], [0.74, 1], Extrapolation.CLAMP) },
    ],
  }));
  const lidStyle = useAnimatedStyle(() => ({
    opacity: interpolate(lid.value, [0, 0.86, 1], [1, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(lid.value, [0, 1], [0, 78], Extrapolation.CLAMP) },
      { translateY: interpolate(lid.value, [0, 1], [0, -88], Extrapolation.CLAMP) },
      { rotate: `${interpolate(lid.value, [0, 1], [0, 18], Extrapolation.CLAMP)}deg` },
      { scale: interpolate(lid.value, [0, 1], [1, 0.82], Extrapolation.CLAMP) },
    ],
  }));
  const dishStyle = useAnimatedStyle(() => ({
    opacity: dish.value,
    transform: [
      { translateY: interpolate(dish.value, [0, 1], [30, 0], Extrapolation.CLAMP) },
      { scale: interpolate(dish.value, [0, 0.72, 1], [0.45, 1.15, 1], Extrapolation.CLAMP) },
      { rotate: `${interpolate(dish.value, [0, 1], [-8, 0], Extrapolation.CLAMP)}deg` },
    ],
  }));
  const steamStyle = useAnimatedStyle(() => ({
    opacity: steam.value,
    transform: [
      { translateY: interpolate(steam.value, [0, 1], [16, -13], Extrapolation.CLAMP) },
      { scale: interpolate(steam.value, [0, 1], [0.7, 1], Extrapolation.CLAMP) },
    ],
  }));
  const confettiStyle = useAnimatedStyle(() => ({
    opacity: confetti.value,
    transform: [
      { rotate: `${interpolate(confetti.value, [0, 1], [-25, 18], Extrapolation.CLAMP)}deg` },
      { scale: interpolate(confetti.value, [0, 1], [0.2, 1], Extrapolation.CLAMP) },
    ],
  }));
  const successStyle = useAnimatedStyle(() => ({
    opacity: success.value,
    transform: [
      { translateY: interpolate(success.value, [0, 1], [13, 0], Extrapolation.CLAMP) },
      { scale: interpolate(success.value, [0, 1], [0.72, 1], Extrapolation.CLAMP) },
    ],
  }));

  const title = language === 'zh' ? `“${recipeName}”完成啦！` : `“${recipeName}” is ready!`;
  const subtitle = language === 'zh'
    ? '库存和今日饮食记录已经同步更新'
    : 'Inventory and today’s meal log are updated';

  return (
    <Modal transparent animationType="none" visible statusBarTranslucent>
      <Animated.View
        accessibilityViewIsModal
        accessibilityLiveRegion="polite"
        style={[styles.backdrop, backdropStyle]}>
        <Animated.View style={[styles.scene, sceneStyle]}>
          <Animated.Text style={[styles.confetti, styles.confettiOne, confettiStyle]}>✦</Animated.Text>
          <Animated.Text style={[styles.confetti, styles.confettiTwo, confettiStyle]}>●</Animated.Text>
          <Animated.Text style={[styles.confetti, styles.confettiThree, confettiStyle]}>★</Animated.Text>
          <Animated.Text style={[styles.confetti, styles.confettiFour, confettiStyle]}>◆</Animated.Text>
          <Animated.Text style={[styles.confetti, styles.confettiFive, confettiStyle]}>♡</Animated.Text>

          <View style={styles.stage}>
            <Animated.View style={[styles.steamRow, steamStyle]}>
              <Text style={styles.steam}>⌁</Text>
              <Text style={[styles.steam, styles.steamMiddle]}>⌁</Text>
              <Text style={styles.steam}>⌁</Text>
            </Animated.View>

            <Animated.View style={[styles.dishWrap, dishStyle]}>
              <View style={styles.dishGlow} />
              <Text style={styles.dishEmoji}>{emoji}</Text>
            </Animated.View>

            <View style={styles.plateBack} />
            <View style={styles.plateFront}>
              <Text style={styles.plateFace}>• ᴗ •</Text>
              <View style={styles.plateBlush} />
            </View>

            <Animated.View style={[styles.lid, lidStyle]}>
              <View style={styles.lidHandle} />
              <View style={styles.lidHighlight} />
            </Animated.View>
          </View>

          <Animated.View style={[styles.successPill, successStyle]}>
            <View style={styles.checkCircle}>
              <Text style={styles.checkText}>✓</Text>
            </View>
            <View style={styles.successCopy}>
              <Text style={styles.successTitle} numberOfLines={1}>{title}</Text>
              <Text style={styles.successText}>{subtitle}</Text>
            </View>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, backgroundColor: '#17362DBD' },
  scene: { width: '100%', maxWidth: 390, alignItems: 'center' },
  stage: { width: 300, height: 260, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 4 },
  steamRow: { position: 'absolute', top: 31, flexDirection: 'row', gap: 13, zIndex: 4 },
  steam: { color: '#FFF7DF', fontSize: 41, fontWeight: '900', transform: [{ rotate: '90deg' }] },
  steamMiddle: { marginTop: -9 },
  dishWrap: { position: 'absolute', top: 76, zIndex: 3, width: 122, height: 104, alignItems: 'center', justifyContent: 'center' },
  dishGlow: { position: 'absolute', width: 118, height: 92, borderRadius: 52, backgroundColor: '#FFF2B542' },
  dishEmoji: { fontSize: 74, textShadowColor: '#FFF1A8', textShadowRadius: 16 },
  plateBack: { position: 'absolute', bottom: 44, width: 226, height: 68, borderRadius: 50, backgroundColor: '#DCEDE3', borderWidth: 6, borderColor: '#F8FFF9' },
  plateFront: { position: 'absolute', bottom: 24, width: 238, height: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 50, backgroundColor: '#8FC8AA', borderWidth: 6, borderColor: '#DDF2E5', shadowColor: '#123A2C', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.25, shadowRadius: 17, elevation: 8 },
  plateFace: { color: '#315F49', fontSize: 20, fontWeight: '900' },
  plateBlush: { width: 65, height: 7, borderLeftWidth: 13, borderRightWidth: 13, borderColor: '#F1A19F', opacity: 0.85 },
  lid: { position: 'absolute', bottom: 73, zIndex: 5, width: 218, height: 105, borderTopLeftRadius: 110, borderTopRightRadius: 110, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, backgroundColor: '#B9D9C7', borderWidth: 6, borderColor: '#E8F6ED', shadowColor: '#153C2F', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.21, shadowRadius: 12, elevation: 7 },
  lidHandle: { position: 'absolute', top: -22, alignSelf: 'center', width: 54, height: 27, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: '#5B9978', borderWidth: 5, borderColor: '#DDF0E4' },
  lidHighlight: { position: 'absolute', top: 20, left: 38, width: 72, height: 11, borderRadius: 7, backgroundColor: '#FFFFFF63', transform: [{ rotate: '-16deg' }] },
  confetti: { position: 'absolute', zIndex: 8, color: '#FFE38A', fontSize: 31, textShadowColor: '#FFF2B3', textShadowRadius: 10 },
  confettiOne: { left: 20, top: 76 },
  confettiTwo: { left: 58, top: 12, color: '#F39CA7', fontSize: 20 },
  confettiThree: { right: 38, top: 46 },
  confettiFour: { right: 10, top: 130, color: '#8DD2C0', fontSize: 22 },
  confettiFive: { left: 8, top: 164, color: '#FFD0D8', fontSize: 35 },
  successPill: { width: '100%', minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 24, backgroundColor: '#FFFDF8', shadowColor: '#102C23', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.24, shadowRadius: 20, elevation: 10 },
  checkCircle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#4A9876' },
  checkText: { color: '#FFFFFF', fontSize: 26, fontWeight: '800' },
  successCopy: { flex: 1, gap: 2 },
  successTitle: { color: '#183E30', fontSize: 14, fontWeight: '900' },
  successText: { color: '#6D7C73', fontSize: 10.5, lineHeight: 16, fontWeight: '700' },
});
