import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ccms.gaminglounge',
  appName: 'CCMS',
  webDir: 'dist',
  server: {
    url: 'http://148.66.152.6',
    cleartext: true,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;