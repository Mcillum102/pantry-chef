import type { Href } from 'expo-router';

export type MiniGame = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  /** 游戏页面路由，例如 '/games/memory'。没有时卡片显示「即将上线」 */
  href?: Href;
};

/**
 * 游戏页（src/app/games.tsx）里显示的小游戏列表。
 * 新增一个游戏：在 src/app/games/ 下建页面，然后在这里加一条，填上 href。
 */
export const MINI_GAMES: readonly MiniGame[] = [];
