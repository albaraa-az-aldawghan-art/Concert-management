// Optional visual QA dependencies live only in ignored tmp/pdf-render.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createCanvas, DOMMatrix, ImageData, Path2D } = require('../tmp/pdf-render/node_modules/@napi-rs/canvas');
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const { getDocument } = await import('../tmp/pdf-render/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const loading = getDocument({ data: new Uint8Array(await readFile('tmp/material-requests/request-layout.pdf')), useSystemFonts: false });
const pdf = await loading.promise;
let combined = '';
for (let index = 1; index <= pdf.numPages; index++) {
  const page = await pdf.getPage(index);
  const text = await page.getTextContent();
  combined += text.items.map(i => i.str ?? '').join(' ');
  const viewport = page.getViewport({ scale: 1.4 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvasContext: canvas.getContext('2d'), viewport, canvas }).promise;
  await writeFile(`tmp/material-requests/request-page-${index}.png`, canvas.toBuffer('image/png'));
}
assert.ok(combined.includes('125.5'));
assert.ok(combined.includes('100.25'));
assert.ok(!/[٠-٩۰-۹]/.test(combined));
console.log(`Rendered and checked ${pdf.numPages} PDF pages with Latin quantities.`);
await loading.destroy();
