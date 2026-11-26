import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createAmbience } from './audio.js';

gsap.registerPlugin(ScrollTrigger);

// Lazy 3D modules (code-split; a missing or failing module falls back gracefully).
// datamorph.js is built in parallel: if the file does not exist yet the glob simply has no entry.
const modules = import.meta.glob(['./film/engine.js', './showcase/monoliths.js', './showcase/bridgebuild.js', './showcase/datamorph.js']);
const params = new URLSearchParams(location.search);
// QA: ?nogl skips every WebGL module (pure DOM / typography checks); ?nogl=engine,monoliths skips only those.
const noglParam = params.get('nogl');
const skipGL = (path) => noglParam !== null && (noglParam === '' || noglParam.split(',').some((k) => k && path.includes(k)));
const load = (path) => (skipGL(path) ? Promise.reject(new Error('nogl')) : modules[path] ? modules[path]() : Promise.reject(new Error(`${path} missing`)));

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;
const quality = coarse || window.innerWidth < 900 || (navigator.hardwareConcurrency || 8) <= 4 ? 'low' : 'high';
if (reduced) document.documentElement.classList.add('reduced');
document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const pad2 = (n) => String(Math.floor(n)).padStart(2, '0');
const ambience = createAmbience();

/* ================================================================== */
/* Smooth scroll                                                       */
/* ================================================================== */
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ duration: 1.25, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true, wheelMultiplier: 0.85 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}
const scrollY = () => (lenis ? lenis.scroll : window.scrollY);
function scrollToY(y, opts = {}) {
  if (lenis) lenis.scrollTo(y, { force: true, ...opts });
  else window.scrollTo(0, y);
}

const burger = document.querySelector('.nav__burger');
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    const target = id === '#top' ? 0 : document.querySelector(id);
    if (target === null) return;
    e.preventDefault();
    stopAutoplay();
    document.body.classList.remove('menu-open');
    burger?.setAttribute('aria-expanded', 'false');
    burger?.setAttribute('aria-label', 'Open menu');
    if (lenis) { lenis.start(); lenis.scrollTo(target, { duration: 1.8 }); }
    else if (target === 0) window.scrollTo(0, 0);
    else target.scrollIntoView();
  });
});

/* ================================================================== */
/* Typography: split into words + characters, wdth "birth"             */
/* ================================================================== */
function splitChars(el) {
  if (el.dataset.splitDone) return [...el.querySelectorAll('.char')];
  el.dataset.splitDone = '1';
  const label = el.textContent.replace(/\s+/g, ' ').trim();
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) {
        const f = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { f.appendChild(document.createTextNode(' ')); return; }
          const w = document.createElement('span');
          w.className = 'w';
          [...part].forEach((ch) => { const c = document.createElement('span'); c.className = 'char'; c.textContent = ch; w.appendChild(c); });
          f.appendChild(w);
        });
        node.replaceChild(f, child);
      } else if (child.nodeType === 1 && child.tagName !== 'BR') walk(child);
    });
  };
  walk(el);
  if (/^H\d$/.test(el.tagName) || el.tagName === 'P') el.setAttribute('aria-label', label);
  [...el.children].forEach((c) => c.setAttribute('aria-hidden', 'true'));
  return [...el.querySelectorAll('.char')];
}
const targetWidth = (el) => parseFloat(getComputedStyle(el.closest('.t-disp') || el).getPropertyValue('--wd')) || 125;

/** Signature: characters are born condensed (wdth 62) and blurred, then widen into place. */
function birth(chars, { delay = 0, stagger = 0.022, duration = 1.35, from = 'start' } = {}) {
  if (!chars.length) return null;
  if (reduced) { gsap.set(chars, { opacity: 1, clearProps: 'filter,transform' }); return null; }
  const wd = targetWidth(chars[0]);
  gsap.killTweensOf(chars);
  return gsap.fromTo(chars,
    { '--wd': 62, opacity: 0, filter: 'blur(12px)', yPercent: 22 },
    { '--wd': wd, opacity: 1, filter: 'blur(0px)', yPercent: 0, duration, ease: 'expo.out', delay, stagger: { each: stagger, from },
      onComplete: () => chars.forEach((c) => { c.style.removeProperty('--wd'); c.style.filter = ''; }) });
}
function unbirth(chars, { duration = 0.55 } = {}) {
  if (!chars.length) return null;
  gsap.killTweensOf(chars);
  if (reduced) { gsap.set(chars, { opacity: 0 }); return null; }
  return gsap.to(chars, { '--wd': 62, opacity: 0, filter: 'blur(10px)', yPercent: -14, duration, ease: 'power2.in', stagger: { each: 0.006, from: 'end' } });
}

/* ================================================================== */
/* Film                                                                */
/* ================================================================== */
const filmEl = document.querySelector('.film');
const filmStage = filmEl.querySelector('.film__stage');
const filmMount = filmEl.querySelector('.film__gl');
const cards = [...filmEl.querySelectorAll('.card')].map((el) => {
  const [a, b] = el.dataset.range.split(',').map(Number);
  const title = el.querySelector('.card__title, .finale__line, .card__coords');
  const chars = title ? splitChars(title) : [];
  gsap.set(chars, { opacity: 0 });
  return { el, a, b, chars, no: el.querySelector('.card__no'), rest: el.querySelectorAll('.card__kick, .card__sub, .ctas'), on: false };
});

