// Render the local static build (site/) in headless Chromium without a web server
// (requests are fulfilled from disk) and save full-page screenshots.
// Usage: node scripts/preview.mjs <outDir> desktop|mobile slug...
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const SITE = path.join(ROOT, 'site');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.avif': 'image/avif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.gif': 'image/gif', '.json': 'application/json' };

export async function openLocal(browser, device) {
  const ctx = await browser.newContext(device === 'mobile' ? { ...devices['iPhone 13'] } : { viewport: { width: +(process.env.WIDTH || 1440), height: 900 } });
  await ctx.route('http://local.test/**', async route => {
    let p = decodeURIComponent(new URL(route.request().url()).pathname);
    if (!p.startsWith('/assets/') && !p.startsWith('/js/') && !p.startsWith('/css/') && device === 'mobile' && !p.startsWith('/m/')) p = '/m' + p;
    let f = path.join(SITE, p);
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf ' + p });
    return route.fulfill({ status: 200, headers: { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }, body: fs.readFileSync(f) });
  });
  await ctx.route(/^https?:\/\/(?!local\.test)/, route => {
    const u = route.request().url();
    // allow only embeds we deliberately keep
    if (/google\.com\/maps|maps\.google|gstatic\.com|googleapis\.com/.test(u)) return route.continue();
    console.log('  external request blocked:', u.slice(0, 120));
    return route.abort();
  });
  return ctx;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [outDir, device, ...slugs] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await openLocal(browser, device);
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('  pageerror', e.message));
  for (const slug of slugs) {
    await p.goto('http://local.test/' + (slug === 'index' ? '' : slug + '/'), { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    const h = await p.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < h + 900; y += 350) { await p.evaluate(y => window.scrollTo(0, y), y); await p.waitForTimeout(120); }
    await p.waitForTimeout(1500);
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(outDir, `${device}_${slug.replace(/\//g, '__')}.png`), fullPage: true });
    console.log(device, slug, h);
  }
  await browser.close();
}
