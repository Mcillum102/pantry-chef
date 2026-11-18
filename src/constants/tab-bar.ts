/** 底部 Tab 栏（含边框）的高度，见 src/components/app-tab-bar.tsx 的 innerContainer */
export const TAB_BAR_HEIGHT = 68;

/**
 * 网页版 Tab 栏离屏幕底边的距离，必须和 src/global.css 里 #app-tab-bar-v2 的 bottom 一致：
 * 压进 iPhone 底部 Home 横条的安全区一部分，只留出横条本身的位置。
 */
export function webTabBarBottom(safeAreaBottom: number) {
  return Math.max(8, safeAreaBottom - 14);
}
