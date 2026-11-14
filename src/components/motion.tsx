import { useEffect, useImperativeHandle, type PropsWithChildren, type Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/** 出现时从下方弹入，delay 用来做依次出现 */
export function FadeInUp({ delay = 0, distance = 18, style, children }: PropsWithChildren<{ delay?: number; distance?: number; style?: StyleProp<ViewStyle> }>) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(withDelay(delay, withSpring(1, { damping: 16, stiffness: 140, mass: 0.8, reduceMotion: ReduceMotion.System })));
  }, [delay, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.6], [0, 1], 'clamp'),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [distance, 0]) },
      { scale: interpolate(progress.value, [0, 1], [0.96, 1]) },
    ],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

/** 轻轻上下浮动（呼吸感），phase 让多个元素错开节奏 */
export function Bobbing({ amplitude = 6, duration = 2600, phase = 0, style, children }: PropsWithChildren<{ amplitude?: number; duration?: number; phase?: number; style?: StyleProp<ViewStyle> }>) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.set(withDelay(phase, withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }),
      -1,
      true
    )));
  }, [duration, phase, t]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(t.value, [0, 1], [amplitude, -amplitude]) },
      { rotate: `${interpolate(t.value, [0, 1], [-2, 2])}deg` },
    ],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

export type ShakeHandle = { shake: () => void };

/** 输入错误时左右抖一下：ref.current?.shake() */
export function Shake({ ref, style, children }: PropsWithChildren<{ ref?: Ref<ShakeHandle>; style?: StyleProp<ViewStyle> }>) {
  const x = useSharedValue(0);

  useImperativeHandle(ref, () => ({
    shake: () => {
      const step = (to: number) => withTiming(to, { duration: 55, reduceMotion: ReduceMotion.System });
      x.set(withSequence(step(-10), step(10), step(-7), step(7), step(-3), step(0)));
    },
  }), [x]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
