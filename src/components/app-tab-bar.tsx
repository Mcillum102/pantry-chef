import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import {
  TabList,
  TabSlot,
  TabTrigger,
  Tabs,
  type TabListProps,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
} from 'react';
import { Pressable, ScrollView, StyleSheet, View, type LayoutRectangle, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { FloatingCookingTimer } from '@/components/floating-cooking-timer';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const INACTIVE = '#646A63';

/** 让选中的按钮自动滚到可见区域 */
const TabRevealContext = createContext<((frame: LayoutRectangle) => void) | null>(null);

export type AppTabConfig = {
  name: string;
  href: Href;
  label: string;
  icon: IconName;
  selectedIcon: IconName;
};

/** 底部 Tab 栏里可以左右滑动的入口，按顺序显示。新增入口加在这里。 */
export const SCROLLABLE_TABS: readonly AppTabConfig[] = [
  { name: 'home', href: '/', label: '首页', icon: 'home-outline', selectedIcon: 'home' },
  { name: 'inventory', href: '/inventory', label: '库存', icon: 'fridge-outline', selectedIcon: 'fridge' },
  { name: 'recipes', href: '/recipes', label: '菜谱', icon: 'book-open-outline', selectedIcon: 'book-open-variant' },
  { name: 'recommend', href: '/recommend', label: '健康', icon: 'heart-pulse', selectedIcon: 'heart-pulse' },
  { name: 'games', href: '/games' as Href, label: '游戏', icon: 'gamepad-variant-outline', selectedIcon: 'gamepad-variant' },
];

/** 固定在 Tab 栏最右边、不跟着滑动的入口 */
export const PINNED_TAB: AppTabConfig = {
  name: 'profile',
  href: '/profile',
  label: '我的',
  icon: 'account-outline',
  selectedIcon: 'account',
};

/** 不显示在 Tab 栏、但需要保留路由的页面 */
const HIDDEN_TABS: readonly { name: string; href: Href }[] = [
  { name: 'planner', href: '/planner' },
  { name: 'insights', href: '/insights' },
  { name: 'widgets', href: '/widgets' },
  { name: 'account', href: '/account' },
  { name: 'preferences', href: '/preferences' as Href },
];

type AppTabsLayoutProps = {
  /** 平台相关的定位（安全区等） */
  containerStyle?: StyleProp<ViewStyle>;
  /** 平台相关的玻璃效果 / 背景 */
  surfaceStyle?: StyleProp<ViewStyle>;
  nativeID?: string;
};

export function AppTabsLayout({ containerStyle, surfaceStyle, nativeID }: AppTabsLayoutProps) {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList containerStyle={containerStyle} surfaceStyle={surfaceStyle} nativeID={nativeID}>
          {SCROLLABLE_TABS.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <TabButton label={tab.label} icon={tab.icon} selectedIcon={tab.selectedIcon} />
            </TabTrigger>
          ))}
          <TabTrigger name={PINNED_TAB.name} href={PINNED_TAB.href} asChild>
            <TabButton label={PINNED_TAB.label} icon={PINNED_TAB.icon} selectedIcon={PINNED_TAB.selectedIcon} />
          </TabTrigger>
          {HIDDEN_TABS.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} style={styles.hiddenTab} />
          ))}
        </CustomTabList>
      </TabList>
      <FloatingCookingTimer />
    </Tabs>
  );
}

type CustomTabListProps = TabListProps & {
  containerStyle?: StyleProp<ViewStyle>;
  surfaceStyle?: StyleProp<ViewStyle>;
};

const hiddenTabNames = new Set(HIDDEN_TABS.map((tab) => tab.name));

/**
 * Tab 触发器必须是 TabList 子组件的直接子元素（expo-router 靠这个注册路由），
 * 所以这里按 name 把它们分到「可滑动区」「固定在右边」「隐藏」三处渲染。
 */
