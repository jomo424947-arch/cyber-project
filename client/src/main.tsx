import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { LanguageProvider } from './context/LanguageContext';
import { SystemSettingsProvider } from './context/SystemSettingsContext';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ThemeProvider>
        <ToastProvider>
          <LanguageProvider>
            <SystemSettingsProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </SystemSettingsProvider>
          </LanguageProvider>
        </ToastProvider>
      </ThemeProvider>
    </HashRouter>
  </React.StrictMode>
);
