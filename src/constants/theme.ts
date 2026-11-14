/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1E2420',
    background: '#F6F4EE',
    backgroundElement: '#EFEDE5',
    backgroundSelected: '#DFEFE5',
    textSecondary: '#5E655D',
    primary: '#2E6B4F',
    primarySoft: '#E3F1E8',
    danger: '#B95544',
    dangerSoft: '#F9E7E3',
    warning: '#B4791D',
    warningSoft: '#FFF1D2',
    border: '#E8E4DA',
    surface: '#FFFFFF',
  },
  dark: {
    text: '#F4F2EB',
    background: '#171A17',
    backgroundElement: '#252A25',
    backgroundSelected: '#30493A',
    textSecondary: '#B6B9B0',
    primary: '#82C49D',
    primarySoft: '#263E30',
    danger: '#F09A8B',
    dangerSoft: '#452A26',
    warning: '#E5B967',
    warningSoft: '#46391F',
    border: '#333A34',
    surface: '#202420',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** 品牌渐变：主卡片、按钮高光等使用 */
export const Gradients = {
  forest: ['#3A8562', '#2E6B4F', '#1F5240'] as const,
  aurora: { mint: '#BFE6CF', peach: '#FFD8BC', butter: '#FFEFB5', sky: '#CFE6F5' },
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-ui)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/** 页面大标题、分区标题的统一样式：系统字体（苹方）中粗、字距略紧，和「菜谱库」标题一致 */
export const DisplayText = { fontWeight: '600' as const, letterSpacing: -0.6 };

/** 页面右上角的圆形按钮：统一 44px。primary 是主操作（绿底），secondary 是次要操作（白底） */
export const HeaderButton = {
  base: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: '#2E6B4F', boxShadow: '0 8px 20px rgba(46, 107, 79, 0.28)' },
  secondary: { backgroundColor: '#FFFFFF', boxShadow: '0 1px 2px rgba(30, 36, 32, 0.05), 0 6px 16px rgba(30, 36, 32, 0.08)' },
} as const;

export const Radius = { sm: 12, md: 18, lg: 24, xl: 30, pill: 999 } as const;

export const Shadows = {
  card: '0 1px 2px rgba(30, 36, 32, 0.04), 0 8px 24px rgba(30, 36, 32, 0.06)',
  raised: '0 2px 6px rgba(30, 36, 32, 0.06), 0 18px 40px rgba(30, 36, 32, 0.10)',
  glow: '0 14px 36px rgba(46, 107, 79, 0.28)',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
