const storagePrefix = 'fresh-pantry:';

export async function readPersistedValue<T>(key: string): Promise<T | null> {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(`${storagePrefix}${key}`);
  return value ? (JSON.parse(value) as T) : null;
}

export async function writePersistedValue<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${storagePrefix}${key}`, JSON.stringify(value));
}