const hud = {
  chapter: filmEl.querySelector('.hud__chapter'),
  tc: filmEl.querySelector('.hud__tc'),
  coord: filmEl.querySelector('.hud__coord'),
  rail: [...filmEl.querySelectorAll('.rail button')],
  railFill: filmEl.querySelector('.rail__line i'),
  hint: filmEl.querySelector('.film__hint'),
};
const CHAPTERS = [
  { at: 0, name: 'I · The World', coord: 'Orbit · 400 km · 22.0° N 31.2° E' },
  { at: 0.37, name: 'II · Descent', coord: 'Altitude 3,200 m · Nile Delta' },
  { at: 0.48, name: 'III · The River', coord: 'The Nile · Cairo · 30.04° N 31.24° E' },
  { at: 0.7, name: 'IV · The Bridge', coord: 'Golden hour → blue hour' },
  { at: 0.88, name: 'V · Act', coord: 'Cairo · Night' },
];
const FILM_SECONDS = 180; // the film's own timecode (24 fps)
const timecode = (f) => { const s = f * FILM_SECONDS; return `00:${pad2(s / 60)}:${pad2(s % 60)}:${pad2((s * 24) % 24)}`; };
hud.rail.forEach((b) => { const i = b.querySelector('.rail__tip i'); if (i) i.textContent = timecode(+b.dataset.at); });
let currentChapter = -1;

function showCard(c) {
  c.on = true;
  c.el.classList.add('is-on');
  gsap.killTweensOf([c.el, c.rest, c.no]);
  gsap.set(c.el, { autoAlpha: 1 });
  if (reduced) { gsap.set([...c.chars, ...c.rest], { opacity: 1 }); return; }
  birth(c.chars, { stagger: c.chars.length > 60 ? 0.012 : 0.026, duration: 1.5 });
  gsap.fromTo(c.rest, { opacity: 0, y: 22, clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, y: 0, clipPath: 'inset(0 0% 0 0)', duration: 1.3, ease: 'expo.out', stagger: 0.1, delay: 0.3 });
  if (c.no) gsap.fromTo(c.no, { '--wdn': 62, opacity: 0, filter: 'blur(14px)' }, { '--wdn': 125, opacity: 1, filter: 'blur(0px)', duration: 2.2, ease: 'expo.out' });
}
function hideCard(c) {
  c.on = false;
  c.el.classList.remove('is-on');
  gsap.killTweensOf([c.el, c.rest, c.no]);
  if (reduced) { gsap.set(c.el, { autoAlpha: 0 }); return; }
  unbirth(c.chars);
  gsap.to([...c.rest, c.no].filter(Boolean), { opacity: 0, y: -14, duration: 0.45, ease: 'power2.in' });
  gsap.to(c.el, { autoAlpha: 0, duration: 0.2, delay: 0.6 });
}

let film = null;
let filmProgress = 0;
function updateFilmUI(f) {
  filmProgress = f;
  cards.forEach((c) => {
    const inside = f >= c.a && f < c.b;
    if (inside && !c.on) showCard(c); else if (!inside && c.on) hideCard(c);
  });
  let idx = 0;
  CHAPTERS.forEach((ch, i) => { if (f >= ch.at) idx = i; });
  if (idx !== currentChapter) {
    const first = currentChapter === -1;
    currentChapter = idx;
    hud.chapter.textContent = CHAPTERS[idx].name;
    hud.coord.textContent = CHAPTERS[idx].coord;
    hud.rail.forEach((r, i) => r.classList.toggle('is-on', i === idx));
    if (!first) { ambience.chime(idx); ambience.whoosh?.(0.6); }
  }
  hud.tc.textContent = timecode(f);
  if (hud.railFill) hud.railFill.style.transform = `scaleY(${f})`;
  hud.hint.style.opacity = f > 0.02 ? 0 : 1;
  filmEl.classList.toggle('is-ended', f > 0.965);
  ambience.update(f);
}

const filmST = ScrollTrigger.create({
  trigger: filmEl, start: 'top top', end: 'bottom bottom', scrub: true,
  onUpdate: (self) => { film?.setProgress(self.progress); updateFilmUI(self.progress); },
});
ScrollTrigger.create({ trigger: filmEl, start: 'bottom bottom', end: 'bottom top', onUpdate: (s) => ambience.update(1 + s.progress) });

// Sound toggle
const soundBtn = filmEl.querySelector('.sound');
function syncSound() {
  const on = ambience.on;
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.setAttribute('aria-label', on ? 'Turn ambient sound off' : 'Turn ambient sound on');
  soundBtn.querySelector('.sound__label').textContent = on ? 'Sound on' : 'Sound off';
  ambience.update(filmProgress);
}
soundBtn.addEventListener('click', async () => { await ambience.toggle(); syncSound(); });

