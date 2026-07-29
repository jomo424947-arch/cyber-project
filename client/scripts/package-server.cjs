const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '../..');
const serverDir = path.join(rootDir, 'server');
const destDir = path.resolve(__dirname, '../electron/server');

console.log('📦 Packaging server for Electron build...');

// 1. Create destination directory
if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true, force: true });
}
fs.mkdirSync(destDir, { recursive: true });

// 2. Copy compiled server files (server/dist)
const srcDist = path.join(serverDir, 'dist');
if (!fs.existsSync(srcDist)) {
  console.error(`❌ Server build not found at: ${srcDist}. Make sure to build the server first.`);
  process.exit(1);
}

function copyFolderRecursiveSync(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const files = fs.readdirSync(source);
  for (const file of files) {
    const curSource = path.join(source, file);
    const curTarget = path.join(target, file);
    if (fs.lstatSync(curSource).isDirectory()) {
      copyFolderRecursiveSync(curSource, curTarget);
    } else {
      fs.copyFileSync(curSource, curTarget);
    }
  }
}

copyFolderRecursiveSync(srcDist, destDir);
console.log('✓ Copied server/dist to electron/server');

// 3. Copy package.json to the destination
fs.copyFileSync(path.join(serverDir, 'package.json'), path.join(destDir, 'package.json'));
console.log('✓ Copied package.json');

// 3b. Copy .env file to the destination (needed for Supabase cloud credentials)
const envFile = path.join(serverDir, '.env');
const rootEnvFile = path.join(rootDir, '.env');
const envSource = fs.existsSync(envFile) ? envFile : fs.existsSync(rootEnvFile) ? rootEnvFile : null;
if (envSource) {
  fs.copyFileSync(envSource, path.join(destDir, '.env'));
  console.log(`✓ Copied .env from ${path.relative(rootDir, envSource)}`);
} else {
  console.warn('⚠ No .env file found — Supabase cloud features may not work in the packaged app.');
}

// 4. Install production dependencies inside destination
console.log('⚙ Installing production node_modules for server...');
try {
  execSync('npm install --omit=dev --no-audit --no-fund', {
    cwd: destDir,
    stdio: 'inherit',
  });
  console.log('✓ Successfully installed production node_modules for server');
} catch (err) {
  console.error('❌ Failed to install production dependencies for server:', err.message);
  process.exit(1);
}

console.log('🎉 Server packaging completed successfully.');
