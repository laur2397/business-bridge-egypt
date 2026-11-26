import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createAmbience } from './audio.js';

gsap.registerPlugin(ScrollTrigger);

// Lazy 3D modules (code-split; a missing or failing module falls back gracefully)
const modules = import.meta.glob(['./film/engine.js', './showcase/monoliths.js', './showcase/bridgebuild.js']);
const load = (path) => (modules[path] ? modules[path]() : Promise.reject(new Error(`${path} missing`)));

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;
const quality = coarse || window.innerWidth < 900 || (navigator.hardwareConcurrency || 8) <= 4 ? 'low' : 'high';
if (reduced) document.documentElement.classList.add('reduced');
document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));

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
const burger = document.querySelector('.nav__burger');
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    const target = id === '#top' ? 0 : document.querySelector(id);
    if (target === null) return;
    e.preventDefault();
    document.body.classList.remove('menu-open');
    burger?.setAttribute('aria-expanded', 'false');
    burger?.setAttribute('aria-label', 'Open menu');
    if (lenis) { lenis.start(); lenis.scrollTo(target, { duration: 1.8 }); }
    else if (target === 0) window.scrollTo(0, 0);
    else target.scrollIntoView();
  });
});

/* ================================================================== */
/* Text splitting                                                      */
/* ================================================================== */
function splitWords(el) {
  const frag = document.createDocumentFragment();
  const walk = (node, tag) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          const outer = document.createElement('span');
          outer.className = 'split-line';
          outer.style.cssText = 'display:inline-block;vertical-align:top';
          const inner = document.createElement(tag || 'span');
          inner.textContent = part;
          outer.appendChild(inner);
          frag.appendChild(outer);
        });
      } else if (child.nodeType === 1 && child.tagName === 'BR') {
        frag.appendChild(document.createElement('br'));
      } else if (child.nodeType === 1) walk(child, child.tagName.toLowerCase());
    });
  };
  walk(el, null);
  el.innerHTML = '';
  el.appendChild(frag);
  return el.querySelectorAll('.split-line > *');
}
const splitEls = [...document.querySelectorAll('[data-split]')].map((el) => ({ el, words: splitWords(el) }));

/* ================================================================== */
/* Film                                                                */
/* ================================================================== */
const filmEl = document.querySelector('.film');
const filmMount = filmEl.querySelector('.film__gl');
const cards = [...filmEl.querySelectorAll('.card')].map((el) => {
  const [a, b] = el.dataset.range.split(',').map(Number);
  const title = el.querySelector('.card__title, .finale__line, .card__coords');
  // kinetic typography: split titles into characters grouped by word
  if (title) {
    const words = [];
    const walk = (node, wrapTag) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) {
          const parts = child.textContent.split(/(\s+)/);
          const f = document.createDocumentFragment();
          parts.forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { f.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span'); w.style.cssText = 'display:inline-block;white-space:nowrap';
            [...part].forEach((ch) => { const c = document.createElement('span'); c.className = 'char'; c.textContent = ch; w.appendChild(c); });
            words.push(w);
            if (wrapTag) { const t = document.createElement(wrapTag); t.appendChild(w); f.appendChild(t); } else f.appendChild(w);
          });
          node.replaceChild(f, child);
        } else if (child.nodeType === 1 && child.tagName !== 'BR') {
          // flatten <em> into styled spans so characters can animate individually
          if (child.tagName === 'EM') { walk(child, null); } else walk(child, null);
        }
      });
    };
    walk(title, null);
  }
  return { el, a, b, chars: el.querySelectorAll('.char'), rest: el.querySelectorAll('.eyebrow, .card__sub, .hero__ctas'), on: false };
});

const hud = {
  chapter: filmEl.querySelector('.hud__chapter'),
  tc: filmEl.querySelector('.hud__tc'),
  coord: filmEl.querySelector('.hud__coord'),
  rail: [...filmEl.querySelectorAll('.film__rail span')],
  hint: filmEl.querySelector('.film__hint'),
};
const CHAPTERS = [
  { at: 0, name: 'I · The World', coord: 'Orbit · 400 km · 22.0° N 31.2° E' },
  { at: 0.37, name: 'II · Descent', coord: 'Altitude 3,200 m · Nile Delta' },
  { at: 0.48, name: 'III · The River', coord: 'The Nile · Cairo · 30.04° N 31.24° E' },
  { at: 0.7, name: 'IV · The Bridge', coord: 'Golden hour → blue hour' },
  { at: 0.88, name: 'V · Act', coord: 'Cairo · Night' },
];
let currentChapter = -1;
const ambience = createAmbience();

