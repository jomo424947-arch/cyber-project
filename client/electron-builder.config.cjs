const path = require('path');
const os = require('os');

const tempOutputDir = path.join(os.tmpdir(), 'ccms-dist-output');

module.exports = {
  appId: 'com.ccms.gaminglounge',
  productName: 'CCMS Cyber Cafe',
  electronVersion: '31.2.0',
  npmRebuild: false,
  asar: true,
  directories: {
    output: tempOutputDir,
  },
  files: [
    'dist/**/*',
    'electron/**/*',
  ],
  win: {
    target: ['nsis'],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
};
