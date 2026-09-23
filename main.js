const still = matchMedia('(prefers-reduced-motion: reduce)');

// the hero arrow takes you to the series
document.querySelector('.scroll').addEventListener('click', () => {
  window.__smoothStop?.();
  document.getElementById('series').scrollIntoView({ behavior: still.matches ? 'auto' : 'smooth' });
});

/* The hero picture drifts a few px against the pointer. Decorative, so it goes
   through a spring (it keeps momentum and settles) instead of tracking 1:1.
   Only where there is a real pointer, the two-column layout, and motion allowed. */
(() => {
  const layer = document.querySelector('.picture > span');
  const ok = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 901px) and (prefers-reduced-motion: no-preference)');
  if (!layer) return;

  const STIFFNESS = 90, DAMPING = 16, RANGE_X = 14, RANGE_Y = 10;   // ~0.5s settle, no visible bounce
  let tx = 0, ty = 0, x = 0, y = 0, vx = 0, vy = 0, raf = 0, last = 0;

  const step = (t) => {
    const dt = Math.min(0.032, last ? (t - last) / 1000 : 0.016);
    last = t;
    vx += (STIFFNESS * (tx - x) - DAMPING * vx) * dt;
    vy += (STIFFNESS * (ty - y) - DAMPING * vy) * dt;
    x += vx * dt;
    y += vy * dt;
    // scaled up just enough that the drift never shows an edge
    layer.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(1.04)`;
    const moving = Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(vx) + Math.abs(vy) > 0.02;
    raf = moving ? requestAnimationFrame(step) : 0;
    if (!moving) last = 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(step); };

  addEventListener('pointermove', (e) => {
    if (!ok.matches) return;
    tx = (e.clientX / innerWidth - 0.5) * -RANGE_X;
    ty = (e.clientY / innerHeight - 0.5) * -RANGE_Y;
    kick();
  }, { passive: true });
  // pointer leaves the window: ease back to rest
  document.addEventListener('pointerleave', () => { tx = 0; ty = 0; kick(); });
  // switching to a layout or setting where it doesn't apply: drop the transform
  ok.addEventListener('change', () => {
    if (ok.matches) return;
    cancelAnimationFrame(raf); raf = 0; last = 0;
    x = y = vx = vy = tx = ty = 0;
    layer.style.transform = '';
  });
})();

/* The hero slides: the background and the small panel change together, one series at a
   time, and the panel's caption, link and counter follow. Pauses while the panel is hovered
   or focused and while the tab is hidden; under reduced motion it stays on the first slide. */
(() => {
  const bgs = [...document.querySelectorAll('.picture img')];
  const shots = [...document.querySelectorAll('.campaign img')];
  const panel = document.querySelector('.campaign');
  if (bgs.length < 2 || bgs.length !== shots.length) return;
  const cap = panel.querySelector('.campaign__cap');
  const count = panel.querySelector('.campaign__count b');
  const HOLD = 5000;
  let i = 0, timer = 0, held = false;

  // the later photos start loading as soon as the first background has — not on window `load`,
  // which waits on everything (web fonts, the series images) and can sit pending for many seconds
  const fill = () => [...bgs, ...shots].forEach((im) => { if (im.dataset.src) { im.src = im.dataset.src; delete im.dataset.src; } });
  const first = bgs[0];
  if (first.complete) setTimeout(fill, 150); else first.addEventListener('load', () => setTimeout(fill, 150), { once: true });
  setTimeout(fill, 2500);   // and regardless, shortly after
  // never cut to a photo that hasn't arrived: both halves of the next slide must be decoded
  const ready = (k) => [bgs[k], shots[k]].every((im) => im.complete && im.naturalWidth > 0);

  const show = (n) => {
    i = n;
    bgs.forEach((im, k) => im.classList.toggle('is-on', k === i));
    shots.forEach((im, k) => im.classList.toggle('is-on', k === i));
    const s = shots[i].dataset;
    panel.href = `#${s.id}`;
    panel.setAttribute('aria-label', `${s.name}, ${s.tag.toLowerCase()}: see the series`);
    count.textContent = String(i + 1).padStart(2, '0');
    // the caption blurs out, swaps, and comes back, so the two names never overlap
    panel.classList.add('is-swapping');
    setTimeout(() => {
      cap.querySelector('small').textContent = s.tag;
      cap.querySelector('b').textContent = s.name;
      panel.classList.remove('is-swapping');
    }, 240);
  };
  const stop = () => { clearInterval(timer); timer = 0; };
  const play = () => {
    stop();
    if (still.matches || document.hidden || held) return;
    timer = setInterval(() => { const n = (i + 1) % bgs.length; if (ready(n)) show(n); }, HOLD);
  };
  const hold = (on) => { held = on; play(); };
  panel.addEventListener('pointerenter', () => hold(true));
  panel.addEventListener('pointerleave', () => hold(false));
  panel.addEventListener('focusin', () => hold(true));
  panel.addEventListener('focusout', () => hold(false));
  document.addEventListener('visibilitychange', play);
  still.addEventListener('change', play);
  play();
})();