function showCard(c) {
  c.on = true;
  c.el.classList.add('is-on');
  gsap.killTweensOf([c.el, c.chars, c.rest]);
  gsap.set(c.el, { autoAlpha: 1 });
  if (reduced) { gsap.set([c.chars, c.rest], { opacity: 1, clearProps: 'transform,filter' }); return; }
  gsap.fromTo(c.chars, { opacity: 0, yPercent: 40, filter: 'blur(14px)', letterSpacing: '0.12em' },
    { opacity: 1, yPercent: 0, filter: 'blur(0px)', letterSpacing: '0em', duration: 1.4, ease: 'expo.out', stagger: { each: 0.018, from: 'start' } });
  gsap.fromTo(c.rest, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: 0.1, delay: 0.25 });
}
function hideCard(c) {
  c.on = false;
  c.el.classList.remove('is-on');
  gsap.killTweensOf([c.el, c.chars, c.rest]);
  if (reduced) { gsap.set(c.el, { autoAlpha: 0 }); return; }
  gsap.to(c.chars, { opacity: 0, filter: 'blur(10px)', yPercent: -30, duration: 0.6, ease: 'power2.in', stagger: { each: 0.008, from: 'end' } });
  gsap.to(c.rest, { opacity: 0, y: -16, duration: 0.5, ease: 'power2.in' });
  gsap.to(c.el, { autoAlpha: 0, duration: 0.2, delay: 0.6 });
}

function pad2(n) { return String(Math.floor(n)).padStart(2, '0'); }
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
    currentChapter = idx;
    hud.chapter.textContent = CHAPTERS[idx].name;
    hud.coord.textContent = CHAPTERS[idx].coord;
    hud.rail.forEach((r, i) => r.classList.toggle('is-on', i === idx));
    ambience.chime(idx);
  }
  // 24 fps timecode over a ~3-minute "film"
  const secs = f * 180;
  hud.tc.textContent = `00:${pad2(secs / 60)}:${pad2(secs % 60)}:${pad2((secs * 24) % 24)}`;
  hud.hint.style.opacity = f > 0.02 ? 0 : 1;
  filmEl.classList.toggle('is-ended', f > 0.965);
  ambience.update(f);
}

ScrollTrigger.create({
  trigger: filmEl, start: 'top top', end: 'bottom bottom', scrub: true,
  onUpdate: (self) => { film?.setProgress(self.progress); updateFilmUI(self.progress); },
});
ScrollTrigger.create({ trigger: filmEl, start: 'bottom bottom', end: 'bottom top', onUpdate: (s) => ambience.update(1 + s.progress) });

// Sound toggle
const soundBtn = filmEl.querySelector('.sound');
soundBtn.addEventListener('click', async () => {
  const on = await ambience.toggle();
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.setAttribute('aria-label', on ? 'Turn ambient sound off' : 'Turn ambient sound on');
  soundBtn.querySelector('.sound__label').textContent = on ? 'Sound on' : 'Sound off';
  ambience.update(filmProgress);
});

/* ================================================================== */
/* Opening titles (preloader) → film                                    */
/* ================================================================== */
const pre = document.querySelector('.preloader');
const preBar = pre.querySelector('.preloader__bar span');
const preCount = pre.querySelector('.preloader__count');
const load01 = { real: 0, shown: 0 };
const titles = gsap.timeline();
titles.to('.preloader__arc path', { strokeDashoffset: 0, duration: 2.2, ease: 'power2.inOut' })
  .to('.preloader__presents', { opacity: 1, letterSpacing: '0.24em', duration: 1.6, ease: 'power2.out' }, 0.9);
const loadTicker = () => {
  load01.shown += (Math.min(load01.real, 0.98) - load01.shown) * 0.08;
  preBar.style.transform = `scaleX(${load01.shown})`;
  preCount.textContent = String(Math.round(load01.shown * 100)).padStart(3, '0');
};
gsap.ticker.add(loadTicker);

