import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const sourceAsset = path.join(projectRoot, 'public', 'icons', 'Vivid Orange Interlocking Knot Logo.png');

if (!fs.existsSync(sourceAsset)) {
  console.error('Source asset missing:', sourceAsset);
  process.exit(1);
}

console.log('1. Reading master asset and keying background to transparent alpha...');
const tempDir = '/tmp';
const rawPath = path.join(tempDir, 'raw_input.rgba');
execSync(`magick "${sourceAsset}" -depth 8 "${rawPath}"`);

const raw = fs.readFileSync(rawPath);
const out = Buffer.alloc(raw.length);

const ORANGE_R = 254;
const ORANGE_G = 97;
const ORANGE_B = 2;

let minX = 1254, maxX = 0, minY = 1254, maxY = 0;

for (let y = 0; y < 1254; y++) {
  for (let x = 0; x < 1254; x++) {
    const idx = (y * 1254 + x) * 4;
    const r = raw[idx];
    const g = raw[idx + 1];
    const b = raw[idx + 2];

    if (r > 15 || g > 15) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const alpha = Math.min(255, Math.max(0, Math.round((r / ORANGE_R) * 255)));
      out[idx] = ORANGE_R;
      out[idx + 1] = ORANGE_G;
      out[idx + 2] = ORANGE_B;
      out[idx + 3] = alpha;
    } else {
      out[idx] = 0;
      out[idx + 1] = 0;
      out[idx + 2] = 0;
      out[idx + 3] = 0;
    }
  }
}

console.log('Logo bounding box:', { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 });

const tempRaw = path.join(tempDir, 'knot_transparent_raw.rgba');
fs.writeFileSync(tempRaw, out);

const transparentFull = path.join(tempDir, 'knot_transparent_full.png');
execSync(`magick -size 1254x1254 -depth 8 rgba:"${tempRaw}" "${transparentFull}"`);

// Crop 768x768 centered at mark center (X=626.5, Y=625.0) -> offset +242+241
const master768 = path.join(tempDir, 'knot_master_768.png');
execSync(`magick "${transparentFull}" -crop 768x768+242+241 +repage "${master768}"`);
console.log('2. Created transparent master 768x768 at:', master768);

// Generate all PNG resolutions
const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
const buildIconsDir = path.join(projectRoot, 'build', 'icons');
const publicIconsDir = path.join(projectRoot, 'public', 'icons');

fs.mkdirSync(buildIconsDir, { recursive: true });
fs.mkdirSync(publicIconsDir, { recursive: true });

console.log('3. Generating resized transparent PNG icons for build/icons and public/icons...');
for (const size of sizes) {
  const buildTarget = path.join(buildIconsDir, `${size}x${size}.png`);
  const publicTarget = path.join(publicIconsDir, `${size}x${size}.png`);
  
  execSync(`magick "${master768}" -filter Lanczos -resize ${size}x${size} "${buildTarget}"`);
  fs.copyFileSync(buildTarget, publicTarget);
  console.log(` - Generated ${size}x${size}.png`);
}

// 512x512 build/icon.png
const buildIconPng = path.join(projectRoot, 'build', 'icon.png');
fs.copyFileSync(path.join(buildIconsDir, '512x512.png'), buildIconPng);
console.log(' - Copied 512x512.png to build/icon.png');

// Clean up temp raw files
fs.unlinkSync(rawPath);
fs.unlinkSync(tempRaw);
fs.unlinkSync(transparentFull);

console.log('✅ Raster icons generated successfully.');
