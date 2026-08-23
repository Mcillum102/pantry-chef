import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Icon, Label, NativeTabs, VectorIcon } from 'expo-router/unstable-native-tabs';
import { Platform, useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { useLanguage } from '@/context/language-context';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
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
        <Label>{text('库存', 'Inventory')}</Label>
        <Icon
          sf={{ default: 'refrigerator', selected: 'refrigerator.fill' }}
          androidSrc={<VectorIcon family={MaterialCommunityIcons} name="fridge-outline" />}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="recipes">
        <Label>{text('菜谱', 'Recipes')}</Label>
        <Icon
          sf={{ default: 'book.pages', selected: 'book.pages.fill' }}
          androidSrc={<VectorIcon family={MaterialCommunityIcons} name="book-open-outline" />}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="recommend">
        <Label>{text('健康', 'Health')}</Label>
        <Icon
          sf={{ default: 'heart.text.square', selected: 'heart.text.square.fill' }}
          androidSrc={<VectorIcon family={MaterialCommunityIcons} name="heart-pulse" />}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <Label>{text('我的', 'Profile')}</Label>
        <Icon
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
          androidSrc={<VectorIcon family={MaterialCommunityIcons} name="account-outline" />}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
