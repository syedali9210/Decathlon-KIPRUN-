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

/* ═══ film + main shoe (ported from the store build) ═══════════════════ */
const $ = (s) => document.querySelector(s);
const REDUCED = still.matches;

const FEATURE_VERT = `
attribute vec2 p; varying vec2 vUv;
void main(){ vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const FEATURE_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uMouse;    // pointer in uv space
uniform float uTime;
uniform float uForce;   // 0 at rest, 1 right after the pointer moves
void main(){
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 d = uv - uMouse;
  float r = length(d);
  vec2 dir = d / max(r, 0.0001);
  // one ring travelling out of the cursor, fading with distance
  float ring = sin(r * 22.0 - uTime * 3.2) * exp(-r * 5.0);
  uv += dir * ring * 0.03 * (0.22 + uForce);
  // a slow idle sway so it is alive before anyone touches it
  uv.x += sin(uv.y * 7.0 + uTime * 0.6) * 0.0022;
  vec2 shift = dir * 0.005 * uForce;
  vec4 c = texture2D(uTex, clamp(uv, 0.001, 0.999));
  float rr = texture2D(uTex, clamp(uv + shift, 0.001, 0.999)).r;
  float bb = texture2D(uTex, clamp(uv - shift, 0.001, 0.999)).b;
  gl_FragColor = vec4(rr, c.g, bb, c.a);
}`;

function initFeatureGl(src) {
  const cv = $('#featureGl');
  const img = $('#featureImg');
  if (!cv || REDUCED) return;
  const gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: true });
  if (!gl) return;                                   // no WebGL: the <img> is already showing

  const sh = (type, srcTxt) => { const o = gl.createShader(type); gl.shaderSource(o, srcTxt); gl.compileShader(o); return o; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, FEATURE_VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FEATURE_FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uMouse = gl.getUniformLocation(prog, 'uMouse');
  const uTime = gl.getUniformLocation(prog, 'uTime');
  const uForce = gl.getUniformLocation(prog, 'uForce');
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const tex = gl.createTexture();
  const im = new Image();
  im.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
    cv.style.aspectRatio = `${im.naturalWidth} / ${im.naturalHeight}`;
    img.classList.add('is-hidden');                  // hand over from the fallback
    size();
    start();
  };
  im.src = src;

  const size = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (w && h && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
  };
  addEventListener('resize', size);

  let mx = 0.5, my = 0.4, force = 0, raf = 0, t0 = performance.now();
  addEventListener('pointermove', (e) => {
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    mx = (e.clientX - r.left) / r.width;
    my = (e.clientY - r.top) / r.height;
    force = Math.min(1, force + 0.35);
  }, { passive: true });

  const hud = $('#hudFrame');
  let hudN = 0;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    if (hud && !(++hudN % 2)) hud.textContent = String((hudN >> 1) % 1000).padStart(3, '0');
    size();
    force *= 0.96;
    gl.uniform2f(uMouse, mx, my);
    gl.uniform1f(uTime, (performance.now() - t0) / 1000);
    gl.uniform1f(uForce, force);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const start = () => { if (!raf) frame(); };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  // only draw while the section is on screen
  new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? start() : stop())), { threshold: 0 }).observe($('.max'));
}


if (document.getElementById('featureGl')) initFeatureGl('assets/series/kipride-max.webp');

