import { useEffect } from 'react';
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

type RecipeShelfCelebrationProps = {
  emoji: string;
  recipeName: string;
  language: AppLanguage;
  onComplete: () => void;
};

export function RecipeShelfCelebration({
  emoji,
  recipeName,
  language,
  onComplete,
}: RecipeShelfCelebrationProps) {
  const backdrop = useSharedValue(0);
  const scene = useSharedValue(0);
  const book = useSharedValue(0);
  const shelfBounce = useSharedValue(0);
  const sparkle = useSharedValue(0);
  const success = useSharedValue(0);

  useEffect(() => {
    backdrop.set(
      withTiming(1, {
        duration: 180,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.System,
      })
    );
    scene.set(withSpring(1, { damping: 13, stiffness: 135, reduceMotion: ReduceMotion.System }));
    book.set(
      withDelay(
        420,
        withTiming(1, {
          duration: 820,
          easing: Easing.inOut(Easing.cubic),
          reduceMotion: ReduceMotion.System,
        })
      )
    );
    shelfBounce.set(
      withDelay(
        1190,
        withSequence(
          withTiming(1, { duration: 110, reduceMotion: ReduceMotion.System }),
          withTiming(-0.55, { duration: 100, reduceMotion: ReduceMotion.System }),
          withSpring(0, { damping: 8, stiffness: 185, reduceMotion: ReduceMotion.System })
        )
      )
    );
    sparkle.set(
      withDelay(
        1330,
        withSequence(
          withSpring(1, { damping: 8, stiffness: 180, reduceMotion: ReduceMotion.System }),
          withDelay(480, withTiming(0, { duration: 220, reduceMotion: ReduceMotion.System }))
        )
      )
    );
    success.set(
      withDelay(
        1460,
        withSpring(1, { damping: 10, stiffness: 160, reduceMotion: ReduceMotion.System })
      )
    );

    const exitTimer = setTimeout(() => {
      backdrop.set(
        withTiming(
          0,
          { duration: 260, reduceMotion: ReduceMotion.System },
          (finished) => {
            if (finished) runOnJS(onComplete)();
          }
        )
      );
    }, 2550);

    return () => clearTimeout(exitTimer);
  }, [backdrop, book, onComplete, scene, shelfBounce, sparkle, success]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const sceneStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scene.value, [0, 0.2, 1], [0, 1, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(scene.value, [0, 1], [28, 0], Extrapolation.CLAMP) },
      { scale: interpolate(scene.value, [0, 1], [0.72, 1], Extrapolation.CLAMP) },
    ],
  }));
  const bookStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(book.value, [0, 1], [96, 0], Extrapolation.CLAMP) },
      { translateY: interpolate(book.value, [0, 1], [-138, 0], Extrapolation.CLAMP) },
      { rotate: `${interpolate(book.value, [0, 0.72, 1], [18, -7, 0], Extrapolation.CLAMP)}deg` },
      { scale: interpolate(book.value, [0, 0.78, 1], [1.2, 0.88, 1], Extrapolation.CLAMP) },
    ],
  }));
  const shelfStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -Math.abs(shelfBounce.value) * 8 },
      { rotate: `${shelfBounce.value * 1.8}deg` },
      { scale: 1 + Math.abs(shelfBounce.value) * 0.018 },
    ],
  }));
  const sparkleStyle = useAnimatedStyle(() => ({
    opacity: sparkle.value,
    transform: [
      { rotate: `${interpolate(sparkle.value, [0, 1], [-18, 12], Extrapolation.CLAMP)}deg` },
      { scale: interpolate(sparkle.value, [0, 1], [0.2, 1], Extrapolation.CLAMP) },
    ],
  }));
  const successStyle = useAnimatedStyle(() => ({
    opacity: success.value,
    transform: [
      { translateY: interpolate(success.value, [0, 1], [12, 0], Extrapolation.CLAMP) },
      { scale: interpolate(success.value, [0, 1], [0.72, 1], Extrapolation.CLAMP) },
    ],
  }));

  const title = language === 'zh' ? `“${recipeName}”已加入书架` : `“${recipeName}” joined your shelf`;
  const subtitle = language === 'zh' ? '新菜谱已经收藏好啦' : 'Your new recipe is safely saved';

  return (
    <Modal transparent animationType="none" visible statusBarTranslucent>
      <Animated.View
        accessibilityViewIsModal
        accessibilityLiveRegion="polite"
        style={[styles.backdrop, backdropStyle]}>
        <Animated.View style={[styles.scene, sceneStyle]}>
          <Animated.Text style={[styles.sparkle, styles.sparkleLeft, sparkleStyle]}>✦</Animated.Text>
          <Animated.Text style={[styles.sparkle, styles.sparkleRight, sparkleStyle]}>♡</Animated.Text>
          <Animated.Text style={[styles.sparkle, styles.sparkleTop, sparkleStyle]}>★</Animated.Text>

          <View style={styles.stage}>
            <Animated.View style={[styles.shelf, shelfStyle]}>
              <View style={styles.shelfBack} />
              <View style={styles.topBooks}>
                <View style={[styles.bookSpine, styles.bookMint]} />
                <View style={[styles.bookSpine, styles.bookYellow]} />
                <View style={[styles.bookSpine, styles.bookPink]} />
              </View>
              <View style={styles.bottomBooks}>
                <View style={[styles.bookSpine, styles.bookBlue]} />
                <View style={[styles.bookSpine, styles.bookCoral]} />
                <View style={[styles.bookSpine, styles.bookCream]} />
                <View style={[styles.bookSpine, styles.bookMint, styles.bookLean]} />
              </View>
              <View style={styles.shelfBoardTop} />
              <View style={styles.shelfBoardBottom} />
              <View style={styles.shelfFootLeft} />
              <View style={styles.shelfFootRight} />
              <View style={styles.shelfFace}>
                <Text style={styles.shelfFaceText}>• ᴗ •</Text>
                <View style={styles.shelfBlush} />
              </View>
            </Animated.View>

            <Animated.View style={[styles.newBook, bookStyle]}>
              <View style={styles.bookBinding} />
              <Text style={styles.newBookEmoji}>{emoji}</Text>
              <View style={styles.bookLabel} />
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
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, backgroundColor: '#17362DB8' },
  scene: { width: '100%', maxWidth: 390, alignItems: 'center' },
  stage: { width: 300, height: 270, alignItems: 'center', justifyContent: 'flex-end' },
  shelf: { width: 238, height: 188, marginBottom: 18, borderRadius: 22, backgroundColor: '#C98755', borderWidth: 6, borderColor: '#F1C28E', shadowColor: '#382115', shadowOffset: { width: 0, height: 15 }, shadowOpacity: 0.28, shadowRadius: 20, elevation: 9 },
  shelfBack: { position: 'absolute', inset: 10, borderRadius: 13, backgroundColor: '#8C5B3B' },
  shelfBoardTop: { position: 'absolute', left: 5, right: 5, top: 83, height: 13, borderRadius: 7, backgroundColor: '#EDB576' },
  shelfBoardBottom: { position: 'absolute', left: -3, right: -3, bottom: 9, height: 15, borderRadius: 8, backgroundColor: '#EDB576' },
  topBooks: { position: 'absolute', left: 21, top: 23, height: 60, flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  bottomBooks: { position: 'absolute', left: 28, top: 103, height: 57, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  bookSpine: { width: 23, height: 55, borderRadius: 6, borderWidth: 3, borderColor: '#FFFFFF75' },
  bookMint: { height: 58, backgroundColor: '#78B99B' },
  bookYellow: { height: 48, backgroundColor: '#F0C96C' },
  bookPink: { height: 53, backgroundColor: '#E9959E' },
  bookBlue: { height: 51, backgroundColor: '#84AFC8' },
  bookCoral: { height: 56, backgroundColor: '#E8846F' },
  bookCream: { height: 45, backgroundColor: '#F4D9A7' },
  bookLean: { transform: [{ rotate: '9deg' }], marginLeft: 3 },
  newBook: { position: 'absolute', left: 189, top: 86, width: 48, height: 70, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 8, backgroundColor: '#4A9876', borderWidth: 4, borderColor: '#BEE2CE', shadowColor: '#173D2F', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.24, shadowRadius: 9, elevation: 7 },
  bookBinding: { position: 'absolute', left: 5, top: 0, bottom: 0, width: 6, borderRadius: 4, backgroundColor: '#2D7156' },
  newBookEmoji: { marginLeft: 6, fontSize: 24 },
  bookLabel: { width: 21, height: 5, marginLeft: 6, marginTop: 5, borderRadius: 3, backgroundColor: '#EAF5EE' },
  shelfFootLeft: { position: 'absolute', left: 29, bottom: -16, width: 24, height: 18, borderRadius: 7, backgroundColor: '#9C633E' },
  shelfFootRight: { position: 'absolute', right: 29, bottom: -16, width: 24, height: 18, borderRadius: 7, backgroundColor: '#9C633E' },
  shelfFace: { position: 'absolute', right: 25, bottom: 28, alignItems: 'center' },
  shelfFaceText: { color: '#FCE5CA', fontSize: 18, fontWeight: '900' },
  shelfBlush: { width: 54, height: 6, borderLeftWidth: 11, borderRightWidth: 11, borderColor: '#E99586', opacity: 0.82 },
  sparkle: { position: 'absolute', zIndex: 5, color: '#FFEBA0', fontSize: 35, textShadowColor: '#FFF3B8', textShadowRadius: 12 },
  sparkleLeft: { left: 18, top: 76 },
  sparkleRight: { right: 18, top: 112, color: '#FFD1DA' },
  sparkleTop: { right: 72, top: 18, fontSize: 28 },
  successPill: { width: '100%', minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 24, backgroundColor: '#FFFDF8', shadowColor: '#102C23', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.24, shadowRadius: 20, elevation: 10 },
  checkCircle: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#4A9876' },
  checkText: { color: '#FFFFFF', fontSize: 25, fontWeight: '800' },
  successCopy: { flex: 1, gap: 2 },
  successTitle: { color: '#183E30', fontSize: 14, fontWeight: '900' },
  successText: { color: '#6D7C73', fontSize: 11, lineHeight: 16, fontWeight: '700' },
});
