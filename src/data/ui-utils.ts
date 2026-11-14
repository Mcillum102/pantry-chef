/** 拆出开头的整数，例如 "2/3" → [2, "/3"]，"650" → [650, ""] */
export function splitLeadingNumber(value: string): [number, string] | null {
  const match = /^(\d+)(.*)$/s.exec(value);
  return match ? [Number(match[1]), match[2]] : null;
}

/** 把 #RRGGBB 调亮（amount > 0）或调暗（amount < 0），amount 取 -1～1 */
export function shadeColor(hex: string, amount: number) {
  const value = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) return hex;
  const channel = (index: number) => {
    const c = parseInt(value.slice(index, index + 2), 16);
    const next = amount >= 0 ? c + (255 - c) * amount : c * (1 + amount);
    return Math.round(Math.min(255, Math.max(0, next))).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

/** 由一个颜色生成好看的三段渐变 */
export function gradientFrom(color: string): readonly string[] {
  return [shadeColor(color, 0.16), color, shadeColor(color, -0.24)];
}
