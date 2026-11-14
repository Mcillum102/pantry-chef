import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Text, type StyleProp, type TextStyle } from 'react-native';

import { splitLeadingNumber } from '@/data/ui-utils';

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** 数字从上一次的值滚动到新值；不是数字开头的字符串原样显示 */
export function CountUp({ value, style, duration = 800 }: { value: string | number; style?: StyleProp<TextStyle>; duration?: number }) {
  const text = String(value);
  const parsed = splitLeadingNumber(text);
  const target = parsed?.[0] ?? 0;
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (!parsed) return;
    let frame = 0;
    let cancelled = false;
    const from = fromRef.current;
    const start = Date.now();

    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced || from === target) {
        fromRef.current = target;
        setShown(target);
        return;
      }
      const step = () => {
        const progress = Math.min(1, (Date.now() - start) / duration);
        const next = Math.round(from + (target - from) * easeOutCubic(progress));
        setShown(next);
        if (progress < 1) frame = requestAnimationFrame(step);
        else fromRef.current = target;
      };
      frame = requestAnimationFrame(step);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      fromRef.current = target;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return <Text style={style}>{parsed ? `${shown}${parsed[1]}` : text}</Text>;
}
