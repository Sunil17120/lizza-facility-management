import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lizza.facility.management.v2',
  appName: 'Lizza App',
  webDir: 'build', 
  plugins: {
    CapacitorUpdater: {
      autoUpdate: true, 
  
    },
  },
};

export default config;