import type { Href } from 'expo-router';

export type MiniGame = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  /** 游戏页面路由（单独成页的游戏用）。没有 href 也没有 screen 时卡片显示「即将上线」 */
  href?: Href;
  /** 内置游戏：在游戏页里全屏打开（见 src/app/games.tsx 的 GAME_SCREENS） */
  screen?: 'memory';
};

/**
 * 游戏页（src/app/games.tsx）里显示的小游戏列表。
 * 新增一个游戏：在 src/components/games/ 下写组件，在 games.tsx 的 GAME_SCREENS 里登记，再在这里加一条。
 */
export const MINI_GAMES: readonly MiniGame[] = [
  {
    id: 'memory',
    name: '食材记忆翻牌',
    emoji: '🃏',
    description: '翻开两张一样的食材就配对成功，比比谁的步数更少。',
    screen: 'memory',
  },
];
