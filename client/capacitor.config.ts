import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ccms.gaminglounge',
  appName: 'CCMS',
  webDir: 'dist',
  server: {
    url: 'http://64.202.188.31',
    cleartext: true,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;