/* ---------- Director mode: "Play the film" ---------- */
const playBtn = filmEl.querySelector('.play');
const playUse = playBtn.querySelector('use');
const playLabel = playBtn.querySelector('.play__label b');
const AUTOPLAY_SECONDS = 70;
let autoplay = false;
// Monotonic "breathing" ease: five gentle slow-downs (one per chapter) inside a soft in/out.
const directorEase = (t) => {
  const b = t - 0.024 * Math.sin(2 * Math.PI * t * 5);
  return 0.78 * b + 0.22 * (0.5 - 0.5 * Math.cos(Math.PI * b));
};
function setPlayUI(on) {
  playBtn.setAttribute('aria-pressed', String(on));
  playUse.setAttribute('href', on ? '#i-stop' : '#i-play');
  playLabel.textContent = on ? 'Stop the film' : 'Play the film';
  filmEl.classList.toggle('is-playing', on);
}
async function startAutoplay(fromF = null) {
  if (!lenis) return;
  try { await ambience.ensureOn(); syncSound(); } catch { /* audio blocked: play silently */ }
  const a = filmST.start, b = filmST.end;
  let y0 = fromF == null ? scrollY() : a + fromF * (b - a);
  if (y0 >= b - 20 || y0 < a) y0 = a;
  autoplay = true;
  setPlayUI(true);
  lenis.start();
  lenis.scrollTo(y0, { immediate: true, force: true });
  const duration = Math.max(3, AUTOPLAY_SECONDS * ((b - y0) / (b - a)));
  lenis.scrollTo(b, { duration, easing: directorEase, force: true, onComplete: () => { if (autoplay) stopAutoplay(); } });
}
function stopAutoplay() {
  if (!autoplay) return;
  autoplay = false;
  setPlayUI(false);
  if (lenis) lenis.scrollTo(lenis.animatedScroll, { immediate: true, force: true });
}
if (!lenis) playBtn.hidden = true;
playBtn.addEventListener('click', () => (autoplay ? stopAutoplay() : startAutoplay()));
// Any user scroll gesture takes control back (capture phase: runs before Lenis reads the wheel).
const userTakesOver = () => stopAutoplay();
window.addEventListener('wheel', userTakesOver, { capture: true, passive: true });
window.addEventListener('touchstart', userTakesOver, { capture: true, passive: true });
window.addEventListener('keydown', (e) => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(e.key)) userTakesOver(); }, { capture: true });

// Chapter rail: jump (continues the autoplay from there when it is running)
hud.rail.forEach((btn) => btn.addEventListener('click', () => {
  const at = +btn.dataset.at;
  ambience.whoosh?.(1);
  if (autoplay) { startAutoplay(at); return; }
  scrollToY(filmST.start + at * (filmST.end - filmST.start), { duration: 2.4, easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) });
}));

/* ---------- Hold to Act ---------- */
const holdRing = document.querySelector('.holdring');
const holdBar = holdRing.querySelector('.holdring__bar');
const holdLabel = holdRing.querySelector('.holdring__label');
const hold = { down: false, amt: 0, ext: null, x: 0, y: 0, sx: 0, sy: 0, type: 'mouse' };
function holdRelease() {
  if (!hold.down) return;
  hold.down = false;
  film?.pointerUp?.();
  holdRing.classList.remove('is-on');
  document.querySelector('.cursor')?.classList.remove('is-holding');
}
if (!reduced) {
  filmStage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('a, button')) return;
    Object.assign(hold, { down: true, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, type: e.pointerType });
    film?.pointerDown?.();
    holdRing.style.transform = '';
    gsap.set(holdRing, { x: e.clientX, y: e.clientY });
    holdRing.classList.add('is-on');
    document.querySelector('.cursor')?.classList.add('is-holding');
  });
  window.addEventListener('pointermove', (e) => {
    if (!hold.down) return;
    hold.x = e.clientX; hold.y = e.clientY;
    gsap.set(holdRing, { x: e.clientX, y: e.clientY });
    if (hold.type !== 'mouse' && Math.hypot(e.clientX - hold.sx, e.clientY - hold.sy) > 14) holdRelease();
  }, { passive: true });
  window.addEventListener('pointerup', holdRelease);
  window.addEventListener('pointercancel', holdRelease);
  window.addEventListener('blur', holdRelease);
  filmStage.addEventListener('contextmenu', (e) => { if (hold.down) e.preventDefault(); });
}

/* ---------- per-frame: velocity, hold, letterbox breathing ---------- */
const vel = { v: 0, lastY: 0 };
const velEls = new Set();
const io = new IntersectionObserver((entries) => entries.forEach((en) => {
  if (en.isIntersecting) velEls.add(en.target);
  else { velEls.delete(en.target); en.target.style.removeProperty('--vw'); en.target.style.removeProperty('--vs'); }
}), { rootMargin: '10% 0px' });
if (!reduced) document.querySelectorAll('[data-vel]').forEach((el) => io.observe(el));

const marquee = document.querySelector('.marquee__track');
const mq = { x: 0, dir: 1, half: 0 };
if (marquee) {
  marquee.innerHTML += marquee.innerHTML; // seamless loop
  const measure = () => { mq.half = marquee.scrollWidth / 2; };
  measure(); window.addEventListener('resize', measure); document.fonts?.ready.then(measure);
}
let drama = 0, lastDramaW = -1, lastVelW = 99;

