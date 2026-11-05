// One-time migration: snapshot the rendered Wix pages (desktop + mobile layouts)
// into static HTML under site/, with every asset (images, fonts, css, video) localized.
// Usage: CHROME_PATH=/path/to/chrome node scripts/snapshot.mjs [slug ...]
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { recordStates, usedKeys } from './states.mjs';

const ORIGIN = 'https://www.thespiralbundang.com';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const SITE = path.join(ROOT, 'site');
const ASSETS = path.join(SITE, 'assets');

export const PAGES = [
  'index',
  'about-1',
  'contact-4',
  '복제-시설안내',
  'about-9',
  'general-8',
  '자이로토닉-레슨',
  'category/all-products',
  'category/gyrotonic-pre-training',
  'product-page/필수-1-1-사전레슨-10시간',
  'product-page/gyrotonic-final-certificate-course-1',
  'product-page/gyrotonic-pretraining-course-토-일',
  'event-list',
  'event-details/peuliteuleining-1cha-2025-05-23-19-00',
];

const ASSET_HOSTS = /(?:https?:)?\/\/(?!static\.parastorage\.com[^"'\s]*\.map)(?:static\.wixstatic\.com|video\.wixstatic\.com|static\.parastorage\.com|siteassets\.parastorage\.com|fonts\.gstatic\.com|fonts\.googleapis\.com)(?:(?!&quot;)[^"'()\s<>\\])*/g;

const urlMap = new Map(); // remote url -> local web path
const pending = new Map();

const extFromType = (ct, u) => {
  ct = (ct || '').split(';')[0].trim();
  const m = {
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/avif': '.avif', 'image/gif': '.gif',
    'image/svg+xml': '.svg', 'font/woff2': '.woff2', 'font/woff': '.woff', 'application/font-woff': '.woff',
    'font/ttf': '.ttf', 'text/css': '.css', 'video/mp4': '.mp4', 'image/x-icon': '.ico', 'image/vnd.microsoft.icon': '.ico',
  }[ct];
  if (m) return m;
  const e = path.extname(new URL(u).pathname).toLowerCase();
  return e && e.length <= 6 ? e : '.bin';
};

async function fetchAsset(rawUrl) {
  let u = rawUrl.replace(/&amp;/g, '&');
  if (u.startsWith('//')) u = 'https:' + u;
  if (urlMap.has(u)) return urlMap.get(u);
  if (pending.has(u)) return pending.get(u);
  const job = (async () => {
    let res;
    for (let i = 0; i < 3; i++) {
      try {
        res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36', Accept: 'image/avif,image/webp,image/png,image/*,*/*;q=0.8' } });
        if (res.ok) break;
      } catch (e) { res = null; }
    }
    if (!res || !res.ok) { console.warn('  ! fetch failed', res && res.status, u.slice(0, 140)); urlMap.set(u, u); return u; }
    const ext = extFromType(res.headers.get('content-type'), u);
    const host = new URL(u).hostname.split('.')[0];
    const hash = crypto.createHash('sha1').update(u).digest('hex').slice(0, 14);
    const base = path.basename(new URL(u).pathname).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'f';
    const rel = `/assets/${host}/${base}-${hash}${ext}`;
    let buf = Buffer.from(await res.arrayBuffer());
    if (ext === '.css') buf = Buffer.from(await rewriteCss(buf.toString('utf8'), u));
    fs.mkdirSync(path.dirname(path.join(SITE, rel)), { recursive: true });
    fs.writeFileSync(path.join(SITE, rel), buf);
    urlMap.set(u, rel);
    return rel;
  })();
  pending.set(u, job);
  return job;
}

async function rewriteCss(css, baseUrl) {
  const refs = new Set();
  css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (_, q, r) => { if (!r.startsWith('data:')) refs.add(r); return _; });
  const map = {};
  for (const r of refs) {
    let abs; try { abs = new URL(r, baseUrl).href; } catch { continue; }
    if (!/^https?:/.test(abs)) continue;
    map[r] = await fetchAsset(abs);
  }
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, r) => (map[r] ? `url("${map[r]}")` : m));
}

async function localizeHtml(html) {
  const found = new Set(html.match(ASSET_HOSTS) || []);
  // url() inside inline <style> may be relative to nothing; absolute ones are caught above.
  const list = [...found].sort((a, b) => b.length - a.length);
  await Promise.all(list.map(u => fetchAsset(u)));
  for (const u of list) {
    let k = u.replace(/&amp;/g, '&'); if (k.startsWith('//')) k = 'https:' + k;
    const local = urlMap.get(k);
    if (local && local !== u) html = html.split(u).join(local);
  }
  return html;
}

