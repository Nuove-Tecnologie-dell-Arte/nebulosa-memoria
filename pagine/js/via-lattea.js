import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// LA VIA LATTEA: la nebulosa come la nostra galassia vera, in scala (1 unita' = 1000 anni luce): un disco di circa 100.000
// anni luce, la barra centrale, quattro bracci a spirale. Al centro Sagittarius A*, il buco nero, con l'orizzonte degli eventi,
// l'anello di luce e il disco di gas che gli gira intorno (lui e' ingrandito: in scala vera sarebbe invisibile).
// Le foto sono le stelle: distribuite come le stelle vere (fitte verso il centro, nei bracci), e le simili vicine tra loro.
// E' in tre dimensioni come quella vera (disco spesso, bordo piegato, rigonfiamento a X, alone, bolle di Fermi). Ci si gira intorno
// trascinando, e la rotella avvicina verso il punto indicato dal mouse: cosi' ci si entra dove si vuole.

const D = window.NEBULOSA;
const $ = id => document.getElementById(id);
if (!D) {
  const m = document.createElement('div');
  m.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:50;max-width:440px;padding:22px 24px;background:#131116;border:1px solid rgba(240,138,100,.5);color:#ece6e1;font:300 14px/1.6 Jost,sans-serif';
  m.innerHTML = '<b style="font-weight:400;color:#f08a64">Mancano i dati della nebulosa.</b><br>Apri la nebulosa con <code>Apri la nebulosa.command</code>, oppure lancia <code>python3 programma/genera_dati.py</code>.';
  document.body.appendChild(m);
  throw new Error('dati mancanti');
}
const thumbSrc = id => '/foto/thumb/' + id + '.jpg';
const fullSrc = id => '/foto/full/' + id + '.jpg';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAU = Math.PI * 2;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeIO = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const seme = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296; };
const memo = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };

// ---------------- la scena ----------------
const cv = $('c');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x06050a);
const camera = new THREE.PerspectiveCamera(60, 1, .1, 2500);   // un po' piu' larga: si sta dentro la galassia
const CASA = new THREE.Vector3(0, 72, 70);   // dall'alto e di lato: si vede tutta la galassia
camera.position.copy(CASA);
const controls = new OrbitControls(camera, cv);
Object.assign(controls, { zoomToCursor: true, screenSpacePanning: true, enableDamping: true, dampingFactor: .06, autoRotate: !reduced, autoRotateSpeed: .35, minDistance: 1.2, maxDistance: 260, rotateSpeed: .6, zoomSpeed: 1.4 });   // la rotella un po' piu' rapida: la galassia e' grande
let fermo = 0;
const riprendiGiro = () => { clearTimeout(fermo); fermo = setTimeout(() => { if (!fuoco) controls.autoRotate = !reduced; }, 9000); };
controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(fermo); });
controls.addEventListener('end', riprendiGiro);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .8, .45, .82);
composer.addPass(bloom); composer.addPass(new OutputPass());
const materialiFili = [];   // le linee spesse devono sapere quanto e' grande lo schermo
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); materialiFili.forEach(m => m.resolution.set(w, h)); }
addEventListener('resize', resize); resize();