let finished = false;
function finishLoading() {
  if (finished) return;
  finished = true;
  gsap.ticker.remove(loadTicker);
  const tl = gsap.timeline({ delay: Math.max(0, 2.4 - titles.time()) });
  tl.to(load01, { shown: 1, duration: 0.5, onUpdate: () => { preBar.style.transform = `scaleX(${load01.shown})`; preCount.textContent = String(Math.round(load01.shown * 100)).padStart(3, '0'); } })
    .to('.preloader__inner', { opacity: 0, filter: 'blur(8px)', duration: 0.9, ease: 'power2.in' }, '+=0.2')
    .to(pre, { autoAlpha: 0, duration: 1.4, ease: 'power2.inOut' }, '-=0.2')
    .add(() => {
      document.body.classList.remove('is-loading');
      lenis?.start();
      ScrollTrigger.refresh();
      updateFilmUI(0);
      if (!reduced) gsap.from('.nav, .hud', { opacity: 0, duration: 1.6, ease: 'power2.out', clearProps: 'opacity' });
    }, '-=0.8');
}

async function initFilm() {
  try {
    const { createFilm } = await load('./film/engine.js');
    film = createFilm(filmMount, { quality, reduced, onProgress: (l, t) => { load01.real = t ? l / t : 0; } });
    await Promise.race([film.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('film timeout')), 25000))]);
    filmEl.classList.add('is-gl');
  } catch (err) {
    console.warn('[film] using fallback:', err?.message || err);
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
/* Hall of monoliths (services)                                        */
/* ================================================================== */
const hallEl = document.querySelector('.hall');
const hallItems = [...hallEl.querySelectorAll('.hall__item')];
const hallBtns = [...hallEl.querySelectorAll('[data-goto]')];
let hall = null;
let activeService = -1;

function setService(i) {
  if (i === activeService) return;
  const prev = hallItems[activeService];
  activeService = i;
  const next = hallItems[i];
  hallBtns.forEach((b, k) => b.classList.toggle('is-on', k === i));
  hall?.setActive?.(i);
  if (prev) {
    prev.classList.remove('is-active');
    gsap.to(prev, { autoAlpha: 0, y: -30, filter: 'blur(8px)', duration: reduced ? 0 : 0.5, ease: 'power2.in' });
  }
  next.classList.add('is-active');
  gsap.fromTo(next, { autoAlpha: 0, y: 40, filter: 'blur(10px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: reduced ? 0 : 1.1, ease: 'expo.out', delay: reduced ? 0 : 0.25 });
  if (!reduced) gsap.from(next.querySelectorAll('li'), { opacity: 0, x: -16, duration: 0.8, ease: 'expo.out', stagger: 0.06, delay: 0.5 });
}
gsap.set(hallItems, { autoAlpha: 0 });
setService(0);

ScrollTrigger.create({
  trigger: hallEl, start: 'top top', end: 'bottom bottom', scrub: true,
  onUpdate: (self) => {
    const p = self.progress;
    hall?.setProgress(p);
    gsap.set('.hall__progress i', { scaleX: p });
    setService(Math.min(7, Math.floor(p * 8 * 0.999)));
  },
});
hallBtns.forEach((b, i) => b.addEventListener('click', () => {
  const st = ScrollTrigger.getAll().find((s) => s.trigger === hallEl);
  if (!st) return;
  const y = st.start + (st.end - st.start) * ((i + 0.5) / 8);
  if (lenis) lenis.scrollTo(y, { duration: 1.4 }); else window.scrollTo(0, y);
}));
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

/* ================================================================== */
/* Method — the bridge builds itself                                   */
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
// If the 3D module never arrives, show the steps statically.
setTimeout(() => { if (!bridge) stepsWrap.classList.add('is-static'); }, 30000);

/* ================================================================== */
/* Generic reveals                                                     */
/* ================================================================== */
splitEls.forEach(({ el, words }) => {
  if (reduced) return;
  gsap.from(words, { yPercent: 115, rotate: 2, duration: 1.4, ease: 'expo.out', stagger: 0.045, scrollTrigger: { trigger: el, start: 'top 85%' } });
});
if (!reduced) {
  ScrollTrigger.batch('[data-fade]', {
    start: 'top 88%',
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08, overwrite: true }),
  });
}
const manifesto = document.querySelector('[data-words]');
if (manifesto) {
  const html = [];
  manifesto.childNodes.forEach((n) => {
    const hl = n.nodeType === 1 && n.classList.contains('hl');
    n.textContent.split(/\s+/).filter(Boolean).forEach((w) => html.push(`<span class="w${hl ? ' hl' : ''}">${w}</span>`));
  });
  manifesto.innerHTML = html.join(' ');
  const ws = manifesto.querySelectorAll('.w');
  if (reduced) gsap.set(ws, { opacity: 1 });
  else gsap.to(ws, { opacity: 1, stagger: 0.1, ease: 'none', scrollTrigger: { trigger: manifesto, start: 'top 78%', end: 'bottom 45%', scrub: 0.6 } });
}
document.querySelectorAll('[data-count]').forEach((el) => {
  const target = parseFloat(el.dataset.count);
  const dec = parseInt(el.dataset.decimals || '0', 10);
  const o = { v: 0 };
  if (reduced) { el.textContent = target.toFixed(dec); return; }
  ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => gsap.to(o, { v: target, duration: 2.4, ease: 'expo.out', onUpdate: () => (el.textContent = o.v.toFixed(dec)) }) });
});

