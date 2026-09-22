const still = matchMedia('(prefers-reduced-motion: reduce)');

// the hero arrow takes you to the series
document.querySelector('.scroll').addEventListener('click', () => {
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

  // the later photos load once the first slide has painted
  const fill = () => [...bgs, ...shots].forEach((im) => { if (im.dataset.src) { im.src = im.dataset.src; delete im.dataset.src; } });
  if (document.readyState === 'complete') setTimeout(fill, 300); else addEventListener('load', () => setTimeout(fill, 300));

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
    timer = setInterval(() => show((i + 1) % bgs.length), HOLD);
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

/* ── the series ─────────────────────────────────────────────── */

// rows reveal once, a little before they're fully in view
(() => {
  const rows = document.querySelectorAll('.row');
  const reveal = (row) => {
    row.classList.add('is-in');
    // after the entrance, drop the stagger delays so hover and press answer at once
    setTimeout(() => row.classList.add('is-settled'), 1400);
  };
  if (!('IntersectionObserver' in window)) { rows.forEach(reveal); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    reveal(e.target);
    io.unobserve(e.target);
  }), { rootMargin: '0px 0px -12% 0px', threshold: 0.2 });
  rows.forEach((r) => io.observe(r));
  // arriving by a hero pill or a deep link: show the target row straight away
  const hit = location.hash && document.querySelector(`.row${CSS.escape(location.hash)}`);
  if (hit) reveal(hit);
})();

// DETAILS opens the full product name and model code
document.querySelectorAll('.row [aria-controls]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    btn.closest('.row').classList.toggle('is-open', open);
  });
});

/* The route: the square is "you are here". It rides the line at the height of the middle
   of the screen; the line is grey above it (covered) and blue below (still to run).
   The square glides on a spring rather than jumping with every scroll event. */
(() => {
  const svg = document.querySelector('.series__route');
  const lit = document.getElementById('route');
  const marker = document.getElementById('routeMarker');
  const art = document.querySelector('.series__art');
  if (!svg || !lit || !marker) return;
  const on = matchMedia('(min-width: 901px)');
  const VB_W = 1083.45, VB_H = 2416.81;

  // sample the path once: [fraction along the path, x, y] in viewBox units.
  // The path starts at the bottom of the section and climbs to the top.
  const L = lit.getTotalLength();
  const N = 700, pts = [];
  for (let i = 0; i <= N; i++) { const p = lit.getPointAtLength((L * i) / N); pts.push([i / N, p.x, p.y]); }
  const atY = (y) => {   // first sample from the top end whose y reaches the target
    for (let i = N; i >= 0; i--) if (pts[i][2] >= y) return pts[i][0];
    return 0;
  };
  // where Figma parks the square (758, 1520 on the 1482-wide frame)
  const DESIGN = atY(1520 - 96.38);

  let target = DESIGN, s = DESIGN, v = 0, raf = 0, last = 0;
  const place = (f) => {
    const i = Math.round(f * N), [, px, py] = pts[i];
    const r = svg.getBoundingClientRect(), a = art.getBoundingClientRect();
    const x = r.left - a.left + (px / VB_W) * r.width, y = r.top - a.top + (py / VB_H) * r.height;
    marker.style.setProperty('--mx', `${x.toFixed(1)}px`);
    marker.style.setProperty('--my', `${y.toFixed(1)}px`);
    lit.style.setProperty('--lit', f.toFixed(4));
  };
  const step = (t) => {
    const dt = Math.min(0.032, last ? (t - last) / 1000 : 0.016);
    last = t;
    v += (140 * (target - s) - 22 * v) * dt;   // stiff, critically damped-ish: follows closely, no overshoot
    s += v * dt;
    place(s);
    const moving = Math.abs(target - s) + Math.abs(v) > 0.0004;
    raf = moving ? requestAnimationFrame(step) : 0;
    if (!moving) last = 0;
  };
  const update = () => {
    if (!on.matches) return;
    if (still.matches) { place(DESIGN); return; }   // reduced motion: the design's resting state, no tracking
    const r = svg.getBoundingClientRect();
    const y = ((innerHeight / 2 - r.top) / r.height) * VB_H;
    target = atY(Math.max(0, Math.min(VB_H, y)));
    if (!raf) raf = requestAnimationFrame(step);
  };
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', () => { place(s); update(); });
  still.addEventListener('change', update);
  on.addEventListener('change', update);
  place(s);
  update();
})();
