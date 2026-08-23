import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import AppTabs from '@/components/app-tabs';
import { KitchenProvider } from '@/context/kitchen-context';
import { LanguageProvider } from '@/context/language-context';
import { HealthProvider } from '@/context/health-context';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={DefaultTheme}>
        <LanguageProvider>
          <KitchenProvider key="inventory-schema-v7">
            <HealthProvider>
              <AppTabs />
            </HealthProvider>
          </KitchenProvider>
        </LanguageProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
