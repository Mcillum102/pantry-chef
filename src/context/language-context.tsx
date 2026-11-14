import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
} from 'react';

export type AppLanguage = 'zh' | 'en';

type LanguageContextValue = {
  language: AppLanguage;
  locale: 'zh-CN' | 'en-CA';
  text: (chinese: string, english: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

// 私用版只保留中文。文案里的英文字符串暂时留着，切换入口已经删除。
const language: AppLanguage = 'zh';

export function LanguageProvider({ children }: PropsWithChildren) {
  const text = useCallback(
    (chinese: string, _english: string) => chinese,
    []
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      locale: 'zh-CN',
      text,
    }),
    [text]
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
