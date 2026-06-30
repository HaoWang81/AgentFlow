import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

const TARGET_DIR = path.resolve('resources', 'python-env');
const VERSION = '20240107'; 
const PY_VERSION = '3.10.13';

const urls = {
  win32: {
    x64: `https://github.com/indygreg/python-build-standalone/releases/download/${VERSION}/cpython-${PY_VERSION}+${VERSION}-x86_64-pc-windows-msvc-shared-install_only.tar.gz`,
  },
  darwin: {
    x64: `https://github.com/indygreg/python-build-standalone/releases/download/${VERSION}/cpython-${PY_VERSION}+${VERSION}-x86_64-apple-darwin-install_only.tar.gz`,
    arm64: `https://github.com/indygreg/python-build-standalone/releases/download/${VERSION}/cpython-${PY_VERSION}+${VERSION}-aarch64-apple-darwin-install_only.tar.gz`,
  },
  linux: {
    x64: `https://github.com/indygreg/python-build-standalone/releases/download/${VERSION}/cpython-${PY_VERSION}+${VERSION}-x86_64-unknown-linux-gnu-install_only.tar.gz`,
    arm64: `https://github.com/indygreg/python-build-standalone/releases/download/${VERSION}/cpython-${PY_VERSION}+${VERSION}-aarch64-unknown-linux-gnu-install_only.tar.gz`,
  }
};

const platform = os.platform();
const arch = os.arch();

const url = urls[platform]?.[arch];

if (!url) {
  console.error(`No prebuilt Python found for ${platform} ${arch}`);
  process.exit(1);
}

if (fs.existsSync(TARGET_DIR)) {
  console.log('Python environment already exists, skipping download.');
  process.exit(0);
}

console.log(`Downloading Python from ${url}...`);

fs.mkdirSync('resources', { recursive: true });
const tempArchive = path.resolve('resources', 'python.tar.gz');

async function download() {
  console.log('Downloading with curl (with auto-resume and retry)...');
  execSync(`curl -L -f --retry 5 -C - -o "${tempArchive}" "${url}"`, { stdio: 'inherit' });
  
  console.log('Download complete. Extracting...');
  fs.mkdirSync(TARGET_DIR, { recursive: true });
  
  execSync(`tar -xzf "${tempArchive}" -C "${TARGET_DIR}"`);
  fs.unlinkSync(tempArchive);
  console.log('Python environment ready at', TARGET_DIR);
}

download().catch(err => {
  console.error('Failed to download Python:', err);
  process.exit(1);
});
