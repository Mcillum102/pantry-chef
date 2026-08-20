import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';

import { readPersistedValue, writePersistedValue } from '@/services/persistence';

export function usePersistentState<T>(
  key: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState(initialValue);
  const [isHydrated, setIsHydrated] = useState(false);
  const initialValueRef = useRef(initialValue);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      try {
        const storedValue = await readPersistedValue<T>(key);
        if (active) setValue(storedValue ?? initialValueRef.current);
      } catch (error) {
        console.warn(`Unable to restore persisted state: ${key}`, error);
      } finally {
        if (active) setIsHydrated(true);
      }
    }

    void hydrate();
    return () => {
      active = false;
    };
  }, [key]);

  useEffect(() => {
    if (!isHydrated) return;
    const timer = setTimeout(() => {
      void writePersistedValue(key, value).catch((error) => {
        console.warn(`Unable to persist state: ${key}`, error);
      });
    }, 120);

    return () => clearTimeout(timer);
  }, [isHydrated, key, value]);

  return [value, setValue, isHydrated];
}
