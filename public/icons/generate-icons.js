// Run this script once to generate icons:
// node public/icons/generate-icons.js
// Requires: npm install canvas

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function generateIcon(size, filename) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#1e40af');
  gradient.addColorStop(1, '#3b82f6');
  ctx.fillStyle = gradient;
  ctx.roundRect(0, 0, size, size, size * 0.2);
  ctx.fill();

  // Music note icon
  const scale = size / 192;
  ctx.fillStyle = 'white';
  ctx.font = `bold ${Math.floor(80 * scale)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🎵', size / 2, size / 2);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(__dirname, filename), buffer);
  console.log(`Generated ${filename}`);
}

generateIcon(192, 'icon-192.png');
generateIcon(512, 'icon-512.png');
