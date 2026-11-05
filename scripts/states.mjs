// Record how the live Wix runtime mutates the DOM for an interaction (hover a menu item,
// tap the mobile menu, ...), so the static site can replay the exact same DOM states.

const IN_PAGE = () => {
  let n = 0;
  document.querySelectorAll('*').forEach(e => { if (!e.hasAttribute('data-sp-k')) e.setAttribute('data-sp-k', 'k' + (n++)); });
  const attrsOf = e => { const o = {}; for (const a of e.attributes) if (a.name !== 'data-sp-k') o[a.name] = a.value; return o; };
  const kidsOf = e => [...e.children].map(c => c.getAttribute('data-sp-k') || '?').join(',');
  window.__spSnap = () => {
    const m = new Map();
    document.querySelectorAll('[data-sp-k]').forEach(e => {
      const rec = { a: attrsOf(e), kids: kidsOf(e) };
      if (e.getElementsByTagName('*').length < 400) rec.html = e.innerHTML;
      m.set(e.getAttribute('data-sp-k'), rec);
    });
    return m;
  };
  window.__spDiff = (base, scope, skip) => {
    const attrs = [], html = [];
    const htmlKeys = new Set();
    document.querySelectorAll('[data-sp-k]').forEach(e => {
      const k = e.getAttribute('data-sp-k'); const b = base.get(k); if (!b) return;
      if (scope && !e.closest(scope)) return;
      if (skip && e.closest(skip)) return;
      const now = attrsOf(e);
      for (const name of new Set([...Object.keys(b.a), ...Object.keys(now)])) {
        if (b.a[name] === now[name]) continue;
        if (name === 'class') {
          const bt = new Set((b.a[name] || '').split(/\s+/).filter(Boolean)), nt = new Set((now[name] || '').split(/\s+/).filter(Boolean));
          const rem = [...bt].filter(t => !nt.has(t)), add = [...nt].filter(t => !bt.has(t));
          if (rem.length || add.length) attrs.push([k, '@class', rem.join(' '), add.join(' ')]);
        } else if (name === 'style') {
          const parse = v => { const d = document.createElement('div'); d.setAttribute('style', v || ''); const o = {}; for (const pr of d.style) o[pr] = d.style.getPropertyValue(pr) + (d.style.getPropertyPriority(pr) ? ' !important' : ''); return o; };
          const bs = parse(b.a[name]), ns = parse(now[name]);
          for (const pr of new Set([...Object.keys(bs), ...Object.keys(ns)])) if (bs[pr] !== ns[pr]) attrs.push([k, '@style:' + pr, bs[pr] ?? null, ns[pr] ?? null]);
        } else attrs.push([k, name, b.a[name] ?? null, now[name] ?? null]);
      }
      if (kidsOf(e) !== b.kids && b.html !== undefined) {
        // skip if an ancestor is already recorded
        let p = e.parentElement, inside = false;
        while (p) { if (htmlKeys.has(p.getAttribute('data-sp-k'))) { inside = true; break; } p = p.parentElement; }
        if (!inside) { htmlKeys.add(k); html.push([k, b.html, e.innerHTML.replace(/ data-sp-k="k\d+"/g, '')]); }
      }
    });
    return { attrs, html };
  };
};

// Ignore churn that Wix produces continuously and that we don't want to replay.
const NOISE = (name, k) => /^(data-motion-enter|data-sp-enter)$/.test(name);

