import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useCookingSession } from '@/context/cooking-session-context';

export function CookingNotificationRouter() {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();
  const { session, isHydrated, requestCookingResume } = useCookingSession();
  const handledResponseRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isHydrated || !response) return;
    const request = response.notification.request;
    if (request.content.data?.kind !== 'cooking-timer') return;
    const responseKey = `${request.identifier}-${response.notification.date}`;
    if (handledResponseRef.current === responseKey) return;
    handledResponseRef.current = responseKey;

    router.replace('/recipes');
    const timer = setTimeout(() => {
      if (session) requestCookingResume();
      void Notifications.clearLastNotificationResponseAsync();
    }, 120);
    return () => clearTimeout(timer);
  }, [isHydrated, requestCookingResume, response, router, session]);

  return null;
}
