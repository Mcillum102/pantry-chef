// 键盘遮挡计算（纯函数，方便测试）。
// iPhone 的 Safari / 主屏幕 App 弹出键盘时，页面本身的高度不变，只是「看得见的区域」(visualViewport) 变小，
// 有时还会整体往上平移。固定在底部的输入框、弹窗就会被键盘盖住。
// 这里算出：可见区域上方被推出去多少（top），下方被键盘盖住多少（bottom）。

export type KeyboardInsets = { top: number; bottom: number };

export const NO_KEYBOARD: KeyboardInsets = { top: 0, bottom: 0 };

/** 小于这个高度的变化当作地址栏伸缩之类的抖动，不算键盘 */
const MIN_KEYBOARD_HEIGHT = 80;

export function visualViewportInsets(input: {
  layoutHeight: number;
  viewportHeight: number;
  viewportOffsetTop: number;
}): KeyboardInsets {
  const top = Math.max(0, Math.round(input.viewportOffsetTop));
  const bottom = Math.max(0, Math.round(input.layoutHeight - input.viewportHeight - input.viewportOffsetTop));
  if (bottom + top < MIN_KEYBOARD_HEIGHT) return NO_KEYBOARD;
  return { top, bottom };
}

export function sameInsets(a: KeyboardInsets, b: KeyboardInsets) {
  return a.top === b.top && a.bottom === b.bottom;
}