gsap.ticker.add((time, dtMs) => {
  const dt = Math.min(0.05, (dtMs || 16) / 1000);
  // scroll velocity, normalised -1..1
  let raw = 0;
  if (lenis) raw = lenis.velocity || 0;
  else { const y = window.scrollY; raw = (y - vel.lastY); vel.lastY = y; }
  const target = reduced ? 0 : clamp(raw / 70, -1, 1);
  vel.v += (target - vel.v) * Math.min(1, dt * 7);
  if (Math.abs(vel.v) < 0.0005) vel.v = 0;
  film?.setVelocity?.(vel.v);

  // headings in view narrow + skew with velocity (wdth axis)
  if (!reduced && Math.abs(vel.v - lastVelW) > 0.004) {
    lastVelW = vel.v;
    const a = Math.abs(vel.v);
    const vw = (a * 48).toFixed(1), vs = `${(-vel.v * 9).toFixed(2)}deg`;
    velEls.forEach((el) => { el.style.setProperty('--vw', vw); el.style.setProperty('--vs', vs); });
    marquee?.style.setProperty('--mvw', (a * 55).toFixed(1));
  }
  // marquee speed follows scroll velocity and direction
  if (marquee && !reduced && mq.half) {
    if (vel.v > 0.04) mq.dir = 1; else if (vel.v < -0.04) mq.dir = -1;
    mq.x -= mq.dir * (55 + Math.abs(vel.v) * 1300) * dt;
    if (mq.x <= -mq.half) mq.x += mq.half; else if (mq.x > 0) mq.x -= mq.half;
    marquee.style.transform = `translate3d(${mq.x.toFixed(1)}px,0,0) skewX(${(-vel.v * 10).toFixed(2)}deg)`;
  }

  // Hold to Act: local ramp (the engine may report its own amount through onHold)
  hold.amt = hold.down ? Math.min(1, hold.amt + dt / 1.1) : Math.max(0, hold.amt - dt * 2.4);
  const h = hold.ext != null ? Math.max(hold.ext, hold.down ? hold.amt * 0.999 : 0) : hold.amt;
  if (hold.down || h > 0.001) {
    holdBar.style.strokeDashoffset = String(1 - h);
    holdLabel.textContent = h >= 0.99 ? 'Act' : 'Hold';
    ambience.hold?.(h);
  } else if (h === 0 && hold.lastH !== 0) ambience.hold?.(0);
  hold.lastH = h;

  // letterbox breathing: engine drama + hold
  const dTarget = clamp((film?.getDrama?.() || 0) + h * 0.55, 0, 1);
  drama += (dTarget - drama) * Math.min(1, dt * 3);
  if (Math.abs(drama - lastDramaW) > 0.002) { lastDramaW = drama; filmStage.style.setProperty('--drama', drama.toFixed(3)); }
});

/* ================================================================== */
/* Opening titles (preloader) → film                                    */
/* ================================================================== */
const pre = document.querySelector('.preloader');
const preBar = pre.querySelector('.preloader__bar span');
const preCount = pre.querySelector('.preloader__count');
const preName = pre.querySelector('.preloader__name');
const preChars = splitChars(preName);
const load01 = { real: 0, shown: 0 };
const titles = gsap.timeline();
gsap.set(preChars, { opacity: 0 });
titles.to('.preloader__arc path', { strokeDashoffset: 0, duration: 2.2, ease: 'power2.inOut' })
  .add(() => birth(preChars, { stagger: 0.045, duration: 1.8, from: 'center' }), 0.5)
  .to('.preloader__presents', { opacity: 1, duration: 1.4, ease: 'power2.out' }, 1.6);
const drawLoad = () => {
  preBar.style.transform = `scaleX(${load01.shown})`;
  preCount.textContent = String(Math.round(load01.shown * 100)).padStart(3, '0');
};
const loadTicker = () => { load01.shown += (Math.min(load01.real, 0.98) - load01.shown) * 0.08; drawLoad(); };
gsap.ticker.add(loadTicker);

let finished = false;
function finishLoading() {
  if (finished) return;
  finished = true;
  gsap.ticker.remove(loadTicker);
  const tl = gsap.timeline({ delay: Math.max(0, 2.6 - titles.time()) });
  tl.to(load01, { shown: 1, duration: 0.5, onUpdate: drawLoad })
    .add(() => unbirth(preChars, { duration: 0.8 }), '+=0.2')
    .to('.preloader__inner, .preloader__meta, .preloader__load, .preloader__count', { opacity: 0, filter: 'blur(8px)', duration: 0.9, ease: 'power2.in' }, '<')
    .to(pre, { autoAlpha: 0, duration: 1.2, ease: 'power2.inOut' }, '-=0.2')
    .add(() => {
      document.body.classList.remove('is-loading');
      lenis?.start();
      ScrollTrigger.refresh();
      updateFilmUI(filmST.progress || 0);
      if (!reduced) gsap.from('.nav, .hud, .rail', { opacity: 0, duration: 1.6, ease: 'power2.out', clearProps: 'opacity' });
    }, '-=0.8');
}

async function initFilm() {
  try {
    const { createFilm } = await load('./film/engine.js');
    film = createFilm(filmMount, { quality, reduced, onProgress: (l, t) => { load01.real = t ? l / t : 0; } });
    film.onHold = (a) => { hold.ext = a; }; // contract: engine reports its lens-punch amount
    await Promise.race([film.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('film timeout')), 25000))]);
    filmEl.classList.add('is-gl');
  } catch (err) {
    if (err?.message !== 'nogl') console.warn('[film] using fallback:', err?.message || err);
  }
  finishLoading();
}
setTimeout(finishLoading, 28000);
initFilm();

if (!coarse && !reduced) {
  window.addEventListener('pointermove', (e) => {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = (e.clientY / window.innerHeight) * 2 - 1;
    film?.setPointer(x, y);
    hall?.setPointer?.(x, y);
    bridge?.setPointer?.(x, y);
  }, { passive: true });
}

/* ================================================================== */
/* 02 Why Egypt — pinned particle data morph                           */
/* ================================================================== */
const egyptEl = document.querySelector('.egypt');
const dmEl = egyptEl.querySelector('.dm');
const dmStage = dmEl.querySelector('.dm__stage');
const dmCaps = [...dmEl.querySelectorAll('.dm__cap')];
const dmTicks = [...dmEl.querySelectorAll('.dm__ticks i')];
const dmStateEl = dmEl.querySelector('.dm__state');
const dmIntroChars = splitChars(dmCaps[0].querySelector('.t-disp'));
let dm = null;
let dmStatic = false;
let dmCap = -1;
let dmP = 0;

