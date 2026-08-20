/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#24251F',
    background: '#F7F5EF',
    backgroundElement: '#EEECE4',
    backgroundSelected: '#DFEDE4',
    textSecondary: '#74756C',
    primary: '#2F6D50',
    primarySoft: '#E3F0E7',
    danger: '#B95544',
    dangerSoft: '#F9E7E3',
    warning: '#B4791D',
    warningSoft: '#FFF1D2',
    border: '#E5E1D7',
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
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

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
