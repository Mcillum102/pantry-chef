export const MEMORY_FOODS = ['🍅', '🥚', '🥕', '🥦', '🍄', '🌽', '🧄', '🍆', '🥔', '🍋', '🍓', '🥑'] as const;

export type MemoryCard = { id: number; food: string; matched: boolean };

/** 生成一副打乱的牌：pairs 对食材，每种两张。random 可注入，便于测试 */
export function createMemoryDeck(pairs = 6, random: () => number = Math.random): MemoryCard[] {
  const foods = shuffle([...MEMORY_FOODS], random).slice(0, Math.min(pairs, MEMORY_FOODS.length));
  return shuffle([...foods, ...foods], random).map((food, id) => ({ id, food, matched: false }));
}

function shuffle<T>(items: T[], random: () => number) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** 翻开的两张是否配对；配对则标记为已完成 */
export function resolvePair(deck: MemoryCard[], first: number, second: number): { deck: MemoryCard[]; matched: boolean } {
  const matched = first !== second && deck[first]?.food === deck[second]?.food;
  if (!matched) return { deck, matched: false };
  return { deck: deck.map((card, index) => (index === first || index === second ? { ...card, matched: true } : card)), matched: true };
}

export function isMemoryComplete(deck: MemoryCard[]) {
  return deck.length > 0 && deck.every((card) => card.matched);
}

export type MemoryBest = { moves: number; seconds: number } | null;

/** 步数少的更好；步数相同比用时 */
export function betterMemoryResult(best: MemoryBest, moves: number, seconds: number): boolean {
  if (!best) return true;
  return moves < best.moves || (moves === best.moves && seconds < best.seconds);
}
