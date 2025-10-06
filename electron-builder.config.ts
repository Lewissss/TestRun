import type { Configuration } from 'electron-builder';

const config: Configuration = {
  appId: 'com.testrun.app',
  productName: 'TestRun',
  directories: {
    output: 'release',
    buildResources: 'resources'
  },
  files: [
    'dist/main/**/*',
    'dist/preload/**/*',
    'dist/renderer/**/*',
    '!**/*.map'
  ],
  extraMetadata: {
    main: 'dist/main/main.js'
  },
  mac: {
    target: 'dmg',
    category: 'public.app-category.developer-tools',
    icon: 'resources/icon.png'
  },
  win: {
    target: 'nsis',
    icon: 'resources/icon.png'
  },
  linux: {
    target: ['AppImage'],
    category: 'Utility',
    icon: 'resources/icon.png'
  }
};

export default config;
