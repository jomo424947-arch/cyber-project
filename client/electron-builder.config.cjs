const path = require('path');
const os = require('os');

const tempOutputDir = path.join(os.tmpdir(), 'ccms-dist-output');

module.exports = {
  appId: 'com.ccms.gaminglounge',
  productName: 'CCMS',
  extraMetadata: {
    version: require('./package.json').version,
  },
  electronVersion: '31.2.0',
  npmRebuild: false,
  asar: true,
  directories: {
    output: tempOutputDir,
    buildResources: 'build',
  },
  files: [
    'dist/**/*',
    'electron/**/*',
    'build/**/*',
  ],
  publish: [
    {
      provider: 'github',
      owner: 'jomo424947-arch',
      repo: 'cyber-project',
      releaseType: 'release',
    },
  ],
  win: {
    target: ['nsis'],
    icon: 'build/icon.ico',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico',
    installerHeaderIcon: 'build/icon.ico',
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'CCMS',
    artifactName: 'CCMS-Setup-${version}.${ext}',
  },
};
