import assert from 'node:assert/strict';
import test from 'node:test';

import { betterMemoryResult, createMemoryDeck, isMemoryComplete, resolvePair } from '../src/data/memory-game.ts';

function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

test('deck has each food exactly twice', () => {
  const deck = createMemoryDeck(6, seeded(1));
  assert.equal(deck.length, 12);
  const counts = new Map<string, number>();
  deck.forEach((card) => counts.set(card.food, (counts.get(card.food) ?? 0) + 1));
  assert.equal(counts.size, 6);
  assert.ok([...counts.values()].every((count) => count === 2));
});

test('resolves pairs and detects completion', () => {
  let deck = createMemoryDeck(2, seeded(3));
  const first = 0;
  const partner = deck.findIndex((card, index) => index !== first && card.food === deck[first].food);
  const other = deck.findIndex((card) => card.food !== deck[first].food);
  assert.equal(resolvePair(deck, first, other).matched, false);
  assert.equal(resolvePair(deck, first, first).matched, false);
  deck = resolvePair(deck, first, partner).deck;
  assert.equal(isMemoryComplete(deck), false);
  const rest = deck.map((card, index) => index).filter((index) => !deck[index].matched);
  deck = resolvePair(deck, rest[0], rest[1]).deck;
  assert.equal(isMemoryComplete(deck), true);
});

test('compares best results by moves then time', () => {
  assert.equal(betterMemoryResult(null, 10, 30), true);
  assert.equal(betterMemoryResult({ moves: 10, seconds: 30 }, 9, 60), true);
  assert.equal(betterMemoryResult({ moves: 10, seconds: 30 }, 10, 25), true);
  assert.equal(betterMemoryResult({ moves: 10, seconds: 30 }, 11, 5), false);
});