function countUp(el, dur = 2.2) {
  const target = parseFloat(el.dataset.count);
  const dec = parseInt(el.dataset.decimals || '0', 10);
  if (reduced) { el.textContent = target.toFixed(dec); return; }
  const o = { v: 0 };
  gsap.to(o, { v: target, duration: dur, ease: 'expo.out', onUpdate: () => (el.textContent = o.v.toFixed(dec)) });
}
function showDmCap(i) {
  if (i === dmCap || dmStatic) return;
  const prev = dmCaps[dmCap];
  dmCap = i;
  dmTicks.forEach((t, k) => t.classList.toggle('is-on', k === i));
  if (i >= 0) dmStateEl.textContent = pad2(i + 1);
  if (prev) {
    prev.classList.remove('is-on');
    gsap.killTweensOf(prev);
    gsap.to(prev, { clipPath: 'polygon(100% 0%, 100% 0%, 100% 100%, 100% 100%)', duration: reduced ? 0 : 0.6, ease: 'power3.in',
      onComplete: () => { if (!prev.classList.contains('is-on')) gsap.set(prev, { autoAlpha: 0 }); } });
  }
  const next = dmCaps[i];
  if (!next) return;
  next.classList.add('is-on');
  gsap.killTweensOf(next);
  gsap.set(next, { autoAlpha: 1 });
  gsap.fromTo(next, { clipPath: 'polygon(0% 0%, 0% 0%, -25% 100%, -25% 100%)' }, { clipPath: 'polygon(0% 0%, 125% 0%, 100% 100%, -25% 100%)', duration: reduced ? 0 : 1.2, ease: 'expo.out', delay: reduced ? 0 : 0.25 });
  if (i === 0) birth(dmIntroChars, { delay: 0.3 });
  const num = next.querySelector('[data-count]');
  if (num) {
    countUp(num);
    if (!reduced) gsap.fromTo(next.querySelector('.stat__num'), { '--wdn': 125, filter: 'blur(10px)' }, { '--wdn': 62, filter: 'blur(0px)', duration: 1.8, ease: 'expo.out', delay: 0.2 });
  }
}
// Scroll → morph progress with plateaus, so each of the five states holds while its caption reads.
const dmStair = (s) => { const seg = Math.min(3.9999, s * 4); const i = Math.floor(seg); return (i + smoothstep(0.32, 0.86, seg - i)) / 4; };
function setDmStatic() {
  if (dmStatic) return;
  dmStatic = true;
  egyptEl.classList.add('is-static');
  dmCaps.forEach((c) => { c.classList.add('is-on'); gsap.set(c, { autoAlpha: 1, clearProps: 'clipPath' }); });
  gsap.set(dmIntroChars, { opacity: 1 });
  dmCaps.forEach((c) => {
    const num = c.querySelector('[data-count]');
    if (num) ScrollTrigger.create({ trigger: c, start: 'top 90%', once: true, onEnter: () => countUp(num) });
  });
  ScrollTrigger.refresh();
}
gsap.set(dmCaps, { autoAlpha: 0 });
gsap.set(dmIntroChars, { opacity: 0 });
const dmST = ScrollTrigger.create({
  trigger: dmEl, start: 'top top', end: 'bottom bottom', scrub: true,
  onUpdate: (self) => {
    if (dmStatic) return;
    dmP = dmStair(self.progress);
    dm?.setProgress?.(dmP);
    const k = dmP * 4, i = Math.round(k);
    showDmCap(Math.abs(k - i) < 0.34 ? i : -1);
  },
  onToggle: (self) => { if (!dm) return; if (self.isActive) dm.resume?.(); else dm.pause?.(); },
});
if (reduced || skipGL('./showcase/datamorph.js')) setDmStatic();
else {
  ScrollTrigger.create({
    trigger: egyptEl, start: 'top 250%', once: true,
    onEnter: async () => {
      try {
        const { createDataMorph } = await load('./showcase/datamorph.js');
        dm = createDataMorph(dmEl.querySelector('.dm__gl'), { quality });
        await Promise.race([dm.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('datamorph timeout')), 30000))]);
        dm.setProgress?.(dmP);
        if (!dmST.isActive) dm.pause?.();
        egyptEl.classList.add('is-gl');
      } catch (err) {
        console.warn('[datamorph] static fallback:', err?.message || err);
        try { dm?.dispose?.(); } catch { /* ignore */ }
        dm = null;
        setDmStatic();
      }
    },
  });
  const dmXY = (e) => { const r = dmStage.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1]; };
  dmStage.addEventListener('pointermove', (e) => { if (dm) dm.setPointer?.(...dmXY(e)); }, { passive: true });
  dmStage.addEventListener('pointerleave', () => dm?.setPointer?.(9, 9));
  dmStage.addEventListener('click', (e) => { if (!dm) return; dm.burst?.(...dmXY(e)); ambience.burst?.(); });
}

/* ================================================================== */
/* 04 Hall of monoliths (services): scroll, drag with inertia, keys    */
/* ================================================================== */
const hallEl = document.querySelector('.hall');
const hallStage = hallEl.querySelector('.hall__stage');
const hallItems = [...hallEl.querySelectorAll('.hall__item')];
const hallBtns = [...hallEl.querySelectorAll('[data-goto]')];
const hallBig = hallEl.querySelector('.hall__big span');
const hallCount = hallEl.querySelector('.hall__count');
const hallTitles = hallItems.map((it) => splitChars(it.querySelector('h3')));
let hall = null;
let activeService = -1;

