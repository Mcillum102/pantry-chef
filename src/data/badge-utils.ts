export function formatBadgeCount(count: number, maximum = 99) {
  const normalizedCount = Math.max(0, Math.floor(count));
  if (normalizedCount === 0) return null;
  return normalizedCount > maximum ? `${maximum}+` : String(normalizedCount);
}
