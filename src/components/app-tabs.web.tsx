import type { ViewStyle } from 'react-native';

import { AppTabsLayout } from '@/components/app-tab-bar';

type WebGlassStyle = ViewStyle & {
  backdropFilter?: string;
  WebkitBackdropFilter?: string;
};

const glassBackdrop: WebGlassStyle = {
  backdropFilter: 'blur(26px) saturate(180%)',
  WebkitBackdropFilter: 'blur(26px) saturate(180%)',
};

// 安全区由 src/global.css 里的 #app-tab-bar-v2 用 env(safe-area-inset-*) 处理
export default function AppTabs() {
  return <AppTabsLayout nativeID="app-tab-bar-v2" surfaceStyle={glassBackdrop} />;
}
