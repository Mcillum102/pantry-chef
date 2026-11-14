export type PasscodeStrength = { level: 0 | 1 | 2 | 3; label: string; tips: string[] };

/** 厨房口令强度：只做提示，不强制。level 0 不可用，1 弱，2 中，3 强 */
export function evaluatePasscode(passcode: string): PasscodeStrength {
  const tips: string[] = [];
  if (passcode.length < 6) {
    return { level: 0, label: '太短', tips: ['至少 6 位，建议 8 位以上'] };
  }
  let score = 0;
  if (passcode.length >= 8) score += 1;
  else tips.push('再长一点，8 位以上更安全');
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((re) => re.test(passcode)).length
    + (/[^\x00-\x7F]/.test(passcode) ? 1 : 0);
  if (kinds >= 2) score += 1;
  else tips.push('混合字母、数字或符号');
  if (passcode.length >= 12 || kinds >= 3) score += 1;
  const repetitive = /^(.)\1+$/.test(passcode) || '0123456789abcdefghijklmnopqrstuvwxyz'.includes(passcode.toLowerCase());
  if (repetitive) return { level: 1, label: '弱', tips: ['不要用重复或连续的字符'] };
  if (/(19|20)\d{2}[01]\d[0-3]\d/.test(passcode)) tips.push('别直接用生日，容易被猜到');
  const level = Math.max(1, Math.min(3, score)) as 1 | 2 | 3;
  return { level, label: level === 3 ? '强' : level === 2 ? '中' : '弱', tips };
}

export const MAX_PASSCODE_ATTEMPTS = 5;
export const PASSCODE_LOCK_MS = 60_000;

export type PasscodeAttempts = { failures: number; lockedUntil: number | null };

/** 记录一次口令错误；达到上限后锁定一段时间 */
export function recordPasscodeFailure(state: PasscodeAttempts, now: number): PasscodeAttempts {
  const failures = state.failures + 1;
  if (failures >= MAX_PASSCODE_ATTEMPTS) return { failures: 0, lockedUntil: now + PASSCODE_LOCK_MS };
  return { failures, lockedUntil: null };
}

/** 剩余锁定秒数（未锁定为 0） */
export function lockSecondsLeft(state: PasscodeAttempts, now: number) {
  return state.lockedUntil && state.lockedUntil > now ? Math.ceil((state.lockedUntil - now) / 1000) : 0;
}