function setService(i) {
  if (i === activeService) return;
  const prev = hallItems[activeService];
  const first = activeService === -1;
  activeService = i;
  const next = hallItems[i];
  hallBtns.forEach((b, k) => b.classList.toggle('is-on', k === i));
  hall?.setActive?.(i);
  hallBig.textContent = pad2(i + 1);
  hallCount.textContent = `${pad2(i + 1)} / 08`;
  if (!first) ambience.whoosh?.(0.35);
  hallItems.forEach((it, k) => {
    if (k === i) return;
    it.classList.remove('is-active');
    if (it === prev) {
      gsap.killTweensOf(it);
      gsap.to(it, { autoAlpha: 0, x: -30, duration: reduced ? 0 : 0.4, ease: 'power2.in' });
    } else if (gsap.getProperty(it, 'autoAlpha') > 0) { gsap.killTweensOf(it); gsap.set(it, { autoAlpha: 0 }); }
  });
  next.classList.add('is-active');
  gsap.killTweensOf(next);
  gsap.fromTo(next, { autoAlpha: 0, x: 0 }, { autoAlpha: 1, duration: reduced ? 0 : 0.6, delay: reduced ? 0 : 0.2 });
  if (!reduced) {
    birth(hallTitles[i], { delay: 0.25, stagger: 0.012, duration: 1.2 });
    gsap.fromTo(next.querySelectorAll('.hall__num, p, li'), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.04, delay: 0.4 });
    gsap.fromTo(hallBig, { '--wdn': 125, opacity: 0 }, { '--wdn': 62, opacity: 1, duration: 1.6, ease: 'expo.out' });
  } else gsap.set(hallTitles[i], { opacity: 1 });
}
gsap.set(hallItems, { autoAlpha: 0 });
hallTitles.forEach((c) => gsap.set(c, { opacity: 0 }));
setService(0);

const hallST = ScrollTrigger.create({
  trigger: hallEl, start: 'top top', end: 'bottom bottom', scrub: true,
  onUpdate: (self) => {
    const p = self.progress;
    hall?.setProgress(p);
    gsap.set('.hall__progress i', { scaleX: p });
    setService(Math.min(7, Math.floor(p * 8 * 0.999)));
  },
});
const serviceY = (i) => hallST.start + (hallST.end - hallST.start) * ((clamp(i, 0, 7) + 0.5) / 8);
const goService = (i, duration = 1.4) => scrollToY(serviceY(i), { duration });
hallBtns.forEach((b, i) => b.addEventListener('click', () => goService(i)));

// Drag (mouse + touch) maps horizontal motion onto the pinned scroll position, with inertia + snap.
const drag = { on: false, moved: false, id: 0, x0: 0, y0: 0, s0: 0, lx: 0, lt: 0, v: 0 };
hallStage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('a, button')) return;
  Object.assign(drag, { on: true, moved: false, id: e.pointerId, x0: e.clientX, y0: e.clientY, s0: scrollY(), lx: e.clientX, lt: performance.now(), v: 0 });
});
hallStage.addEventListener('pointermove', (e) => {
  if (!drag.on || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x0;
  if (!drag.moved) {
    if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(e.clientY - drag.y0)) return;
    drag.moved = true;
    stopAutoplay();
    hallStage.setPointerCapture?.(e.pointerId);
    hallStage.classList.add('is-dragging');
  }
  const perPx = (hallST.end - hallST.start) / 8 / (hallStage.clientWidth * 0.42);
  const y = clamp(drag.s0 - dx * perPx, hallST.start + 1, hallST.end - 1);
  scrollToY(y, { immediate: true });
  const now = performance.now();
  const inst = (e.clientX - drag.lx) / Math.max(1, now - drag.lt);
  drag.v = drag.v * 0.6 + inst * 0.4;
  drag.lx = e.clientX; drag.lt = now;
});
const endDrag = () => {
  if (!drag.on) return;
  drag.on = false;
  hallStage.classList.remove('is-dragging');
  if (!drag.moved) return;
  const seg = (hallST.end - hallST.start) / 8;
  const perPx = seg / (hallStage.clientWidth * 0.42);
  const projected = scrollY() - drag.v * 320 * perPx; // inertia: ~320 ms of travel
  const i = clamp(Math.round((projected - hallST.start) / seg - 0.5), 0, 7);
  goService(i, 1.1);
};
hallStage.addEventListener('pointerup', endDrag);
hallStage.addEventListener('pointercancel', endDrag);
hallStage.addEventListener('lostpointercapture', endDrag);
window.addEventListener('keydown', (e) => {
  if (!hallST.isActive || e.target.closest?.('input, textarea')) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); goService(activeService + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); goService(activeService - 1); }
});
if (!skipGL('./showcase/monoliths.js')) {
  ScrollTrigger.create({
    trigger: hallEl, start: 'top 250%', once: true,
    onEnter: async () => {
      try {
        const { createMonoliths } = await load('./showcase/monoliths.js');
        hall = createMonoliths(hallEl.querySelector('.hall__gl'), { quality });
        await hall.ready;
        hall.setActive?.(Math.max(0, activeService));
        gsap.to(hallEl.querySelector('.hall__fallback'), { opacity: 0, duration: 1.2 });
      } catch (err) { console.warn('[monoliths] fallback:', err?.message || err); }
    },
  });
}

