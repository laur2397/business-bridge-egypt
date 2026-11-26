import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

// Lazy scene modules (code-split; missing module => graceful fallback)
const scenes = import.meta.glob(['./scene/hero.js', './scene/globe.js']);
const loadScene = (name) => {
  const loader = scenes[`./scene/${name}.js`];
  if (!loader) return Promise.reject(new Error(`${name} module missing`));
  return loader();
};

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;
const isSmall = () => window.innerWidth < 900;
const quality = coarse || window.innerWidth < 900 || (navigator.hardwareConcurrency || 8) <= 4 ? 'low' : 'high';
if (reduced) document.documentElement.classList.add('reduced');

document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));

/* ------------------------------------------------------------------ */
/* Smooth scroll                                                       */
/* ------------------------------------------------------------------ */
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}

document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    const target = id === '#top' ? 0 : document.querySelector(id);
    if (target === null) return;
    e.preventDefault();
    document.body.classList.remove('menu-open');
    burger?.setAttribute('aria-expanded', 'false');
    burger?.setAttribute('aria-label', 'Open menu');
    // Lenis is stopped while the mobile menu is open; scrollTo is ignored when stopped
    if (lenis) { lenis.start(); lenis.scrollTo(target, { offset: 0, duration: 1.6 }); }
    else if (target === 0) window.scrollTo(0, 0);
    else target.scrollIntoView();
  });
});

/* ------------------------------------------------------------------ */
/* Text splitting                                                      */
/* ------------------------------------------------------------------ */
function splitWords(el) {
  const frag = document.createDocumentFragment();
  const walk = (node, wrapperTag) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          const outer = document.createElement('span');
          outer.className = 'split-line';
          outer.style.display = 'inline-block';
          outer.style.verticalAlign = 'top';
          const inner = document.createElement(wrapperTag || 'span');
          inner.textContent = part;
          outer.appendChild(inner);
          frag.appendChild(outer);
        });
      } else if (child.nodeType === 1) {
        walk(child, child.tagName.toLowerCase());
      }
    });
  };
  walk(el, null);
  el.innerHTML = '';
  el.appendChild(frag);
  return el.querySelectorAll('.split-line > *');
}

const splitEls = [...document.querySelectorAll('[data-split]')].map((el) => ({ el, words: splitWords(el) }));

/* ------------------------------------------------------------------ */
/* Preloader → intro                                                   */
/* ------------------------------------------------------------------ */
const pre = document.querySelector('.preloader');
const preBar = pre.querySelector('.preloader__bar span');
const preCount = pre.querySelector('.preloader__count');
const preMark = pre.querySelector('.preloader__mark');
const loadState = { v: 0 };
let heroReady = false;

gsap.to(preMark, { clipPath: 'inset(0 0% 0 0)', duration: 1.4, ease: 'power3.inOut', delay: 0.15 });
const loadTween = gsap.to(loadState, {
  v: 88, duration: 2.2, ease: 'power2.out',
  onUpdate: () => {
    preBar.style.transform = `scaleX(${loadState.v / 100})`;
    preCount.textContent = String(Math.round(loadState.v)).padStart(3, '0');
  },
});

let loadingFinished = false;
function finishLoading() {
  // Guard: the 7s safety timer and initHero() can both call this; a second intro
  // timeline would capture mid-animation values and leave hero elements at opacity 0.
  if (loadingFinished) return;
  loadingFinished = true;
  loadTween.kill();
  gsap.timeline()
    .to(loadState, {
      v: 100, duration: 0.6, ease: 'power2.inOut',
      onUpdate: () => {
        preBar.style.transform = `scaleX(${loadState.v / 100})`;
        preCount.textContent = String(Math.round(loadState.v)).padStart(3, '0');
      },
    })
    .to(pre.querySelector('.preloader__inner'), { opacity: 0, y: -20, duration: 0.6, ease: 'power3.in' }, '+=0.1')
    .to(pre.querySelector('.preloader__curtain'), { scaleY: 1, duration: 0.8, ease: 'expo.inOut' }, '-=0.2')
    .set(pre.querySelector('.preloader__curtain'), { transformOrigin: 'top' })
    .to(pre, { autoAlpha: 0, duration: 0.01 })
    .add(() => {
      document.body.classList.remove('is-loading');
      lenis?.start();
      ScrollTrigger.refresh();
      introHero();
    }, '-=0.05');
}

