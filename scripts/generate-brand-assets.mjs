import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const SIZE = 512;
const CENTER = SIZE / 2;
const RADIUS = 220;

const COLORS = {
  background: { r: 13, g: 20, b: 41 }, // #0d1429
  orbit: { r: 19, g: 30, b: 60 }, // subtle outer glow
  core: { r: 95, g: 92, b: 255 }, // brand primary
  accent: { r: 34, g: 225, b: 182 }, // accent highlight
};

const png = new PNG({ width: SIZE, height: SIZE });

function setPixel(x, y, { r, g, b }, a = 255) {
  const idx = (SIZE * y + x) << 2;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = a;
}

for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const dx = x - CENTER;
    const dy = y - CENTER;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < RADIUS + 8) {
      const t = Math.min(distance / RADIUS, 1);
      const mix = (start, end) => Math.round(start + (end - start) * t);
      setPixel(x, y, {
        r: mix(COLORS.core.r, COLORS.orbit.r),
        g: mix(COLORS.core.g, COLORS.orbit.g),
        b: mix(COLORS.core.b, COLORS.orbit.b),
      });
    } else {
      setPixel(x, y, COLORS.background);
    }
  }
}

function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const v0x = cx - ax;
  const v0y = cy - ay;
  const v1x = bx - ax;
  const v1y = by - ay;
  const v2x = px - ax;
  const v2y = py - ay;

  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;

  const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
  return u >= 0 && v >= 0 && u + v < 1;
}

const arrowSize = 150;
const tipX = CENTER + arrowSize * 0.95;
const tipY = CENTER;
const tailTopX = CENTER - arrowSize * 0.7;
const tailTopY = CENTER - arrowSize * 0.6;
const tailBottomX = tailTopX;
const tailBottomY = CENTER + arrowSize * 0.6;

for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    if (pointInTriangle(x, y, tipX, tipY, tailTopX, tailTopY, tailBottomX, tailBottomY)) {
      setPixel(x, y, COLORS.accent);
    }
  }
}

mkdirSync('resources', { recursive: true });
const iconPath = join('resources', 'icon.png');
writeFileSync(iconPath, PNG.sync.write(png));

mkdirSync('public', { recursive: true });
const favIcon = new PNG({ width: 128, height: 128 });
for (let y = 0; y < 128; y += 1) {
  for (let x = 0; x < 128; x += 1) {
    const sourceX = Math.floor((x / 128) * SIZE);
    const sourceY = Math.floor((y / 128) * SIZE);
    const idxSrc = (SIZE * sourceY + sourceX) << 2;
    const idxDest = (128 * y + x) << 2;
    favIcon.data[idxDest] = png.data[idxSrc];
    favIcon.data[idxDest + 1] = png.data[idxSrc + 1];
    favIcon.data[idxDest + 2] = png.data[idxSrc + 2];
    favIcon.data[idxDest + 3] = png.data[idxSrc + 3];
  }
}
writeFileSync(join('public', 'favicon.png'), PNG.sync.write(favIcon));

console.log(`Created resources/icon.png and public/favicon.png`);
