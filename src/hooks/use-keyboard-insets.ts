import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

import { NO_KEYBOARD, sameInsets, visualViewportInsets, type KeyboardInsets } from '@/data/keyboard-utils';

/**
 * 当前键盘挡住了多少：bottom = 底部被键盘盖住的高度，top = 页面被系统往上推出去的高度（只在网页出现）。
 * 原生 iOS / Android 用系统键盘事件；网页（包括 iPhone 主屏幕 App）用 visualViewport。
 */
export function useKeyboardInsets(): KeyboardInsets {
  const [insets, setInsets] = useState<KeyboardInsets>(NO_KEYBOARD);

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || !window.visualViewport) return;
      const viewport = window.visualViewport;
      const update = () => {
        const next = visualViewportInsets({
          layoutHeight: window.innerHeight,
          viewportHeight: viewport.height,
          viewportOffsetTop: viewport.offsetTop,
        });
        setInsets((current) => (sameInsets(current, next) ? current : next));
      };
      update();
      viewport.addEventListener('resize', update);
      viewport.addEventListener('scroll', update);
      return () => {
        viewport.removeEventListener('resize', update);
        viewport.removeEventListener('scroll', update);
      };
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => setInsets({ top: 0, bottom: event.endCoordinates.height }));
    const hide = Keyboard.addListener(hideEvent, () => setInsets(NO_KEYBOARD));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return insets;
}
