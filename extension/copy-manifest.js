import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceManifest = path.join(__dirname, 'manifest.json');
const targetManifest = path.join(__dirname, 'dist', 'manifest.json');

try {
  // Ensure dist directory exists
  if (!fs.existsSync(path.join(__dirname, 'dist'))) {
    fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
  }

  // Copy manifest
  fs.copyFileSync(sourceManifest, targetManifest);
  console.log('✓ Successfully copied manifest.json to dist/manifest.json');

  // Create mock icons directory so Chrome does not warn
  const iconsDir = path.join(__dirname, 'dist', 'icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }
} catch (err) {
  console.error('Failed to copy manifest:', err);
  process.exit(1);
}
