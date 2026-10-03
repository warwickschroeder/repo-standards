// Re-encodes every PNG in an evidence folder as a 1200px-wide JPEG for the evidence page (about 60 KB each instead of 180 KB).
// Usage: node shrink-shots.mjs <evidence dir> <out dir> [<package.json that resolves @playwright/test>]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const [src, out, from = 'package.json'] = process.argv.slice(2);
if (!src || !out) throw new Error('Usage: node shrink-shots.mjs <evidence dir> <out dir> [<package.json>]');
fs.mkdirSync(out, { recursive: true });

const { chromium } = createRequire(path.resolve(from))('@playwright/test');
const browser = await chromium.launch();
const page = await browser.newPage();
let total = 0;
for (const f of fs.readdirSync(src).filter((n) => n.endsWith('.png') && !n.startsWith('error-'))) {
  const png = fs.readFileSync(path.join(src, f)).toString('base64');
  const jpg = await page.evaluate(async (d) => {
    const img = new Image();
    img.src = `data:image/png;base64,${d}`;
    await img.decode();
    const w = Math.min(1200, img.width);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = Math.round((img.height * w) / img.width);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72).split(',')[1];
  }, png);
  const buf = Buffer.from(jpg, 'base64');
  total += buf.length;
  fs.writeFileSync(path.join(out, f.replace(/\.png$/, '.jpg')), buf);
}
await browser.close();
console.log(`wrote ${(total / 1e6).toFixed(1)} MB to ${out}`);
