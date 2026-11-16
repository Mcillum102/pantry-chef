import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppLaunchAnimation } from '@/components/app-launch-animation';
import { AppErrorBoundary } from '@/components/app-error-boundary';
import { AppAccessGate } from '@/components/app-access-gate';
import { CookingNotificationRouter } from '@/components/cooking-notification-router';
import { CloudSyncProvider } from '@/context/cloud-sync-context';
import { CookingSessionProvider } from '@/context/cooking-session-context';
import { KitchenProvider } from '@/context/kitchen-context';
import { LanguageProvider } from '@/context/language-context';
import { MemberProvider } from '@/context/member-context';
import { HealthProvider } from '@/context/health-context';
import { ReminderProvider } from '@/context/reminder-context';
import { WidgetProvider } from '@/context/widget-context';
import { TasksProvider } from '@/context/tasks-context';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AppErrorBoundary>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={DefaultTheme}>
        <LanguageProvider>
          <KitchenProvider key="inventory-schema-v7">
            <HealthProvider>
              <ReminderProvider>
                <MemberProvider>
                <CloudSyncProvider>
                <TasksProvider>
                <CookingSessionProvider>
                  <WidgetProvider>
                    <CookingNotificationRouter />
                    <AppAccessGate />
                    <AppLaunchAnimation />
                  </WidgetProvider>
                </CookingSessionProvider>
                </TasksProvider>
                </CloudSyncProvider>
                </MemberProvider>
              </ReminderProvider>
            </HealthProvider>
          </KitchenProvider>
        </LanguageProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}