function introHero() {
  const hero = splitEls.find((s) => s.el.classList.contains('hero__title'));
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  if (hero) tl.from(hero.words, { yPercent: 115, rotate: 3, duration: 1.5, stagger: 0.06 }, 0);
  tl.from('[data-hero-in]', { y: 30, opacity: 0, duration: 1.3, stagger: 0.12 }, 0.35)
    .from('.nav', { y: -40, opacity: 0, duration: 1.2, clearProps: 'transform,opacity' }, 0.5)
    .from('.hero__coords, .hero__phase, .hero__scroll', { opacity: 0, duration: 1.4 }, 0.8);
}

/* ------------------------------------------------------------------ */
/* Hero WebGL                                                          */
/* ------------------------------------------------------------------ */
const heroMount = document.querySelector('.hero__canvas');
const heroFallback = document.querySelector('.hero__fallback');
let hero = null;

async function initHero() {
  try {
    const mod = await loadScene('hero');
    hero = mod.createHeroScene(heroMount, { quality });
    await Promise.race([hero.ready, new Promise((r) => setTimeout(r, 6000))]);
    gsap.to(heroFallback, { opacity: 0, duration: 1.2, ease: 'power2.out' });
  } catch (err) {
    console.warn('[hero] WebGL scene unavailable, using fallback.', err?.message || err);
  }
  heroReady = true;
  finishLoading();
}
// Safety: never keep the user waiting more than ~7 seconds
setTimeout(() => { if (!heroReady) { heroReady = true; finishLoading(); } }, 7000);
initHero();

const phaseBars = document.querySelectorAll('.hero__phase i');
ScrollTrigger.create({
  trigger: '.hero',
  start: 'top top',
  end: 'bottom bottom',
  scrub: true,
  onUpdate: (self) => {
    const p = self.progress;
    hero?.setProgress(p);
    phaseBars.forEach((b, i) => { b.style.transform = `scaleY(${gsap.utils.clamp(0, 1, p * 4 - i)})`; });
  },
});
if (!reduced) {
  gsap.to('.hero__content', {
    yPercent: -18, opacity: 0, ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: '28% top', scrub: true },
  });
  gsap.timeline({ scrollTrigger: { trigger: '.hero', start: '45% top', end: 'bottom bottom', scrub: true } })
    .fromTo('.hero__outro', { opacity: 0, y: 40, filter: 'blur(12px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', ease: 'power2.out', duration: 0.6 })
    .to('.hero__outro', { opacity: 1, duration: 0.4 });
}

/* ------------------------------------------------------------------ */
/* Globe                                                               */
/* ------------------------------------------------------------------ */
const globeMount = document.querySelector('.reach__globe-canvas');
let globe = null;
let globeLoading = false;
async function initGlobe() {
  if (globe || globeLoading) return;
  globeLoading = true;
  try {
    const mod = await loadScene('globe');
    globe = mod.createGlobe(globeMount, { quality });
    await globe.ready;
    gsap.to('.reach__globe-fallback', { opacity: 0, duration: 1 });
    globe.setProgress(globeProgress);
  } catch (err) {
    console.warn('[globe] unavailable, using fallback.', err?.message || err);
  }
}
let globeProgress = 0;
ScrollTrigger.create({ trigger: '.reach', start: 'top 160%', once: true, onEnter: initGlobe });
ScrollTrigger.create({
  trigger: '.reach', start: 'top top', end: 'bottom bottom', scrub: true,
  onUpdate: (self) => { globeProgress = self.progress; globe?.setProgress(self.progress); },
});
const regionBtns = document.querySelectorAll('[data-region]');
regionBtns.forEach((btn) => {
  const on = () => { regionBtns.forEach((b) => b.classList.toggle('is-active', b === btn)); globe?.focus?.(btn.dataset.region); };
  const off = () => { btn.classList.remove('is-active'); globe?.focus?.(null); };
  btn.addEventListener('mouseenter', on);
  btn.addEventListener('focus', on);
  btn.addEventListener('mouseleave', off);
  btn.addEventListener('blur', off);
  btn.addEventListener('click', on);
});

/* pointer parallax shared */
if (!coarse && !reduced) {
  window.addEventListener('pointermove', (e) => {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = (e.clientY / window.innerHeight) * 2 - 1;
    hero?.setPointer?.(x, y);
    globe?.setPointer?.(x, y);
  }, { passive: true });
}

/* ------------------------------------------------------------------ */
/* Generic reveals                                                     */
/* ------------------------------------------------------------------ */
splitEls.forEach(({ el, words }) => {
  if (el.classList.contains('hero__title')) return;
  if (reduced) return;
  gsap.from(words, {
    yPercent: 115, rotate: 2, duration: 1.4, ease: 'expo.out', stagger: 0.045,
    scrollTrigger: { trigger: el, start: 'top 85%' },
  });
});