export async function recordStates(p, device) {
  await p.evaluate(IN_PAGE);
  await p.evaluate(() => { window.__spBase0 = window.__spSnap(); });
  const states = {};
  const SKIP = '.wixui-slideshow, .wixui-video-player, .pro-gallery, wix-video, [class*="bgVideo"], #sp-extras, iframe';
  const capture = async (name, act, undo, baseExpr = '__spBase0', scope = null) => {
    await p.evaluate((b) => { window.__spBase = window[b]; }, baseExpr);
    try { await act(); } catch (e) { console.warn('  state act failed', name, e.message.split('\n')[0]); return false; }
    await p.waitForTimeout(900);
    const d = await p.evaluate(([sc, sk]) => window.__spDiff(window.__spBase, sc, sk), [scope, scope ? null : SKIP]);
    d.attrs = d.attrs.filter(([k, n]) => !NOISE(n, k));
    states[name] = d;
    return async () => { if (undo) { await undo(); await p.waitForTimeout(900); } };
  };

  if (device === 'desktop') {
    const items = await p.$$eval('.wixui-dropdown-menu > nav > ul > li', lis => lis.filter(li => li.querySelector(':scope > ul')).map(li => li.id));
    for (const id of items) {
      const undo = await capture(`hover:${id}`, () => p.hover('#' + id), () => p.mouse.move(5, 880));
      if (undo) await undo();
    }
  } else {
    const t = await p.$('#MENU_AS_CONTAINER_TOGGLE');
    if (t) {
      await capture('menu', () => p.click('#MENU_AS_CONTAINER_TOGGLE'), null);
      await p.evaluate(() => { window.__spMenu = window.__spSnap(); });
      const subs = await p.$$eval('#MENU_AS_CONTAINER_EXPANDABLE_MENU > ul > li', lis => lis.map((li, i) => li.querySelector(':scope > ul') ? li.getAttribute('data-testid') : null).filter(Boolean));
      for (const tid of subs) {
        const btn = `[data-testid="${tid}"] > [data-testid="itemWrapper"] button, [data-testid="${tid}"] > [data-testid="itemWrapper"] [role="button"]`;
        const undo = await capture(`sub:${tid}`, () => p.click(btn), () => p.click(btn), '__spMenu');
        if (undo) await undo();
      }
      // close the menu again
      const close = await p.$('#MENU_AS_CONTAINER_TOGGLE');
      await close.click({ force: true }).catch(() => {});
      await p.waitForTimeout(900);
    }
  }
  const jsClick = sel => p.evaluate(sel => { const b = document.querySelector(sel); if (!b) throw new Error('no ' + sel); b.click(); }, sel);
  // video players: paused / unmuted looks (progress is driven by our runtime)
  const players = await p.$$eval('.wixui-video-player', els => els.map(e => e.id).filter(Boolean));
  if (players.length) { await p.mouse.move(2, 2); await p.waitForTimeout(4500); await p.evaluate(() => { window.__spBase0 = window.__spSnap(); }); }
  for (const id of players) {
    const sc = '#' + id;
    await p.evaluate(() => { window.__spV = window.__spSnap(); });
    const hv = async () => { await p.$eval('#' + id, e => e.scrollIntoView({ block: 'center' })); const b = await p.$('#' + id); const r = await b.boundingBox(); await p.mouse.move(Math.max(5, r.x + r.width / 2), r.y + r.height / 2); };
    const u0 = await capture(`vhover:${id}`, hv, async () => { await p.mouse.move(2, 2); await p.waitForTimeout(4000); }, '__spV', sc);
    if (u0) await u0();
    await p.evaluate(() => { window.__spV = window.__spSnap(); });
    const pb = `#${id} button[aria-label="Pause"], #${id} button[aria-label="Play"]`;
    const u1 = await capture(`vplay:${id}`, () => jsClick(pb), () => jsClick(pb), '__spV', sc);
    if (u1) await u1();
    await p.evaluate(() => { window.__spV = window.__spSnap(); });
    const mb = `#${id} button[aria-label="Unmute"], #${id} button[aria-label="Mute"]`;
    const u2 = await capture(`vmute:${id}`, () => jsClick(mb), () => jsClick(mb), '__spV', sc);
    if (u2) await u2();
  }
  // force anything Wix left behind back to the base state
  await p.evaluate(() => {
    const d = window.__spDiff(window.__spBase0, null, '.wixui-slideshow, .pro-gallery, wix-video, [class*="bgVideo"], #sp-extras');
    for (const [k, n, before, after] of d.attrs) { const e = document.querySelector(`[data-sp-k="${k}"]`); if (!e) continue;
      if (n === '@class') { after.split(' ').filter(Boolean).forEach(t => e.classList.remove(t)); before.split(' ').filter(Boolean).forEach(t => e.classList.add(t)); }
      else if (n.startsWith('@style:')) { const pr = n.slice(7); if (before === null) e.style.removeProperty(pr); else { const imp = / !important$/.test(before); e.style.setProperty(pr, before.replace(/ !important$/, ''), imp ? 'important' : ''); } }
      else before === null ? e.removeAttribute(n) : e.setAttribute(n, before); }
    for (const [k, before] of d.html) { const e = document.querySelector(`[data-sp-k="${k}"]`); if (e) e.innerHTML = before; }
  });
  const residual = await p.evaluate((sk) => window.__spDiff(window.__spBase0, null, sk), SKIP);
  const res = residual.attrs.filter(([k, n]) => !NOISE(n, k));
  if (res.length || residual.html.length) console.warn('  residual after undo:', JSON.stringify(res).slice(0, 300), residual.html.length);
  return states;
}

// In cleanDom: keep data-sp-k only on elements the states reference.
export function usedKeys(states) {
  const s = new Set();
  for (const st of Object.values(states)) { st.attrs.forEach(a => s.add(a[0])); st.html.forEach(h => s.add(h[0])); }
  return [...s];
}