/* Film: portrait screens get the 9:16 cuts; only the on-screen clip plays. */
(() => {
  const frame = document.getElementById('filmFrame');
  if (!frame) return;
  const section = frame.closest('.film');
  const vids = [...frame.querySelectorAll('.film__video')];
  const dots = [...document.querySelectorAll('#filmDots li')];
  const portrait = matchMedia('(max-aspect-ratio: 1/1)');
  const phone = matchMedia('(max-width: 900px)');
  let cur = 0, visible = false;

  const load = () => vids.forEach((v) => {
    const base = portrait.matches ? v.dataset.port : v.dataset.land;
    if (v.dataset.base === base) return;
    v.dataset.base = base; v.poster = base + '.jpg'; v.src = base + '.mp4'; v.muted = true;
  });
  load();
  portrait.addEventListener('change', () => { load(); if (visible) play(); });

  const play = () => {
    vids.forEach((v, k) => { if (k !== cur) v.pause(); });
    if (REDUCED) { vids[cur].controls = true; return; }   // reduced motion: poster and controls, no autoplay
    vids[cur].preload = 'auto';
    vids[cur].play().catch(() => {});
  };
  const pick = (n) => {
    if (n === cur) return;
    vids[cur].classList.remove('is-on'); vids[cur].pause(); vids[cur].controls = false;
    cur = n;
    vids[cur].classList.add('is-on');
    vids[cur].currentTime = 0;
    dots.forEach((d, k) => d.classList.toggle('is-on', k === cur));
    if (visible) play();
  };
  document.getElementById('filmDots').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) pick(+b.dataset.i);
  });
  new IntersectionObserver((es) => es.forEach((e) => {
    visible = e.isIntersecting;
    if (visible) play(); else vids.forEach((v) => v.pause());
  }), { threshold: 0.05 }).observe(frame);

  // the card opens to full bleed over the first 70% of a screen of scroll; the rest cuts colourway
  const CARD = () => (phone.matches ? [18, 12, 94, 12, 82, 88, 6, 88] : [30, 15, 80, 15, 70, 85, 20, 85]);
  const FULL = [0, 0, 100, 0, 100, 100, 0, 100];
  const clamp = (x) => Math.max(0, Math.min(1, x));
  window.__filmScroll = () => {
    const r = section.getBoundingClientRect(), vh = innerHeight;
    if (r.bottom < 0 || r.top > vh) return;
    const travel = r.height - vh;
    const open = clamp(-r.top / (vh * 0.7));
    const whole = clamp(-r.top / travel);
    if (!REDUCED) {
      const c = CARD(), p = c.map((v, k) => v + (FULL[k] - v) * open);
      frame.style.clipPath = `polygon(${p[0]}% ${p[1]}%, ${p[2]}% ${p[3]}%, ${p[4]}% ${p[5]}%, ${p[6]}% ${p[7]}%)`;
      frame.style.setProperty('--z', (1.12 - 0.12 * open).toFixed(4));
      frame.style.setProperty('--ui', clamp((open - 0.4) / 0.6).toFixed(3));
    }
    pick(whole < 0.3 ? 0 : Math.min(vids.length - 1, Math.floor(((whole - 0.3) / 0.7) * vids.length)));
  };
})();

/* Main shoe: the pinned stage steps its three numbers as the words scroll past;
   the shoe turns and grows a little across the section, the MAX outline drifts up. */
(() => {
  const section = document.querySelector('.max');
  if (!section) return;
  const shoe = document.getElementById('featureShoe');
  const kanji = section.querySelector('.max__kanji');
  const specs = [...section.querySelectorAll('.spec')];
  const desk = matchMedia('(min-width: 901px)');
  window.__maxScroll = () => {
    if (!desk.matches) { shoe.style.transform = ''; kanji.style.transform = ''; return; }
    const r = section.getBoundingClientRect(), vh = innerHeight;
    if (r.bottom < 0 || r.top > vh) return;
    const p = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height - vh)));
    specs.forEach((s, k) => s.classList.toggle('is-on', k === Math.min(specs.length - 1, Math.floor(p * specs.length))));
    if (REDUCED) return;
    shoe.style.transform = `rotate(${(-10 + 15 * p).toFixed(2)}deg) scale(${(0.88 + 0.24 * p).toFixed(3)})`;
    kanji.style.transform = `translateY(${(-16 * p).toFixed(2)}%)`;
  };
})();

// one rAF-throttled scroll handler drives both
(() => {
  let queued = false;
  const tick = () => { queued = false; window.__filmScroll?.(); window.__maxScroll?.(); };
  const ask = () => { if (!queued) { queued = true; requestAnimationFrame(tick); } };
  addEventListener('scroll', ask, { passive: true });
  addEventListener('resize', ask);
  tick();
})();
