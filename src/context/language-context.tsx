import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
} from 'react';

import { usePersistentState } from '@/hooks/use-persistent-state';

export type AppLanguage = 'zh' | 'en';

type LanguageContextValue = {
  language: AppLanguage;
  locale: 'zh-CN' | 'en-CA';
  setLanguage: (language: AppLanguage) => void;
  text: (chinese: string, english: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguage] = usePersistentState<AppLanguage>('language', 'zh');
  const text = useCallback(
    (chinese: string, english: string) => (language === 'zh' ? chinese : english),
    [language]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      locale: language === 'zh' ? 'zh-CN' : 'en-CA',
      setLanguage,
      text,
    }),
    [language, setLanguage, text]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error('useLanguage must be used inside LanguageProvider');
  }

  return context;
}
