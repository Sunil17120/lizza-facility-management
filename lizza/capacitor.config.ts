import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lizza.facility.management.lizza',
  appName: 'Lizza App',
  webDir: 'build', // Note: change to 'dist' if you are using Vite instead of Create React App
plugins: {
    CapacitorUpdater: {
      autoUpdate: true, // This allows the background updates we set up
    },
  },
};

export default config;