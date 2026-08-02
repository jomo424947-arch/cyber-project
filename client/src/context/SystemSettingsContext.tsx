import React, { createContext, useContext, useState } from 'react';

interface SystemSettingsContextType {
  systemName: string;
  systemLogoUrl: string;
  walletQrUrl: string;
  walletPhoneNumber: string;
  bankDetails: string;
  hasConfiguredSettings: boolean;
  updateSystemSettings: (name: string, logoUrl: string) => void;
  updatePaymentSettings: (walletQrUrl: string, walletPhoneNumber: string, bankDetails: string) => void;
}

const STORAGE_NAME_KEY = 'ccms_system_name';
const STORAGE_LOGO_KEY = 'ccms_system_logo';
const STORAGE_WALLET_QR_KEY = 'ccms_wallet_qr';
const STORAGE_WALLET_PHONE_KEY = 'ccms_wallet_phone';
const STORAGE_BANK_DETAILS_KEY = 'ccms_bank_details';

const DEFAULT_SYSTEM_NAME = 'CCMS';
const DEFAULT_SYSTEM_LOGO = '';

const SystemSettingsContext = createContext<SystemSettingsContextType | undefined>(undefined);

export const SystemSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [systemName, setSystemName] = useState<string>(() => {
    return localStorage.getItem(STORAGE_NAME_KEY) || DEFAULT_SYSTEM_NAME;
  });

  const [systemLogoUrl, setSystemLogoUrl] = useState<string>(() => {
    return localStorage.getItem(STORAGE_LOGO_KEY) || DEFAULT_SYSTEM_LOGO;
  });

  const [walletQrUrl, setWalletQrUrl] = useState<string>(() => {
    return localStorage.getItem(STORAGE_WALLET_QR_KEY) || '';
  });

  const [walletPhoneNumber, setWalletPhoneNumber] = useState<string>(() => {
    return localStorage.getItem(STORAGE_WALLET_PHONE_KEY) || '';
  });

  const [bankDetails, setBankDetails] = useState<string>(() => {
    return localStorage.getItem(STORAGE_BANK_DETAILS_KEY) || '';
  });

  const [hasConfiguredSettings, setHasConfiguredSettings] = useState<boolean>(true);

  // Automatically update browser tab title & favicon when systemName or systemLogoUrl changes
  React.useEffect(() => {
    // 1. Update Tab Title: Display ONLY the Cafe Name (or CCMS fallback if empty)
    const titleText = systemName && systemName.trim() ? systemName.trim() : 'CCMS';
    document.title = titleText;

    // 2. Update Browser Favicon
    if (systemLogoUrl && systemLogoUrl.trim()) {
      let iconLink = document.querySelector("link[rel='icon']") as HTMLLinkElement;
      let shortcutLink = document.querySelector("link[rel='shortcut icon']") as HTMLLinkElement;

      if (!iconLink) {
        iconLink = document.createElement('link');
        iconLink.rel = 'icon';
        document.head.appendChild(iconLink);
      }
      iconLink.href = systemLogoUrl;

      if (shortcutLink) {
        shortcutLink.href = systemLogoUrl;
      }
    }
  }, [systemName, systemLogoUrl]);

  const updateSystemSettings = (name: string, logoUrl: string) => {
    const trimmedName = name.trim();
    const trimmedLogo = logoUrl.trim();
    
    setSystemName(trimmedName);
    setSystemLogoUrl(trimmedLogo);
    setHasConfiguredSettings(true);

    localStorage.setItem(STORAGE_NAME_KEY, trimmedName);
    localStorage.setItem(STORAGE_LOGO_KEY, trimmedLogo);
  };

  const updatePaymentSettings = (qrUrl: string, phone: string, bank: string) => {
    const trimmedQr = qrUrl.trim();
    const trimmedPhone = phone.trim();
    const trimmedBank = bank.trim();

    setWalletQrUrl(trimmedQr);
    setWalletPhoneNumber(trimmedPhone);
    setBankDetails(trimmedBank);

    localStorage.setItem(STORAGE_WALLET_QR_KEY, trimmedQr);
    localStorage.setItem(STORAGE_WALLET_PHONE_KEY, trimmedPhone);
    localStorage.setItem(STORAGE_BANK_DETAILS_KEY, trimmedBank);
  };

  return (
    <SystemSettingsContext.Provider 
      value={{ 
        systemName, 
        systemLogoUrl, 
        walletQrUrl, 
        walletPhoneNumber, 
        bankDetails, 
        hasConfiguredSettings,
        updateSystemSettings, 
        updatePaymentSettings 
      }}
    >
      {children}
    </SystemSettingsContext.Provider>
  );
};

export const useSystemSettings = () => {
  const context = useContext(SystemSettingsContext);
  if (!context) {
    throw new Error('useSystemSettings must be used within a SystemSettingsProvider');
  }
  return context;
};
