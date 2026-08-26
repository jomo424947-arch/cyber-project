import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ccms.gaminglounge',
  appName: 'CCMS',
  webDir: 'dist',
  server: {
    url: 'https://www.ccms-cafe.online',
    cleartext: false,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;