if (!reduced) {
  ScrollTrigger.batch('[data-fade]', {
    start: 'top 88%',
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08, overwrite: true }),
  });
}

/* Manifesto word scrub */
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
  else gsap.to(ws, {
    opacity: 1, stagger: 0.1, ease: 'none',
    scrollTrigger: { trigger: manifesto, start: 'top 78%', end: 'bottom 45%', scrub: 0.6 },
  });
}

/* Counters */
document.querySelectorAll('[data-count]').forEach((el) => {
  const target = parseFloat(el.dataset.count);
  const dec = parseInt(el.dataset.decimals || '0', 10);
  const o = { v: 0 };
  const fmt = (v) => v.toFixed(dec);
  if (reduced) { el.textContent = fmt(target); return; }
  ScrollTrigger.create({
    trigger: el, start: 'top 90%', once: true,
    onEnter: () => gsap.to(o, { v: target, duration: 2.4, ease: 'expo.out', onUpdate: () => (el.textContent = fmt(o.v)) }),
  });
});

/* ------------------------------------------------------------------ */
/* Services — horizontal pinned scroll (desktop)                       */
/* ------------------------------------------------------------------ */
const mm = gsap.matchMedia();
const track = document.querySelector('.services__track');
const cards = [...track.querySelectorAll('.svc:not(.svc--intro)')];
const countEl = document.querySelector('.services__count .cur');

mm.add('(min-width: 901px)', () => {
  const dist = () => track.scrollWidth - window.innerWidth;
  const tween = gsap.to(track, {
    x: () => -dist(), ease: 'none',
    scrollTrigger: {
      trigger: '.services__pin', start: 'top top', end: () => `+=${dist()}`,
      pin: true, scrub: reduced ? true : 0.8, invalidateOnRefresh: true, anticipatePin: 1,
      onUpdate: (self) => {
        gsap.set('.services__progress i', { scaleX: self.progress });
        const idx = Math.min(cards.length, Math.max(1, Math.round(self.progress * (cards.length - 1)) + 1));
        countEl.textContent = String(idx).padStart(2, '0');
      },
    },
  });
  if (!reduced) {
    cards.forEach((card) => {
      gsap.from(card, {
        rotateY: -18, z: -120, opacity: 0.25, ease: 'none',
        scrollTrigger: { trigger: card, containerAnimation: tween, start: 'left 100%', end: 'left 55%', scrub: true },
      });
      gsap.from(card.querySelector('.svc__num'), {
        xPercent: 40, ease: 'none',
        scrollTrigger: { trigger: card, containerAnimation: tween, start: 'left 100%', end: 'right 0%', scrub: true },
      });
    });
  }
  return () => gsap.set(track, { clearProps: 'transform' });
});

mm.add('(max-width: 900px)', () => {
  if (reduced) return;
  cards.forEach((card) => gsap.from(card, { y: 60, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: card, start: 'top 90%' } }));
});

/* Card hover glow + tilt */
if (!coarse && !reduced) {
  cards.forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      card.style.setProperty('--mx', `${x * 100}%`);
      card.style.setProperty('--my', `${y * 100}%`);
      gsap.to(card, { rotateX: (0.5 - y) * 6, rotateY: (x - 0.5) * 8, transformPerspective: 900, duration: 0.6, ease: 'power3.out' });
    });
    card.addEventListener('pointerleave', () => gsap.to(card, { rotateX: 0, rotateY: 0, duration: 0.9, ease: 'power3.out' }));
  });
}

