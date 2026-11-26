# Business Bridge Egypt — binvestb.com

Cinematic one-page website for **Business Bridge Egypt**, an independent business facilitation and strategic advisory company connecting international businesses and investors with opportunities in Egypt.

*Beyond Words! Act!*

## Experience

- **Hero:** a real-time WebGL scene of the Nile at Cairo. Golden hour turns into night as you scroll, with a cable-stayed bridge, the Giza pyramids in desert haze, and the city lights switching on.
- **Global reach:** a dotted 3D globe with Cairo at the centre and light arcs to Europe, the Gulf, Asia, the Americas and Africa.
- **Services:** eight services on a pinned horizontal track with 3D card transitions.
- **Method:** Understand → Connect → Coordinate → Act, drawn as a bridge that builds itself on scroll.
- Smooth scrolling (Lenis), GSAP ScrollTrigger choreography, custom cursor, magnetic buttons and film grain.
- Accessible: semantic HTML, keyboard navigation, `prefers-reduced-motion` support, and graceful fallbacks when WebGL is not available.

## Stack

Vite · vanilla ES modules · three.js · GSAP · Lenis · self-hosted fonts (Cormorant Garamond, Inter).
All 3D textures are generated procedurally, so the site needs no external image assets.

## Develop

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build in dist/
npm run preview
```

Test pages for the 3D scenes: `/hero-test.html` and `/globe-test.html` (development only).

## Deploy

Every push to `main` builds the site and publishes it to GitHub Pages (see `.github/workflows/deploy.yml`).
For the custom domain `www.binvestb.com`:

1. Add `public/CNAME` containing `www.binvestb.com`.
2. Remove `BASE_PATH` from the workflow.
3. In Cloudflare DNS, point `www` (CNAME) to `<user>.github.io`.

## Content sources

All company content comes from the official Business Bridge Egypt profile (v4).
The figures about Egypt are cited inline in `index.html`: CAPMAS (population), IDSC / Egyptian Cabinet (Suez Canal share of trade), SCZONE / DLA Piper (economic zone area) and GAFI (trade agreements).