/* ── the series: stage + details for the selected shoe, five cards under it ── */
(() => {
  const section = document.getElementById('series');
  const dataEl = document.getElementById('seriesData');
  if (!section || !dataEl) return;
  const data = JSON.parse(dataEl.textContent);
  const q = (id) => document.getElementById(id);
  const img = q('stageImg'), tilt = q('stageTilt'), stage = q('stage');
  const tag = q('infoTag'), name = q('infoName'), usps = q('infoUsps'), price = q('infoPrice');
  const link = q('infoLink'), moreBtn = q('infoMore'), moreBody = q('infoMoreBody'), full = q('infoFull'), model = q('stageModel');
  const cards = [...section.querySelectorAll('.card')];
  const EASE = 'cubic-bezier(.23,1,.32,1)';
  let cur = 0, token = 0;

  // warm every stage image so a swap never waits on the network
  data.forEach((s) => { const im = new Image(); im.src = `assets/series/${s.img}`; });

  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const setMore = (open) => { moreBtn.setAttribute('aria-expanded', String(open)); moreBody.classList.toggle('is-open', open); };
  moreBtn.addEventListener('click', () => setMore(moreBtn.getAttribute('aria-expanded') !== 'true'));

  const fill = (s) => {
    tag.textContent = s.tag;
    name.textContent = s.name;
    usps.innerHTML = s.usps.map(([t, d], k) => `<li><span class="info__n">${String(k + 1).padStart(2, '0')}</span><b>${esc(t)}</b><p>${esc(d)}</p></li>`).join('');
    price.textContent = s.price;
    price.classList.toggle('is-status', !s.price.startsWith('₹'));
    link.href = s.href;
    full.innerHTML = `${esc(s.full)} · Model ${s.model}${s.note ? `<br>${esc(s.note)}` : ''}`;
    model.textContent = `Model ${s.model}`;
  };
  const swapImg = (s) => { img.src = `assets/series/${s.img}`; img.width = s.w; img.height = s.h; img.alt = s.alt; };
  const stop = (els) => els.forEach((el) => el.getAnimations().forEach((a) => a.cancel()));

  const select = (k, instant = false) => {
    if (k === cur || k < 0 || k >= data.length) return;
    const dir = k > cur ? 1 : -1, s = data[k], t = ++token;
    cur = k;
    cards.forEach((c, i) => { c.classList.toggle('is-active', i === k); c.setAttribute('aria-pressed', String(i === k)); });
    setMore(false);

    if (instant || still.matches) {
      // reduced motion: a plain, quick crossfade, no movement or blur
      swapImg(s); fill(s);
      if (!instant) [img, q('info')].forEach((el) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease' }));
      return;
    }
    const lines = () => [tag, name, ...usps.children, price.parentNode];
    stop([img, ...lines()]);
    // out: fast, towards the side we're leaving; the blur hides the moment the two shoes would overlap
    img.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: `translateX(${-36 * dir}px)`, filter: 'blur(6px)' }],
      { duration: 160, easing: EASE, fill: 'forwards' });
    lines().forEach((el) => el.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(3px)' }], { duration: 140, easing: EASE, fill: 'forwards' }));

    setTimeout(async () => {
      if (t !== token) return;
      swapImg(s);
      try { await img.decode(); } catch {}
      if (t !== token) return;
      fill(s);
      stop([img, ...lines()]);
      img.animate([{ opacity: 0, transform: `translateX(${36 * dir}px) scale(.97)`, filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
        { duration: 520, easing: EASE });
      lines().forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(10px)', filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
        { duration: 420, delay: 40 + i * 40, easing: EASE, fill: 'backwards' }));
    }, 160);
  };

  cards.forEach((c, i) => c.addEventListener('click', () => {
    select(i);
    // on a phone the cards sit below the stage: bring the change into view
    if (stage.getBoundingClientRect().top < 0) {
      window.__smoothStop?.();
      stage.scrollIntoView({ behavior: still.matches ? 'auto' : 'smooth', block: 'start' });
    }
  }));

  // the hero pills and the photo panel link to #kipcore etc.: pick that shoe and bring the section up
  const byId = (id) => data.findIndex((s) => s.id === id);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    const k = a ? byId(a.getAttribute('href').slice(1)) : -1;
    if (k < 0) return;
    e.preventDefault();
    select(k);
    history.replaceState(null, '', `#${data[k].id}`);
    window.__smoothStop?.();
    section.scrollIntoView({ behavior: still.matches ? 'auto' : 'smooth' });
  });
  const start = byId(location.hash.slice(1));
  if (start >= 0) { select(start, true); section.scrollIntoView(); }

  /* the shoe leans toward the pointer. Decorative, so it rides a spring (keeps momentum,
     settles) rather than tracking 1:1; only with a real pointer and motion allowed */
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  let tx = 0, ty = 0, x = 0, y = 0, vx = 0, vy = 0, raf = 0, last = 0;
  const step = (t) => {
    const dt = Math.min(0.032, last ? (t - last) / 1000 : 0.016);
    last = t;
    vx += (120 * (tx - x) - 18 * vx) * dt; vy += (120 * (ty - y) - 18 * vy) * dt;
    x += vx * dt; y += vy * dt;
    tilt.style.transform = `rotateX(${y.toFixed(2)}deg) rotateY(${x.toFixed(2)}deg)`;
    const moving = Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(vx) + Math.abs(vy) > 0.01;
    raf = moving ? requestAnimationFrame(step) : 0;
    if (!moving) last = 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(step); };
  stage.addEventListener('pointermove', (e) => {
    if (!fine.matches || still.matches) return;
    const r = stage.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 18;
    ty = -((e.clientY - r.top) / r.height - 0.5) * 12;
    kick();
  });
  stage.addEventListener('pointerleave', () => { tx = 0; ty = 0; kick(); });
})();

