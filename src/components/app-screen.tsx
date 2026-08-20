import { Children, useCallback, type PropsWithChildren, type ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';

type AppScreenProps = PropsWithChildren<{
  eyebrow?: string;
  title: ReactNode;
  subtitle?: string;
  action?: ReactNode;
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

export function AppScreen({ eyebrow, title, subtitle, action, children }: AppScreenProps) {
  const insets = useSafeAreaInsets();
  const entranceProgress = useSharedValue(0);
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
    opacity: interpolate(entranceProgress.value, [0, 0.34], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(
          entranceProgress.value,
          [0, 0.44],
          [14, 0],
          Extrapolation.CLAMP
        ),
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
    <ScrollView
      style={styles.scrollView}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Platform.OS === 'android' ? insets.top + Spacing.three : Spacing.three,
          paddingBottom: insets.bottom + 112,
        },
      ]}>
      <View style={styles.inner}>
        <Animated.View style={[styles.header, headerAnimatedStyle]}>
          <View style={styles.headerCopy}>
            {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
            {typeof title === 'string' ? <Text style={styles.title}>{title}</Text> : title}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {action}
        </Animated.View>
        <View style={styles.sections}>
          {screenChildren.map((child, index) => (
            <AnimatedScreenSection key={index} progress={entranceProgress} index={index}>
              {child}
            </AnimatedScreenSection>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

export function SectionHeader({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.four,
  },
  sections: {
    width: '100%',
    gap: Spacing.four,
  },
  animatedSection: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headerCopy: {
    flex: 1,
    gap: 3,
  },
  eyebrow: {
    color: Colors.light.primary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  title: {
    color: Colors.light.text,
    fontSize: 32,
    lineHeight: 39,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  subtitle: {
    color: Colors.light.textSecondary,
    fontSize: 15,
    lineHeight: 21,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  sectionTitle: {
    color: Colors.light.text,
    fontSize: 20,
    fontWeight: '800',
  },
  sectionDetail: {
    color: Colors.light.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
});