/* Journey */
const stages = document.querySelectorAll('.stage');
ScrollTrigger.create({
  trigger: '.journey__rail', start: 'top 75%', end: 'bottom 50%', scrub: reduced ? false : 0.6,
  onUpdate: (self) => {
    gsap.set('.journey__line i', { scaleX: self.progress });
    stages.forEach((s, i) => s.classList.toggle('is-on', self.progress >= i / 4 + 0.02));
  },
  onLeave: () => stages.forEach((s) => s.classList.add('is-on')),
});
if (reduced) { gsap.set('.journey__line i', { scaleX: 1 }); stages.forEach((s) => s.classList.add('is-on')); }
else gsap.from('.stage', { y: 50, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.14, scrollTrigger: { trigger: '.journey__rail', start: 'top 85%' } });

if (!reduced) {
  gsap.fromTo('.contact__big', { xPercent: 6 }, { xPercent: -2, ease: 'none', scrollTrigger: { trigger: '.contact', start: 'top bottom', end: 'bottom top', scrub: true } });
}

/* ================================================================== */
/* Nav, menu, cursor                                                   */
/* ================================================================== */
const nav = document.querySelector('.nav');
let lastY = 0;
const onScroll = (y) => {
  nav.classList.toggle('is-scrolled', y > 40);
  nav.classList.toggle('is-film', y < filmEl.offsetHeight - window.innerHeight * 0.5);
  if (!document.body.classList.contains('menu-open')) nav.classList.toggle('is-hidden', y > lastY && y > 400);
  lastY = y;
};
if (lenis) lenis.on('scroll', ({ scroll }) => onScroll(scroll));
else window.addEventListener('scroll', () => onScroll(window.scrollY), { passive: true });

burger.addEventListener('click', () => {
  const open = document.body.classList.toggle('menu-open');
  burger.setAttribute('aria-expanded', String(open));
  burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  if (open) lenis?.stop(); else lenis?.start();
  if (open && !reduced) gsap.from('.mobile-menu a', { y: 40, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.06, delay: 0.25 });
});

if (!coarse && !reduced) {
  const cursor = document.querySelector('.cursor');
  const dot = cursor.querySelector('.cursor__dot');
  const ring = cursor.querySelector('.cursor__ring');
  const xDot = gsap.quickTo(dot, 'x', { duration: 0.12, ease: 'power3' });
  const yDot = gsap.quickTo(dot, 'y', { duration: 0.12, ease: 'power3' });
  const xRing = gsap.quickTo(ring, 'x', { duration: 0.5, ease: 'power3' });
  const yRing = gsap.quickTo(ring, 'y', { duration: 0.5, ease: 'power3' });
  let seen = false;
  window.addEventListener('pointermove', (e) => {
    if (!seen) { seen = true; cursor.classList.add('is-active'); }
    xDot(e.clientX); yDot(e.clientY); xRing(e.clientX); yRing(e.clientY);
  }, { passive: true });
  document.querySelectorAll('a, button').forEach((el) => {
    el.addEventListener('mouseenter', () => cursor.classList.add('is-hover'));
    el.addEventListener('mouseleave', () => cursor.classList.remove('is-hover'));
  });
  document.querySelectorAll('[data-magnetic]').forEach((el) => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * 0.28);
      yTo((e.clientY - (r.top + r.height / 2)) * 0.38);
    });
    el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
  });
} else {
  document.querySelector('.cursor')?.remove();
}

window.addEventListener('load', () => ScrollTrigger.refresh());
