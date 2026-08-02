const fs = require('fs');
const path = require('path');
const os = require('os');

const tempDir = path.join(os.tmpdir(), 'ccms-dist-output');
const releaseDir = path.join(__dirname, '../release');

if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

if (fs.existsSync(tempDir)) {
  const files = fs.readdirSync(tempDir);
  for (const file of files) {
    if (file.endsWith('.exe') || file.endsWith('.blockmap') || file.endsWith('.yml') || file.endsWith('.yaml')) {
      const src = path.join(tempDir, file);
      const dest = path.join(releaseDir, file);
      try {
        fs.copyFileSync(src, dest);
        console.log(`✓ Copied ${file} -> release/`);
      } catch (err) {
        console.warn(`Could not copy ${file}: ${err.message}`);
      }
    }
  }
}
