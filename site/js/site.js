/* The Spiral — static runtime replacing the bits of the Wix runtime the pages need. */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 1. Entrance animations (Wix "motion" CSS waits paused until the element is in view) */
  function initEnter() {
    var els = [].slice.call(document.querySelectorAll('[data-sp-enter]'));
    if (!els.length) return;
    var done = function (el) { el.setAttribute('data-motion-enter', 'done'); el.style.animationPlayState = ''; };
    if (reduce || !('IntersectionObserver' in window)) { els.forEach(done); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target; io.unobserve(el);
        var names = getComputedStyle(el).animationName;
        if (!names || names === 'none') { done(el); return; }
        var left = names.split(',').length;
        var iters = getComputedStyle(el).animationIterationCount.split(',');
        el.addEventListener('animationend', function h() { if (--left <= 0 || iters.indexOf('infinite') > -1 && left <= 1) { el.removeEventListener('animationend', h); if (iters.indexOf('infinite') === -1) done(el); } });
        el.style.animationPlayState = 'running';
      });
    }, { threshold: 0.01 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* 2. Replay DOM states recorded from the live Wix runtime (menus) */
  var STATES = {};
  function initStates() {
    var el = document.getElementById('sp-states');
    if (!el) return;
    STATES = JSON.parse(el.textContent);
    var byK = function (k) { return document.querySelector('[data-sp-k="' + k + '"]'); };
    var on = {};
    function apply(name, fwd) {
      var st = STATES[name]; if (!st || !!on[name] === fwd) return;
      on[name] = fwd;
      st.attrs.forEach(function (a) {
        var e = byK(a[0]); if (!e) return; var n = a[1], v = fwd ? a[3] : a[2], u = fwd ? a[2] : a[3];
        if (n === '@class') { (u || '').split(' ').forEach(function (t) { t && e.classList.remove(t); }); (v || '').split(' ').forEach(function (t) { t && e.classList.add(t); }); }
        else if (n.indexOf('@style:') === 0) { var pr = n.slice(7); if (v === null) e.style.removeProperty(pr); else e.style.setProperty(pr, v.replace(/ !important$/, ''), / !important$/.test(v) ? 'important' : ''); }
        else v === null ? e.removeAttribute(n) : e.setAttribute(n, v);
      });
      st.html.forEach(function (h) { var e = byK(h[0]); if (e) e.innerHTML = fwd ? h[2] : h[1]; });
    }
    window.__spApply = apply;
    // desktop dropdown menus
    var openName = null, closeT = null;
    Object.keys(STATES).forEach(function (name) {
      if (name.indexOf('hover:') !== 0) return;
      var li = document.getElementById(name.slice(6)); if (!li) return;
      var menu = li.closest('.wixui-dropdown-menu');
      var wrap = menu && menu.querySelector('[id$="dropWrapper"]');
      var open = function () { clearTimeout(closeT); if (openName && openName !== name) apply(openName, false); apply(name, true); openName = name; };
      var close = function () { clearTimeout(closeT); closeT = setTimeout(function () { if (openName) apply(openName, false); openName = null; }, 200); };
      li.addEventListener('mouseenter', open); li.addEventListener('mouseleave', close);
      li.addEventListener('focusin', open);
      if (wrap && !wrap.__sp) { wrap.__sp = 1; wrap.addEventListener('mouseenter', function () { clearTimeout(closeT); }); wrap.addEventListener('mouseleave', close); }
    });
    // mobile menu
    var toggle = document.getElementById('MENU_AS_CONTAINER_TOGGLE');
    if (toggle && STATES.menu) {
      var subsOpen = function () { return Object.keys(on).filter(function (n) { return n.indexOf('sub:') === 0 && on[n]; }); };
      var closeMenu = function () { subsOpen().forEach(function (n) { apply(n, false); }); apply('menu', false); document.documentElement.style.overflow = ''; };
      var flip = function (ev) { ev && ev.preventDefault(); if (on.menu) closeMenu(); else { apply('menu', true); } };
      toggle.addEventListener('click', flip);
      toggle.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') flip(e); });
      var ov = document.getElementById('overlay-MENU_AS_CONTAINER'); if (ov) ov.addEventListener('click', closeMenu);
      document.addEventListener('click', function (e) {
        var t = e.target.closest && e.target.closest('[data-testid^="MENU_AS_CONTAINER_EXPANDABLE_MENU-"] > [data-testid="itemWrapper"] button, [data-testid^="MENU_AS_CONTAINER_EXPANDABLE_MENU-"] > [data-testid="itemWrapper"] [role="button"]');
        if (t && on.menu) {
          e.preventDefault();
          var tid = t.closest('[data-testid^="MENU_AS_CONTAINER_EXPANDABLE_MENU-"]').getAttribute('data-testid');
          var n = 'sub:' + tid; apply(n, !on[n]);
        }
        var cb = e.target.closest && e.target.closest('#MENU_AS_CONTAINER [aria-label*="닫기"], #MENU_AS_CONTAINER [aria-label*="Close"]');
        if (cb && on.menu) { e.preventDefault(); closeMenu(); }
      });
    }
  }

  var EXTRAS = {};
  function loadExtras() { var e = document.getElementById('sp-extras'); if (e) try { EXTRAS = JSON.parse(e.textContent) || {}; } catch (x) {} }

  /* 3. Slideshows (Wix SlideShow: horizontal slide, 1s cubic-bezier(.87,0,.13,1), ~5.4s cycle) */
  function initSlideshows() {
    var shows = EXTRAS.slideshows || {};
    Object.keys(shows).forEach(function (id) {
      var root = document.getElementById(id), data = shows[id];
      if (!root || !data.order || data.order.length < 2) return;
      var cur = data.order.filter(function (sid) { return document.getElementById(sid); })[0];
      if (!cur) return;
      var holder = document.getElementById(cur).parentElement;
      var idx = data.order.indexOf(cur), busy = false, timer;
      var num = function (d) { return parseInt(d.getAttribute('aria-label').slice(6), 10); };
      var dots = [].slice.call(root.querySelectorAll('nav a[aria-label^="Slide"]')).sort(function (a, b) { return num(a) - num(b); });
      var selCls = (function () { var c = null; dots.forEach(function (d) { if (d.classList.length > 1) c = d.classList[d.classList.length - 1]; }); return c; })();
      var mk = function (sid) { var t = document.createElement('div'); t.innerHTML = data.slides[sid]; return t.firstElementChild; };
      var go = function (n, dir) {
        if (busy || n === idx) return; busy = true;
        if (dir === undefined) dir = n > idx ? 1 : -1;
        var old = document.getElementById(data.order[idx]); var nw = mk(data.order[n]);
        if (!nw || !old) { busy = false; return; }
        var W = root.offsetWidth, ease = 'transform 1s cubic-bezier(0.87, 0, 0.13, 1)';
        nw.style.transform = 'translateX(' + dir * W + 'px)'; holder.appendChild(nw);
        nw.offsetWidth;
        [old, nw].forEach(function (e) { e.style.transition = ease; });
        old.style.transform = 'translateX(' + -dir * W + 'px)'; nw.style.transform = 'translateX(0)';
        idx = n;
        if (selCls) dots.forEach(function (d, i) { d.classList.toggle(selCls, i === n); });
        setTimeout(function () { old.remove(); nw.style.transition = ''; nw.style.transform = ''; busy = false; initEnterIn(nw); }, 1020);
      };
      var next = function () { go((idx + 1) % data.order.length, 1); };
      var prev = function () { go((idx - 1 + data.order.length) % data.order.length, -1); };
      var auto = function () { clearInterval(timer); timer = setInterval(next, 5400); };
      dots.forEach(function (d, i) { d.addEventListener('click', function (e) { e.preventDefault(); go(i); auto(); }); });
      var btns = [].slice.call(root.querySelectorAll(':scope > button'));
      if (btns[0]) btns[0].addEventListener('click', function () { prev(); auto(); });
      if (btns[1]) btns[1].addEventListener('click', function () { next(); auto(); });
      var sx = null;
      root.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
      root.addEventListener('touchend', function (e) { if (sx === null) return; var dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) { dx < 0 ? next() : prev(); auto(); } sx = null; });
      auto();
    });
  }
  function initEnterIn(scope) { [].slice.call(scope.querySelectorAll('[data-sp-enter]')).forEach(function (el) { el.setAttribute('data-motion-enter', 'done'); }); }

  /* 4. Pro-gallery sliders: arrows + continuous auto-scroll where the original had it */
  function initGalleries() {
    [].slice.call(document.querySelectorAll('[id^="pro-gallery-container-"]')).forEach(function (root) {
      var sc = root.querySelector('.gallery-horizontal-scroll'); if (!sc) return;
      var inner = sc.querySelector('.gallery-horizontal-scroll-inner') || sc.firstElementChild;
      var items = [].slice.call(sc.querySelectorAll('.gallery-item-container'));
      if (!items.length) return;
      var step = items.length > 1 ? Math.abs(items[1].offsetLeft - items[0].offsetLeft) || items[0].offsetWidth : items[0].offsetWidth;
      var speed = parseFloat(root.getAttribute('data-sp-autoslide') || '0');
      var arrows = [].slice.call(root.parentElement.querySelectorAll('.nav-arrows-container'));
      if (speed) {
        // loop length: distance until the first image repeats
        var src0 = (items[0].querySelector('img') || {}).src, period = 0;
        for (var i = 1; i < items.length; i++) if ((items[i].querySelector('img') || {}).src === src0) { period = items[i].offsetLeft - items[0].offsetLeft; break; }
        if (!period) period = sc.scrollWidth / 2;
        var off = 0, extra = 0, last = performance.now(), paused = false;
        var frame = function (t) {
          var dt = Math.min(64, t - last) / 1000; last = t;
          if (!paused && !reduce) off += speed * dt;
          if (extra) { var d = extra * 0.12; if (Math.abs(extra) < 0.5) d = extra; off += d; extra -= d; }
          off = ((off % period) + period) % period;
          inner.style.transform = 'translateX(' + (-off) + 'px)';
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        sc.scrollLeft = 0;
        if (arrows[0]) arrows[0].addEventListener('click', function () { extra -= step; });
        if (arrows[1]) arrows[1].addEventListener('click', function () { extra += step; });
      } else {
        if (arrows[0]) arrows[0].addEventListener('click', function () { sc.scrollBy({ left: -step, behavior: 'smooth' }); });
        if (arrows[1]) arrows[1].addEventListener('click', function () { sc.scrollBy({ left: step, behavior: 'smooth' }); });
      }
    });
  }

  /* 4b. Non-slider pro-galleries were laid out in px for a 1440px window: scale them to the real width */
  function initGalleryScale() {
    var roots = [].slice.call(document.querySelectorAll('.pro-gallery-margin-container')).filter(function (m) {
      var r = m.closest('[id^="pro-gallery-container-"]'); return r && !/\bslider\b/.test(r.className) && !m.closest('.gallery-horizontal-scroll');
    });
    if (!roots.length) return;
    var fit = function () {
      roots.forEach(function (m) {
        var baseW = m.__spW || (m.__spW = parseFloat(m.style.width)), baseH = m.__spH || (m.__spH = parseFloat(m.style.height));
        if (!baseW || !baseH) return;
        var cont = m.closest('[id^="pro-gallery-container-"]');
        var comp = m.closest('[id^="gallery-wrapper-"]');
        comp = comp && comp.parentElement.closest('[id^="comp-"]');
        var w = (comp || cont.parentElement).getBoundingClientRect().width;
        var k = w / baseW;
        m.style.transformOrigin = '0 0'; m.style.transform = Math.abs(k - 1) < 0.002 ? '' : 'scale(' + k + ')';
        cont.style.height = (baseH * k) + 'px';
        if (comp) comp.style.height = (baseH * k) + 'px';
      });
    };
    fit(); window.addEventListener('resize', fit);
  }

  /* 5. 3D carousel (Wix "3D Carousel" app, cloud-carousel geometry measured from the original) */
  function initCarousels() {
    var cars = EXTRAS.carousels || {};
    Object.keys(cars).forEach(function (id) {
      var comp = document.getElementById(id); var srcs = cars[id];
      if (!comp || !srcs.length) return;
      var host = comp.querySelector('iframe') ? comp.querySelector('iframe').parentElement : comp;
      var ifr = comp.querySelector('iframe'); if (ifr) ifr.remove();
      var box = document.createElement('div'); box.className = 'sp-carousel';
      host.appendChild(box);
      var imgs = srcs.map(function (s) { var im = new Image(); im.src = s; im.alt = ''; im.draggable = false; box.appendChild(im); return im; });
      var n = imgs.length, rot = Math.PI / 2, target = rot, stepA = 2 * Math.PI / n;
      var minScale = 0.064;
      var layout = function () {
        var W = box.clientWidth, H = box.clientHeight;
        var xC = W / 2, xR = W / 2, yR = H * 0.083, yC = H * 0.0837, baseW = W * 0.4163;
        var range = (1 - minScale) / 2;
        imgs.forEach(function (im, i) {
          var a = rot - i * stepA; var sn = Math.sin(a), cs = Math.cos(a);
          var s = (sn + 1) * range + minScale;
          var ratio = im.naturalWidth ? im.naturalHeight / im.naturalWidth : 0.705;
          var w = baseW * s, h = baseW * ratio * s;
          im.style.width = w + 'px'; im.style.height = h + 'px';
          im.style.left = (xC + (cs * xR - baseW / 2) * s) + 'px';
          im.style.top = (yC + sn * yR * s) + 'px';
          im.style.zIndex = Math.round(s * 100); im.style.opacity = s;
        });
      };
      var tick = function () { rot += (target - rot) * 0.08; layout(); requestAnimationFrame(tick); };
      imgs.forEach(function (im, i) {
        im.addEventListener('click', function () { var k = Math.round((rot - Math.PI / 2) / stepA); var cur = ((k % n) + n) % n; var d = i - cur; if (d > n / 2) d -= n; if (d < -n / 2) d += n; target += d * stepA; });
      });
      var hover = false; box.addEventListener('mouseenter', function () { hover = true; }); box.addEventListener('mouseleave', function () { hover = false; });
      setInterval(function () { if (!hover && !document.hidden) target += stepA; }, 2000);
      tick();
    });
  }

  /* 6. Wix video players: play/pause, mute, progress, seek, fullscreen */
  function initPlayers() {
    [].slice.call(document.querySelectorAll('.wixui-video-player')).forEach(function (root) {
      var v = root.querySelector('video'); if (!v) return;
      var id = root.id;
      v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute('muted', ''); v.setAttribute('loop', ''); v.setAttribute('playsinline', '');
      var played = root.querySelector('.wix-playable--progress-played');
      var knob = root.querySelector('.wix-playable--progress-seek-btn');
      var knobWrap = knob && knob.parentElement;
      var bar = root.querySelector('[aria-label="Progress control"]');
      var buffered = bar && bar.querySelectorAll('.eVHV0E')[1];
      var timeBox = root.querySelector('.wix-playable--time-text');
      var curT = root.querySelector('[data-playable-hook="current-time-indicator"]');
      var durT = root.querySelector('[data-playable-hook="duration-time-indicator"]');
      var fmt = function (t) { t = Math.floor(t || 0); return ('0' + Math.floor(t / 60)).slice(-2) + ':' + ('0' + (t % 60)).slice(-2); };
      var paint = function () {
        var d = v.duration || 0, r = d ? v.currentTime / d : 0;
        if (played) played.style.transform = 'scaleX(' + r.toFixed(3) + ')';
        if (knobWrap && bar) knobWrap.style.transform = 'translateX(' + (r * bar.offsetWidth).toFixed(3) + 'px)';
        if (buffered && v.buffered.length && d) buffered.style.width = (v.buffered.end(v.buffered.length - 1) / d * 100).toFixed(2) + '%';
        if (curT) curT.textContent = fmt(v.currentTime);
        if (durT && d) durT.textContent = fmt(d);
        if (timeBox) { timeBox.setAttribute('data-playable-current-time', v.currentTime); if (d) timeBox.setAttribute('data-playable-duration', d); }
      };
      ['timeupdate', 'progress', 'loadedmetadata'].forEach(function (e) { v.addEventListener(e, paint); });
      var setPaused = function (p) { if (window.__spApply) window.__spApply('vplay:' + id, p); };
      var setUnmuted = function (u) { if (window.__spApply) window.__spApply('vmute:' + id, u); };
      v.addEventListener('pause', function () { setPaused(true); });
      v.addEventListener('play', function () { setPaused(false); });
      var toggle = function () { v.paused ? v.play() : v.pause(); };
      var hideT, show = function (ms) { if (!window.__spApply) return; window.__spApply('vhover:' + id, true); clearTimeout(hideT); hideT = setTimeout(function () { if (!v.paused) window.__spApply('vhover:' + id, false); }, ms || 2500); };
      root.addEventListener('mousemove', function () { show(2500); });
      root.addEventListener('mouseleave', function () { show(300); });
      root.addEventListener('touchstart', function () { show(3000); }, { passive: true });
      v.addEventListener('pause', function () { show(60000); });
      setTimeout(function () { show(3000); }, 0);
      root.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        var lab = b ? (b.getAttribute('aria-label') || '') : '';
        if (b && /^(Pause|Play)$/.test(lab)) { e.preventDefault(); toggle(); }
        else if (b && /^(Mute|Unmute)$/.test(lab)) { e.preventDefault(); v.muted = !v.muted; setUnmuted(!v.muted); }
        else if (b && /full ?screen/i.test(lab)) { e.preventDefault(); (root.requestFullscreen || root.webkitRequestFullscreen || function () { v.webkitEnterFullscreen && v.webkitEnterFullscreen(); }).call(root); }
        else if (!b && !e.target.closest('[role="slider"]')) toggle();
      });
      if (bar) bar.addEventListener('click', function (e) { var r = bar.getBoundingClientRect(); if (v.duration) v.currentTime = (e.clientX - r.left) / r.width * v.duration; });
      var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting && !v.__spUser) v.play().catch(function () {}); }); }) : null;
      if (io) io.observe(root); else v.play().catch(function () {});
      v.addEventListener('pause', function () { v.__spUser = true; });
    });
    // background videos
    [].slice.call(document.querySelectorAll('video')).forEach(function (v) {
      if (v.closest('.wixui-video-player')) return;
      v.muted = true; v.loop = true; v.playsInline = true; v.play && v.play().catch(function () {});
    });
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', run) : run();
  function run() {
    loadExtras();
    [initEnter, initStates, initSlideshows, initGalleries, initGalleryScale, initCarousels, initPlayers].forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
  }
})();