function CustomTabList({ children, containerStyle, surfaceStyle, nativeID, style: _style, ...props }: CustomTabListProps) {
  const scrollable: ReactElement[] = [];
  const pinned: ReactElement[] = [];
  const hidden: ReactElement[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement<{ name?: string }>(child)) return;
    const name = child.props.name ?? '';
    if (name === PINNED_TAB.name) pinned.push(child);
    else if (hiddenTabNames.has(name)) hidden.push(child);
    else scrollable.push(child);
  });

  const scrollRef = useRef<ScrollView>(null);
  const viewportWidth = useRef(0);
  const scrollX = useRef(0);
  const pendingFrame = useRef<LayoutRectangle | null>(null);
  const contentWidth = useRef(0);
  // 两侧渐隐提示：哪一侧还有没露出来的按钮，就在哪一侧显示
  const [edges, setEdges] = useState({ left: false, right: false });
  const updateEdges = useCallback(() => {
    const left = scrollX.current > 4;
    const right = scrollX.current + viewportWidth.current < contentWidth.current - 4;
    setEdges((current) => (current.left === left && current.right === right ? current : { left, right }));
  }, []);
  const reveal = useCallback((frame: LayoutRectangle) => {
    const width = viewportWidth.current;
    // 刚挂载时按钮比滚动区先完成测量，先记下来，等滚动区有宽度后再滚
    if (!width) {
      pendingFrame.current = frame;
      return;
    }
    const margin = 24;
    let next = scrollX.current;
    if (frame.x < scrollX.current + margin) next = frame.x - margin;
    else if (frame.x + frame.width > scrollX.current + width - margin) next = frame.x + frame.width - width + margin;
    if (next !== scrollX.current) scrollRef.current?.scrollTo({ x: Math.max(0, next), animated: true });
  }, []);

  return (
    <View {...props} nativeID={nativeID} style={[styles.tabListContainer, containerStyle]}>
      <View style={styles.shadowContainer}>
        <View style={[styles.innerContainer, surfaceStyle]}>
          <View style={styles.glassHighlight} />
          <TabRevealContext.Provider value={reveal}>
            <View style={styles.scrollArea}>
            <ScrollView
              ref={scrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              onLayout={(event) => {
                viewportWidth.current = event.nativeEvent.layout.width;
                const pending = pendingFrame.current;
                pendingFrame.current = null;
                if (pending) reveal(pending);
                updateEdges();
              }}
              onContentSizeChange={(width) => {
                contentWidth.current = width;
                updateEdges();
              }}
              onScroll={(event) => {
                scrollX.current = event.nativeEvent.contentOffset.x;
                updateEdges();
              }}
              scrollEventThrottle={32}
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}>
              {scrollable}
            </ScrollView>
            {edges.left ? <EdgeFade side="left" /> : null}
            {edges.right ? <EdgeFade side="right" /> : null}
            </View>
          </TabRevealContext.Provider>
          <View style={styles.divider} />
          <View style={styles.pinnedArea}>{pinned}</View>
          {hidden}
        </View>
      </View>
    </View>
  );
}

function EdgeFade({ side }: { side: 'left' | 'right' }) {
  const id = `tab-fade-${side}`;
  return (
    <View pointerEvents="none" style={[styles.edgeFade, side === 'left' ? styles.edgeFadeLeft : styles.edgeFadeRight]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1={side === 'left' ? '0' : '1'} y1="0" x2={side === 'left' ? '1' : '0'} y2="0">
            <Stop offset="0%" stopColor="#FAF9F5" stopOpacity={1} />
            <Stop offset="100%" stopColor="#FAF9F5" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

type TabButtonProps = TabTriggerSlotProps & {
  label: string;
  icon: IconName;
  selectedIcon: IconName;
};

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
  const reveal = useContext(TabRevealContext);
  const frameRef = useRef<LayoutRectangle | null>(null);

  useEffect(() => {
    if (isFocused && frameRef.current) reveal?.(frameRef.current);
  }, [isFocused, reveal]);

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
    color: interpolateColor(focusProgress.value, [0, 1], [INACTIVE, '#FFFFFF']),
    opacity: interpolate(focusProgress.value, [0, 1], [0.86, 1]),
  }));
  const pressAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(isFocused) }}
      onLayout={(event) => {
        frameRef.current = event.nativeEvent.layout;
        if (isFocused) reveal?.(event.nativeEvent.layout);
      }}
      onPressIn={(event) => {
        pressScale.set(withTiming(0.86, { duration: 90, reduceMotion: ReduceMotion.System }));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressScale.set(withSpring(1, {
          damping: 8,
          stiffness: 250,
          mass: 0.55,
          overshootClamping: false,
          reduceMotion: ReduceMotion.System,
        }));
        onPressOut?.(event);
      }}
      style={styles.tabButton}>
      <Animated.View style={[styles.tabButtonView, pressAnimatedStyle]}>
        <Animated.View style={[styles.selectedTab, pillAnimatedStyle]} />
        <Animated.View style={[styles.tabForeground, iconAnimatedStyle]}>
          <MaterialCommunityIcons
            name={isFocused ? selectedIcon : icon}
            size={22}
            color={isFocused ? '#FFFFFF' : INACTIVE}
          />
        </Animated.View>
        <Animated.Text style={[styles.tabLabel, labelAnimatedStyle, isFocused && styles.selectedLabel]}>
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
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
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.88)',
    backgroundColor: 'rgba(250, 249, 245, 0.78)',
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
  scrollView: {
    flex: 1,
  },
  edgeFade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 28,
  },
  edgeFadeLeft: { left: 0 },
  edgeFadeRight: { right: 0 },
  scrollArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 25,
  },
  scrollContent: {
    flexGrow: 1,
    gap: 2,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 34,
    marginHorizontal: 3,
    backgroundColor: 'rgba(60, 70, 64, 0.18)',
  },
  pinnedArea: {
    flexShrink: 0,
  },
  tabButton: {
    flexGrow: 1,
    flexShrink: 0,
    minWidth: 62,
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
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    pointerEvents: 'none',
    borderRadius: 25,
    backgroundColor: Colors.light.primary,
    boxShadow: '0 6px 16px rgba(46, 107, 79, 0.32)',
  },
  tabForeground: {
    zIndex: 1,
  },
  tabLabel: {
    zIndex: 1,
    color: INACTIVE,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  selectedLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  hiddenTab: {
    display: 'none',
  },
});