// Runs inside the page: clean the live (hydrated) DOM into a static document.
function cleanDom(opts) {
  const { origin, device, states, keys } = opts;
  const d = document.documentElement.cloneNode(true);
  const q = (s) => [...d.querySelectorAll(s)];
  const keep = new Set(keys || []);
  q('[data-sp-k]').forEach(e => { if (!keep.has(e.getAttribute('data-sp-k'))) e.removeAttribute('data-sp-k'); });
  // scripts (keep structured data)
  q('script').forEach(s => { if (s.type !== 'application/ld+json' && !s.classList.contains('sp-data')) s.remove(); });
  q('link').forEach(l => { if (/preload|modulepreload|prefetch|dns-prefetch|preconnect|manifest/.test(l.rel)) l.remove(); });
  q('noscript').forEach(n => n.remove());
  // Wix-only widgets we do not carry over
  q('iframe[title="Wix Chat"]').forEach(f => { const c = f.closest('[id^="comp-"]'); (c || f).closest('[id$="-pinned-layer"]')?.remove(); (c || f).remove(); });
  q('iframe[title="Events Calendar"]').forEach(f => { const c = f.closest('[id^="comp-"]'); (c || f).remove(); });
  q('iframe[title="Google 지도"]').forEach(f => { f.setAttribute('src', 'https://maps.google.com/maps?q=' + encodeURIComponent('경기도 성남시 분당구 내정로 58') + '&z=16&hl=ko&output=embed'); f.setAttribute('loading', 'lazy'); f.removeAttribute('data-src'); });
  q('iframe[src*="Carousel."]').forEach(f => f.setAttribute('src', 'about:blank'));
  q('a[href$="/forum"]').forEach(a => { (a.closest('[id^="comp-"]') || a).remove(); });
  q('#WIX_ADS, #wix-first-paint, #SCROLL_TO_TOP, #SCROLL_TO_BOTTOM, #QUICK_ACTION_BAR').forEach(e => e.remove());
  // images: freeze to the largest rendered candidate
  q('img').forEach(img => {
    const ss = img.getAttribute('srcset');
    if (ss) {
      const parts = ss.split(/,\s+(?=https?:)/).map(s => s.trim().split(/\s+/));
      const best = parts[parts.length - 1][0];
      if (best) img.setAttribute('src', best);
    }
    img.removeAttribute('srcset'); img.removeAttribute('sizes');
    if (img.getAttribute('fetchpriority')) img.removeAttribute('fetchpriority');
  });
  q('picture source').forEach(s => s.remove());
  // videos: keep native autoplay working without Wix runtime
  q('video').forEach(v => {
    const live = document.getElementById(v.id) || null;
    const src = v.getAttribute('src') || (live && live.currentSrc) || '';
    if (src) v.setAttribute('src', src);
    v.setAttribute('playsinline', ''); v.setAttribute('preload', 'auto');
    if (v.hasAttribute('autoplay') || v.closest('[class*="bgVideo"], wix-video')) { v.setAttribute('autoplay', ''); v.setAttribute('muted', ''); }
    if (v.loop || v.hasAttribute('loop')) v.setAttribute('loop', '');
  });
  // entrance animations: let our runtime replay them on scroll
  q('[data-motion-enter="done"]').forEach(e => { e.removeAttribute('data-motion-enter'); e.setAttribute('data-sp-enter', ''); });
  // internal links -> site-relative
  q('a[href]').forEach(a => {
    const h = a.getAttribute('href');
    if (h.startsWith(origin)) a.setAttribute('href', h.slice(origin.length) || '/');
    if (/^\/?forum/.test(a.getAttribute('href'))) a.setAttribute('href', '/');
  });
  d.setAttribute('data-sp-device', device);
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/css/site.css';
  d.querySelector('head').appendChild(css);
  if (states && Object.keys(states).length) {
    const st = document.createElement('script'); st.type = 'application/json'; st.id = 'sp-states';
    st.textContent = JSON.stringify(states).replace(/</g, '\\u003c');
    d.querySelector('body').appendChild(st);
  }
  const js = document.createElement('script'); js.src = '/js/site.js'; js.defer = true;
  d.querySelector('head').appendChild(js);
  return '<!DOCTYPE html>\n' + d.outerHTML;
}

async function settle(p) {
  await p.waitForTimeout(2500);
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h + 900; y += 350) { await p.evaluate(y => window.scrollTo(0, y), y); await p.waitForTimeout(140); }
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(1200);
}

