import { Children, useCallback, useEffect, type PropsWithChildren, type ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  ReduceMotion,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuroraBackdrop } from '@/components/aurora-backdrop';
import { Colors, DisplayText, MaxContentWidth, Radius, Spacing } from '@/constants/theme';

type AppScreenProps = PropsWithChildren<{
  eyebrow?: string;
  title: ReactNode;
  subtitle?: string;
  action?: ReactNode;
  /** 页面底部额外留白（比如首页底部有输入栏） */
  bottomSpace?: number;
  /** 这个值变化时滚到最底部（比如发出一条消息后） */
  scrollToEndKey?: number;
}>;

function AnimatedScreenSection({
  progress,
  index,
  children,
}: PropsWithChildren<{ progress: SharedValue<number>; index: number }>) {
  const start = Math.min(0.12 + index * 0.055, 0.42);
  const end = Math.min(start + 0.42, 0.96);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [start, end], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(progress.value, [start, end], [18, 0], Extrapolation.CLAMP),
      },
      {
        scale: interpolate(progress.value, [start, end], [0.97, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  return <Animated.View style={[styles.animatedSection, animatedStyle]}>{children}</Animated.View>;
}

export function AppScreen({ eyebrow, title, subtitle, action, bottomSpace = 0, scrollToEndKey, children }: AppScreenProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  useEffect(() => {
    if (!scrollToEndKey) return;
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [scrollRef, scrollToEndKey]);
  const entranceProgress = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const screenChildren = Children.toArray(children);

  useFocusEffect(
    useCallback(() => {
      cancelAnimation(entranceProgress);
      entranceProgress.set(0);
      entranceProgress.set(withTiming(1, {
        duration: 620,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        reduceMotion: ReduceMotion.System,
      }));

      return () => {
        cancelAnimation(entranceProgress);
        entranceProgress.set(0);
      };
    }, [entranceProgress])
  );

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity:
      interpolate(entranceProgress.value, [0, 0.34], [0, 1], Extrapolation.CLAMP)
      * interpolate(scrollY.value, [0, 110], [1, 0.15], Extrapolation.CLAMP),
    transform: [
      {
        translateY:
          interpolate(entranceProgress.value, [0, 0.44], [14, 0], Extrapolation.CLAMP)
          + interpolate(scrollY.value, [-120, 0, 160], [-24, 0, 38], Extrapolation.CLAMP),
      },
      {
        scale: interpolate(
          entranceProgress.value,
          [0, 0.44],
          [0.97, 1],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  return (
    <View style={styles.screen}>
      <AuroraBackdrop scrollY={scrollY} />
      <Animated.ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        style={styles.scrollView}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'android' ? insets.top + Spacing.three : Spacing.three,
            paddingBottom: insets.bottom + 120 + bottomSpace,
          },
        ]}>
        <View nativeID="app-screen-content" style={styles.inner}>
          <Animated.View style={[styles.header, headerAnimatedStyle]}>
            {eyebrow ? (
              <View style={styles.eyebrowPill}>
                <View style={styles.eyebrowDot} />
                <Text style={styles.eyebrow}>{eyebrow}</Text>
              </View>
            ) : null}
            {/* 按钮和大标题同一行、垂直居中；副标题单独占一整行，不会被按钮挤窄 */}
            <View style={styles.titleRow}>
              <View style={styles.titleWrap}>
                {typeof title === 'string' ? <Text style={[styles.title, DisplayText]} numberOfLines={1}>{title}</Text> : title}
              </View>
              {action ? <View style={styles.actions}>{action}</View> : null}
            </View>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </Animated.View>
          <View style={styles.sections}>
            {screenChildren.map((child, index) => (
              <AnimatedScreenSection key={index} progress={entranceProgress} index={index}>
                {child}
              </AnimatedScreenSection>
            ))}
          </View>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

export function SectionHeader({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, DisplayText]}>{title}</Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scrollView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: 26,
  },
  sections: {
    width: '100%',
    gap: 26,
  },
  animatedSection: {
    width: '100%',
  },
  header: {
    gap: 6,
    paddingTop: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyebrowPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.light.primary,
  },
  eyebrow: {
    color: Colors.light.primary,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  title: {
    color: Colors.light.text,
    fontSize: 32,
    lineHeight: 40,
  },
  subtitle: {
    color: Colors.light.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  sectionTitle: {
    color: Colors.light.text,
    fontSize: 23,
    lineHeight: 30,
  },
  sectionDetail: {
    color: Colors.light.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
});
