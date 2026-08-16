import React, { createContext, useContext, useState, useEffect } from 'react';

export type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  fontScale: number; // e.g. 100 (%)
  iconScale: number; // e.g. 100 (%)
  setFontScale: (scale: number) => void;
  setIconScale: (scale: number) => void;
  resetVisualScale: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('ccms-theme') as Theme;
    if (savedTheme === 'dark' || savedTheme === 'light') {
      return savedTheme;
    }
    // Default to dark mode for cyberpunk aesthetic
    return 'dark';
  });

  const [fontScale, setFontScaleState] = useState<number>(() => {
    const savedFontScale = localStorage.getItem('ccms-font-scale');
    if (savedFontScale) {
      const parsed = parseFloat(savedFontScale);
      if (!isNaN(parsed) && parsed >= 50 && parsed <= 200) {
        return parsed;
      }
    }
    return 100;
  });

  const [iconScale, setIconScaleState] = useState<number>(() => {
    const savedIconScale = localStorage.getItem('ccms-icon-scale');
    if (savedIconScale) {
      const parsed = parseFloat(savedIconScale);
      if (!isNaN(parsed) && parsed >= 50 && parsed <= 200) {
        return parsed;
      }
    }
    return 100;
  });

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('ccms-theme', newTheme);
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const setFontScale = (scale: number) => {
    const clamped = Math.min(Math.max(scale, 70), 160);
    setFontScaleState(clamped);
    localStorage.setItem('ccms-font-scale', clamped.toString());
  };

  const setIconScale = (scale: number) => {
    const clamped = Math.min(Math.max(scale, 70), 160);
    setIconScaleState(clamped);
    localStorage.setItem('ccms-icon-scale', clamped.toString());
  };

  const resetVisualScale = () => {
    setFontScale(100);
    setIconScale(100);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const fontFactor = fontScale / 100;
    const iconFactor = iconScale / 100;
    document.documentElement.style.setProperty('--font-scale', fontFactor.toString());
    document.documentElement.style.setProperty('--icon-scale', iconFactor.toString());
  }, [fontScale, iconScale]);

  return (
    <ThemeContext.Provider 
      value={{ 
        theme, 
        setTheme, 
        toggleTheme, 
        fontScale, 
        iconScale, 
        setFontScale, 
        setIconScale, 
        resetVisualScale 
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

