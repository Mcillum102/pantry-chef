// 网页版（iPhone 主屏幕 App）页面该有多高。纯函数，方便测试。
//
// iOS 26 以后，主屏幕 App 的 height:100% / innerHeight 有时会少算底部 Home 横条那一条，
// 页面最下面空出一块；但在别的机型 / 系统版本上又是准的。所以不写死任何数值，
// 每台手机打开时按它自己的屏幕尺寸算：主屏幕模式下 App 本来就铺满整块屏幕。

export type ViewportReading = {
  /** 主屏幕模式（display-mode: standalone 或 navigator.standalone） */
  standalone: boolean;
  innerWidth: number;
  innerHeight: number;
  screenWidth: number;
  screenHeight: number;
};

/** 浏览器报的高度和屏幕差太多时（iPad 分屏、桌面浏览器等）不信屏幕尺寸 */
const MAX_CORRECTION = 120;

export function appViewportHeight({ standalone, innerWidth, innerHeight, screenWidth, screenHeight }: ViewportReading) {
  if (!standalone || innerHeight <= 0) return innerHeight;
  // iPhone 的 screen 宽高不随横竖屏交换：竖屏宽度对得上 screen.width，横屏对得上 screen.height
  const portrait = Math.abs(innerWidth - screenWidth) <= 1;
  const landscape = Math.abs(innerWidth - screenHeight) <= 1;
  const full = portrait ? screenHeight : landscape ? screenWidth : innerHeight;
  // 只往大了修正（补上被少算的那一条），而且修正量要在合理范围内
  if (full < innerHeight || full - innerHeight > MAX_CORRECTION) return innerHeight;
  return full;
}
