import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, View, type StyleProp, type ViewStyle } from 'react-native';

import { useKeyboardInsets } from '@/hooks/use-keyboard-insets';

/**
 * 代替 KeyboardAvoidingView：键盘弹出时把内容往上让，保证输入框和底部按钮不被盖住。
 * 原生 iOS 用系统的 KeyboardAvoidingView；网页（iPhone 主屏幕 App）它不起作用，改用 visualViewport 计算的留白。
 * 放在全屏弹窗 / 底部弹出层的最外层使用。
 */
export function KeyboardAware({ style, children }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  if (Platform.OS !== 'web') {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={style}>
        {children}
      </KeyboardAvoidingView>
    );
  }
  return <WebKeyboardAware style={style}>{children}</WebKeyboardAware>;
}

function WebKeyboardAware({ style, children }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { top, bottom } = useKeyboardInsets();
  return <View style={[style, (top || bottom) ? { paddingTop: top, paddingBottom: bottom } : null]}>{children}</View>;
}