/* ═══ film (ported from the store build) + layers ═══════════════════ */
const $ = (s) => document.querySelector(s);
const REDUCED = still.matches;

/* Film: the reel keeps running. Portrait screens get the 9:16 cuts; the clips are warmed
   before the section arrives, the one on screen and the one after it stay playing, and a
   colourway change is a crossfade between two running clips rather than a restart. The card
   opening to full bleed rides its own easing, so the shape follows the scroll smoothly. */
(() => {
  const frame = document.getElementById('filmFrame');
  if (!frame) return;
  const section = frame.closest('.film');
  const vids = [...frame.querySelectorAll('.film__video')];
  const dots = [...document.querySelectorAll('#filmDots li')];
  const portrait = matchMedia('(max-aspect-ratio: 1/1)');
  const phone = matchMedia('(max-width: 900px)');
  let cur = 0, near = false, visible = false;

  const load = () => vids.forEach((v) => {
    const base = portrait.matches ? v.dataset.port : v.dataset.land;
    if (v.dataset.base === base) return;
    const at = v.currentTime;
    v.dataset.base = base;
    v.poster = base + '.jpg';
    v.src = base + '.mp4';
    v.muted = true;
    v.preload = near ? 'auto' : 'metadata';
    if (at) v.currentTime = at;   // a rotate keeps its place in the clip
  });
  load();
  portrait.addEventListener('change', () => { load(); sync(); });

  /* the clip on screen and the one after it run; the far one rests. Two decodes at most,
     and the next colourway is always ready to cut to */
  function sync() {
    if (REDUCED) { vids.forEach((v, k) => { v.pause(); v.controls = k === cur; }); return; }
    vids.forEach((v, k) => {
      const wanted = near && (k === cur || k === (cur + 1) % vids.length);
      if (wanted) { v.preload = 'auto'; if (v.paused) v.play().catch(() => {}); }
      else if (!v.paused) v.pause();
    });
  }
  const pick = (n) => {
    if (n === cur) return;
    vids[cur].classList.remove('is-on');
    vids[cur].controls = false;
    cur = n;
    vids[cur].classList.add('is-on');      // no rewind: the clip is already running underneath
    dots.forEach((d, k) => d.classList.toggle('is-on', k === cur));
    sync();
  };
  document.getElementById('filmDots').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) pick(+b.dataset.i);
  });
  // warmed a screen early, so the first frames are there before the section is
  new IntersectionObserver((es) => es.forEach((e) => { near = e.isIntersecting; load(); sync(); }),
    { rootMargin: '120% 0px' }).observe(section);
  new IntersectionObserver((es) => es.forEach((e) => { visible = e.isIntersecting; }),
    { threshold: 0.02 }).observe(frame);

  // the card opens to full bleed over the first 70% of a screen of scroll; the rest cuts colourway
  const CARD = () => (phone.matches ? [18, 12, 94, 12, 82, 88, 6, 88] : [30, 15, 80, 15, 70, 85, 20, 85]);
  const FULL = [0, 0, 100, 0, 100, 100, 0, 100];
  const clamp = (x) => Math.max(0, Math.min(1, x));
  let want = 0, now = 0, raf = 0, last = 0;
  const draw = () => {
    const c = CARD(), p = c.map((v, k) => v + (FULL[k] - v) * now);
    frame.style.clipPath = `polygon(${p[0]}% ${p[1]}%, ${p[2]}% ${p[3]}%, ${p[4]}% ${p[5]}%, ${p[6]}% ${p[7]}%)`;
    frame.style.setProperty('--z', (1.12 - 0.12 * now).toFixed(4));
    frame.style.setProperty('--ui', clamp((now - 0.4) / 0.6).toFixed(3));
  };
  const ease = (t) => {
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016);
    last = t;
    now += (want - now) * (1 - Math.exp(-dt * 16));
    if (Math.abs(want - now) < 0.0008) now = want;
    draw();
    raf = now === want ? 0 : requestAnimationFrame(ease);
    if (!raf) last = 0;
  };
  window.__filmScroll = () => {
    const r = section.getBoundingClientRect(), vh = innerHeight;
    if (r.bottom < 0 || r.top > vh) return;
    const travel = r.height - vh;
    want = clamp(-r.top / (vh * 0.7));
    if (!REDUCED && !raf) raf = requestAnimationFrame(ease);
    const whole = clamp(-r.top / travel);
    pick(whole < 0.3 ? 0 : Math.min(vids.length - 1, Math.floor(((whole - 0.3) / 0.7) * vids.length)));
  };
})();

