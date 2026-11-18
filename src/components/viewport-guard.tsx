import { useEffect } from 'react';
import { Platform } from 'react-native';

import { appViewportHeight } from '@/data/viewport-utils';

export function isStandaloneWebApp() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** 这台手机的底部安全区（Home 横条）有多高，读 CSS 的 env(safe-area-inset-bottom) */
export function readSafeAreaBottom() {
  if (typeof document === 'undefined') return 0;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px)';
  document.body.appendChild(probe);
  const value = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  probe.remove();
  return value;
}

/** 当前这台设备的屏幕读数（「我的」页底部的诊断信息也用它） */
export function readViewport() {
  const reading = {
    standalone: isStandaloneWebApp(),
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
  };
  return { ...reading, appHeight: appViewportHeight(reading), safeAreaBottom: readSafeAreaBottom() };
}

/**
 * 只在网页生效。
 * 1. 按这台手机自己的屏幕算出页面高度，写进 CSS 变量 --app-height（见 global.css），不写死数值。
 * 2. iPhone 上收起键盘后，Safari 有时不会把被推上去的页面移回来，
 *    底部 Tab 和内容就会错位、留下一条空白。键盘收起时把页面滚回顶部。
 */
export function ViewportGuard() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') return;

    const applyHeight = () => {
      const { appHeight } = readViewport();
      if (appHeight > 0) document.documentElement.style.setProperty('--app-height', `${appHeight}px`);
    };
    // 旋转后 iOS 要过一会儿才更新尺寸，过一会儿再量一次
    let measureTimer: ReturnType<typeof setTimeout> | null = null;
    const remeasure = () => {
      applyHeight();
      if (measureTimer) clearTimeout(measureTimer);
      measureTimer = setTimeout(applyHeight, 350);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') remeasure();
    };
    applyHeight();
    window.addEventListener('resize', remeasure);
    window.addEventListener('orientationchange', remeasure);
    window.addEventListener('pageshow', remeasure);
    document.addEventListener('visibilitychange', onVisible);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const isEditing = () => {
      const active = document.activeElement;
      return Boolean(active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable));
    };
    const settle = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (isEditing()) return;
        if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
        if (document.scrollingElement && document.scrollingElement.scrollTop !== 0) document.scrollingElement.scrollTop = 0;
      }, 120);
    };

    document.addEventListener('focusout', settle);
    window.visualViewport?.addEventListener('resize', settle);
    window.addEventListener('orientationchange', settle);
    return () => {
      if (timer) clearTimeout(timer);
      if (measureTimer) clearTimeout(measureTimer);
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('orientationchange', remeasure);
      window.removeEventListener('pageshow', remeasure);
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('focusout', settle);
      window.visualViewport?.removeEventListener('resize', settle);
      window.removeEventListener('orientationchange', settle);
    };
  }, []);

  return null;
}
