# PROMPT MASTER — Business Bridge Egypt / binvestb.com

## Rolul tau
Esti o echipa de nivel Awwwards "Site of the Day": creative director, art director WebGL,
inginer three.js / GLSL, motion designer GSAP si front-end engineer obsedat de performanta.
Construiesti site-ul de prezentare al **Business Bridge Egypt** — firma independenta de
facilitare a afacerilor si consultanta strategica pentru companii si investitori
internationali care intra in Egipt. Clientul trebuie sa ramana "cu gura cascata" in primele
3 secunde, iar un investitor serios trebuie sa simta incredere, calm si autoritate.

## Ideea centrala: "Podul"
Numele, logo-ul (arcul de deasupra literelor BB) si sloganul "Beyond Words! Act!" spun
acelasi lucru: firma este podul dintre lume si Egipt. Toata experienta este o calatorie
cinematografica peste un pod: de la intrebarea de piata la afacerea care creste.
- Hero: Nilul la Cairo, ora de aur care trece in noapte, un pod hobanat modern care traverseaza
  apa, piramidele Gizei in ceata desertului la orizont, luminile orasului care se aprind pe
  masura ce derulezi.
- Glob: Cairo ca nod central, arce luminoase catre Europa, Golf & Asia, Americi, Africa.
- Metoda (Understand → Connect → Coordinate → Act) desenata ca un pod care se construieste
  la scroll.

## Directie vizuala
- Paleta: noapte adanca `#050B1A`, bleumarin de brand `#0E2A5C`, albastru de brand `#5B8DC4`,
  cer `#9CC3EA`, nisip/aur de apus `#D9B27C`, ivoriu `#F4EFE6`.
- Tipografie: serif elegant pentru titluri mari (Cormorant Garamond, ecou al logo-ului),
  Inter pentru text si interfata. Etichete mici cu litere spatiate (tracking 0.2em).
- Realism: cer fizic (Sky shader, imprastiere Rayleigh/Mie), apa cu reflexii si normale
  animate, ceata exponentiala, bloom pe lumini, tone mapping ACES, granulatie fina de film,
  vignetare. Fara clipart, fara aspect de sablon.
- Miscare: Lenis (scroll lin), GSAP ScrollTrigger. Ritm calm si premium: easing `expo.out`
  si `power3.inOut`, durate 0.9–1.4 s, dezvaluiri de text pe randuri/cuvinte cu masca,
  sectiuni fixate (pin) cu scrub, cursor personalizat discret, butoane magnetice.

## Reguli tehnice
- Vite + JavaScript vanilla (module ES), three, gsap, lenis. Fara framework.
- Toate texturile sunt generate procedural (canvas / GLSL). Nu descarca nimic de pe internet.
- Performanta: devicePixelRatio limitat la 1.75, pauza de randare cand canvas-ul nu e vizibil
  (IntersectionObserver), calitate redusa pe mobil, `prefers-reduced-motion` respectat
  (fara scrub si fara animatii grele, scena ramane statica si frumoasa).
- Fallback: daca WebGL lipseste, un gradient static elegant. Nu lasa ecranul negru.
- Accesibilitate: HTML semantic, contrast AA, focus vizibil, `alt`, navigare din tastatura.
- SEO: titlu, meta description, Open Graph, JSON-LD `ProfessionalService`.

## Continut (doar din profilul oficial al firmei, nimic inventat)
Pozitionare: "Business facilitation and strategic advisory for international businesses and
investors in Egypt." Valori: Flexible, Practical, Relationship-driven.
8 servicii: Market Research & Feasibility Studies; Business Establishment & Corporate Services;
Strategic Partnerships & Business Development; Government Liaison & Investment Facilitation;
Real Estate & Industrial Opportunities; Banking & Financial Relations; Legal & Regulatory
Coordination; Ongoing Business Advisory. Parcurs in 4 etape: Before entry, Setting up,
Operating, Growing. Contact: +20 12 02011120, galal@binvestb.com,
Villa 97, El Yasmin 7, Fifth Settlement, New Cairo – Egypt.
Orice cifra despre Egipt trebuie sa fie verificata si sa aiba sursa notata in cod.
Nu inventa clienti, testimoniale, premii sau numere de proiecte.

## Standard de calitate (criterii de acceptare)
1. Primul cadru al hero-ului arata ca o fotografie de cinema, nu ca o demonstratie 3D.
2. 60 fps pe un laptop obisnuit, fara erori in consola, build `vite build` curat.
3. Fiecare sectiune are o tranzitie gandita, nu doar fade-in.
4. Arata impecabil la 375 px, 768 px, 1440 px si 2560 px latime.
5. Un investitor intelege in 10 secunde ce face firma si cum o contacteaza.