/* ================================================================== */
/* 05 Method — the bridge builds itself                                */
/* ================================================================== */
const methodEl = document.querySelector('.method');
const steps = [...methodEl.querySelectorAll('.mstep')];
const stepsWrap = methodEl.querySelector('.method__steps');
let bridge = null;
let methodP = 0;
const STEP_AT = [0.25, 0.5, 0.75, 0.95];
ScrollTrigger.create({
  trigger: methodEl, start: 'top top', end: 'bottom bottom', scrub: true,
  onUpdate: (self) => {
    methodP = self.progress;
    bridge?.setProgress(methodP);
    if (bridge) steps.forEach((s, i) => s.classList.toggle('is-on', methodP >= STEP_AT[i] - 0.03));
  },
});
function placeSteps() {
  if (bridge?.getNodeScreenPositions) {
    const pts = bridge.getNodeScreenPositions();
    const r = methodEl.querySelector('.method__stage').getBoundingClientRect();
    pts.forEach((pt, i) => {
      if (!steps[i] || !pt) return;
      steps[i].style.left = `${pt.x * r.width}px`;
      steps[i].style.top = `${pt.y * r.height + 34}px`;
    });
  }
  requestAnimationFrame(placeSteps);
}
if (skipGL('./showcase/bridgebuild.js')) stepsWrap.classList.add('is-static');
else {
  ScrollTrigger.create({
    trigger: methodEl, start: 'top 250%', once: true,
    onEnter: async () => {
      try {
        const { createBridgeBuild } = await load('./showcase/bridgebuild.js');
        bridge = createBridgeBuild(methodEl.querySelector('.method__gl'), { quality });
        await bridge.ready;
        bridge.setProgress(methodP);
        gsap.to(methodEl.querySelector('.method__fallback'), { opacity: 0, duration: 1.2 });
        placeSteps();
      } catch (err) {
        console.warn('[bridge] fallback:', err?.message || err);
        stepsWrap.classList.add('is-static');
      }
    },
  });
  setTimeout(() => { if (!bridge) stepsWrap.classList.add('is-static'); }, 30000);
}

/* ================================================================== */
/* Section reveals: titles, diagonal wipes, numerals                   */
/* ================================================================== */
document.querySelectorAll('[data-title]').forEach((el) => {
  if (el.closest('.dm__cap')) return; // handled by the data-morph captions
  const chars = splitChars(el);
  if (reduced) return;
  gsap.set(chars, { opacity: 0 });
  ScrollTrigger.create({ trigger: el, start: 'top 86%', once: true, onEnter: () => birth(chars, { stagger: 0.018 }) });
});
if (!reduced) {
  ScrollTrigger.batch('[data-fade]', {
    start: 'top 90%',
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: 0.07, overwrite: true }),
  });

  // Diagonal clip-path wipes with a luminous edge (alternating direction) — no fades between sections.
  document.querySelectorAll('[data-wipe]').forEach((sec, n) => {
    const edge = document.createElement('i');
    edge.className = 'wipe-edge';
    edge.setAttribute('aria-hidden', 'true');
    sec.appendChild(edge);
    const flip = n % 2 === 1;
    const set = (k) => {
      if (k <= 0.001) { sec.style.clipPath = ''; edge.style.opacity = '0'; return; }
      const W = sec.offsetWidth, h = k * window.innerHeight * 0.26;
      sec.style.clipPath = flip
        ? `polygon(0 0, 100% ${h}px, 100% 100%, 0 100%)`
        : `polygon(0 ${h}px, 100% 0, 100% 100%, 0 100%)`;
      const len = Math.hypot(W, h), ang = Math.atan2(h, W) * (flip ? 1 : -1);
      edge.style.width = `${len}px`;
      edge.style.top = `${flip ? 0 : h}px`;
      edge.style.transform = `rotate(${ang}rad)`;
      edge.style.opacity = String(Math.min(1, k * 4));
    };
    ScrollTrigger.create({ trigger: sec, start: 'top bottom', end: 'top 30%', onUpdate: (s) => set(1 - s.progress), onRefresh: (s) => set(1 - s.progress) });
  });

  // Giant cut numerals: drift and condense (wdth 125 → 62) as their section arrives.
  document.querySelectorAll('.sec__num').forEach((num) => {
    const sec = num.closest('section, .sec');
    gsap.set(num, { y: 0, yPercent: -38 });
    gsap.fromTo(num, { yPercent: -8, '--wdn': 125 }, { yPercent: -46, '--wdn': 62, ease: 'none', scrollTrigger: { trigger: sec, start: 'top bottom', end: 'top 10%', scrub: 0.6 } });
  });
}

// Manifesto: words light up with scroll
const manifesto = document.querySelector('[data-words]');
if (manifesto) {
  const html = [];
  manifesto.childNodes.forEach((n) => {
    const cls = n.nodeType === 1 ? n.className : '';
    n.textContent.split(/\s+/).filter(Boolean).forEach((w) => html.push(`<span class="w${cls ? ` ${cls}` : ''}">${w}</span>`));
  });
  manifesto.setAttribute('aria-label', manifesto.textContent.replace(/\s+/g, ' ').trim());
  manifesto.innerHTML = `<span aria-hidden="true">${html.join(' ')}</span>`;
  const ws = manifesto.querySelectorAll('.w');
  if (reduced) gsap.set(ws, { opacity: 1 });
  else gsap.to(ws, { opacity: 1, stagger: 0.1, ease: 'none', scrollTrigger: { trigger: manifesto, start: 'top 80%', end: 'bottom 50%', scrub: 0.6 } });
}