/* ------------------------------------------------------------------ */
/* Method — bridge drawn on scroll                                     */
/* ------------------------------------------------------------------ */
(function methodBridge() {
  const svg = document.querySelector('.method__bridge svg');
  if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg';
  const arch = svg.querySelector('.m-arch');
  const deck = svg.querySelector('.m-deck');
  const hangersG = svg.querySelector('.m-hangers');
  const nodesG = svg.querySelector('.m-nodes');
  const len = arch.getTotalLength();
  const yAt = (x) => {
    let lo = 0, hi = len;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (arch.getPointAtLength(mid).x < x) lo = mid; else hi = mid; }
    return arch.getPointAtLength(lo).y;
  };
  const hangers = [];
  for (let x = 110; x <= 1170; x += 35) {
    const l = document.createElementNS(NS, 'line');
    const y = yAt(x);
    l.setAttribute('x1', x); l.setAttribute('x2', x); l.setAttribute('y1', y); l.setAttribute('y2', 330);
    hangersG.appendChild(l); hangers.push(l);
  }
  const nodeXs = [160, 480, 800, 1120];
  const icons = ['M-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M5 5l6 6', 'M-8 0h16M0-8v16', 'M-8-6h16M-8 0h16M-8 6h16', 'M-6 0h12M2-6l6 6-6 6'];
  const nodes = nodeXs.map((x, i) => {
    const g = document.createElementNS(NS, 'g');
    const y = yAt(x);
    g.setAttribute('transform', `translate(${x} ${y})`);
    g.innerHTML = `<circle r="46" fill="url(#nodeGlow)" class="ng" opacity="0"/><circle r="26" fill="#08173a" stroke="${i === 3 ? '#d9b27c' : '#9cc3ea'}" stroke-width="1.2"/><path d="${icons[i]}" stroke="${i === 3 ? '#d9b27c' : '#f4efe6'}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    nodesG.appendChild(g);
    return g;
  });
  gsap.set(arch, { strokeDasharray: len, strokeDashoffset: len });
  gsap.set(deck, { strokeDasharray: 1240, strokeDashoffset: 1240 });
  gsap.set(hangers, { scaleY: 0, transformOrigin: '50% 100%', transformBox: 'fill-box' });
  gsap.set(nodes, { scale: 0, transformOrigin: '50% 50%', transformBox: 'fill-box' });
  const tl = gsap.timeline({
    scrollTrigger: reduced ? null : { trigger: '.method__bridge', start: 'top 80%', end: 'bottom 35%', scrub: 0.8 },
  });
  tl.to(deck, { strokeDashoffset: 0, duration: 1, ease: 'none' })
    .to(arch, { strokeDashoffset: 0, duration: 2, ease: 'none' }, 0.2)
    .to(hangers, { scaleY: 1, duration: 0.4, stagger: 0.04, ease: 'power2.out' }, 0.5);
  nodes.forEach((n, i) => {
    tl.to(n, { scale: 1, duration: 0.4, ease: 'back.out(2)' }, 0.5 + i * 0.45)
      .to(n.querySelector('.ng'), { opacity: 1, duration: 0.4 }, 0.6 + i * 0.45);
  });
  if (reduced) tl.progress(1);
})();

/* Journey line */
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
else {
  gsap.from('.stage', { y: 50, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.14, scrollTrigger: { trigger: '.journey__rail', start: 'top 85%' } });
}

/* Contact headline parallax */
if (!reduced) {
  gsap.fromTo('.contact__big', { xPercent: 6 }, { xPercent: -2, ease: 'none', scrollTrigger: { trigger: '.contact', start: 'top bottom', end: 'bottom top', scrub: true } });
}

/* ------------------------------------------------------------------ */
/* Nav                                                                 */
/* ------------------------------------------------------------------ */
const nav = document.querySelector('.nav');
const burger = document.querySelector('.nav__burger');
let lastY = 0;
const onScroll = (y) => {
  nav.classList.toggle('is-scrolled', y > 40);
  const goingDown = y > lastY && y > 400;
  if (!document.body.classList.contains('menu-open')) nav.classList.toggle('is-hidden', goingDown);
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
document.querySelectorAll('.mobile-menu a').forEach((a) => a.addEventListener('click', () => lenis?.start()));

/* ------------------------------------------------------------------ */
/* Cursor + magnetic buttons                                           */
/* ------------------------------------------------------------------ */
if (!coarse && !reduced) {
  const cursor = document.querySelector('.cursor');
  const dot = cursor.querySelector('.cursor__dot');
  const ring = cursor.querySelector('.cursor__ring');
  const xDot = gsap.quickTo(dot, 'x', { duration: 0.12, ease: 'power3' });
  const yDot = gsap.quickTo(dot, 'y', { duration: 0.12, ease: 'power3' });
  const xRing = gsap.quickTo(ring, 'x', { duration: 0.5, ease: 'power3' });
  const yRing = gsap.quickTo(ring, 'y', { duration: 0.5, ease: 'power3' });
  window.addEventListener('pointermove', (e) => { cursor.classList.add('is-active'); xDot(e.clientX); yDot(e.clientY); xRing(e.clientX); yRing(e.clientY); }, { passive: true });
  document.querySelectorAll('a, button, [data-tilt]').forEach((el) => {
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

/* Pause WebGL when tab hidden (modules also handle visibility) */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hero?.pause?.(); globe?.pause?.(); } else { hero?.resume?.(); globe?.resume?.(); }
});

window.addEventListener('load', () => ScrollTrigger.refresh());
