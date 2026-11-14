import { useEffect, useId, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Gradients } from '@/constants/theme';

export { gradientFrom, shadeColor } from '@/data/ui-utils';

type GradientSurfaceProps = PropsWithChildren<{
  /** 从左上到右下的渐变色，2～3 个 */
  colors?: readonly string[];
  /** 每隔几秒扫过一道柔光 */
  sheen?: boolean;
  style?: StyleProp<ViewStyle>;
}>;

/**
 * 渐变卡片：SVG 渐变底 + 右上角柔光 + 可选的光泽扫过动画。
 * 用法和 View 一样，padding / borderRadius 等写在 style 里。
 */
export function GradientSurface({ colors = Gradients.forest, sheen = true, style, children }: GradientSurfaceProps) {
  const id = useId().replace(/:/g, '');
  const [width, setWidth] = useState(0);
  const sweep = useSharedValue(0);

  useEffect(() => {
    if (!sheen) return;
    sweep.set(withRepeat(
      withSequence(
        withDelay(2600, withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.cubic), reduceMotion: ReduceMotion.System })),
        withTiming(0, { duration: 0 })
      ),
      -1,
      false
    ));
  }, [sheen, sweep]);

  const sheenStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(sweep.value, [0, 1], [-160, width + 160]) },
      { rotate: '18deg' },
    ],
  }));

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const stops = colors.length >= 3 ? colors : [colors[0], colors[colors.length - 1]];

  return (
    <View style={[styles.surface, style]} onLayout={onLayout}>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={`g-${id}`} x1="0" y1="0" x2="1" y2="1">
            {stops.map((color, index) => (
              <Stop key={index} offset={`${(index / (stops.length - 1)) * 100}%`} stopColor={color} />
            ))}
          </LinearGradient>
          <RadialGradient id={`r-${id}`} cx="85%" cy="0%" r="70%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.28} />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#g-${id})`} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#r-${id})`} />
        <Circle cx="92%" cy="105%" r="70" fill="#FFFFFF" fillOpacity={0.06} />
      </Svg>
      {sheen ? (
        <Animated.View pointerEvents="none" style={[styles.sheen, sheenStyle]} />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    position: 'relative',
    overflow: 'hidden',
  },
  sheen: {
    position: 'absolute',
    top: -60,
    bottom: -60,
    left: 0,
    width: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.13)',
  },
});
