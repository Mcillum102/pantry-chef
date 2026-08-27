import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useLanguage } from '@/context/language-context';

export function AppLaunchAnimation() {
  const { text } = useLanguage();
  const [visible, setVisible] = useState(true);
  const mountedRef = useRef(true);
  const backdrop = useSharedValue(1);
  const logo = useSharedValue(0);
  const copy = useSharedValue(0);
  const tomato = useSharedValue(0);
  const broccoli = useSharedValue(0);
  const milk = useSharedValue(0);

  useEffect(() => {
    mountedRef.current = true;

    async function beginAnimation() {
      try {
        await SplashScreen.hideAsync();
      } finally {
        if (!mountedRef.current) return;

        logo.set(withSpring(1, {
          damping: 12,
          stiffness: 145,
          mass: 0.82,
          reduceMotion: ReduceMotion.System,
        }));
        tomato.set(withDelay(180, withSpring(1, {
          damping: 9,
          stiffness: 175,
          reduceMotion: ReduceMotion.System,
        })));
        broccoli.set(withDelay(300, withSpring(1, {
          damping: 9,
          stiffness: 175,
          reduceMotion: ReduceMotion.System,
        })));
        milk.set(withDelay(420, withSpring(1, {
          damping: 9,
          stiffness: 175,
          reduceMotion: ReduceMotion.System,
        })));
        copy.set(withDelay(470, withTiming(1, {
          duration: 430,
          easing: Easing.out(Easing.cubic),
          reduceMotion: ReduceMotion.System,
        })));
        backdrop.set(withDelay(1850, withTiming(
          0,
          {
            duration: 420,
            easing: Easing.inOut(Easing.cubic),
            reduceMotion: ReduceMotion.System,
          },
          (finished) => {
            if (finished) runOnJS(setVisible)(false);
          }
        )));
      }
    }

    void beginAnimation();
    return () => {
      mountedRef.current = false;
    };
  }, [backdrop, broccoli, copy, logo, milk, tomato]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value,
  }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: interpolate(logo.value, [0, 0.22, 1], [0, 1, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(logo.value, [0, 1], [22, 0], Extrapolation.CLAMP) },
      { scale: interpolate(logo.value, [0, 0.72, 1], [0.62, 1.08, 1], Extrapolation.CLAMP) },
      { rotate: `${interpolate(logo.value, [0, 0.72, 1], [-5, 2, 0], Extrapolation.CLAMP)}deg` },
    ],
  }));
  const copyStyle = useAnimatedStyle(() => ({
    opacity: copy.value,
    transform: [{ translateY: interpolate(copy.value, [0, 1], [14, 0], Extrapolation.CLAMP) }],
  }));
  const tomatoStyle = useAnimatedStyle(() => ({
    opacity: tomato.value,
    transform: [
      { translateY: interpolate(tomato.value, [0, 1], [-34, 0], Extrapolation.CLAMP) },
      { scale: interpolate(tomato.value, [0, 0.7, 1], [0.3, 1.18, 1], Extrapolation.CLAMP) },
      { rotate: `${interpolate(tomato.value, [0, 1], [-18, 8], Extrapolation.CLAMP)}deg` },
    ],
  }));
  const broccoliStyle = useAnimatedStyle(() => ({
    opacity: broccoli.value,
    transform: [
      { translateX: interpolate(broccoli.value, [0, 1], [-26, 0], Extrapolation.CLAMP) },
      { scale: interpolate(broccoli.value, [0, 0.7, 1], [0.3, 1.18, 1], Extrapolation.CLAMP) },
      { rotate: `${interpolate(broccoli.value, [0, 1], [-22, -7], Extrapolation.CLAMP)}deg` },
    ],
  }));
  const milkStyle = useAnimatedStyle(() => ({
    opacity: milk.value,
    transform: [
      { translateX: interpolate(milk.value, [0, 1], [28, 0], Extrapolation.CLAMP) },
      { scale: interpolate(milk.value, [0, 0.7, 1], [0.3, 1.16, 1], Extrapolation.CLAMP) },
      { rotate: `${interpolate(milk.value, [0, 1], [18, 7], Extrapolation.CLAMP)}deg` },
    ],
  }));

  if (!visible) return null;

  return (
    <Animated.View
      accessibilityLabel={text('鲜食记正在启动', 'Fresh Pantry is starting')}
      accessibilityViewIsModal
      testID="app-launch-animation"
      style={[styles.backdrop, backdropStyle]}>
      <View style={styles.glowLarge} />
      <View style={styles.glowSmall} />

      <View style={styles.scene}>
        <Animated.Text style={[styles.food, styles.tomato, tomatoStyle]}>🍅</Animated.Text>
        <Animated.Text style={[styles.food, styles.broccoli, broccoliStyle]}>🥦</Animated.Text>
        <Animated.Text style={[styles.food, styles.milk, milkStyle]}>🥛</Animated.Text>

        <Animated.View style={[styles.logoCard, logoStyle]}>
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="contain"
            source={require('../../assets/images/logo-concept-v1.png')}
            style={styles.logo}
          />
        </Animated.View>

        <Animated.View style={[styles.copy, copyStyle]}>
          <Text style={styles.title}>{text('鲜食记', 'Fresh Pantry')}</Text>
          <View style={styles.taglineRow}>
            <View style={styles.taglineLine} />
            <Text style={styles.tagline}>
              {text('每一份新鲜，都不被忘记', 'Make every fresh ingredient count')}
            </Text>
            <View style={styles.taglineLine} />
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#F7F5EF',
  },
  glowLarge: {
    position: 'absolute',
    top: '18%',
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: '#E3F0E7',
    opacity: 0.9,
  },
  glowSmall: {
    position: 'absolute',
    bottom: -84,
    right: -74,
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: '#F7C98E',
    opacity: 0.2,
  },
  scene: { width: 310, alignItems: 'center' },
  logoCard: {
    width: 210,
    height: 210,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 62,
    backgroundColor: '#FFFDF8',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    shadowColor: '#1B4935',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 12,
  },
  logo: { width: 196, height: 196 },
  food: { position: 'absolute', zIndex: 3, fontSize: 34 },
  tomato: { top: -18, right: 28 },
  broccoli: { top: 72, left: 4 },
  milk: { top: 142, right: 7 },
  copy: { alignItems: 'center', gap: 12, marginTop: 32 },
  title: {
    color: '#245B42',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 5,
  },
  taglineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  taglineLine: { width: 22, height: 1, backgroundColor: '#7CA78E' },
  tagline: { color: '#5F776A', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
});
