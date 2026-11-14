import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Gradients } from '@/constants/theme';

type Blob = { id: string; color: string; size: number; top: number; left: `${number}%`; drift: number; duration: number };

const BLOBS: readonly Blob[] = [
  { id: 'mint', color: Gradients.aurora.mint, size: 420, top: -190, left: '-35%', drift: 28, duration: 14000 },
  { id: 'peach', color: Gradients.aurora.peach, size: 380, top: -170, left: '40%', drift: -24, duration: 17000 },
  { id: 'butter', color: Gradients.aurora.butter, size: 300, top: -10, left: '10%', drift: 20, duration: 19000 },
];

/**
 * 页面顶部缓慢流动的柔和光晕。纯装饰，不响应触摸。
 * 传入 scrollY 时会随滚动产生视差并逐渐淡出。
 */
export function AuroraBackdrop({
  scrollY,
  height = 360,
  style,
  blobs = BLOBS,
}: {
  scrollY?: SharedValue<number>;
  height?: number;
  style?: StyleProp<ViewStyle>;
  blobs?: readonly Blob[];
}) {
  const parallaxStyle = useAnimatedStyle(() => {
    const y = scrollY?.value ?? 0;
    return {
      opacity: interpolate(y, [0, height * 0.8], [1, 0.25], 'clamp'),
      transform: [{ translateY: interpolate(y, [-200, 0, height], [60, 0, -height * 0.35], 'clamp') }],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.container, { height }, parallaxStyle, style]}>
      {/* 宽屏时把光晕限制在内容宽度附近，避免散成孤立的圆 */}
      <View style={styles.stage}>
        {blobs.map((blob) => <DriftingBlob key={blob.id} blob={blob} />)}
      </View>
    </Animated.View>
  );
}

function DriftingBlob({ blob }: { blob: Blob }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.set(withRepeat(
      withTiming(1, { duration: blob.duration, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }),
      -1,
      true
    ));
  }, [blob.duration, t]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(t.value, [0, 1], [-blob.drift, blob.drift]) },
      { translateY: interpolate(t.value, [0, 1], [blob.drift * 0.6, -blob.drift * 0.6]) },
      { scale: interpolate(t.value, [0, 0.5, 1], [1, 1.08, 1]) },
    ],
  }));

  return (
    <Animated.View style={[styles.blob, { width: blob.size, height: blob.size, top: blob.top, left: blob.left }, animatedStyle]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={`aurora-${blob.id}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={blob.color} stopOpacity={0.95} />
            <Stop offset="40%" stopColor={blob.color} stopOpacity={0.55} />
            <Stop offset="72%" stopColor={blob.color} stopOpacity={0.14} />
            <Stop offset="100%" stopColor={blob.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#aurora-${blob.id})`} />
      </Svg>
    </Animated.View>
  );
}

/** 给整页铺底色用（光晕下面的那一层） */
export function ScreenBackground({ color }: { color: string }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    alignItems: 'center',
  },
  stage: {
    width: '100%',
    maxWidth: 860,
    height: '100%',
  },
  blob: {
    position: 'absolute',
  },
});