// le stelle lontane
let stelle;
{
  const n = 1800, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(700 + Math.random() * 500); a.set([v.x, v.y, v.z], i * 3); }   // il cielo lontano, fuori dalla galassia
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  stelle = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xece6e1, size: 1.1, sizeAttenuation: false, transparent: true, opacity: .55, fog: false }));
  scene.add(stelle);
}
function texLuce(stops) {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); stops.forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const TEX_ANELLO = (() => { const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'); x.strokeStyle = '#fff'; x.lineWidth = 5; x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 6, 0, TAU); x.stroke(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
// il nucleo: il punto in cui tutti questi ricordi si toccano
const nucleo = new THREE.Sprite(new THREE.SpriteMaterial({ map: texLuce([[0, 'rgba(255,255,250,1)'], [.12, 'rgba(255,240,200,.95)'], [.35, 'rgba(255,170,80,.45)'], [1, 'rgba(255,90,30,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
const alone = new THREE.Sprite(new THREE.SpriteMaterial({ map: texLuce([[0, 'rgba(255,170,90,.5)'], [.5, 'rgba(160,60,40,.15)'], [1, 'rgba(60,20,30,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
// nei colori opachi il centro non brilla: e' un punto tenue, il porto dove le foto nuove aspettano di essere lette
const centroOpaco = new THREE.Sprite(new THREE.SpriteMaterial({ map: texLuce([[0, 'rgba(255,255,255,.9)'], [.3, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]), depthWrite: false, transparent: true }));
centroOpaco.scale.setScalar(3.2);
scene.add(alone, nucleo, centroOpaco);

// ---------------- i colori delle foto: temperatura o spettro ----------------
const FUOCO = [[0, [70, 120, 255]], [.25, [150, 150, 235]], [.45, [230, 60, 40]], [.7, [255, 140, 30]], [.88, [255, 215, 90]], [1, [255, 250, 230]]];
function temperatura(t) {
  for (let k = 1; k < FUOCO.length; k++) if (t <= FUOCO[k][0] || k === FUOCO.length - 1) {
    const [a, ca] = FUOCO[k - 1], [b, cb] = FUOCO[k], u = clamp((t - a) / (b - a), 0, 1);
    return new THREE.Color().setRGB(...ca.map((v, i) => (v + (cb[i] - v) * u) / 255), THREE.SRGBColorSpace);
  }
}
const PALETTE = ['fuoco', 'spettro'];
const NOME_PALETTE = { fuoco: 'temperatura', spettro: 'spettro' };
let palette = PALETTE.includes(memo('nebulosa-colori')) ? memo('nebulosa-colori') : 'fuoco';
const chiaro = () => false, opaco = () => false;   // nella galassia il fondo e' sempre lo spazio
function colore(p) {
  const f = p.f, [vi, qu, , sc] = f.mv;
  const c = palette === 'spettro' ? new THREE.Color().setHSL(f.h / 360, .78, clamp(f.l / 100, .45, .68), THREE.SRGBColorSpace) : temperatura(clamp(.5 + .55 * vi - .5 * qu + .1 * sc, 0, 1));
  return f.provv ? c.lerp(new THREE.Color(.78, .77, .75), .6) : c;   // non ancora letta: quasi grigia
}

// ---------------- la Via Lattea ----------------
// Le misure sono quelle della galassia vera, semplificate. 1 unita' = 1000 anni luce. Il piano della galassia e' x-z, il Sole sta verso +z.
// Oltre al disco sottile ci sono le parti che danno volume, tutte vere: il disco spesso, il bordo che si piega e si allarga,
// il rigonfiamento a X al centro, l'alone, le bolle di Fermi.
const R_DISCO = 50;                                      // il disco: circa 100.000 anni luce di diametro
const R_SCALA = 8.5;                                     // le stelle diventano e volte piu' rade ogni 8.500 anni luce (lunghezza di scala 2,6 kpc)
const R_MIN = 5;                                         // piu' vicino al buco nero niente foto: c'e' solo la luce del nucleo
const BARRA = { meta: 13.5, angolo: THREE.MathUtils.degToRad(-27), larga: .4 };   // la barra: circa 27.000 anni luce, inclinata di circa 27 gradi
const PASSO_SPIRALE = THREE.MathUtils.degToRad(12.5);    // quanto si aprono i bracci (circa 12 gradi, misurato)
const R_INIZIO = 12.5;                                   // i bracci partono dalle estremita' della barra
const SOLE = new THREE.Vector3(0, .07, 26.6);            // il Sole: a circa 26.600 anni luce dal centro, appena sopra il piano
// i quattro bracci: Scudo-Centauro e Perseo partono dalle punte della barra, Sagittario-Carena e Norma in mezzo
const BRACCI = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
const angoloBraccio = (fase, R) => BARRA.angolo + fase + Math.log(Math.max(R, R_INIZIO) / R_INIZIO) / Math.tan(PASSO_SPIRALE);
const avvolgi = a => Math.atan2(Math.sin(a), Math.cos(a));
// quante stelle stanno entro il raggio R in un disco esponenziale con lunghezza di scala «scala» (frazione fino a R_DISCO)
const massaEntro = (R, scala = R_SCALA) => 1 - (1 + R / scala) * Math.exp(-R / scala);
function raggioPer(u, rMin = R_MIN, scala = R_SCALA) {   // il raggio che lascia dentro una frazione u delle stelle (tra rMin e R_DISCO)
  const a = massaEntro(rMin, scala), b = massaEntro(R_DISCO, scala), m = a + u * (b - a);
  let lo = rMin, hi = R_DISCO; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (massaEntro(mid, scala) < m) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
const casuale = r0 => () => { const u = Math.max(1e-9, r0()), v = r0(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
// oltre i 30.000 anni luce il disco si allarga (svasatura) e si piega: da una parte sale, dall'altra scende, come una tesa di cappello
const svasatura = R => 1 + Math.max(0, R - 30) / 15;
const piega = (x, z) => { const R = Math.hypot(x, z); return R <= 30 ? 0 : 4 * Math.sin(Math.atan2(z, x) - .4) * ((R - 30) / 20) ** 2; };
const spessore = R => (.3 + 2 * Math.exp(-R / 5)) * svasatura(R);   // il disco sottile (circa 1000 anni luce), piu' gonfio al centro e ai bordi
// la mappa delle somiglianze diventa la galassia. Nel piano: la mappa 2D (un cerchio, le foto simili vicine); la distanza dal centro
// segue quanto sono fitte le stelle vere, la direzione viene tirata verso il braccio piu' vicino (o verso la barra al centro).
// In altezza: la terza dimensione della mappa delle somiglianze in 3D. Il 65% delle foto sta nel disco sottile, il resto nel disco spesso
let raggiMappa = [], altezzeMappa = [];
const raggioMappa = f => Math.hypot(f.x || 0, f.y || 0);
const altezzaMappa = f => Math.abs((f.p || [])[2] || 0);
function rango(lista, x) { let lo = 0, hi = lista.length; while (lo < hi) { const m = (lo + hi) >> 1; if (lista[m] < x) lo = m + 1; else hi = m; } return lo; }
function postoNellaGalassia(p, v) {
  const f = p.f, rs = raggioMappa(f), ts = Math.atan2(f.y || 0, f.x || 0), r0 = seme(p.id + ' stella'), g = casuale(r0);
  const u = (rango(raggiMappa, rs) + .5) / Math.max(1, raggiMappa.length), R = raggioPer(Math.min(.999, u));
  const q = (rango(altezzeMappa, altezzaMappa(f)) + .5) / Math.max(1, altezzeMappa.length), segno = ((f.p || [])[2] || 0) < 0 ? -1 : 1;
  let x, z;
  if (R < R_INIZIO) {                                    // vicino al centro: lungo la barra
    const a = R * Math.cos(ts), b = R * Math.sin(ts) * BARRA.larga;
    x = a * Math.cos(BARRA.angolo) - b * Math.sin(BARRA.angolo); z = a * Math.sin(BARRA.angolo) + b * Math.cos(BARRA.angolo);
  } else {                                               // piu' fuori: verso il braccio piu' vicino, senza schiacciarci sopra del tutto
    let d = 1e9; for (const fase of BRACCI) { const x0 = avvolgi(ts - angoloBraccio(fase, R)); if (Math.abs(x0) < Math.abs(d)) d = x0; }
    const th = ts - d * .7 + g() * .03;
    x = R * Math.cos(th); z = R * Math.sin(th);
  }
  // l'altezza: nel disco sottile fino a circa 1000 anni luce, nel disco spesso da 1500 a 8000, sempre piu' svasata ai bordi
  const h = q < .65 ? (q / .65) * 1.2 * spessore(R) / svasatura(R) : 1.5 + (q - .65) / .35 * 6.5;
  v.set(x, segno * h * svasatura(R) + piega(x, z), z);
  return lontanoDalBuco(v);
}
function lontanoDalBuco(v) {                             // nessuna foto dentro il disco di gas del buco nero
  const r = Math.hypot(v.x, v.z); if (r < R_MIN && Math.abs(v.y) < 3) { const k = R_MIN / Math.max(r, .01); v.x *= k; v.z *= k; if (r < .01) v.x = R_MIN; }
  return v;
}
const DMIN = 2.4;                                        // la distanza minima tra due foto: nessuna copre l'altra
const dx = new THREE.Vector3(), dy = new THREE.Vector3();
function spingi(ps, giri, mobili) {
  for (let g = 0; g < giri; g++) {
    for (let a = 0; a < ps.length; a++) for (let b = a + 1; b < ps.length; b++) {
      const A = ps[a].fine, B = ps[b].fine, ex = A.x - B.x, ey = A.y - B.y, ez = A.z - B.z;
      if (ex * ex + ey * ey + ez * ez >= DMIN * DMIN) continue;
      const ma = !mobili || mobili.has(ps[a]), mb = !mobili || mobili.has(ps[b]); if (!ma && !mb) continue;
      const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
      dx.set(ex, ey, ez); if (d < 1e-4) dx.set(Math.sin(a + g), Math.cos(a * b), Math.cos(b)); dx.setLength((DMIN - d) / (ma && mb ? 2 : 1));
      if (ma) A.add(dx); if (mb) B.sub(dx);
    }
  }
}
function disponiTutte() {
  const ps = photos.filter(p => !p.hold);
  raggiMappa = ps.map(p => raggioMappa(p.f)).sort((a, b) => a - b);
  altezzeMappa = ps.map(p => altezzaMappa(p.f)).sort((a, b) => a - b);
  ps.forEach(p => postoNellaGalassia(p, p.fine));
  for (let i = 0; i < 4; i++) { spingi(ps, 20); ps.forEach(p => lontanoDalBuco(p.fine)); }
}
function posizionaUna(p) {                               // una foto nuova (o appena letta): il suo posto, senza spostare le altre
  postoNellaGalassia(p, p.fine);
  spingi(photos.filter(q => !q.hold || q === p), 30, new Set([p])); lontanoDalBuco(p.fine);
}

// ---------------- le stelle della galassia: non sono foto, danno la forma ----------------
// il disco sottile (gialle e vecchie verso il centro, azzurre e giovani nei bracci), il disco spesso, la barra e il rigonfiamento a X,
// le nuvolette rosa dove nascono le stelle, l'alone, le bolle di Fermi
let baglioreCentro = null;   // la luce del rigonfiamento: da vicino si spegne, se no copre il buco nero
const TEX_STELLA = texLuce([[0, 'rgba(255,255,255,1)'], [.2, 'rgba(255,255,255,.7)'], [1, 'rgba(255,255,255,0)']]);
const GIALLO = new THREE.Color(1, .82, .55), AZZURRO = new THREE.Color(.62, .74, 1), ROSA = new THREE.Color(1, .42, .62), BIANCO = new THREE.Color(1, .95, .85), VIOLA = new THREE.Color(.62, .48, 1);
function puntiGalassia(n, crea, grandezza, opacita, puntini = true) {   // puntini: grandezza fissa in pixel (le stelle restano puntini anche da vicino)
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), v = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < n; i++) { crea(v, c, i); pos.set([v.x, v.y, v.z], i * 3); col.set([c.r, c.g, c.b], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ size: grandezza * (puntini ? Math.min(devicePixelRatio || 1, 2) : 1), sizeAttenuation: !puntini, map: TEX_STELLA, vertexColors: true, transparent: true, opacity: opacita, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(m); if (puntini) stellePuntini.push(m); return m;
}
const stellePuntini = [];   // da lontano tante stelle si sovrappongono: si abbassa la loro luce, se no il centro diventa una macchia bianca
{
  const r0 = seme('via lattea'), g = casuale(r0);
  puntiGalassia(42000, (v, c) => {                       // il disco sottile
    const R = raggioPer(r0(), 2.5), nelBraccio = r0() < .62;
    const th = nelBraccio && R > R_INIZIO * .8 ? angoloBraccio(BRACCI[Math.floor(r0() * 4)], R) + g() * (.1 + 1.2 / R) : r0() * TAU;
    const x = R * Math.cos(th), z = R * Math.sin(th);
    v.set(x, g() * spessore(R) * .5 + piega(x, z), z);
    c.copy(GIALLO).lerp(AZZURRO, sstep(6, 26, R) * (nelBraccio ? 1 : .6)).multiplyScalar((.35 + .45 * r0()) * (nelBraccio ? 1 : .55));
  }, 2.6, 1);
  puntiGalassia(12000, (v, c) => {                       // il disco spesso: stelle piu' vecchie, fino a qualche migliaio di anni luce sopra e sotto
    const R = raggioPer(r0(), 3, 7), th = r0() * TAU, x = R * Math.cos(th), z = R * Math.sin(th);
    v.set(x, g() * 3 * svasatura(R) + piega(x, z), z);
    c.copy(GIALLO).lerp(BIANCO, .3).multiplyScalar(.18 + .2 * r0());
  }, 2.2, 1);
  puntiGalassia(16000, (v, c) => {                       // la barra e il rigonfiamento: stelle vecchie, gialle
    const a = g() * BARRA.meta * .42, b = g() * BARRA.meta * .42 * BARRA.larga;
    v.set(a * Math.cos(BARRA.angolo) - b * Math.sin(BARRA.angolo), g() * 1.3, a * Math.sin(BARRA.angolo) + b * Math.cos(BARRA.angolo));
    const r = v.length(); if (r < 4) v.multiplyScalar(4 / Math.max(r, .05) * (1 + r0() * .3));   // intorno al buco nero resta lo spazio scuro
    c.copy(GIALLO).multiplyScalar(.35 + .4 * r0());
  }, 2.4, 1);
  puntiGalassia(7000, (v, c) => {                        // il rigonfiamento a X: visto di lato, le stelle della barra formano una X
    const a = (r0() * 2 - 1) * 6.5, h = Math.abs(a) * .65 * (r0() < .5 ? 1 : -1) + g() * .45, b = g() * 1.1;
    v.set(a * Math.cos(BARRA.angolo) - b * Math.sin(BARRA.angolo), h, a * Math.sin(BARRA.angolo) + b * Math.cos(BARRA.angolo));
    const r = v.length(); if (r < 4) v.multiplyScalar(4 / Math.max(r, .05));
    c.copy(GIALLO).multiplyScalar(.3 + .3 * r0());
  }, 2.2, 1);
  puntiGalassia(700, (v, c) => {                         // le nuvolette rosa: dove nascono le stelle, lungo i bracci
    const R = 11 + r0() * 36, th = angoloBraccio(BRACCI[Math.floor(r0() * 4)], R) + g() * .06;
    const x = R * Math.cos(th) + g() * .6, z = R * Math.sin(th) + g() * .6;
    v.set(x, g() * .25 + piega(x, z), z);
    c.copy(ROSA).multiplyScalar(.5 + .5 * r0());
  }, 1.1, .55, false);   // le nuvolette sono nuvole: da vicino diventano grandi
  const rMinA = 5 ** -.5, rMaxA = 150 ** -.5;
  puntiGalassia(6000, (v, c) => {                        // l'alone: stelle vecchissime e rade tutto intorno (densita' ~ r^-3,5), un po' schiacciato
    const r = (rMinA - r0() * (rMinA - rMaxA)) ** -2, a = r0() * TAU, b = Math.acos(r0() * 2 - 1);
    v.set(Math.sin(b) * Math.cos(a), Math.cos(b) * .75, Math.sin(b) * Math.sin(a)).multiplyScalar(r);
    c.copy(GIALLO).lerp(BIANCO, .5).multiplyScalar(.12 + .12 * r0());
  }, 2, 1);
  puntiGalassia(3000, (v, c) => {                        // le bolle di Fermi: due lobi enormi sopra e sotto il centro (si vedono solo nei raggi gamma)
    const su = r0() < .5 ? 1 : -1, a = r0() * TAU, b = Math.acos(r0() * 2 - 1);
    v.set(Math.sin(b) * Math.cos(a) * 7.5, (Math.cos(b) + 1) * 12.5 * su, Math.sin(b) * Math.sin(a) * 7.5);
    c.copy(VIOLA).multiplyScalar(.12 + .1 * r0());
  }, 2, 1);
  // la luce del rigonfiamento centrale
  const bagliore = new THREE.Sprite(new THREE.SpriteMaterial({ map: texLuce([[0, 'rgba(255,236,200,.9)'], [.25, 'rgba(255,200,140,.35)'], [1, 'rgba(255,150,90,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  bagliore.scale.setScalar(26); scene.add(bagliore);
  baglioreCentro = bagliore;
}

// ---------------- Sagittarius A*: il buco nero al centro ----------------
// In scala vera sarebbe un miliardesimo della galassia (circa 24 milioni di km): qui e' ingrandito, ma fatto come quelli veri:
// un disco nero (l'orizzonte degli eventi e la sua ombra), un anello sottile di luce che gli gira intorno, e il disco di gas
// caldo che ruota (piu' veloce vicino al buco), piu' luminoso dalla parte che viene verso di noi
const ORIZZONTE = .9;
const orizzonte = new THREE.Mesh(new THREE.SphereGeometry(ORIZZONTE, 48, 32), new THREE.MeshBasicMaterial({ color: 0x000000 }));
scene.add(orizzonte);
const TEX_FOTONI = (() => { const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, S * .3, S / 2, S / 2, S * .5); g.addColorStop(0, 'rgba(255,240,210,0)'); g.addColorStop(.42, 'rgba(255,240,210,1)'); g.addColorStop(.6, 'rgba(255,190,120,.35)'); g.addColorStop(1, 'rgba(255,150,80,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const anelloFotoni = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_FOTONI, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
anelloFotoni.scale.setScalar(ORIZZONTE * 3.2); scene.add(anelloFotoni);
const DISCO_N = 6000, disco = new THREE.Group(); disco.rotation.x = .38; scene.add(disco);
const discoDati = [];
const discoPunti = (() => {
  const r0 = seme('disco di accrescimento'), pos = new Float32Array(DISCO_N * 3), col = new Float32Array(DISCO_N * 3);
  for (let i = 0; i < DISCO_N; i++) { const r = ORIZZONTE * (1.7 + 4 * Math.pow(r0(), 1.8)); discoDati.push({ r, a: r0() * TAU, h: (r0() - .5) * .05 * r }); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ size: .09, map: TEX_STELLA, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  disco.add(m); return m;
})();
const CALDO = new THREE.Color(1, .95, .85), TIEPIDO = new THREE.Color(1, .45, .15), versoDiNoi = new THREE.Vector3(), vel = new THREE.Vector3();
function passoBuco(dt) {
  const pos = discoPunti.geometry.getAttribute('position'), col = discoPunti.geometry.getAttribute('color'), c = new THREE.Color();
  // la direzione della camera vista dal disco (per l'effetto Doppler: la parte che viene verso di noi e' piu' luminosa)
  versoDiNoi.copy(camera.position).applyMatrix4(new THREE.Matrix4().copy(disco.matrixWorld).invert()).normalize();
  for (let i = 0; i < DISCO_N; i++) {
    const d = discoDati[i]; d.a += (reduced ? 0 : 1.4) * Math.pow(d.r / ORIZZONTE, -1.5) * dt;
    const ca = Math.cos(d.a), sa = Math.sin(d.a);
    pos.setXYZ(i, d.r * ca, d.h, d.r * sa);
    vel.set(-sa, 0, ca);
    const caldo = sstep(ORIZZONTE * 5.7, ORIZZONTE * 1.7, d.r), doppler = clamp(1 + .9 * vel.dot(versoDiNoi), .25, 1.9);
    c.copy(TIEPIDO).lerp(CALDO, caldo).multiplyScalar((.25 + .6 * caldo) * doppler);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  pos.needsUpdate = true; col.needsUpdate = true;
}

// ---------------- le foto ----------------
// la sfera: la foto dentro, il vetro intorno; e' sempre rivolta verso chi guarda, da qualsiasi lato.
// Nei colori opachi e' una stampa rotonda: la foto e un bordo sottile del suo colore
function disegnaSfera(c, S, col, im) {
  c.width = c.height = S; const x = c.getContext('2d'), k = S / 160;
  const [r, g, b] = col.toArray().map(v => Math.round(v * 255)), rgba = a => `rgba(${r},${g},${b},${a})`, R = S / 2 - 3 * k;
  const ok = im && im.complete && im.naturalWidth;
  if (opaco()) {
    const ri = R - 6 * k;
    x.fillStyle = rgba(chiaro() ? .25 : .35); x.beginPath(); x.arc(S / 2, S / 2, ri, 0, TAU); x.fill();
    if (ok) { const m = Math.min(im.naturalWidth, im.naturalHeight); x.save(); x.beginPath(); x.arc(S / 2, S / 2, ri, 0, TAU); x.clip(); x.drawImage(im, (im.naturalWidth - m) / 2, (im.naturalHeight - m) / 2, m, m, S / 2 - ri, S / 2 - ri, ri * 2, ri * 2); x.restore(); }
    x.strokeStyle = rgba(1); x.lineWidth = 7 * k; x.beginPath(); x.arc(S / 2, S / 2, R - 3.5 * k, 0, TAU); x.stroke();
    if (chiaro()) { x.strokeStyle = 'rgba(40,34,28,.35)'; x.lineWidth = 1.2 * k; x.beginPath(); x.arc(S / 2, S / 2, R, 0, TAU); x.stroke(); }
    return;
  }
  let gr = x.createRadialGradient(S * .42, S * .4, 0, S / 2, S / 2, R);
  gr.addColorStop(0, rgba(.12)); gr.addColorStop(.7, rgba(.22)); gr.addColorStop(1, rgba(.7));
  x.fillStyle = gr; x.beginPath(); x.arc(S / 2, S / 2, R, 0, TAU); x.fill();
  const ri = R * .7;
  if (ok) {
    const m = Math.min(im.naturalWidth, im.naturalHeight);
    x.save(); x.beginPath(); x.arc(S / 2, S / 2, ri, 0, TAU); x.clip();
    x.drawImage(im, (im.naturalWidth - m) / 2, (im.naturalHeight - m) / 2, m, m, S / 2 - ri, S / 2 - ri, ri * 2, ri * 2);
    gr = x.createRadialGradient(S / 2, S / 2, ri * .6, S / 2, S / 2, ri); gr.addColorStop(0, rgba(0)); gr.addColorStop(1, rgba(.55));
    x.fillStyle = gr; x.fillRect(0, 0, S, S); x.restore();
  }
  gr = x.createRadialGradient(S / 2, S * .62, R * .3, S / 2, S / 2, R); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.35)');
  x.fillStyle = gr; x.beginPath(); x.arc(S / 2, S / 2, R, 0, TAU); x.fill();
  gr = x.createRadialGradient(S * .36, S * .3, 0, S * .36, S * .3, R * .62); gr.addColorStop(0, 'rgba(255,255,255,.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.beginPath(); x.arc(S / 2, S / 2, R, 0, TAU); x.fill();
  x.fillStyle = 'rgba(255,255,255,.85)'; x.beginPath(); x.ellipse(S * .33, S * .24, 8 * k, 4.5 * k, -.6, 0, TAU); x.fill();
  x.strokeStyle = rgba(.95); x.lineWidth = 3 * k; x.beginPath(); x.arc(S / 2, S / 2, R, 0, TAU); x.stroke();
  x.strokeStyle = 'rgba(255,255,255,.3)'; x.lineWidth = 2 * k; x.beginPath(); x.arc(S / 2, S / 2, R - 4 * k, .2, 1.6); x.stroke();
}
function ridisegna(p) { disegnaSfera(p.can, 160, p.col, p.img); p.tex.needsUpdate = true; if (p.hi) { p.hi.asp = disegnaIntera(p.hi.can, p.col, p.hi.img.complete && p.hi.img.naturalWidth ? p.hi.img : p.img); p.hi.tex.needsUpdate = true; } }
const luceSfera = () => opaco() ? 0xffffff : 0xd8d8d8;   // con il bagliore le sfere sono un po' meno luminose
const photos = [], photoById = {}, sprites = [];
const DUR_MOSSA = 2600;
function makePhoto(id, f) {
  const p = { id, f, ph: seme(id)() * TAU, uPrev: 0, fine: new THREE.Vector3(), da: new THREE.Vector3(), t0: -1e9, dur: DUR_MOSSA };
  p.col = colore(p);
  p.can = document.createElement('canvas'); disegnaSfera(p.can, 160, p.col, null);
  p.tex = new THREE.CanvasTexture(p.can); p.tex.colorSpace = THREE.SRGBColorSpace;
  p.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: p.tex, transparent: true, depthWrite: false, color: luceSfera() }));
  p.base = 1.25 * (f.s || .9); p.sprite.scale.setScalar(p.base); p.sprite.userData.p = p;   // piu' grandi che nella nebulosa: la galassia e' grande
  p.img = new Image(); p.img.onload = () => ridisegna(p); p.img.src = thumbSrc(id);
  scene.add(p.sprite); photos.push(p); photoById[id] = p; sprites.push(p.sprite);
  return p;
}
function aggiornaFoto(p, f) {   // la foto e' stata letta: va al suo posto nella galassia, con il suo colore
  p.f = f;
  p.da.copy(p.sprite.position); posizionaUna(p); p.t0 = performance.now();
  p.col = colore(p); p.base = 1.25 * (f.s || .9); ridisegna(p); p.lampo = performance.now() + 2200;
}
D.tutte.forEach(id => { if (D.foto[id]) makePhoto(id, D.foto[id]); });
disponiTutte();

// ---------------- i fili: i tag in comune ----------------
// un solo tipo di linea, un solo significato: due foto hanno dei tag in comune. Piu' tag, linea piu' spessa.
// Si vedono solo dalla foto indicata (o aperta) verso le foto con cui ha piu' in comune
const MAX_FILI = 12;
function legami(p) {
  const ta = new Set(p.f.tag || []), w = new Map((p.f.vicine || []).map(([id, v]) => [id, v]));
  let out = ta.size ? photos.filter(q => q !== p && !q.hold && q.f.tag).map(q => [q, q.f.tag.reduce((n, t) => n + ta.has(t), 0)]).filter(x => x[1] > 0) : [];
  if (!out.length) out = [...w.keys()].map(id => photoById[id]).filter(q => q && !q.hold && q !== p).map(q => [q, 1]);   // non ancora letta: le foto che le somigliano
  return out.sort((a, b) => b[1] - a[1] || (w.get(b[0].id) || 0) - (w.get(a[0].id) || 0)).slice(0, MAX_FILI);
}
const vicineDi = p => legami(p).map(x => x[0]);
const fili = [1, 2, 3].map(n => {
  const g = new LineSegmentsGeometry(); g.setPositions(new Float32Array(MAX_FILI * 6));
  const m = new LineMaterial({ linewidth: [1.2, 2.4, 4][n - 1], transparent: true, depthWrite: false });
  materialiFili.push(m);
  const l = new LineSegments2(g, m); l.frustumCulled = false; l.visible = false; scene.add(l);
  return l;
});
resize();
function temaFili() {
  fili.forEach((l, i) => {
    const m = l.material;
    m.color.set(chiaro() ? 0x2a2420 : 0xfff4e6); m.opacity = chiaro() ? [.3, .5, .75][i] : opaco() ? [.3, .5, .8][i] : [.2, .34, .55][i];   // con il bagliore le linee spesse abbagliano: piu' tenui
    m.blending = chiaro() ? THREE.NormalBlending : THREE.AdditiveBlending; m.needsUpdate = true;
  });
}
let filiDa = null, filiA = [];   // filiA: [[foto, tag in comune], ...]
let accese = null;   // le foto accese (la foto indicata o aperta e quelle legate a lei), oppure null = tutte
function aggiornaFili() {
  const quanti = [0, 0, 0];
  if (filiDa) {
    const o = filiDa.sprite.position;
    for (const [q, n] of filiA) {
      const i = Math.min(3, n) - 1, a = fili[i].geometry.attributes.instanceStart.data.array, v = q.sprite.position;
      a.set([o.x, o.y, o.z, v.x, v.y, v.z], quanti[i]++ * 6);
    }
  }
  fili.forEach((l, i) => { l.visible = quanti[i] > 0; l.geometry.instanceCount = quanti[i]; l.geometry.attributes.instanceStart.data.needsUpdate = true; });
}

// ---------------- il tema: fondo, bagliore, stelle, centro ----------------
function applicaTema() {
  scene.background = new THREE.Color(0x030308);
  scene.fog = null;
  bloom.enabled = true; bloom.strength = .7;
  nucleo.visible = alone.visible = centroOpaco.visible = false;   // al centro c'e' il buco nero
  for (const p of photos) { p.col = colore(p); ridisegna(p); if (!p.hi) p.sprite.material.color.set(luceSfera()); }
  temaFili();
}
applicaTema();

// ---------------- il suono: nasce dal senso ----------------
// un ronzio grave dal nucleo; ogni impulso che arriva a una foto suona una nota: acuta se e' piena di vita,
// grave se e' vuota; scivola se e' di passaggio, trema se e' ferita, risuona a lungo se e' quieta
let suonoSi = memo('nebulosa-suono') !== 'no';
let actx = null, master = null, riverbero = null, drone = null, rumore = null;
function avviaAudio() {
  if (!suonoSi) return;
  try {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = actx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 4;
      master = actx.createGain(); master.gain.value = .0001; master.connect(comp); comp.connect(actx.destination);
      const rev = actx.createConvolver(), len = Math.floor(actx.sampleRate * 3), ir = actx.createBuffer(2, len, actx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      rev.buffer = ir; riverbero = actx.createGain(); riverbero.gain.value = .45; riverbero.connect(rev); rev.connect(master);
      const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = .8;
      const dg = actx.createGain(); dg.gain.value = .0001; lp.connect(dg); dg.connect(master); dg.connect(riverbero);
      [[55, 'sine', 0, .5], [55, 'triangle', 7, .35], [82.41, 'sine', -5, .3], [110, 'sine', 4, .14]].forEach(([f, type, det, v]) => {
        const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = f; o.detune.value = det; g.gain.value = v; o.connect(g); g.connect(lp); o.start();
      });
      const lfo = actx.createOscillator(), lg = actx.createGain(); lfo.frequency.value = .07; lg.gain.value = 90; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
      drone = dg;
      rumore = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate); const d = rumore.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (actx.state === 'suspended') actx.resume();
    master.gain.setTargetAtTime(.9, actx.currentTime, .6);
  } catch (e) { actx = null; }
}
const pronto = () => suonoSi && actx && actx.state === 'running';
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, avviaAudio, { capture: true, passive: true }));
avviaAudio();   // con «Apri la nebulosa.command» Chrome lo permette subito, senza clic
const SCALA = [45, 48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84];   // la minore pentatonica
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const gradoDi = p => clamp(Math.round(4 + 10 * p.f.mv[0] - 4 * p.f.mv[1] + (p.ph / TAU) * 3), 0, SCALA.length - 1);
function uscita(pan) {
  let out = actx.createGain();
  if (actx.createStereoPanner) { const pn = actx.createStereoPanner(); pn.pan.value = Number.isFinite(pan) ? clamp(pan, -1, 1) : 0; out.connect(pn); pn.connect(master); pn.connect(riverbero); }
  else { out.connect(master); out.connect(riverbero); }
  return out;
}
function nota(p, vol = 1, pan = 0) {
  if (!Number.isFinite(vol)) vol = 1;
  if (!pronto()) return;
  const [vi, qu, tr, sc] = p.f.mv, t = actx.currentTime, f = mtof(SCALA[gradoDi(p)]);
  const dur = 1.1 + 1.6 * qu, v = .045 * vol * (p.f.provv ? .6 : 1);
  const g = uscita(pan);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  const o = actx.createOscillator(), o2 = actx.createOscillator(), g2 = actx.createGain();
  o.frequency.value = f; o2.frequency.value = f * 2.76; g2.gain.value = .22;   // una campana: la nota e un armonico storto
  if (sc > .2) { o.frequency.setValueAtTime(f * Math.pow(2, -3 * sc / 12), t); o.frequency.exponentialRampToValueAtTime(f, t + .4); }
  if (tr > .2) { const l = actx.createOscillator(), lg = actx.createGain(); l.frequency.value = 7.5; lg.gain.value = f * .015 * tr; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur); }
  o.connect(g); o2.connect(g2); g2.connect(g);
  o.start(t); o2.start(t); o.stop(t + dur + .05); o2.stop(t + dur + .05);
}
function accordo(p, vol = 1) {   // un accordo morbido: quando si vola verso una foto, quando una foto si posa
  if (!pronto()) return;
  const t = actx.currentTime, k = gradoDi(p), lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300;
  const g = uscita(0); lp.connect(g);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.05 * vol, t + .5); g.gain.exponentialRampToValueAtTime(.0001, t + 3.2);
  [k, k + 2, k + 4].forEach(i => [-6, 6].forEach(det => { const o = actx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(SCALA[clamp(i, 0, SCALA.length - 1)] - 12); o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + 3.3); }));
}
function urto() {   // una foto arriva dal telefono: un colpo grave e un soffio che sale
  if (!pronto()) return;
  const t = actx.currentTime, o = actx.createOscillator(), g = uscita(0);
  o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(34, t + .7);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.55, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + 1.4);
  o.connect(g); o.start(t); o.stop(t + 1.5);
  const n = actx.createBufferSource(), bp = actx.createBiquadFilter(), gn = uscita(0); n.buffer = rumore; n.loop = true;
  bp.type = 'bandpass'; bp.Q.value = 1.4; bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(4000, t + 1.6);
  gn.gain.setValueAtTime(.0001, t); gn.gain.exponentialRampToValueAtTime(.12, t + .9); gn.gain.exponentialRampToValueAtTime(.0001, t + 2);
  n.connect(bp); bp.connect(gn); n.start(t); n.stop(t + 2.1);
}
const scritteSuono = () => { $('sndbtn').textContent = 'Suono: ' + (suonoSi ? 'sì' : 'no'); };
$('sndbtn').onclick = () => {
  suonoSi = !suonoSi; memo('nebulosa-suono', suonoSi ? 'si' : 'no'); scritteSuono();
  if (suonoSi) avviaAudio(); else if (actx) master.gain.setTargetAtTime(.0001, actx.currentTime, .3);
};
scritteSuono();

// ---------------- nascita: all'apertura le stelle-foto si accendono dal centro verso i bordi ----------------
let nascita = reduced ? -1e9 : performance.now();
const DUR_NASCITA = 4200;
photos.forEach(p => { p.da.copy(p.fine); p.t0 = nascita + 200 + Math.hypot(p.fine.x, p.fine.z) * 70; p.dur = 1400; });

// ---------------- il volo: cliccando una sfera ci si entra dentro, e le sue sorelle le girano intorno ----------------
let fuoco = null;
const DUR_VOLO = 1800;
// da vicino la sfera si apre: la foto intera, nelle sue proporzioni, senza tagli, con una cornice del suo colore
function disegnaIntera(c, col, im) {
  const ok = im && im.complete && im.naturalWidth, asp = ok ? im.naturalWidth / im.naturalHeight : 1;
  const L = 1024, w = asp >= 1 ? L : Math.round(L * asp), h = asp >= 1 ? Math.round(L / asp) : L, b = 14;
  c.width = w; c.height = h; const x = c.getContext('2d');
  const [r, g, bl] = col.toArray().map(v => Math.round(v * 255));
  const tondo = (q, R) => { x.beginPath(); x.moveTo(q + R, q); x.arcTo(w - q, q, w - q, h - q, R); x.arcTo(w - q, h - q, q, h - q, R); x.arcTo(q, h - q, q, q, R); x.arcTo(q, q, w - q, q, R); x.closePath(); };
  x.fillStyle = `rgb(${r},${g},${bl})`; tondo(0, 26); x.fill();                  // la cornice
  x.save(); tondo(b, 16); x.clip();
  if (ok) x.drawImage(im, b, b, w - 2 * b, h - 2 * b); else { x.fillStyle = '#151219'; x.fillRect(0, 0, w, h); }
  x.restore();
  return asp;
}
function alta(p) {   // da vicino la foto si vede intera e a piena risoluzione
  if (p.hi) return;
  const can = document.createElement('canvas'), img = new Image(), tex = new THREE.CanvasTexture(can);
  tex.colorSpace = THREE.SRGBColorSpace; p.hi = { can, img, tex, asp: 1 };
  p.hi.asp = disegnaIntera(can, p.col, p.img);
  img.onload = () => { if (p.hi) { p.hi.asp = disegnaIntera(can, p.col, img); tex.dispose(); p.hi.tex = new THREE.CanvasTexture(can); p.hi.tex.colorSpace = THREE.SRGBColorSpace; p.sprite.material.map = p.hi.tex; p.sprite.material.needsUpdate = true; } };
  img.src = fullSrc(p.id);
  p.sprite.material.map = tex; p.sprite.material.color.set(0xffffff); p.sprite.renderOrder = 5; p.sprite.material.needsUpdate = true;   // aperta: luminosita' piena
}
function bassa(p) { if (!p.hi) return; p.sprite.material.map = p.tex; p.sprite.material.color.set(0xd8d8d8); p.sprite.renderOrder = 0; p.sprite.material.needsUpdate = true; p.hi.tex.dispose(); p.hi = null; }
function vola(p) {
  if (!p || p.hold || arrivo) return;
  if (fuoco && fuoco.p === p && !fuoco.uscita) return;
  const back = fuoco ? fuoco.back : { pos: camera.position.clone(), target: controls.target.clone() };
  if (fuoco) { if (fuoco.p !== p) bassa(fuoco.p); fuoco.p.fk = 0; }
  const sorelle = vicineDi(p).slice(0, 10);
  photos.forEach(q => { if (q.orbita && !sorelle.includes(q)) q.orbita.su = false; });
  const centro = p.fine.clone(); viaggioCam = null;
  sorelle.forEach((q, i) => { q.orbita = { i, n: sorelle.length, centro, k: q.orbita ? q.orbita.k : 0, su: true }; });
  p.orbita && (p.orbita.su = false);
  const out = p.fine.clone().sub(camera.position).negate().setY(0); if (out.lengthSq() < 1e-6) out.set(0, 0, 1); out.normalize();   // ci si avvicina dal lato da cui si guarda
  const camDest = p.fine.clone().addScaledVector(out, 6.4).add(new THREE.Vector3(0, .9, 0));
  fuoco = { p, sorelle, t0: performance.now(), cam0: camera.position.clone(), tgt0: controls.target.clone(), camDest, tgtDest: centro.clone(), back, uscita: false, arrivato: false };
  controls.enabled = false; controls.autoRotate = false; clearTimeout(fermo);
  accese = new Set([p.id, ...sorelle.map(q => q.id)]);
  filiDa = p; filiA = legami(p).slice(0, 10);
  alta(p);
  document.body.classList.add('infuoco');
  mostraPannello(p);
  accordo(p);
}
function torna() {
  if (!fuoco || fuoco.uscita) return;
  Object.assign(fuoco, { uscita: true, arrivato: false, t0: performance.now(), cam0: camera.position.clone(), tgt0: controls.target.clone(), camDest: fuoco.back.pos, tgtDest: fuoco.back.target });
  fuoco.sorelle.forEach(q => { if (q.orbita) q.orbita.su = false; });
  controls.enabled = false;
  accese = null; filiDa = null; filiA = [];
  $('fuoco').classList.remove('on'); document.body.classList.remove('infuoco');
}
function passoVolo(now) {
  if (!fuoco) return;
  const u = easeIO(clamp((now - fuoco.t0) / DUR_VOLO, 0, 1));
  if (!fuoco.arrivato) { camera.position.lerpVectors(fuoco.cam0, fuoco.camDest, u); controls.target.lerpVectors(fuoco.tgt0, fuoco.tgtDest, u); }
  fuoco.p.fk = fuoco.uscita ? 1 - u : u;
  if (u >= 1 && !fuoco.arrivato) {
    fuoco.arrivato = true; controls.enabled = true;
    if (fuoco.uscita) {
      bassa(fuoco.p); fuoco.p.fk = 0; fuoco = null; riprendiGiro();
      const attese = photos.filter(q => q.pending);
      if (attese.length) { attese.forEach(q => { aggiornaFoto(q, q.pending); q.pending = null; }); counts(); renderCron(); }
    }
  }
}
function mostraPannello(p) {
  const a = cron.get(p.id), n = fuoco.sorelle.length, qui = ['localhost', '127.0.0.1'].includes(location.hostname);
  $('fk').innerHTML = (p === ultimaArrivata ? '<span class="nuova">appena arrivata</span> · ' : 'una foto · ') + (n ? `e le ${n} foto con cui ha più tag in comune, che le girano intorno` : '');
  $('fl').textContent = p.f.lettura || '';
  $('fa').innerHTML = a ? `<b>Arrivata dal telefono${a.nome ? ' · foto di ' + esc(a.nome) : ''} · ${quando(a.quando)}</b>${a.frase ? '«' + esc(a.frase) + '»' : ''}` +
    (p.f.provv ? `<br><span class="nota">Non ancora letta: per ora sta vicino alle foto che le somigliano ${p.f.come === 'frase' ? 'per la sua frase' : 'nell\'aspetto'}.</span>` : '') +
    (qui ? `<br><button data-elimina="${p.id}">Rimuovi questa foto</button>` : '') : '';
  $('fa').style.display = a ? '' : 'none';
  $('fuoco').style.setProperty('--c', css(p.col));
  $('fuoco').classList.add('on');
}
$('fx').onclick = torna;

// ---------------- la tua foto ti porta dentro ----------------
// l'unica cosa che muove la nebulosa da sola: quando arriva una foto dal QR, dopo il suo urto la camera vola dentro di lei
// (lettura, frase, sorelle in orbita), resta un po' e poi torna alla vista d'insieme che gira piano.
// Se qualcuno sta usando il mouse, la lascia fare e non torna indietro da sola.
const RIPOSO = 15000, SOSTA_NUOVA = 20000;
const regia = { nuova: null, ritorno: 0 };
let ultimoTocco = -1e9, ultimaArrivata = null;
['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, () => { ultimoTocco = performance.now(); }, { passive: true }));
function passoRegia(now) {
  if (regia.nuova && !arrivo) {
    const p = regia.nuova; regia.nuova = null;
    if (photoById[p.id] && !(fuoco && fuoco.uscita)) { ultimaArrivata = p; vola(p); regia.ritorno = now + DUR_VOLO + SOSTA_NUOVA; }
    else regia.nuova = p;
    return;
  }
  const libera = now - ultimoTocco > RIPOSO;
  if (fuoco && fuoco.arrivato && !fuoco.uscita) { controls.autoRotate = libera && !reduced; controls.autoRotateSpeed = .9; }   // gira piano intorno alla foto
  else if (!fuoco) controls.autoRotateSpeed = .35;
  if (regia.ritorno && now > regia.ritorno && libera && fuoco && fuoco.arrivato && !fuoco.uscita) { regia.ritorno = 0; torna(); }
}

// ---------------- interazione ----------------
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), mpx = { x: -1, y: -1 };
let hover = null, giu = null, mossoMouse = false;
cv.addEventListener('pointermove', e => { mpx.x = e.clientX; mpx.y = e.clientY; mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); mossoMouse = true; });
cv.addEventListener('pointerleave', () => { mpx.x = -1; setHover(null); });
cv.addEventListener('pointerdown', e => { giu = { x: e.clientX, y: e.clientY }; });
cv.addEventListener('pointerup', e => {
  if (giu && Math.hypot(e.clientX - giu.x, e.clientY - giu.y) < 5) { if (hover) vola(hover); else if (fuoco) torna(); }
  giu = null;
});
function setHover(p) {
  if (p === hover) return;
  hover = p;
  cv.style.cursor = p ? 'pointer' : 'grab';
  if (fuoco) return;   // durante il volo restano accese la foto e le sue sorelle
  filiA = p ? legami(p) : [];
  accese = p ? new Set([p.id, ...filiA.map(x => x[0].id)]) : null;
  filiDa = p;
}
function pick() {
  if (!mossoMouse || mpx.x < 0 || arrivo) return;
  mossoMouse = false;
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(sprites, false).find(h => !h.object.userData.p.hold && h.object.material.opacity > .5);
  setHover(hit ? hit.object.userData.p : null);
}
$('home').onclick = () => { if (fuoco) { torna(); return; } verso(new THREE.Vector3(0, 0, 0), CASA.clone()); };
$('palbtn').onclick = () => {
  palette = PALETTE[(PALETTE.indexOf(palette) + 1) % PALETTE.length]; memo('nebulosa-colori', palette); scritteColori();
  applicaTema();
};
const scritteColori = () => { $('palbtn').textContent = 'Colori: ' + NOME_PALETTE[palette]; };
scritteColori();
addEventListener('keydown', e => { if (e.key === 'Escape') { if (fuoco) torna(); else $('home').click(); } });

// ---------------- l'interfaccia si nasconde da sola, e torna appena ti muovi ----------------
let calmaT = 0;
function sveglia() {
  document.body.classList.remove('calma'); clearTimeout(calmaT);
  calmaT = setTimeout(() => { if (!$('cron').classList.contains('open') && !$('qr').classList.contains('open')) document.body.classList.add('calma'); }, 4000);
}
['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, sveglia, { passive: true }));
sveglia();

// ---------------- viaggiare: la camera vola piano verso un punto ----------------
let viaggioCam = null;
const DUR_VIAGGIO = 2200;
function verso(tgt, cam) {
  if (fuoco) return;
  viaggioCam = { t0: performance.now(), cam0: camera.position.clone(), tgt0: controls.target.clone(), cam, tgt };
  controls.autoRotate = false; clearTimeout(fermo);
}
function passoViaggio(now) {
  if (!viaggioCam) return;
  const u = easeIO(clamp((now - viaggioCam.t0) / DUR_VIAGGIO, 0, 1));
  camera.position.lerpVectors(viaggioCam.cam0, viaggioCam.cam, u); controls.target.lerpVectors(viaggioCam.tgt0, viaggioCam.tgt, u);
  if (u >= 1) { viaggioCam = null; riprendiGiro(); }
}
controls.addEventListener('start', () => { viaggioCam = null; });

$('solebtn').onclick = () => {                           // dal Sole: dove siamo noi, guardando verso il centro (la fascia della Via Lattea intorno)
  const vai = () => verso(new THREE.Vector3(0, 0, 0), SOLE.clone());
  if (fuoco) { torna(); setTimeout(vai, DUR_VOLO + 50); } else vai();
};

// ---------------- ogni fotogramma ----------------
const orb = new THREE.Vector3();
let ultimoFotogramma = 0;
let ultimoDrone = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const t = now / 1000;
  passoVolo(now);
  passoViaggio(now);
  passoBuco(Math.min(.05, (now - (ultimoFotogramma || now)) / 1000)); ultimoFotogramma = now;
  const dalCentro = camera.position.length();
  baglioreCentro.material.opacity = sstep(8, 45, dalCentro);
  bloom.strength = .25 + .3 * sstep(6, 40, dalCentro);
  const luceStelle = clamp(Math.pow(20 / Math.max(1, dalCentro), 1.5), .14, 1);   // da fuori la galassia e' piu' tenue, da dentro piu' viva
  stellePuntini.forEach(m => { m.material.opacity = luceStelle; });
  passoMano(now);
  controls.update();
  const nb = clamp((now - nascita) / DUR_NASCITA, 0, 1), eb = easeIO(nb);
  // il nucleo respira; quando arriva una foto si accende
  const lampo = arrivo ? Math.max(0, 1 - Math.abs((now - arrivo.t0) - 500) / 900) : 0;
  nucleo.scale.setScalar(4.2 * (1 + .05 * Math.sin(t * 2)) * (1 + 1.4 * lampo) * (nb < 1 ? .6 + .4 * eb + .8 * (1 - nb) : 1));
  alone.scale.setScalar(16 * (1 + .6 * lampo)); alone.material.opacity = .45 + .3 * lampo;
  centroOpaco.scale.setScalar(3.2 * (1 + .04 * Math.sin(t * 1.5)) * (1 + 1.2 * lampo));
  // il ronzio: piu' forte vicino al nucleo
  if (pronto() && drone && now - ultimoDrone > 200) { ultimoDrone = now; drone.gain.setTargetAtTime(.05 + .11 * clamp(1 - camera.position.length() / 80, 0, 1), actx.currentTime, .5); }
  // le orbite delle sorelle, rivolte verso chi guarda
  camera.matrixWorld.extractBasis(dx, dy, orb);
  let note = 0;
  photos.forEach(p => {
    if (p.hold) return;   // la foto che sta arrivando la muove passoArrivo
    const [vi, qu, tr] = p.f.mv;
    const m = easeIO(clamp((now - p.t0) / p.dur, 0, 1));   // si accende al suo posto (o va al posto nuovo dopo una lettura)
    p.sprite.position.lerpVectors(p.da, p.fine, m);
    if (!reduced && m >= 1) {   // un respiro leggero: chi e' piena di vita si muove un po' di piu', chi e' ferita trema
      const a = .03 + .07 * vi;
      p.sprite.position.x += Math.sin(t * (.4 + vi) + p.ph) * a + (tr ? Math.sin(t * 19 + p.ph * 5) * .015 * tr : 0);
      p.sprite.position.y += Math.cos(t * (.33 + vi * .8) + p.ph * 1.3) * a;
    }
    let sc = p.base * (1 + .06 * vi * Math.sin(t * 2.4 + p.ph)) * (m < 1 ? .4 + .6 * m : 1);
    if (p.orbita) {   // sorella: si stacca dal suo posto e gira intorno alla foto scelta
      const o = p.orbita; o.k = clamp(o.k + (o.su ? .022 : -.03), 0, 1);
      const e = easeIO(o.k), ang = o.i / o.n * TAU + t * .12, R = (fuoco && fuoco.p.hi ? 1.5 * Math.max(1, fuoco.p.hi.asp) + 1.1 : 2.35) + .25 * Math.sin(t * .7 + o.i);   // con la foto aperta l'orbita si allarga: le sorelle le girano intorno senza coprirla
      orb.copy(o.centro).addScaledVector(dx, Math.cos(ang) * R).addScaledVector(dy, Math.sin(ang) * R * .82);
      p.sprite.position.lerp(orb, e); sc += (.62 * (p.f.s || .9) * 1.45 - sc) * e;   // in orbita tornano della grandezza della nebulosa
      if (o.k <= 0 && !o.su) p.orbita = null;
    }
    if (p.fk) { p.sprite.position.lerp(p.fine, p.fk); sc = sc + (3 - sc) * easeIO(p.fk); }
    if (accese && !fuoco) sc *= p === hover ? 1.9 : accese.has(p.id) ? 1.3 : .85;
    if (fuoco && p === hover && p !== fuoco.p) sc *= 1.25;
    if (p.lampo && now < p.lampo) sc *= 1 + .8 * Math.sin((p.lampo - now) / 2200 * Math.PI);
    p.sprite.scale.setScalar(sc);
    if (p.hi && p.fk) p.sprite.scale.x = sc * (1 + (p.hi.asp - 1) * easeIO(p.fk));   // la foto intera: larga quanto le sue proporzioni
    p.sprite.material.opacity = accese && !accese.has(p.id) ? (chiaro() ? .18 : .1) : 1;
    // ogni foto ha il suo ritmo; a ogni giro, ogni tanto, suona la sua nota
    if (!reduced && nb >= 1) {
      const sp = Math.max(.03, .07 + .25 * vi - .04 * qu), u = (t * sp + p.ph) % 1;
      if (u < p.uPrev && pronto() && note < 2) {
        const acc = accese ? accese.has(p.id) : true, prob = accese ? (acc ? .5 : 0) : .03;
        if (Math.random() < prob) {
          const d = camera.position.distanceTo(p.sprite.position), q = p.sprite.position.clone().project(camera);
          if (q.z < 1) { nota(p, clamp(14 / d, .25, 1.4), q.x * .8); note++; }
        }
      }
      p.uPrev = u;
    }
  });
  aggiornaFili();
  pick();
  passoArrivo(now);
  passoRegia(now);
  composer.render();
  $('intro').classList.toggle('hide', camera.position.length() < 60 || !!fuoco);
  updatePreview();
}

// ---------------- anteprima: solo per le foto arrivate dai telefoni ----------------
let pvKey = null;
function updatePreview() {
  const pv = $('pv'), a = hover && cron.get(hover.id);
  if (!a || (fuoco && hover === fuoco.p)) { pv.style.display = 'none'; pvKey = null; return; }
  if (pvKey !== hover.id) {
    pvKey = hover.id;
    pv.innerHTML = `<div class="k" style="color:#f0c88c">dal telefono${a.nome ? ' di ' + esc(a.nome) : ''} · ${quando(a.quando)}</div>${a.frase ? `<q>«${esc(a.frase)}»</q>` : ''}${hover.f.provv ? '<div class="k">non ancora letta · posto provvisorio</div>' : ''}`;
  }
  pv.style.display = 'block';
  pv.style.left = clamp(mpx.x + 30, 8, innerWidth - pv.offsetWidth - 8) + 'px'; pv.style.top = clamp(mpx.y + 16, 70, innerHeight - pv.offsetHeight - 8) + 'px';
}
const css = c => `rgb(${c.toArray().map(v => Math.round(v * 255)).join(',')})`;
const cssA = (c, a) => `rgba(${c.toArray().map(v => Math.round(v * 255)).join(',')},${a})`;

// ---------------- foto dai telefoni, in tempo reale: ogni arrivo e' un nuovo urto ----------------
const LIVE = location.protocol.startsWith('http');
const QUI = ['localhost', '127.0.0.1'].includes(location.hostname);
const cron = new Map();
let online = false, arrivate = 0;
const arrQueue = [];
let arrivo = null, fineUltimo = 0;
const PAUSA = 1200;
function counts() {
  const n = photos.length, prov = photos.filter(p => p.f.provv).length;
  $('st').textContent = n + ' foto';
  $('introp').textContent = `${n} foto${D.luogo ? ' di ' + D.luogo : ''}, raccolte da chi le ha vissute, sparse come le stelle della nostra galassia: più fitte verso il centro e lungo i bracci, e le foto che si somigliano vicine tra loro. Al centro c'è Sagittarius A*, il buco nero. È in tre dimensioni come la galassia vera: il disco sottile e quello spesso, l'alone, le bolle di Fermi (che si vedono solo nei raggi gamma). Trascina per girarle intorno; la rotella ti avvicina al punto che indichi col mouse, così ci entri; «Dal Sole» ti porta dove siamo noi.` +
    (prov ? ` ${prov === 1 ? '1 foto, quasi grigia, ha' : prov + ' foto, quasi grigie, hanno'} ancora un posto provvisorio, vicino alle foto che le somigliano: aspetta${prov === 1 ? '' : 'no'} di essere lett${prov === 1 ? 'a' : 'e'}.` : '');
  $('qrmeta').textContent = arrivate + ' foto arrivate dai telefoni';
}
function addArrival(a, animate) {
  if (!a.dato || photoById[a.id] || arrQueue.some(x => x.id === a.id) || (arrivo && arrivo.a.id === a.id)) return;
  if (animate) { arrQueue.push(a); return; }
  const p = makePhoto(a.id, a.dato); posizionaUna(p); p.da.copy(p.fine); counts();
}
function nextArrival(now) {
  if (arrivo || !arrQueue.length || now < fineUltimo + PAUSA) return;
  if (fuoco) { torna(); return; }   // l'arrivo deve vedersi: prima si torna alla nebulosa
  const a = arrQueue.shift(), p = makePhoto(a.id, a.dato); p.hold = true; posizionaUna(p); counts();
  // una stella nuova nasce come quelle vere: si accende in una nuvola di gas sopra il suo posto e scende piano nel disco
  const curva = new THREE.QuadraticBezierCurve3(p.fine.clone().add(new THREE.Vector3(0, 7, 0)), p.fine.clone().add(new THREE.Vector3(1.5, 3, 0)), p.fine.clone());
  p.pts = new Float32Array(curva.getPoints(80).flatMap(v => [v.x, v.y, v.z])); p.n = p.pts.length / 3;
  setHover(null);
  const coda = arrQueue.length, f = coda === 0 ? 1 : coda <= 2 ? .72 : .5;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p.pts, 3)); g.setDrawRange(0, 0);
  const fusione = chiaro() ? THREE.NormalBlending : THREE.AdditiveBlending;
  const linea = new THREE.Line(g, new THREE.LineBasicMaterial({ color: p.col, transparent: true, blending: fusione, depthWrite: false }));
  const onda = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_ANELLO, color: p.col, transparent: true, blending: fusione, depthWrite: false, opacity: 0 }));
  scene.add(linea, onda);
  arrivo = { a, p, linea, onda, t0: now, T1: 1700 * f + 300, T2: 1700 * f + 300 + 4800 * f, T3: 1700 * f + 300 + 4800 * f + 1300 };
  $('arrK').textContent = 'Nuova foto' + (a.nome ? ' · da ' + a.nome : ' · dal telefono');
  $('arrW').textContent = a.frase ? '«' + a.frase + '»' : '';
  $('arrQ').textContent = arrQueue.length ? '+ ' + arrQueue.length + ' in arrivo' : '';
    $('arrivo').classList.add('on');
  urto();
  renderCron();
}
function passoArrivo(now) {
  nextArrival(now);
  if (!arrivo) return;
  const { p, linea, onda, T1, T2, T3 } = arrivo, el = now - arrivo.t0, s = p.sprite;
  s.material.opacity = 1;
  if (el < T1) {                                            // 1. nasce nel nucleo, grande
    s.position.set(p.pts[0], p.pts[1], p.pts[2]); s.scale.setScalar(p.base * 4 * sstep(0, T1 * .7, el));
  } else if (el < T2) {                                     // 2. scende piano al suo posto nel disco, lasciando una scia
    if (!arrivo.partita) { arrivo.partita = true; $('arrivo').classList.remove('on'); }
    const u = easeIO((el - T1) / (T2 - T1)), j = Math.floor(u * (p.n - 1));
    s.position.set(p.pts[j * 3], p.pts[j * 3 + 1], p.pts[j * 3 + 2]);
    s.scale.setScalar(p.base * (5.5 + (1.4 - 5.5) * sstep(0, .6, u)));
    linea.geometry.setDrawRange(0, j + 1);
  } else {                                                  // 3. si posa: un'onda
    const v = clamp((el - T2) / (T3 - T2), 0, 1);
    if (!arrivo.posata) { arrivo.posata = true; accordo(p, .8); }
    s.position.copy(p.fine); s.scale.setScalar(p.base * (1.4 - .4 * v));
    onda.position.copy(p.fine); onda.scale.setScalar(p.base * (1 + 5 * v)); onda.material.opacity = .9 * (1 - v);
    linea.material.opacity = 1 - v;                         // la scia sparisce: resta la stella nuova
    if (el >= T3) {
      p.hold = false; p.da.copy(p.fine); p.t0 = -1e9; scene.remove(linea, onda); linea.geometry.dispose();
      p.lampo = now + 2200; toast(arrivo.a); arrivo = null; fineUltimo = now; renderCron(); regia.nuova = p; return;
    }
  }
}
function removePhoto(id) {
  const p = photoById[id]; if (!p) return;
  if (fuoco && (fuoco.p === p || fuoco.sorelle.includes(p))) torna();
  scene.remove(p.sprite); p.tex.dispose(); p.sprite.material.dispose(); if (p.hi) p.hi.tex.dispose();
  photos.splice(photos.indexOf(p), 1); sprites.splice(sprites.indexOf(p.sprite), 1); delete photoById[id];
  if (hover === p) setHover(null);
}
function removeArrival(id) {
  cron.delete(id); const qi = arrQueue.findIndex(x => x.id === id); if (qi >= 0) arrQueue.splice(qi, 1);
  if (arrivo && arrivo.a.id === id) { scene.remove(arrivo.linea, arrivo.onda); arrivo = null; $('arrivo').classList.remove('on'); }
  if (photoById[id]) { removePhoto(id); arrivate--; }
  renderCron(); counts();
}
function letta(id, dato) {   // il lettore ha letto una foto: prende il suo posto definitivo
  const p = photoById[id]; if (!p || !dato) return;
  const a = cron.get(id); if (a) a.dato = dato;
  if (p.hold) { p.f = dato; return; }
  if (fuoco && (fuoco.p === p || fuoco.sorelle.includes(p))) { p.pending = dato; return; }   // la applico quando si torna alla nebulosa
  aggiornaFoto(p, dato); counts(); renderCron();
}
function toast(a) {
  const p = photoById[a.id]; if (!p) return;
  const el = document.createElement('div'); el.className = 'toast'; el.style.borderColor = cssA(p.col, .6);
  el.innerHTML = `<img src="${thumbSrc(a.id)}" alt="" style="box-shadow:0 0 0 2px ${css(p.col)}"><div><div class="k">Nuova foto${a.nome ? ' · ' + esc(a.nome) : ''}</div><div class="w">${esc(a.frase || 'è entrata nella memoria')}</div></div>`;
  el.onclick = () => vola(photoById[a.id]);
  $('toasts').prepend(el);
  while ($('toasts').children.length > 4) $('toasts').lastChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 700); }, 11000);
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-elimina]'); if (!b) return;
  e.stopPropagation();
  if (!confirm('Rimuovere questa foto dalla nebulosa? Verrà cancellata anche dal computer.')) return;
  await fetch('/api/elimina', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.dataset.elimina }) });
}, true);

// ---------------- la cronologia ----------------
function quando(q) {
  if (!q) return '';
  const [d, h] = q.split(' '), n = new Date(), oggi = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
  return (d === oggi ? 'oggi' : d.slice(8, 10) + '/' + d.slice(5, 7)) + ' ' + h.slice(0, 5);
}
function renderCron() {
  const list = [...cron.values()].reverse();
  $('cronN').textContent = list.length ? '· ' + list.length : '';
  if (!$('cron').classList.contains('open')) return;
  $('cronC').innerHTML = (online ? '<span style="color:#7fd38a">● in diretta</span>' : '<span style="color:#e6a08c">○ mi sto ricollegando…</span>') + ' · ' +
    (list.length === 1 ? '1 foto arrivata' : list.length + ' foto arrivate') + (QUI && list.length ? '<br><button id="cronAll">Rimuovi tutte</button>' : '');
  $('cronL').innerHTML = list.length ? list.map(a => {
    const p = photoById[a.id], c = p ? css(p.col) : '#999', att = arrQueue.some(x => x.id === a.id) || (arrivo && arrivo.a.id === a.id);
    return `<div class="ci" data-apri="${a.id}"><img src="${thumbSrc(a.id)}" alt="" loading="lazy" style="box-shadow:0 0 0 2px ${c}"><div style="flex:1;min-width:0"><div class="k">${esc(a.nome || 'anonimo')} · ${quando(a.quando)}${att ? ' · <span class="att">sta entrando</span>' : ''}${p && p.f.provv ? ' · posto provvisorio' : p ? ' · letta' : ''}</div>` +
      `<div class="w">${p && p.f.lettura ? esc(p.f.lettura) : a.frase ? '«' + esc(a.frase) + '»' : ''}</div>${QUI ? `<button data-elimina="${a.id}">Rimuovi</button>` : ''}</div></div>`;
  }).join('') : '<div class="vuota">Ancora nessuna foto. Inquadra il QR code con un telefono: ogni foto che arriva comparirà qui, con chi l\'ha mandata e quando.</div>';
}
$('cronbtn').onclick = () => { $('qr').classList.remove('open'); $('cron').classList.toggle('open'); renderCron(); };
$('cronx').onclick = () => $('cron').classList.remove('open');
$('cronL').addEventListener('click', e => { if (e.target.closest('button')) return; const it = e.target.closest('[data-apri]'); if (!it) return; const p = photoById[it.dataset.apri]; if (p && !p.hold) { $('cron').classList.remove('open'); vola(p); } });
$('cron').addEventListener('click', async e => {
  if (e.target.id !== 'cronAll') return;
  if (!confirm('Rimuovere tutte le ' + cron.size + ' foto arrivate dai telefoni? Verranno cancellate anche dal computer.')) return;
  for (const id of [...cron.keys()]) await fetch('/api/elimina', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {});
});
let inViaggio = 0, chiViaggia = '';
function viaggio(d, nome) {
  inViaggio = Math.max(0, inViaggio + d); if (nome != null) chiViaggia = nome;
  $('inarr').textContent = '● Una foto sta arrivando' + (chiViaggia ? ' da ' + chiViaggia : '') + (inViaggio > 1 ? ' (+' + (inViaggio - 1) + ')' : '') + '…';
  $('inarr').classList.toggle('on', inViaggio > 0 && !arrivo);
}
setInterval(() => $('inarr').classList.toggle('on', inViaggio > 0 && !arrivo), 500);
function arrivata(a, animate) { if (!cron.has(a.id)) { cron.set(a.id, a); arrivate++; } addArrival(a, animate); renderCron(); }
if (LIVE) {
  fetch('/api/arrivi', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(list => {
    // ?prova-arrivo nell'indirizzo: rifa' l'ingresso dell'ultima foto arrivata
    const prova = /prova-arrivo/.test(location.search) && list.length ? list.pop() : null;
    list.forEach(a => arrivata(a, false));
    if (prova) { cron.set(prova.id, prova); arrivate++; removePhoto(prova.id); setTimeout(() => { addArrival(prova, true); renderCron(); }, 4800); }
    counts();
  }).catch(() => {});
  const conn = () => {
    const es = new EventSource('/api/eventi');
    es.onopen = () => setOnline(true);
    es.addEventListener('inarrivo', e => { viaggio(+1, JSON.parse(e.data).nome || ''); setTimeout(() => viaggio(-1), 30000); });
    es.addEventListener('annullata', () => viaggio(-1));
    es.addEventListener('foto', e => { viaggio(-1); arrivata(JSON.parse(e.data), true); });
    es.addEventListener('letta', e => { const d = JSON.parse(e.data); letta(d.id, d.dato); });
    es.addEventListener('rimossa', e => removeArrival(JSON.parse(e.data).id));
    es.onerror = () => { setOnline(false); es.close(); setTimeout(conn, 2000); };
  };
  conn();
  // per sicurezza ogni 5 secondi controllo l'elenco: se la diretta si e' persa qualcosa (un arrivo, una lettura), lo recupero
  setInterval(() => fetch('/api/arrivi', { cache: 'no-store' }).then(r => r.json()).then(list => {
    const ids = new Set(list.map(a => a.id));
    list.forEach(a => {
      if (!cron.has(a.id)) arrivata(a, true);
      else if (a.dato && !a.dato.provv && photoById[a.id] && photoById[a.id].f.provv) letta(a.id, a.dato);
    });
    [...cron.keys()].forEach(id => { if (!ids.has(id)) removeArrival(id); });
  }).catch(() => setOnline(false)), 5000);
}
function setOnline(v) { online = v; $('liveDot').classList.toggle('on', v); $('liveDot').title = v ? 'in diretta' : 'non collegata'; renderCron(); }
$('qrbtn').onclick = async () => {
  $('cron').classList.remove('open');
  $('qr').classList.toggle('open');
  if (!$('qr').classList.contains('open')) return;
  if (!LIVE) { $('qrurl').textContent = 'Apri la nebulosa con «Apri la nebulosa.command» per ricevere foto dai telefoni.'; return; }
  try {
    const inf = await (await fetch('/api/info')).json();
    $('qrurl').textContent = inf.carica; counts();
    const drawQR = () => { $('qrcode').innerHTML = ''; new QRCode($('qrcode'), { text: inf.carica, width: 180, height: 180, colorDark: '#06050a', colorLight: '#ffffff' }); };
    if (window.QRCode) drawQR();
    else { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; sc.onload = drawQR; sc.onerror = () => { $('qrcode').textContent = 'QR non disponibile senza internet: usa l’indirizzo qui sotto.'; $('qrcode').style.cssText += ';color:#06050a;font-size:12px;text-align:center'; }; document.head.appendChild(sc); }
  } catch (e) { $('qrurl').textContent = 'Il server non risponde.'; }
};
$('qrx').onclick = () => $('qr').classList.remove('open');

// il QR fisso nell'angolo
if (LIVE) fetch('/api/info').then(r => r.json()).then(inf => {
  const disegna = () => { $('qrfc').innerHTML = ''; new QRCode($('qrfc'), { text: inf.carica, width: 92, height: 92, colorDark: '#06050a', colorLight: '#ffffff' }); $('qrfisso').classList.add('on'); };
  if (window.QRCode) disegna();
  else { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; sc.onload = disegna; document.head.appendChild(sc); }
}).catch(() => {});

counts();
cv.style.cursor = 'grab';
requestAnimationFrame(frame);

// ---------------- la mano: si esplora la nebulosa senza segni con le dita, vista dalla webcam (MediaPipe) ----------------
// conta solo dove sta la mano, e se resta ferma:
// - la mano diventa una luce sullo schermo, attirata dalla foto piu' vicina (una calamita: non serve centrarla)
// - tenendo la mano ferma su una foto un anello si riempie e si vola dentro; dentro, lo stesso con le sorelle
// - la mano verso i bordi fa girare piano la nebulosa da quella parte; al centro sta ferma
// - abbassando la mano (fuori dall'inquadratura) per due secondi si torna alla nebulosa
// Le immagini della webcam restano dentro il browser: non vengono salvate ne' inviate.
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODELLO_MANO = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const OSSA_MANO = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
const SOSTA_MANO = 1500;      // quanto tenere ferma la mano su una foto per entrarci (ms)
const VIA_MANO = 2000;        // quanto tempo senza mano per tornare alla nebulosa (ms)
const mano = { vista: false, ultima: -1e9, x: .5, y: .5, vx: .5, vy: .5, bersaglio: null, da: 0, carica: 0, due: false, vistaDue: 0, ultimaDue: 0, storia: [], d0: 1, r0: 34, dd: 1, pa: null, pb: null };
let rilevatore = null, ultimoVideo = -1, ultimoPasso = 0;
const video = $('manoVideo'), anteprima = $('manoCanvas'), ctxAnte = anteprima.getContext('2d');

// senza webcam (assente, negata, pagina non sicura, librerie non raggiunte) la mano sparisce e si naviga con il mouse
function senzaMano() { rilevatore = null; $('mano').classList.add('assente'); }
async function avviaMano() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return senzaMano();   // succede su http fuori da localhost
  try {
    const { FilesetResolver, HandLandmarker } = await import(MP + '/vision_bundle.mjs');
    const files = await FilesetResolver.forVisionTasks(MP + '/wasm');
    rilevatore = await HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODELLO_MANO, delegate: 'GPU' },
      runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .4, minHandPresenceConfidence: .4, minTrackingConfidence: .4,   // soglie basse: una mano di lato o in ombra non sparisce per un attimo
    });
    await apriCamera(memo('nebulosa-camera'));
  } catch (e) {
    senzaMano();
  }
}
async function apriCamera(id) {
  if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
  const vincoli = { width: { ideal: 1280 }, height: { ideal: 720 }, ...(id ? { deviceId: { exact: id } } : { facingMode: 'user' }) };   // piu' definita: anche da lontano le mani hanno abbastanza pixel
  let flusso;
  try { flusso = await navigator.mediaDevices.getUserMedia({ video: vincoli, audio: false }); }
  catch (e) { if (id) return apriCamera(null); return senzaMano(); }
  video.srcObject = flusso; await video.play();
  // l'elenco delle telecamere (i nomi si vedono solo dopo il permesso): se non ne ho scelta una, preferisco quella del Mac
  const camere = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
  const attuale = flusso.getVideoTracks()[0].getSettings().deviceId;
  if (!id) { const mac = camere.find(c => /facetime|integrat|built/i.test(c.label)); if (mac && mac.deviceId !== attuale) return apriCamera(mac.deviceId); }
  $('manoCamera').innerHTML = camere.map(c => `<option value="${c.deviceId}"${c.deviceId === attuale ? ' selected' : ''}>${esc(c.label || 'telecamera')}</option>`).join('');
  $('manoStato').textContent = 'Alza una mano davanti allo schermo';
}
$('manoCamera').onchange = e => { memo('nebulosa-camera', e.target.value); apriCamera(e.target.value); };
addEventListener('keydown', e => { if (e.key === 'v' || e.key === 'V') $('mano').classList.toggle('nascosta'); });

// dove sta la mano: il centro del palmo (polso e nocche), che non cambia se le dita si muovono
function palmo(L) {
  const k = [0, 5, 9, 13, 17];
  return { x: k.reduce((s, i) => s + L[i].x, 0) / 5, y: k.reduce((s, i) => s + L[i].y, 0) / 5 };
}
function leggiMano(now) {
  if (window.__manoFinta !== undefined) {   // per provare senza webcam: una mano finta (o due) messa dalla console (null = nessuna mano)
    const f = window.__manoFinta, mani = !f ? [] : Array.isArray(f[0]) ? f : [f];
    return { L: mani.slice().sort((a, b) => taglia(b) - taglia(a))[0] || null, mani, lati: window.__latiFinti || [] };
  }
  if (!rilevatore || video.readyState < 2 || video.currentTime === ultimoVideo) return null;
  ultimoVideo = video.currentTime;
  const r = rilevatore.detectForVideo(video, now);
  // la mano che comanda: la piu' grande, cioe' la piu' vicina
  let L = null, best = 0;
  (r.landmarks || []).forEach(m => { const s = Math.hypot(m[0].x - m[9].x, m[0].y - m[9].y); if (s > best) { best = s; L = m; } });
  disegnaAnteprima(r.landmarks || [], L);
  const lati = (r.handedness || r.handednesses || []).map(h => h && h[0] ? h[0].categoryName : null);   // «Left» o «Right»
  return { L, mani: r.landmarks || [], lati };
}
const taglia = m => Math.hypot(m[0].x - m[9].x, m[0].y - m[9].y);   // quanto e' grande una mano nell'inquadratura

// ---------------- lo zoom con due mani: allargarle avvicina, stringerle allontana ----------------
// conta solo la distanza tra i due palmi, misurata in «mani» (divisa per la grandezza delle mani): cosi' non cambia
// se la persona si avvicina o si allontana dalla webcam. Nessuna forma delle dita
const ENTRA_DUE = 120, ESCE_DUE = 500;   // ms: quanto devono vedersi due mani per entrare nello zoom, quanto una puo' sparire prima di uscirne
function dueMani(mani, lati) {   // le due mani piu' grandi (le piu' vicine), con palmo, grandezza e lato
  return mani.map((m, i) => i).sort((a, b) => taglia(mani[b]) - taglia(mani[a])).slice(0, 2).map(i => ({ p: palmo(mani[i]), t: taglia(mani[i]), lato: lati && lati[i] }));
}
function veraCoppia(c) {         // due mani vere, non la stessa vista due volte (stesso lato e quasi nello stesso punto)
  if (c.length < 2) return false;
  const d = Math.hypot(c[0].p.x - c[1].p.x, c[0].p.y - c[1].p.y);
  return d >= .07 && !(c[0].lato && c[0].lato === c[1].lato && d < .15);
}
const misura = c => Math.hypot(c[0].p.x - c[1].p.x, c[0].p.y - c[1].p.y) / Math.max(.02, (c[0].t + c[1].t) / 2);
function aggiornaDueMani(mani, lati, now) {
  const c = dueMani(mani, lati), due = veraCoppia(c);
  if (due) { mano.vistaDue = mano.vistaDue || now; mano.ultimaDue = now; } else mano.vistaDue = 0;
  if (!mano.due && due && now - mano.vistaDue >= ENTRA_DUE) {
    mano.due = true; mano.storia = []; mano.dd = mano.d0 = misura(c); mano.r0 = camera.position.distanceTo(controls.target);
    mano.bersaglio = null; mano.carica = 0; setHover(null);
  } else if (mano.due && !due && now - mano.ultimaDue > ESCE_DUE) mano.due = false;   // una mano persa per un attimo: lo zoom resta fermo, non esce
  if (mano.due && due) {
    // un valore isolato fuori posto (una mano persa o scambiata per un solo fotogramma) lo toglie la mediana degli ultimi tre;
    // un cambiamento vero passa subito, solo ammorbidito
    mano.storia.push(misura(c)); if (mano.storia.length > 3) mano.storia.shift();
    const med = mano.storia.slice().sort((a, b) => a - b)[Math.floor(mano.storia.length / 2)];
    mano.dd += (med - mano.dd) * .5;
    mano.pa = c[0].p; mano.pb = c[1].p;
  }
}
function zoomDueMani() {
  if (fuoco && (!fuoco.arrivato || fuoco.uscita)) return;   // durante un volo la camera e' gia' in movimento
  // da quando le mani si sono alzate insieme: il doppio della distanza tra i palmi = quattro volte piu' vicino,
  // cosi' basta aprire le mani poco piu' delle spalle e restano dentro l'inquadratura
  const vicino = fuoco ? 2.2 : 3, lontano = fuoco ? 14 : 200;
  const voluto = clamp(mano.r0 * Math.pow(mano.d0 / Math.max(mano.dd, .05), 2), vicino, lontano);
  const R = camera.position.distanceTo(controls.target), k = (R + (voluto - R) * .2) / R;
  // ci si avvicina al punto che le mani indicano (a meta' tra i due palmi), come allargando due dita su una foto:
  // quel punto resta fermo sullo schermo e tutto il resto si allarga intorno. Dentro una foto aperta resta lei al centro
  zP.copy(controls.target);
  if (!fuoco && mano.pa) {
    const s = sulloSchermo({ x: (mano.pa.x + mano.pb.x) / 2, y: (mano.pa.y + mano.pb.y) / 2 });
    camera.updateMatrixWorld();   // la camera com'e' adesso, non com'era all'ultimo disegno
    zDir.set(s.x / innerWidth * 2 - 1, 1 - s.y / innerHeight * 2, .5).unproject(camera).sub(camera.position).normalize();
    camera.getWorldDirection(zAvanti);
    zP.copy(camera.position).addScaledVector(zDir, R / Math.max(.2, zDir.dot(zAvanti)));   // il punto indicato, alla profondita' del centro della vista
  }
  controls.target.sub(zP).multiplyScalar(k).add(zP);
  camera.position.sub(zP).multiplyScalar(k).add(zP);
}
const zP = new THREE.Vector3(), zDir = new THREE.Vector3(), zAvanti = new THREE.Vector3();
const sulloSchermo = q => ({ x: clamp((1 - q.x - .18) / .64, 0, 1) * innerWidth, y: clamp((q.y - .15) / .6, 0, 1) * innerHeight });

// la calamita: la foto (visibile) piu' vicina al punto della mano, sullo schermo
const proiezione = new THREE.Vector3();
function piuVicina(x, y) {
  const R = Math.max(70, innerWidth * .06);
  const candidate = fuoco && fuoco.arrivato && !fuoco.uscita ? fuoco.sorelle : photos;
  let best = null, bd = R;
  for (const p of candidate) {
    if (p.hold || p.sprite.material.opacity < .5) continue;
    proiezione.copy(p.sprite.position).project(camera);
    if (proiezione.z > 1) continue;   // dietro la camera
    const d = Math.hypot((proiezione.x + 1) / 2 * innerWidth - x, (1 - proiezione.y) / 2 * innerHeight - y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
const schermoDi = p => { proiezione.copy(p.sprite.position).project(camera); return { x: (proiezione.x + 1) / 2 * innerWidth, y: (1 - proiezione.y) / 2 * innerHeight }; };

const sferica = new THREE.Spherical(), scarto = new THREE.Vector3();
function giraVersoLaMano(dt) {
  if (fuoco) return;                                   // dentro una foto la mano serve a scegliere le sorelle
  const ox = mano.x - .5, oy = mano.y - .5, d = Math.hypot(ox, oy);
  const forza = sstep(.2, .46, d) * (mano.carica > 0 ? .25 : 1);   // al centro ferma; piu' piano mentre si sta entrando in una foto
  if (forza <= 0) return;
  scarto.copy(camera.position).sub(controls.target); sferica.setFromVector3(scarto);
  sferica.theta -= ox / d * forza * .4 * dt;           // mano a destra: la galassia gira verso destra
  sferica.phi = clamp(sferica.phi - oy / d * forza * .25 * dt, .35, Math.PI - .35);
  scarto.setFromSpherical(sferica); camera.position.copy(controls.target).add(scarto);
}

function passoMano(now) {
  const dt = Math.min(.1, (now - (ultimoPasso || now)) / 1000); ultimoPasso = now;
  const r = leggiMano(now);
  if (r) {
    if (r.L) {
      const pt = palmo(r.L);
      // la webcam e' a specchio; la zona centrale dell'inquadratura copre tutto lo schermo
      const tx = clamp((1 - pt.x - .18) / .64, 0, 1), ty = clamp((pt.y - .15) / .6, 0, 1);
      if (!mano.vista) { mano.x = tx; mano.y = ty; }
      mano.x += (tx - mano.x) * .3; mano.y += (ty - mano.y) * .3;
      mano.vista = true; mano.ultima = now; ultimoTocco = now;
      controls.autoRotate = false; clearTimeout(fermo);
    } else if (mano.vista && now - mano.ultima > 350) {
      mano.vista = false; mano.due = false; mano.vistaDue = 0; mano.bersaglio = null; mano.carica = 0; setHover(null); riprendiGiro();
    }
  }
  // senza mano per un po': si torna alla nebulosa (solo se ci si era entrati con la mano)
  // vale anche per la foto appena arrivata dal QR, se mentre si e' dentro una mano e' stata vista (se nessuno c'e', la foto nuova resta i suoi 20 secondi)
  if (!mano.vista && fuoco && !fuoco.uscita && fuoco.arrivato && mano.ultima >= fuoco.t0 - 500 && now - mano.ultima > VIA_MANO) { torna(); }
  if (r) aggiornaDueMani(r.mani || [], r.lati, now);   // anche quando una mano sparisce: serve a capire quanto e' stata via
  if (mano.vista && !arrivo && mano.due) zoomDueMani();
  else if (mano.vista && !arrivo) {
    giraVersoLaMano(dt);
    const hx = mano.x * innerWidth, hy = mano.y * innerHeight;
    const b = (fuoco && (!fuoco.arrivato || fuoco.uscita)) ? null : piuVicina(hx, hy);
    if (b !== mano.bersaglio) { mano.bersaglio = b; mano.da = now; mano.carica = 0; setHover(b); }
    // la mano deve restare piu' o meno ferma: se si sposta molto, l'anello ricomincia
    const mosso = Math.hypot(hx - mano.vx * innerWidth, hy - mano.vy * innerHeight);
    if (mosso > Math.max(40, innerWidth * .035)) { mano.vx = mano.x; mano.vy = mano.y; mano.da = now; }
    if (b) {
      mano.carica = clamp((now - mano.da) / SOSTA_MANO, 0, 1);
      if (mano.carica >= 1) { regia.ritorno = 0; mano.bersaglio = null; mano.carica = 0; vola(b); setHover(null); }   // esplora chi ha la mano: niente ritorno automatico
    } else mano.carica = 0;
  }
  aggiornaCursore(now);
}
function aggiornaCursore(now) {
  const c = $('manoCursore');
  c.classList.toggle('on', mano.vista && !arrivo && !mano.due);
  // con due mani: una luce per palmo e un filo tra loro
  const dm = $('manoDue'); dm.classList.toggle('on', !!(mano.vista && !arrivo && mano.due && mano.pa));
  if (mano.due && mano.pa) {
    const a = sulloSchermo(mano.pa), b = sulloSchermo(mano.pb), [ia, ib] = dm.querySelectorAll('i'), l = dm.querySelector('b');
    ia.style.transform = `translate(${a.x}px,${a.y}px)`; ib.style.transform = `translate(${b.x}px,${b.y}px)`;
    l.style.width = Math.hypot(b.x - a.x, b.y - a.y) + 'px'; l.style.transform = `translate(${a.x}px,${a.y}px) rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`;
  }
  c.classList.toggle('aggancio', !!mano.bersaglio);
  // la luce va verso la foto agganciata (si vede che la calamita l'ha presa)
  let x = mano.x * innerWidth, y = mano.y * innerHeight;
  if (mano.bersaglio) { const s = schermoDi(mano.bersaglio); x += (s.x - x) * .85; y += (s.y - y) * .85; }
  c.style.transform = `translate(${x}px, ${y}px)`;
  c.style.setProperty('--p', (mano.carica * 100).toFixed(1) + '%');
  // la frase di aiuto: cambia secondo quello che si puo' fare adesso
  const aiuto = !mano.vista || arrivo ? '' : mano.due ? 'Due mani: allargale per avvicinarti, stringile per allontanarti' : fuoco && !fuoco.uscita ? (mano.bersaglio ? 'Tieni ferma la mano per passare a questa foto' : 'Porta la mano su una sorella · abbassala per tornare')
    : mano.bersaglio ? 'Tieni ferma la mano: stai entrando in questa foto' : 'Muovi la mano: la luce si aggancia alle foto · verso i bordi la galassia gira';
  if ($('manoAiuto').textContent !== aiuto) $('manoAiuto').textContent = aiuto;
  $('manoAiuto').classList.toggle('on', !!aiuto);
  $('manoStato').textContent = !rilevatore ? $('manoStato').textContent : mano.vista ? (mano.due ? 'due mani: zoom' : mano.bersaglio ? 'mano agganciata a una foto' : 'mano vista') : 'nessuna mano';
}
function disegnaAnteprima(mani, principale) {
  const W2 = anteprima.width, H2 = anteprima.height;
  ctxAnte.save(); ctxAnte.translate(W2, 0); ctxAnte.scale(-1, 1);   // a specchio, come uno specchio vero
  ctxAnte.drawImage(video, 0, 0, W2, H2);
  // la zona dell'inquadratura che copre tutto lo schermo
  ctxAnte.strokeStyle = 'rgba(255,255,255,.25)'; ctxAnte.setLineDash([4, 4]); ctxAnte.strokeRect(.18 * W2, .15 * H2, .64 * W2, .6 * H2); ctxAnte.setLineDash([]);
  for (const m of mani) {
    const on = m === principale;
    ctxAnte.strokeStyle = on ? 'rgba(160,210,255,.95)' : 'rgba(255,255,255,.35)'; ctxAnte.lineWidth = 2;
    for (const [a, b] of OSSA_MANO) { ctxAnte.beginPath(); ctxAnte.moveTo(m[a].x * W2, m[a].y * H2); ctxAnte.lineTo(m[b].x * W2, m[b].y * H2); ctxAnte.stroke(); }
    if (on) { const p = palmo(m); ctxAnte.fillStyle = '#ffd9a0'; ctxAnte.beginPath(); ctxAnte.arc(p.x * W2, p.y * H2, 5, 0, TAU); ctxAnte.fill(); }
  }
  ctxAnte.restore();
}
avviaMano();

window.__mano = { mano, piuVicina, palmo, passoMano };   // per provare dalla console
window.__nebulosa = { photos, photoById, camera, controls, setHover, vola, torna, regia, legami, verso, SOLE, get fuoco() { return fuoco; }, get palette() { return palette; } };   // per provare dalla console