async function main() {
  const only = process.argv.slice(2);
  const pages = only.length ? only : PAGES;
  const exe = process.env.CHROME_PATH;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const extras = {};
  for (const [device, opt] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', { ...devices['iPhone 13'] }]]) {
    const ctx = await browser.newContext(opt);
    const p = await ctx.newPage();
    for (const slug of pages) {
      const url = ORIGIN + '/' + (slug === 'index' ? '' : slug);
      console.log(device, slug);
      await p.goto(url, { waitUntil: 'load', timeout: 90000 }).catch(e => console.warn('  nav', e.message));
      await settle(p);
      // components whose content lives in cross-origin iframes / runtime state
      const extra = await collectExtras(p, slug, device);
      if (extra) extras[`${device}:${slug}`] = extra;
      const states = await recordStates(p, device);
      let html = await p.evaluate(cleanDom, { origin: ORIGIN, device, states, keys: usedKeys(states) });
      html = await localizeHtml(html);
      const outDir = device === 'desktop' ? SITE : path.join(SITE, 'm');
      const file = slug === 'index' ? path.join(outDir, 'index.html') : path.join(outDir, slug, 'index.html');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, html);
    }
    await ctx.close();
  }
  // localize media referenced by extras too
  const ex = JSON.stringify(extras);
  const localized = await localizeHtml(ex);
  fs.mkdirSync(path.join(ROOT, 'scripts', 'data'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'scripts', 'data', 'extras.json'), JSON.stringify(JSON.parse(localized), null, 1));
  await browser.close();
  console.log('assets:', urlMap.size);
}

// Collect data the static DOM can't hold: slideshow slides, iframe carousels, gallery autoplay.
// Results are written into the live DOM (as data attributes / JSON blocks) so cleanDom keeps them.
async function collectExtras(p, slug, device) {
  const out = {};
  // iframe-based 3D carousels (static.parastorage Carousel.html)
  for (const f of p.frames()) {
    if (!/Carousel\.[a-z0-9]+\.html/.test(f.url())) continue;
    const imgs = await f.evaluate(() => [...document.querySelectorAll('img')].map(i => i.currentSrc || i.src)).catch(() => []);
    const compId = new URL(f.url()).searchParams.get('compId');
    out.carousels = out.carousels || {};
    out.carousels[compId] = [...new Set(imgs)];
  }
  // slideshows: identified by their "Slide n" dots (href="./#<slideId>")
  const shows = await p.evaluate(() => [...document.querySelectorAll('nav a[aria-label^="Slide"]')]
    .map(a => a.closest('[id^="comp-"]:not([id="' + (a.getAttribute('href') || '').split('#')[1] + '"])'))
    .filter((v, i, arr) => v && arr.indexOf(v) === i)
    .map(root => ({ id: root.id, dots: [...root.querySelectorAll('nav a[aria-label^="Slide"]')].sort((a, b) => parseInt(a.getAttribute('aria-label').slice(6)) - parseInt(b.getAttribute('aria-label').slice(6))).map(a => a.getAttribute('href').split('#')[1]) })));
  for (const sh of shows) {
    const slides = {};
    for (let i = 0; i < sh.dots.length; i++) {
      const sid = sh.dots[i];
      await p.evaluate(([id, n]) => document.querySelector(`#${id} nav a[aria-label="Slide ${n}"]`)?.click(), [sh.id, i + 1]);
      await p.waitForTimeout(2200);
      const html = await p.evaluate(sid => { const e = document.getElementById(sid); return e ? e.outerHTML : null; }, sid);
      if (html) slides[sid] = html;
    }
    // back to the first slide for the static snapshot
    await p.evaluate(id => document.querySelector(`#${id} nav a[aria-label="Slide 1"]`)?.click(), sh.id);
    await p.waitForTimeout(2200);
    out.slideshows = out.slideshows || {};
    out.slideshows[sh.id] = { order: sh.dots, slides };
  }
  // pro-gallery sliders that auto-scroll: measure their speed (px/s)
  const speeds = await p.evaluate(async () => {
    const tx = e => { const m = getComputedStyle(e).transform; return m === 'none' ? 0 : new DOMMatrix(m).m41; };
    const inners = [...document.querySelectorAll('.gallery-horizontal-scroll-inner')];
    const a = inners.map(tx); await new Promise(r => setTimeout(r, 2000)); const b = inners.map(tx);
    return inners.map((e, i) => { const sp = (a[i] - b[i]) / 2; const root = e.closest('[id^="pro-gallery-container-"]'); if (root && Math.abs(sp) > 2) root.setAttribute('data-sp-autoslide', sp.toFixed(1)); return [root && root.id, sp]; });
  });
  if (speeds.length) out.galleries = speeds;
  // hand everything to the static runtime
  await p.evaluate(data => {
    const s = document.createElement('script'); s.type = 'application/json'; s.className = 'sp-data'; s.id = 'sp-extras';
    s.textContent = JSON.stringify(data).replace(/</g, '\\u003c'); document.body.appendChild(s);
  }, out);
  return Object.keys(out).length ? out : null;
}

main().catch(e => { console.error(e); process.exit(1); });
