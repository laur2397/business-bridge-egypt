# PROMPT MASTER v3 — „BRIDGE”: tipografie de film, actiune grafica, interactivitate

> Feedback de la client asupra v2: „fontul pare total facut de un AI” (Cormorant + Inter = combinatia
> generica a oricarui site generat), „vreau mult mai multa actiune grafica”, „mai interactiv”, „mai cinematografic”.
> v3 raspunde punct cu punct. v2 (filmul WebGL in 5 capitole, monolitii, podul 3D) ramane coloana vertebrala.
> Totul se construieste PESTE el, nu de la zero.

## 1. Tipografie: identitate de afis de film, nu de sablon
**Interzise:** Cormorant, Inter, Playfair, Montserrat, Poppins, Space Grotesk, „serif elegant + sans neutru”,
eyebrow-uri cu linie inainte, gradiente pe text.

**Sistemul nou (self-hosted, deja instalat):**
- **Display: Archivo Variable cu axa de latime (wdth 62–125, wght 100–900).** Titlurile sunt UPPERCASE,
  expandate (wdth 112–125), cu interliniere stransa (0.86–0.92) si tracking usor negativ. Este limbajul
  cartoanelor de titlu din Interstellar, Dune si Arrival. **Semnatura v3:** axa de latime se anima. Literele
  intra comprimate (wdth 62, blur), se lateste in pozitie si raspund la viteza de scroll (scroll rapid → mai
  inguste si inclinate). Nimeni nu poate confunda asta cu un sablon.
- **Accent: Instrument Serif Italic.** Un singur cuvant emotional per titlu („opportunity”, „Act”, „possible”),
  mare, in contrast violent cu expandatul. Folosit cu masura.
- **Tehnic / HUD / cifre: JetBrains Mono.** Timecode, coordonate, indici, etichete de 10–11 px, uppercase,
  tracking larg. Cifrele mari din statistici sunt in Archivo condensat (wdth 62–75, wght 200).
- **Corp de text: Archivo wdth 100, wght 380–420,** 16–18 px, maxim 62 de caractere pe rand.
- **Compozitie editoriala, nu „card + titlu + paragraf”:** grila asimetrica pe 12 coloane, titluri care
  ies din grila si trec peste imagine, numere de sectiune gigantice decupate, linii fine de 1 px, indexuri
  marginale, text vertical pe margine.

## 2. Actiune grafica: nimic static mai mult de o secunda
- **Lumina lichida sub cursor (WebGL fluid).** O simulare de fluid (stable fluids, rezolutie mica) ruleaza
  peste film. Cursorul lasa o dara care refracta imaginea (ca apa pe lentila), cu aberatie cromatica si
  stralucire calda. Pe Nil arata ca o atingere pe apa, in spatiu ca o unda gravitationala.
- **Viteza de scroll se simte fizic:** motion blur directional si aberatie cromatica in post-procesare,
  proportionale cu viteza; titlurile se inclina si se ingusteaza (axa wdth); marquee-ul accelereaza.
- **„Hold to Act”:** apasarea lunga oriunde pe film face un „lens punch”. Camera face dolly-in, adancimea
  de camp se strange, timpul incetineste, iar sunetul face swell. La eliberare, totul revine elastic.
- **Sectiunea „De ce Egipt” devine un spectacol de particule (100k+ pe GPU), care se transforma la scroll:**
  1. praf de aur dispersat →
  2. silueta Egiptului, cu Nilul ca un fir de lumina si Cairo pulsand → cifra „109.5M” (populatie) →
  3. Canalul Suez, cu un flux de nave/particule care curge intre doua mari („~12% din comertul maritim mondial”) →
  4. zona SCZONE: 455 km² ca o grila de lumini →
  5. un glob de particule cu arce spre lume („1.5B consumatori”).

  Cursorul respinge particulele, iar click-ul le explodeaza si le lasa sa se reaseze.
- **Tranzitii intre sectiuni:** mascari cu clip-path pe diagonala si wipe-uri luminoase, nu fade-uri.

## 3. Interactivitate reala (nu doar scroll)
- **„Play the film”:** un mod regizor. Un buton porneste un autoplay cinematografic al filmului (~70 s, cu
  sunet), cu bara de capitole pe care poti sari oriunde. Orice scroll al utilizatorului preia controlul.
- **Navigare pe capitole:** bara I–V devine interactiva, cu preview la hover (numele capitolului si
  timecode-ul).
- **Sala monolitilor:** pe langa scroll, monolitii se pot trage cu mouse-ul sau cu degetul (drag cu inertie)
  si se pot selecta cu click; tastele ← → navigheaza.
- **Podul:** cursorul roteste usor camera, iar hover pe un nod il aprinde si ii arata eticheta.
- **Cursor contextual:** isi schimba forma si textul dupa context: „DRAG”, „HOLD”, „PLAY”, „VIEW”.
- Toate interactiunile functioneaza si pe touch, iar `prefers-reduced-motion` le reduce la versiuni statice.

## 4. Cinematografie
- Benzile cinemascope respira: se strang la momentele dramatice (intrarea in nori, aprinderea luminilor)
  si se retrag la final.
- Carti de titlu pentru capitole in stil film: numar roman uriaș in Archivo expandat, contur de 1 px,
  timecode in mono, iar textul apare litera cu litera, cu animatie pe axa wdth.
- Sunetul ambiental reactioneaza la interactiuni (hold, click pe particule, schimbare de capitol).

## 5. Reguli
- Continut doar din profilul oficial si cifrele verificate (CAPMAS, IDSC, SCZONE/DLA Piper, GAFI). Nimic inventat.
- 60 fps tinta pe laptop; calitate „low” pe mobil; fallback complet fara WebGL; zero erori; `vite build` curat.
- Fiecare cadru, oprit oricand, arata ca un afis de film.

## 6. Contracte intre module (pentru echipa)
```js
// src/film/engine.js — se extinde API-ul createFilm (compatibil cu v2):
film.setVelocity(v)            // viteza de scroll normalizata, -1..1 (din Lenis); motion blur + CA
film.setPointer(x, y)          // -1..1 (exista deja), alimenteaza si fluidul
film.pointerDown(); film.pointerUp();   // „Hold to Act”: lens punch (dolly-in, DOF, slow motion)
film.onHold = (amount0to1) => {}       // callback pentru UI/sunet
film.setLetterbox(extra0to1)           // optional: engine-ul poate cere strangerea benzilor la momente dramatice
film.getDrama() -> 0..1                // cat de „dramatic” e momentul (UI-ul strange benzile)

// src/showcase/datamorph.js
createDataMorph(container, { quality }) -> {
  ready, setProgress(p /*0..1, 5 stari la 0, .25, .5, .75, 1*/), setPointer(x, y),
  burst(x, y), pause(), resume(), dispose()
}
```
