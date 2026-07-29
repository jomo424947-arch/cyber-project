import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations } from '../utils/translations';

type Language = 'en' | 'ar';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, replacements?: Record<string, string>) => string;
  isRtl: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem('ccms-language') as Language) || 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('ccms-language', lang);
  };

  useEffect(() => {
    const isRtl = language === 'ar';
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = language;

    // Dynamically inject Alexandria and Cairo Google Fonts for Arabic typography
    let link = document.getElementById('arabic-font-link');
    if (isRtl && !link) {
      const newLink = document.createElement('link');
      newLink.id = 'arabic-font-link';
      newLink.rel = 'stylesheet';
      newLink.href = 'https://fonts.googleapis.com/css2?family=Alexandria:wght@300;400;500;600;700;800;900&family=Cairo:wght@300;400;500;600;700;800;900&display=swap';
      document.head.appendChild(newLink);
    }
  }, [language]);

  const t = (key: string, replacements?: Record<string, string>): string => {
    let translation = translations[language]?.[key];
    if (translation === undefined) {
      // Fallback to English
      translation = translations['en']?.[key] || key;
    }

    if (replacements && typeof translation === 'string') {
      let result = translation;
      for (const [k, v] of Object.entries(replacements)) {
        result = result.replace(`{${k}}`, v);
      }
      return result;
    }

    return translation;
  };

  const isRtl = language === 'ar';

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRtl }}>
      <div 
        style={{ 
          fontFamily: isRtl ? 'Cairo, system-ui, sans-serif' : 'inherit',
          direction: isRtl ? 'rtl' : 'ltr'
        }}
      >
        {children}
      </div>
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
