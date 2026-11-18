import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

/**
 * App 回到前台（从后台切回来、解锁屏幕、重新联网）时调用 onResume。
 * iPhone 会在后台暂停网页 App 的连接，这段时间对方的改动收不到，回来时需要重新拉一次。
 */
export function useAppResume(onResume: () => void, enabled = true) {
  const callbackRef = useRef(onResume);
  callbackRef.current = onResume;

  useEffect(() => {
    if (!enabled) return;
    let last = 0;
    const fire = () => {
      const now = Date.now();
      if (now - last < 1500) return; // 几个事件常常同时触发，合并成一次
      last = now;
      callbackRef.current();
    };

    if (Platform.OS === 'web') {
      if (typeof document === 'undefined' || typeof window === 'undefined') return;
      const onVisibility = () => {
        if (document.visibilityState === 'visible') fire();
      };
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pageshow', fire);
      window.addEventListener('online', fire);
      window.addEventListener('focus', fire);
      return () => {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pageshow', fire);
        window.removeEventListener('online', fire);
        window.removeEventListener('focus', fire);
      };
    }

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') fire();
    });
    return () => subscription.remove();
  }, [enabled]);
}

/** 页面在前台时每隔 intervalMs 调用一次（后台不跑，省电省流量） */
export function useForegroundInterval(callback: () => void, intervalMs: number, enabled = true) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      const hidden = Platform.OS === 'web'
        ? typeof document !== 'undefined' && document.visibilityState !== 'visible'
        : AppState.currentState !== 'active';
      if (!hidden) callbackRef.current();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs]);
}