/* ── Vercel analytics + speed insights ───────────────────────────────
   On a page with no bundler, @vercel/analytics and @vercel/speed-insights do one thing:
   add the two scripts Vercel serves at run time. Skipped locally, where they would 404. */
(() => {
  const local = /^(localhost|127\.|0\.0\.0\.0|\[?::1)/.test(location.hostname) || location.protocol === 'file:';
  if (local) return;
  for (const src of ['/_vercel/insights/script.js', '/_vercel/speed-insights/script.js']) {
    const s = document.createElement('script');
    s.src = src;
    s.defer = true;
    document.head.appendChild(s);
  }
})();

/* ── the page follows the wheel instead of jumping with it ───────────
   One lerp on the window's own scroll (not a transformed wrapper), so sticky sections,
   anchors and the scrollbar all keep working. Mouse and trackpad only: touch screens have
   their own physics, and reduced motion keeps the browser's plain scrolling. */
(() => {
  if (still.matches || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let target = scrollY, current = scrollY, raf = 0, last = 0, running = false, applied = -1;
  const limit = () => Math.max(0, document.documentElement.scrollHeight - innerHeight);
  const tick = (t) => {
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016);
    last = t;
    current += (target - current) * (1 - Math.exp(-dt * 12));
    if (Math.abs(target - current) < 0.5) { current = target; running = false; }
    scrollTo({ top: current, behavior: 'instant' });
    applied = Math.round(current);
    raf = running ? requestAnimationFrame(tick) : 0;
    if (!raf) last = 0;
  };
  addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.defaultPrevented) return;
    if (e.target.closest?.('.ess__rail')) return;          // the rail scrolls itself
    e.preventDefault();
    const step = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? innerHeight : 1;
    target = Math.max(0, Math.min(limit(), (running ? target : scrollY) + e.deltaY * step));
    running = true;
    if (!raf) raf = requestAnimationFrame(tick);
  }, { passive: false });
  // keyboard, anchors, the scrollbar: let them lead and pick up from where they land.
  // If the page moved to somewhere we did not put it, something else is driving: hand over.
  addEventListener('scroll', () => {
    if (running && applied >= 0 && Math.abs(scrollY - applied) > 2) running = false;
    if (!running) { target = current = scrollY; applied = -1; }
  }, { passive: true });
  /* anything that scrolls the page itself (a pill, a card, the hero arrow) calls this first:
     a frame of ours landing mid-jump would cancel the browser's smooth scroll */
  window.__smoothStop = () => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0; last = 0; applied = -1;
    target = current = scrollY;
  };
})();

/* ── section heads, the range's panel and the footer step in on arrival ── */
(() => {
  const els = [...document.querySelectorAll('[data-in]')];
  if (!els.length) return;
  const io = new IntersectionObserver((entries, obs) => {
    entries.filter((e) => e.isIntersecting).forEach((e, i) => {
      e.target.style.setProperty('--d', `${i * 70}ms`);
      e.target.classList.add('is-in');
      obs.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
  els.forEach((el) => io.observe(el));
})();

// one rAF-throttled scroll handler drives both
(() => {
  let queued = false;
  const tick = () => { queued = false; window.__filmScroll?.(); window.__layScroll?.(); };
  const ask = () => { if (!queued) { queued = true; requestAnimationFrame(tick); } };
  addEventListener('scroll', ask, { passive: true });
  addEventListener('resize', ask);
  tick();
})();
