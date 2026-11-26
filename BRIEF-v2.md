# PROMPT MASTER v2 — „BRIDGE”, un film interactiv pentru Business Bridge Egypt

> Standard: nu „un site frumos”, ci un film. Referinte de nivel: lusion.co, activetheory.net,
> igloo.inc, bruno-simon.com, prezentarile Apple de produs, secventele de titlu din Dune si Blade Runner 2049.
> Juriul Awwwards trebuie sa dea „Site of the Day” fara discutie. Un investitor trebuie sa-l trimita
> mai departe colegilor doar ca sa-l vada.

## 0. Echipa
Lucrati ca un studio de top, nu ca un generator de pagini:
- **Director de imagine (DoP):** lumina, compozitie, obiectiv, miscare de camera. Fiecare cadru se
  judeca ca o fotografie de cinema: regula treimilor, adancime pe 3 planuri (prim-plan / mijloc / fundal),
  linii conducatoare, contrast de valoare, o singura sursa dominanta de lumina.
- **Colorist:** gradare de film. Umbre teal reci, lumini calde amber, negre ridicate usor (look de pelicula),
  saturatie controlata, tranzitii de temperatura gandite (zori → zi aurie → ora albastra → noapte).
- **Artist VFX / tehnic (three.js, GLSL):** atmosfera, volumetrie, apa, nori, lumini, post-procesare.
- **Motion director:** ritm, easing, coregrafie de scroll, tipografie cinetica.
- **Sound designer:** ambient procedural optional (Web Audio), oprit implicit.
- **Inginer de performanta:** 60 fps pe laptop obisnuit, degradare eleganta pe mobil.

## 1. Conceptul: un film in cinci capitole, o singura miscare de camera
Tot hero-ul este **un singur plan-secventa** (one-shot) controlat de scroll, randat intr-un singur canvas WebGL
fix, in format cinemascope 2.39:1 (benzi negre animate, care se retrag cand povestea se incheie).

| Capitol | Titlu | Ce vede spectatorul |
|---|---|---|
| 00 | **Titluri** | Negru absolut. Arcul din logo se deseneaza din lumina. Praf luminos. „Business Bridge Egypt presents”. |
| I | **Orbita** | Pamantul fotorealist din spatiu: zi/noapte, terminatorul trecand peste Egipt, luminile oraselor pe partea de noapte — **Nilul apare ca o panglica de aur** in intuneric. Nori cu umbre, atmosfera cu imprastiere Rayleigh pe margine, Calea Lactee, flare de soare anamorfic. Din Europa, Golf, Asia, Americi si Africa pornesc arce de lumina care **converg spre Cairo**. |
| II | **Coborarea** | Camera plonjeaza spre Delta Nilului, prin stratul de nori (volumetric, iluminat de soarele care rasare). Albul norilor face legatura cu capitolul urmator. |
| III | **Raul** | Iesim din ceata deasupra Nilului, in zori aurii: feluci cu panze albe, pasari, raze de lumina prin ceata (god rays), piramidele Gizei in departare, podul hobanat in fata. Camera aluneca razant pe apa. |
| IV | **Podul** | Camera se ridica deasupra podului. Cade amurgul, apoi ora albastra. Luminile se aprind: lampile podului, fasciile de faruri, ferestrele orasului. |
| V | **Act** | Noapte deplina peste Cairo. Titlul final: „Beyond words. Act.” Benzile de cinemascope se retrag, iar filmul devine site. |

Fiecare capitol are o **carte de titlu** discreta (numar roman, nume capitol, coordonate, timecode) si un
singur mesaj scurt. Textul nu concureaza cu imaginea: el sta in zone negative, gandite in compozitie.

## 2. Realism — reguli
- **Fotografic, nu „3D”.** Fara culori plate, fara margini perfecte, fara lumina uniforma.
- Lumina bazata pe fizica: tone mapping ACES Filmic, iluminare din HDRI (resursele locale din `/public/hdri`),
  culorile texturilor in sRGB si calculul in liniar.
- **Atmosfera peste tot:** ceata cu inaltime, imprastiere aeriana (obiectele departate capata culoarea cerului),
  praf in razele de lumina.
- **Camera fizica:** focala de cinema (24–50 mm echivalent), adancime de camp cu bokeh pe luminile din fundal,
  usoara respiratie a camerei (handheld foarte fin), motion blur perceput prin easing, niciodata miscari liniare.
- **Lentila:** aberatie cromatica fina pe margini, vignetare, streak anamorfic orizontal pe luminile puternice,
  flare cu fantome cand soarele e in cadru, granulatie de film animata, halation (aura rosiatica in jurul
  luminilor puternice).
- **Gradare:** curba de film (toe/shoulder), split-toning teal/amber, LUT procedural pe capitole.

## 3. Resurse disponibile (locale, fara retea)
- `/public/textures/`: earth-day (Blue Marble), earth-night (luminile oraselor), earth-clouds, earth-bump,
  earth-water (masca de ocean pentru reflexii speculare), milkyway. Versiuni 4k si 2k.
- `/public/hdri/`: sunset, sunrise, dawn, night, city, studio, sky, bridge, venice (.exr, CC0).
- three (r18x, cu `three/addons`), gsap, lenis, world-atlas, topojson-client.
- Tot ce lipseste se genereaza procedural (zgomot, FBM, SDF, raymarching).

## 4. Restul site-ului (dupa film)
Aceeasi calitate cinematografica si in sectiunile de continut:
- **Servicii — „Sala monolitilor”:** 8 monoliti de sticla (refractie, dispersie, MeshPhysicalMaterial cu
  transmission), intr-o sala intunecata, cu lumina HDRI de studio si un con de lumina pe monolitul activ.
  Camera trece pe langa ei la scroll, iar textul serviciului apare langa monolitul activ.
- **Metoda — „Constructia podului”:** un pod-arc se construieste in 3D din segmente care zboara la locul lor,
  cu scantei de lumina la fiecare imbinare. Cele 4 piloni sunt Understand, Connect, Coordinate si Act.
- Tranzitii intre sectiuni cu masti si shadere, tipografie cinetica (litere care se asaza din blur si spatiere),
  cursor cu urma luminoasa.

## 5. Continut si onestitate
Doar continutul din profilul oficial (PDF v4). Cifrele despre Egipt raman cele verificate, cu sursa:
CAPMAS (109,5 mil.), IDSC (aprox. 12% din comertul maritim mondial prin Suez), SCZONE (455 km²) si GAFI
(1,5 mld. consumatori). Nu se inventeaza clienti, testimoniale sau premii.

## 6. Performanta si accesibilitate (nenegociabil)
- Un singur renderer pentru film, randare in render target HDR (HalfFloat), post-procesare intr-un numar
  minim de pase. Rezolutia scade automat daca fps-ul scade. Calitatea „low” pe mobil.
- Texturile 4k doar pe desktop. Incarcare progresiva: preloaderul arata progresul real al resurselor.
- `prefers-reduced-motion`: cadre statice frumoase in locul miscarii, continut complet lizibil.
- Fallback fara WebGL: imagini statice gradate, iar site-ul ramane complet functional.
- Zero erori in consola, iar `vite build` trece curat.

## 7. Criteriul final
Fiecare cadru, oprit oricand in timpul scroll-ului, trebuie sa poata fi pus ca wallpaper.
Daca un cadru arata a „demo three.js”, nu e gata.