/* Journey */
const stages = document.querySelectorAll('.stage');
ScrollTrigger.create({
  trigger: '.journey__rail', start: 'top 75%', end: 'bottom 55%', scrub: reduced ? false : 0.6,
  onUpdate: (self) => {
    gsap.set('.journey__line i', { scaleX: self.progress });
    stages.forEach((s, i) => s.classList.toggle('is-on', self.progress >= i / 4 + 0.02));
  },
  onLeave: () => stages.forEach((s) => s.classList.add('is-on')),
});
if (reduced) { gsap.set('.journey__line i', { scaleX: 1 }); stages.forEach((s) => s.classList.add('is-on')); }
else gsap.from('.stage', { y: 60, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.12, scrollTrigger: { trigger: '.journey__rail', start: 'top 88%' } });

if (!reduced) {
  gsap.fromTo('.contact__big', { xPercent: 5 }, { xPercent: -3, ease: 'none', scrollTrigger: { trigger: '.contact', start: 'top bottom', end: 'bottom top', scrub: true } });
  gsap.fromTo('.footer__word', { xPercent: 8 }, { xPercent: 0, ease: 'none', scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: true } });
}

/* ================================================================== */
/* Nav (with current-section index), menu, cursor                      */
/* ================================================================== */
const nav = document.querySelector('.nav');
const navN = nav.querySelector('.nav__now-n');
const navT = nav.querySelector('.nav__now-t');
const setNow = (n, t) => {
  if (navN.textContent === n) return;
  navN.textContent = n; navT.textContent = t;
  if (!reduced) gsap.fromTo(nav.querySelector('.nav__now'), { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.8, ease: 'expo.out' });
};
ScrollTrigger.create({ trigger: filmEl, start: 'top top', end: 'bottom 50%', onToggle: (s) => s.isActive && setNow('00', 'The film') });
document.querySelectorAll('section[data-sec]').forEach((sec) => {
  ScrollTrigger.create({ trigger: sec, start: 'top 50%', end: 'bottom 50%', onToggle: (s) => s.isActive && setNow(sec.dataset.sec, sec.dataset.name) });
});
document.querySelectorAll('.clients, .contact').forEach((sec) => {
  ScrollTrigger.create({ trigger: sec, start: 'top 40px', end: 'bottom 40px', toggleClass: { targets: nav, className: 'is-light' } });
});
let lastY = 0;
const onScroll = (y) => {
  nav.classList.toggle('is-scrolled', y > 40);
  nav.classList.toggle('is-film', y < filmEl.offsetHeight - window.innerHeight * 0.5);
  if (!document.body.classList.contains('menu-open')) nav.classList.toggle('is-hidden', y > lastY && y > 400 && !autoplay);
  lastY = y;
};
if (lenis) lenis.on('scroll', ({ scroll }) => onScroll(scroll));
else window.addEventListener('scroll', () => onScroll(window.scrollY), { passive: true });

burger.addEventListener('click', () => {
  const open = document.body.classList.toggle('menu-open');
  burger.setAttribute('aria-expanded', String(open));
  burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  if (open) { stopAutoplay(); lenis?.stop(); } else lenis?.start();
  if (open && !reduced) gsap.fromTo('.mobile-menu a', { yPercent: 60, opacity: 0}, { yPercent: 0, opacity: 1, duration: 1, ease: 'expo.out', stagger: 0.06, delay: 0.3 });
});

if (!coarse && !reduced) {
  const cursor = document.querySelector('.cursor');
  const dot = cursor.querySelector('.cursor__dot');
  const ring = cursor.querySelector('.cursor__ring');
  const label = cursor.querySelector('.cursor__label');
  const xDot = gsap.quickTo(dot, 'x', { duration: 0.12, ease: 'power3' });
  const yDot = gsap.quickTo(dot, 'y', { duration: 0.12, ease: 'power3' });
  const xRing = gsap.quickTo([ring, label], 'x', { duration: 0.45, ease: 'power3' });
  const yRing = gsap.quickTo([ring, label], 'y', { duration: 0.45, ease: 'power3' });
  let seen = false;
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (!seen) { seen = true; cursor.classList.add('is-active'); }
    xDot(e.clientX); yDot(e.clientY); xRing(e.clientX); yRing(e.clientY);
  }, { passive: true });
  // Contextual label: DRAG / HOLD / PLAY / VIEW / CLICK from data-cursor; plain links just grow the ring.
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const ctl = e.target.closest('a, button');
    const ctx = ctl && !ctl.dataset.cursor ? null : e.target.closest('[data-cursor]');
    const text = ctx ? ctx.dataset.cursor : '';
    cursor.classList.toggle('is-hover', !!ctl && !text);
    cursor.classList.toggle('has-label', !!text);
    if (text && label.textContent !== text) label.textContent = text;
  });
  document.addEventListener('pointerleave', () => cursor.classList.remove('is-active'));
  document.addEventListener('pointerenter', () => seen && cursor.classList.add('is-active'));
  document.querySelectorAll('[data-magnetic]').forEach((el) => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * 0.22);
      yTo((e.clientY - (r.top + r.height / 2)) * 0.32);
    });
    el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
  });
} else {
  document.querySelector('.cursor')?.remove();
}

document.fonts?.ready.then(() => ScrollTrigger.refresh());
window.addEventListener('load', () => ScrollTrigger.refresh());

// QA hooks (harmless in production)
window.__bbe = { startAutoplay, stopAutoplay, goService, get film() { return film; }, get dm() { return dm; } };
