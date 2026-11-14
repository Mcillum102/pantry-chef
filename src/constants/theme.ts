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
    textSecondary: '#6E746C',
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

/**
 * 字体
 * - ui：全局界面文字（Web 上由 src/global.css 统一应用到所有 Text）
 * - display：页面大标题、分区标题等，用霞鹜文楷（只有常规字重，使用时 fontWeight 要设为 '400'）
 * Web 字体在 src/app/+html.tsx 里加载；原生端暂时使用系统字体。
 */
export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
    ui: undefined,
    display: undefined,
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
    ui: undefined,
    display: undefined,
  },
  web: {
    sans: 'var(--font-ui)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
    ui: 'var(--font-ui)',
    display: 'var(--font-display)',
  },
});

/** 标题用的文字样式。注意：要以内联对象传入（不要放进 StyleSheet.create），Web 上才能覆盖全局字体 */
export const DisplayText = Fonts.display
  ? { fontFamily: Fonts.display, fontWeight: '400' as const, letterSpacing: 0.2 }
  : { fontWeight: '800' as const };

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
