import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppTabsLayout } from '@/components/app-tab-bar';

// 原生的 NativeTabs（iOS UITabBar）不能横向滑动，超过 5 个会折叠成「更多」，
// 所以 iOS / Android 也使用和 Web 相同的自定义 Tab 栏。
export default function AppTabs() {
  const insets = useSafeAreaInsets();

  return (
    <AppTabsLayout
      containerStyle={{
        bottom: Math.max(insets.bottom - 6, 8),
        paddingLeft: Math.max(insets.left, 14),
        paddingRight: Math.max(insets.right, 14),
      }}
      // 原生没有 backdrop-filter 毛玻璃，背景调得更不透明，避免内容透出来
      surfaceStyle={{ backgroundColor: 'rgba(247, 247, 243, 0.97)' }}
    />
  );
}
