import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform, useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { useLanguage } from '@/context/language-context';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const { text } = useLanguage();

  return (
    <NativeTabs
      backgroundColor={Platform.OS === 'ios' ? 'rgba(247, 245, 239, 0.72)' : colors.background}
      blurEffect="systemUltraThinMaterial"
      minimizeBehavior="onScrollDown"
      tintColor={Colors.light.primary}
      iconColor={{ default: Colors.light.textSecondary, selected: Colors.light.primary }}
      indicatorColor={Colors.light.primarySoft}
      labelStyle={{
        default: { color: Colors.light.textSecondary, fontSize: 11 },
        selected: { color: Colors.light.primary, fontSize: 11, fontWeight: '700' },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{text('库存', 'Inventory')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'refrigerator', selected: 'refrigerator.fill' }}
          md={{ default: 'kitchen', selected: 'kitchen' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="recipes">
        <NativeTabs.Trigger.Label>{text('菜谱', 'Recipes')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'book.pages', selected: 'book.pages.fill' }}
          md={{ default: 'menu_book', selected: 'menu_book' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="recommend">
        <NativeTabs.Trigger.Label>{text('健康', 'Health')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'heart.text.square', selected: 'heart.text.square.fill' }}
          md={{ default: 'monitor_heart', selected: 'monitor_heart' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>{text('我的', 'Profile')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
          md={{ default: 'person', selected: 'person' }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
