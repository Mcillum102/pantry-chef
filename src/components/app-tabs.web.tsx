import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { useEffect, type ComponentProps } from 'react';
import { Pressable, View, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { FloatingCookingTimer } from '@/components/floating-cooking-timer';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useLanguage } from '@/context/language-context';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

type TabButtonProps = TabTriggerSlotProps & {
  label: string;
  icon: IconName;
  selectedIcon: IconName;
};

type WebGlassStyle = ViewStyle & {
  backdropFilter?: string;
  WebkitBackdropFilter?: string;
};

const glassBackdrop: WebGlassStyle = {
  backdropFilter: 'blur(26px) saturate(180%)',
  WebkitBackdropFilter: 'blur(26px) saturate(180%)',
};

const safeAreaTabBarStyle = {
  boxSizing: 'border-box',
  bottom: 'max(8px, env(safe-area-inset-bottom, 0px))',
  paddingRight: 'max(14px, env(safe-area-inset-right, 0px))',
  paddingLeft: 'max(14px, env(safe-area-inset-left, 0px))',
} as unknown as ViewStyle;

export default function AppTabs() {
  const { text } = useLanguage();

  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton label={text('首页', 'Home')} icon="home-outline" selectedIcon="home" />
          </TabTrigger>
          <TabTrigger name="inventory" href="/inventory" asChild>
            <TabButton label={text('库存', 'Inventory')} icon="fridge-outline" selectedIcon="fridge" />
          </TabTrigger>
          <TabTrigger name="recipes" href="/recipes" asChild>
            <TabButton label={text('菜谱', 'Recipes')} icon="book-open-outline" selectedIcon="book-open-variant" />
          </TabTrigger>
          <TabTrigger name="recommend" href="/recommend" asChild>
            <TabButton label={text('健康', 'Health')} icon="heart-pulse" selectedIcon="heart-pulse" />
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton label={text('我的', 'Profile')} icon="account-outline" selectedIcon="account" />
          </TabTrigger>
          <TabTrigger name="planner" href="/planner" style={styles.hiddenTab} />
          <TabTrigger name="insights" href="/insights" style={styles.hiddenTab} />
          <TabTrigger name="widgets" href="/widgets" style={styles.hiddenTab} />
          <TabTrigger name="account" href="/account" style={styles.hiddenTab} />
          <TabTrigger name="preferences" href={'/preferences' as Href} style={styles.hiddenTab} />
        </CustomTabList>
      </TabList>
      <FloatingCookingTimer />
    </Tabs>
  );
}

export function TabButton({
  label,
  icon,
  selectedIcon,
  isFocused,
  onPressIn,
  onPressOut,
  ...props
}: TabButtonProps) {
  const focusProgress = useSharedValue(isFocused ? 1 : 0);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    focusProgress.set(withSpring(isFocused ? 1 : 0, {
      damping: 15,
      stiffness: 230,
      mass: 0.55,
      reduceMotion: ReduceMotion.System,
    }));
  }, [focusProgress, isFocused]);

  const pillAnimatedStyle = useAnimatedStyle(() => ({
    opacity: focusProgress.value,
    transform: [
      { scaleX: interpolate(focusProgress.value, [0, 1], [0.78, 1]) },
      { scaleY: interpolate(focusProgress.value, [0, 1], [0.88, 1]) },
    ],
  }));
  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(focusProgress.value, [0, 1], [1, -1]) },
      { scale: interpolate(focusProgress.value, [0, 1], [0.9, 1.08]) },
    ],
  }));
  const labelAnimatedStyle = useAnimatedStyle(() => ({
    color: interpolateColor(focusProgress.value, [0, 1], ['#777B75', Colors.light.primary]),
    opacity: interpolate(focusProgress.value, [0, 1], [0.82, 1]),
  }));
  const pressAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  return (
    <Pressable
      {...props}
      accessibilityLabel={label}
      onPressIn={(event) => {
        pressScale.set(
          withTiming(0.86, {
            duration: 90,
            reduceMotion: ReduceMotion.System,
          })
        );
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressScale.set(
          withSpring(1, {
            damping: 8,
            stiffness: 250,
            mass: 0.55,
            overshootClamping: false,
            reduceMotion: ReduceMotion.System,
          })
        );
        onPressOut?.(event);
      }}
      style={styles.tabButton}>
      <Animated.View style={[styles.tabButtonView, pressAnimatedStyle]}>
        <Animated.View style={[styles.selectedTab, pillAnimatedStyle]} />
        <Animated.View style={[styles.tabForeground, iconAnimatedStyle]}>
          <MaterialCommunityIcons
            name={isFocused ? selectedIcon : icon}
            size={23}
            color={isFocused ? Colors.light.primary : '#777B75'}
          />
        </Animated.View>
        <Animated.Text
          style={[styles.tabLabel, labelAnimatedStyle, isFocused && styles.selectedLabel]}>
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  return (
    <View
      {...props}
      nativeID="app-tab-bar-v2"
      style={[styles.tabListContainer, safeAreaTabBarStyle]}>
      <View style={styles.shadowContainer}>
        <View style={[styles.innerContainer, glassBackdrop]}>
          <View style={styles.glassHighlight} />
          {props.children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    bottom: 12,
    zIndex: 20,
    width: '100%',
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  shadowContainer: {
    width: '100%',
    maxWidth: Math.min(MaxContentWidth, 430),
    borderRadius: 31,
    boxShadow: '0 12px 38px rgba(44, 55, 48, 0.16), 0 2px 9px rgba(44, 55, 48, 0.08)',
  },
  innerContainer: {
    minHeight: 66,
    padding: 5,
    borderRadius: 31,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.88)',
    backgroundColor: 'rgba(244, 245, 241, 0.74)',
    overflow: 'hidden',
  },
  glassHighlight: {
    position: 'absolute',
    pointerEvents: 'none',
    top: 1,
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
  tabButton: {
    flex: 1,
    borderRadius: 25,
  },
  tabButtonView: {
    position: 'relative',
    height: 54,
    minWidth: 62,
    paddingHorizontal: Spacing.two,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  selectedTab: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.92)',
    boxShadow: '0 3px 10px rgba(42, 72, 55, 0.10)',
  },
  tabForeground: {
    zIndex: 1,
  },
  tabLabel: {
    zIndex: 1,
    color: '#777B75',
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  selectedLabel: {
    color: Colors.light.primary,
    fontWeight: '700',
  },
  hiddenTab: {
    display: 'none',
  },
});
