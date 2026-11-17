import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * 只在网页生效。iPhone 上收起键盘后，Safari 有时不会把被推上去的页面移回来，
 * 底部 Tab 和内容就会错位、留下一条空白。键盘收起时把页面滚回顶部。
 */
export function ViewportGuard() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') return;

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
      document.removeEventListener('focusout', settle);
      window.visualViewport?.removeEventListener('resize', settle);
      window.removeEventListener('orientationchange', settle);
    };
  }, []);

  return null;
}
