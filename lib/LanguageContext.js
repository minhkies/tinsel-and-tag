'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { translations } from './i18n';
import { Globe } from 'lucide-react';

const LanguageContext = createContext({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('tt_lang');
        if (saved === 'vi' || saved === 'en') return saved;
        if (typeof navigator !== 'undefined' && navigator.language?.startsWith('vi')) {
          return 'vi';
        }
      } catch {
        // Ignore storage errors during initialization
      }
    }
    return 'en';
  });

  // Synchronize document lang attribute with active language
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  const setLanguage = useCallback((lang) => {
    if (lang !== 'en' && lang !== 'vi') return;
    setLanguageState(lang);
    try {
      localStorage.setItem('tt_lang', lang);
    } catch {
      // Ignore storage errors
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, []);

  // Translation lookup function
  const t = useCallback(
    (keyPath, replacements = {}) => {
      const parts = keyPath.split('.');
      let current = translations[language];

      for (const part of parts) {
        if (!current || typeof current !== 'object') {
          current = undefined;
          break;
        }
        current = current[part];
      }

      // Fallback to English if missing in current language
      if (current === undefined && language !== 'en') {
        let fallback = translations.en;
        for (const part of parts) {
          if (!fallback || typeof fallback !== 'object') {
            fallback = undefined;
            break;
          }
          fallback = fallback[part];
        }
        current = fallback;
      }

      if (typeof current !== 'string') {
        return keyPath;
      }

      // Replace template placeholders e.g. {name}, {claimed}, {total}
      let result = current;
      for (const [k, v] of Object.entries(replacements)) {
        result = result.replaceAll(`{${k}}`, String(v ?? ''));
      }
      return result;
    },
    [language]
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
    }),
    [language, setLanguage, t]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

/**
 * Modern Segmented Language Toggle [ EN | VI ]
 */
export function LanguageToggle({ className = '' }) {
  const { language, setLanguage } = useLanguage();

  return (
    <div
      className={`inline-flex items-center gap-1 p-1 bg-white border border-[#E7E5E0] rounded-full shadow-2xs ${className}`}
      aria-label="Language Toggle"
    >
      <Globe className="w-3.5 h-3.5 text-[#78716C] ml-1.5 mr-0.5 shrink-0" />
      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={`px-2 py-0.5 rounded-full text-xs font-bold transition cursor-pointer ${
          language === 'en'
            ? 'bg-[#1B4332] text-[#FAF9F6] shadow-2xs'
            : 'text-[#78716C] hover:text-[#1C1917]'
        }`}
        title="English"
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLanguage('vi')}
        className={`px-2 py-0.5 rounded-full text-xs font-bold transition cursor-pointer ${
          language === 'vi'
            ? 'bg-[#1B4332] text-[#FAF9F6] shadow-2xs'
            : 'text-[#78716C] hover:text-[#1C1917]'
        }`}
        title="Tiếng Việt"
      >
        VI
      </button>
    </div>
  );
}
