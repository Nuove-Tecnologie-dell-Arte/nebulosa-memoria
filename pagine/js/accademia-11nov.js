import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';

// L'ACCADEMIA: la nebulosa dentro il piano vero dell'Accademia di Belle Arti, ricostruito in 3D (un Gaussian Splat).
// Il piano e' un chiostro: un corridoio ad anello intorno al cortile, con le arcate da una parte e il muro dall'altra.
// Le foto sono bolle di luce che galleggiano lungo il corridoio: le foto che si somigliano stanno vicine, una dopo l'altra
// lungo l'anello. Ci si cammina dentro: con le mani (due mani che si allargano = avanti), con le frecce o WASD, trascinando
// per guardarsi intorno. Quando nessuno la usa, la camera fa da sola il giro del chiostro.
// Il modello e i corridoi li prepara strumenti/prepara_modello.py (modello/accademia.splat e modello/corridoi.json).

const D = window.NEBULOSA;
const $ = id => document.getElementById(id);
if (!D) {
  const m = document.createElement('div');
  m.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:70;max-width:440px;padding:22px 24px;background:#131116;border:1px solid rgba(240,138,100,.5);color:#ece6e1;font:300 14px/1.6 Jost,sans-serif';
  m.innerHTML = '<b style="font-weight:400;color:#f08a64">Mancano i dati della nebulosa.</b><br>Apri la nebulosa con <code>Apri la nebulosa.bat</code>, oppure lancia <code>python programma/genera_dati.py</code>.';
  document.body.appendChild(m);
  throw new Error('dati mancanti');
}
const thumbSrc = id => '/foto/thumb/' + id + '.jpg';
const fullSrc = id => '/foto/full/' + id + '.jpg';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAU = Math.PI * 2;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TELEFONO = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
const easeIO = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const seme = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296; };
const memo = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
const avvolgi = a => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------- le misure ----------------
// Il modello e' piccolo (il corridoio e' largo 0,2 unita'): sullo schermo ogni sua unita' vale SCALA, cosi' il corridoio e' largo
// circa 2 e alto quasi 3, e le misure (occhi, bolle, passi) sono quelle di una persona.
const SCALA = 10;
const OCCHI = .95;              // l'altezza degli occhi dal pavimento
const PASSO = 1.3;              // la velocita' di chi cammina (unita' al secondo)
const PASSO_GIRO = .42;         // la velocita' del giro da solo, piu' lenta
const RIPOSO = 15000;           // dopo quanto tempo senza nessuno riparte il giro da solo (ms)

const cv = $('c');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false });
// la qualita': di solito il modello intero (2,3 milioni di macchie, il corridoio con tutti i dettagli);
// con ?qualita=bassa nell'indirizzo quello leggero (le 900.000 macchie piu' importanti), per i computer che non ce la fanno
const ALTA = new URLSearchParams(location.search).get('qualita') !== 'bassa';
// la risoluzione si adatta da sola: se i fotogrammi sono lenti si disegna con meno pixel, se sono veloci con di piu'
// (mai sotto i tre quarti: piu' in basso il corridoio diventa sfocato)
const RISOLUZIONE = { ora: Math.min(devicePixelRatio || 1, 1), min: .75, max: Math.min(devicePixelRatio || 1, TELEFONO ? 1.25 : 1.5), tempi: [] };
renderer.setPixelRatio(RISOLUZIONE.ora);
function adattaRisoluzione(dt) {
  const R = RISOLUZIONE; R.tempi.push(dt); if (R.tempi.length < 45) return;
  const medio = R.tempi.reduce((a, b) => a + b, 0) / R.tempi.length; R.tempi = [];
  let nuova = R.ora;
  if (medio > 1 / 28 && R.ora > R.min) nuova = Math.max(R.min, R.ora - .12);          // sotto i 28 fotogrammi al secondo: meno pixel
  else if (medio < 1 / 55 && R.ora < R.max) nuova = Math.min(R.max, R.ora + .08);      // sopra i 55: un po' piu' definita
  if (nuova !== R.ora) { R.ora = nuova; renderer.setPixelRatio(nuova); resize(); }
}
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x06050a);
const camera = new THREE.PerspectiveCamera(68, 1, .03, 400);
camera.rotation.order = 'YXZ';
// maxPixelRadius: le macchie vicinissime (contro un muro) non diventano enormi sullo schermo, che e' la cosa piu' lenta da disegnare
// (le macchie restano intere: tagliarne i bordi le fa sembrare piu' rade)
const spark = new SparkRenderer({ renderer, maxPixelRadius: 400 });
scene.add(spark);
const materialiFili = [];
function resize() { const w = innerWidth, h = innerHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); materialiFili.forEach(m => m.resolution.set(w, h)); }
addEventListener('resize', resize); resize();

// ---------------- il corridoio ad anello ----------------
// La linea centrale del corridoio e' un rettangolo (nel modello: x0, y0, x1, y1; asse z verso l'alto).
// Sullo schermo: x resta x, l'alto del modello (z) diventa y, e y del modello diventa -z.
let A = { x0: -9.96, x1: 8.89, z0: -.52, z1: 20.06 }, MEZZA = .6, LIM = .5, PERIMETRO = 1;
function impostaAnello(c) {
  const [x0, y0, x1, y1] = c.anello;
  A = { x0: x0 * SCALA, x1: x1 * SCALA, z0: -y1 * SCALA, z1: -y0 * SCALA };
  MEZZA = c.mezza_larghezza * SCALA;
  LIM = MEZZA * .82;                         // fin dove si puo' camminare: non si tocca il muro
  PERIMETRO = 2 * ((A.x1 - A.x0) + (A.z1 - A.z0));
}
impostaAnello({ anello: [-.996, -2.006, .889, .052], mezza_larghezza: .06 });
const lati = () => [[A.x0, A.z0, A.x1, A.z0], [A.x1, A.z0, A.x1, A.z1], [A.x1, A.z1, A.x0, A.z1], [A.x0, A.z1, A.x0, A.z0]];
// un punto della linea centrale (t da 0 a 1 lungo l'anello), con la direzione del corridoio (tx, tz) e quella verso il cortile (nx, nz)
function puntoAnello(t) {
  let s = (((t % 1) + 1) % 1) * PERIMETRO;
  for (const [ax, az, bx, bz] of lati()) {
    const L = Math.hypot(bx - ax, bz - az);
    if (s <= L || bx === A.x0 && bz === A.z0) {
      const u = Math.min(1, s / L), tx = (bx - ax) / L, tz = (bz - az) / L;
      return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, tx, tz, nx: -tz, nz: tx };
    }
    s -= L;
  }
}
// il punto della linea centrale piu' vicino a (x, z): dove sta, a che t, e quanto e' lontano
function vicinoAnello(x, z) {
  let best = null, s0 = 0;
  for (const [ax, az, bx, bz] of lati()) {
    const L = Math.hypot(bx - ax, bz - az), u = clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (L * L), 0, 1);
    const px = ax + (bx - ax) * u, pz = az + (bz - az) * u, d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) best = { px, pz, d, t: (s0 + u * L) / PERIMETRO, tx: (bx - ax) / L, tz: (bz - az) / L };
    s0 += L;
  }
  return best;
}
// un punto nel corridoio a «d» passi prima di «v», dalla parte da cui arriva chi cammina (lungo l'anello, dal lato piu' corto)
function davantiA(v, d) {
  const n = vicinoAnello(v.x, v.z), da = vicinoAnello(cam.pos.x, cam.pos.z);
  let verso = n.t - da.t; if (verso > .5) verso -= 1; if (verso < -.5) verso += 1;
  const s = verso >= 0 ? -1 : 1;
  return dentro(new THREE.Vector3(v.x + n.tx * s * d, OCCHI, v.z + n.tz * s * d));
}
function dentro(v, lim = LIM) {   // riporta un punto dentro il corridoio (in pianta)
  const n = vicinoAnello(v.x, v.z);
  if (n.d > lim) { const k = lim / n.d; v.x = n.px + (v.x - n.px) * k; v.z = n.pz + (v.z - n.pz) * k; }
  return v;
}

// ---------------- il piano dell'Accademia: il Gaussian Splat ----------------
const caricato = (async () => {
  try { impostaAnello(await (await fetch('/modello/corridoi.json')).json()); } catch (e) { /* restano le misure scritte qui sopra */ }
  disponiTutte(); mettiAllInizio();
  const accademia = new SplatMesh({
    url: ALTA ? '/modello/accademia.splat' : '/modello/accademia-leggero.splat', fileType: 'splat',
    onProgress: e => { const u = e && e.total ? e.loaded / e.total : 0; $('caricoBarra').style.width = (u * 100).toFixed(1) + '%'; $('caricoTesto').textContent = u ? `carico il piano 3D… ${Math.round(u * 100)}%` : 'carico il piano 3D…'; },
  });
  accademia.rotation.x = -Math.PI / 2; accademia.scale.setScalar(SCALA);
  scene.add(accademia);
  try { await accademia.initialized; } catch (e) { $('caricoTesto').textContent = 'non riesco a caricare il piano 3D: manca modello/accademia.splat?'; return; }
  $('carico').classList.add('via');
  nascita = reduced ? -1e9 : performance.now();
  photos.forEach(p => { p.da.copy(p.fine); p.t0 = nascita + 300 + p.fine.distanceTo(cam.pos) * 160; p.dur = 1400; });
})();

// ---------------- i colori delle foto: la temperatura ----------------
const FUOCO = [[0, [70, 120, 255]], [.25, [150, 150, 235]], [.45, [230, 60, 40]], [.7, [255, 140, 30]], [.88, [255, 215, 90]], [1, [255, 250, 230]]];
function temperatura(t) {
  for (let k = 1; k < FUOCO.length; k++) if (t <= FUOCO[k][0] || k === FUOCO.length - 1) {
    const [a, ca] = FUOCO[k - 1], [b, cb] = FUOCO[k], u = clamp((t - a) / (b - a), 0, 1);
    return new THREE.Color().setRGB(...ca.map((v, i) => (v + (cb[i] - v) * u) / 255), THREE.SRGBColorSpace);
  }
}
function colore(p) {
  const [vi, qu, , sc] = p.f.mv;
  const c = temperatura(clamp(.5 + .55 * vi - .5 * qu + .1 * sc, 0, 1));
  return p.f.provv ? c.lerp(new THREE.Color(.78, .77, .75), .6) : c;   // non ancora letta: quasi grigia
}

// ---------------- dove stanno le bolle: lungo il corridoio ----------------
// La mappa delle somiglianze e' un cerchio: girando intorno al suo centro si passa da una foto a quelle che le somigliano.
// Quel giro diventa il giro del chiostro: l'angolo di ogni foto nella mappa dice in che punto dell'anello sta (in ordine,
// cosi' le foto sono sparse in modo uniforme). L'altezza viene dalla terza dimensione della mappa; di lato si spostano a
// caso, verso le arcate o verso il muro. Al centro del corridoio, all'altezza degli occhi, resta un passaggio libero.
const BOLLA = .2;                // la grandezza di una bolla
const DMIN = .34;                // la distanza minima tra due bolle
const ALTO = [.28, 2.3];         // tra che altezze galleggiano
let angoliMappa = [], altezzeMappa = [];
const angoloMappa = f => Math.atan2(f.y || 0, f.x || 0);
const altezzaMappa = f => (f.p || [])[2] || 0;
function rango(lista, x) { let lo = 0, hi = lista.length; while (lo < hi) { const m = (lo + hi) >> 1; if (lista[m] < x) lo = m + 1; else hi = m; } return lo; }
function postoNelCorridoio(p, v) {
  const f = p.f, r0 = seme(p.id + ' corridoio');
  const t = (rango(angoliMappa, angoloMappa(f)) + .5) / Math.max(1, angoliMappa.length) + (r0() - .5) * .004;
  const q = (rango(altezzeMappa, altezzaMappa(f)) + .5) / Math.max(1, altezzeMappa.length);
  const c = puntoAnello(t);
  let lat = (r0() < .5 ? -1 : 1) * (.18 + .3 * r0()) * MEZZA / .6, h = ALTO[0] + (ALTO[1] - ALTO[0]) * q;
  return libera(v.set(c.x + c.nx * lat, h, c.z + c.nz * lat));
}
function libera(v) {   // dentro il corridoio, non nel passaggio di chi cammina e mai sotto il pavimento o nel soffitto
  dentro(v, MEZZA * .78);
  v.y = clamp(v.y, ALTO[0], ALTO[1]);
  const n = vicinoAnello(v.x, v.z);
  if (n.d < .24 && v.y > .55 && v.y < 1.38) v.y = v.y < .97 ? .55 : 1.38;   // il passaggio libero all'altezza degli occhi
  return v;
}
const dx = new THREE.Vector3(), dy = new THREE.Vector3();
function spingi(ps, giri, mobili) {
  for (let g = 0; g < giri; g++) {
    for (let a = 0; a < ps.length; a++) for (let b = a + 1; b < ps.length; b++) {
      const P = ps[a].fine, Q = ps[b].fine, ex = P.x - Q.x; if (ex > DMIN || ex < -DMIN) continue;
      const ez = P.z - Q.z; if (ez > DMIN || ez < -DMIN) continue;
      const ey = P.y - Q.y, d2 = ex * ex + ey * ey + ez * ez; if (d2 >= DMIN * DMIN) continue;
      const ma = !mobili || mobili.has(ps[a]), mb = !mobili || mobili.has(ps[b]); if (!ma && !mb) continue;
      const d = Math.sqrt(d2);
      dx.set(ex, ey, ez); if (d < 1e-4) dx.set(Math.sin(a + g), Math.cos(a * b), Math.cos(b)); dx.setLength((DMIN - d) / (ma && mb ? 2 : 1));
      if (ma) P.add(dx); if (mb) Q.sub(dx);
    }
    ps.forEach(p => { if (!mobili || mobili.has(p)) libera(p.fine); });
  }
}
function disponiTutte() {
  const ps = photos.filter(p => !p.hold);
  angoliMappa = ps.map(p => angoloMappa(p.f)).sort((a, b) => a - b);
  altezzeMappa = ps.map(p => altezzaMappa(p.f)).sort((a, b) => a - b);
  ps.forEach(p => postoNelCorridoio(p, p.fine));
  spingi(ps, 60);
  ps.forEach(p => p.sprite.position.copy(p.fine));
}
function posizionaUna(p) {   // una foto nuova (o appena letta): il suo posto, senza spostare le altre
  postoNelCorridoio(p, p.fine);
  spingi(photos.filter(q => !q.hold || q === p), 40, new Set([p]));
}

// ---------------- le bolle ----------------
function disegnaSfera(c, S, col, im) {
  c.width = c.height = S; const x = c.getContext('2d'), k = S / 160;
  const [r, g, b] = col.toArray().map(v => Math.round(v * 255)), rgba = a => `rgba(${r},${g},${b},${a})`, R = S / 2 - 3 * k;
  const ok = im && im.complete && im.naturalWidth;
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
// l'alone di luce intorno a ogni bolla: nel corridoio la bolla fa un po' di luce
function texLuce(stops) {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); stops.forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const TEX_ALONE = texLuce([[0, 'rgba(255,255,255,.55)'], [.3, 'rgba(255,255,255,.18)'], [1, 'rgba(255,255,255,0)']]);
const TEX_PUNTO = texLuce([[0, 'rgba(255,255,255,1)'], [.35, 'rgba(255,255,255,.45)'], [1, 'rgba(255,255,255,0)']]);
const TEX_ANELLO = (() => { const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'); x.strokeStyle = '#fff'; x.lineWidth = 5; x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 6, 0, TAU); x.stroke(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const CODA = 48;
function ridisegna(p) { disegnaSfera(p.can, 160, p.col, p.img); p.tex.needsUpdate = true; p.alone.material.color.copy(p.col); if (p.hi) { p.hi.asp = disegnaIntera(p.hi.can, p.col, p.hi.img.complete && p.hi.img.naturalWidth ? p.hi.img : p.img); p.hi.tex.needsUpdate = true; } }
const photos = [], photoById = {}, sprites = [];
const DUR_MOSSA = 2600;
function makePhoto(id, f) {
  const p = { id, f, ph: seme(id)() * TAU, uPrev: 0, fine: new THREE.Vector3(), da: new THREE.Vector3(), t0: -1e9, dur: DUR_MOSSA, vis: 1 };
  p.col = colore(p);
  p.can = document.createElement('canvas'); disegnaSfera(p.can, 160, p.col, null);
  p.tex = new THREE.CanvasTexture(p.can); p.tex.colorSpace = THREE.SRGBColorSpace;
  p.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: p.tex, transparent: true, depthWrite: false, color: 0xf2f2f2 }));
  p.sprite.renderOrder = 10;   // dopo il piano 3D: le bolle sono luci, si vedono sopra le macchie del modello
  p.alone = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_ALONE, color: p.col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .5 }));
  p.alone.renderOrder = 9;
  p.base = BOLLA * (f.s || .9); p.sprite.scale.setScalar(p.base); p.sprite.userData.p = p;
  p.img = new Image(); p.img.onload = () => ridisegna(p); p.img.src = thumbSrc(id);
  scene.add(p.sprite, p.alone); photos.push(p); photoById[id] = p; sprites.push(p.sprite);
  return p;
}
function aggiornaFoto(p, f) {   // la foto e' stata letta: va al suo posto nel corridoio, con il suo colore
  p.f = f;
  p.da.copy(p.sprite.position); posizionaUna(p); p.t0 = performance.now();
  p.col = colore(p); p.base = BOLLA * (f.s || .9); ridisegna(p); p.lampo = performance.now() + 2200;
}
D.tutte.forEach(id => { if (D.foto[id]) makePhoto(id, D.foto[id]); });

// ---------------- i fili: i tag in comune ----------------
const MAX_FILI = 12;
function legami(p) {
  const ta = new Set(p.f.tag || []), w = new Map((p.f.vicine || []).map(([id, v]) => [id, v]));
  let out = ta.size ? photos.filter(q => q !== p && !q.hold && q.f.tag).map(q => [q, q.f.tag.reduce((n, t) => n + ta.has(t), 0)]).filter(x => x[1] > 0) : [];
  if (!out.length) out = [...w.keys()].map(id => photoById[id]).filter(q => q && !q.hold && q !== p).map(q => [q, 1]);
  return out.sort((a, b) => b[1] - a[1] || (w.get(b[0].id) || 0) - (w.get(a[0].id) || 0)).slice(0, MAX_FILI);
}
const vicineDi = p => legami(p).map(x => x[0]);
const fili = [1, 2, 3].map(n => {
  const g = new LineSegmentsGeometry(); g.setPositions(new Float32Array(MAX_FILI * 6));
  const m = new LineMaterial({ linewidth: [1.2, 2.2, 3.4][n - 1], transparent: true, depthWrite: false, color: 0xfff4e6, opacity: [.25, .4, .6][n - 1], blending: THREE.AdditiveBlending });
  materialiFili.push(m);
  const l = new LineSegments2(g, m); l.frustumCulled = false; l.visible = false; l.renderOrder = 8; scene.add(l);
  return l;
});
resize();
let filiDa = null, filiA = [];
let accese = null;
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

// ---------------- chi cammina: la camera ----------------
// cam: dove sta (in pianta) e dove guarda (yaw: a destra e sinistra, pitch: su e giu')
const cam = { pos: new THREE.Vector3(0, OCCHI, 0), yaw: 0, pitch: 0, vel: 0, lat: 0, giro: !reduced, dirGiro: 1 };
const yawDi = (x, z) => Math.atan2(-x, -z);   // lo yaw che guarda nella direzione (x, z)
function mettiAllInizio() {   // all'inizio: a meta' del primo lato lungo, guardando lungo il corridoio
  const c = puntoAnello(.125); cam.pos.set(c.x, OCCHI, c.z); cam.yaw = yawDi(c.tx, c.tz); cam.pitch = -.04;
}
mettiAllInizio();
const avantiDi = (yaw, v = new THREE.Vector3()) => v.set(-Math.sin(yaw), 0, -Math.cos(yaw));
let ultimoTocco = -1e9;
['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, e => {
  if (ev === 'pointermove' && !e.buttons) return;   // passare col mouse sopra non ferma il giro
  ultimoTocco = performance.now(); cam.giro = false;
}, { passive: true }));
// i tasti: frecce o WASD
const tasti = new Set();
addEventListener('keydown', e => { if (e.target.closest?.('input,select,textarea')) return; tasti.add(e.key.toLowerCase()); });
addEventListener('keyup', e => tasti.delete(e.key.toLowerCase()));
addEventListener('blur', () => tasti.clear());
// la rotella: qualche passo avanti o indietro
let spinta = 0;
cv.addEventListener('wheel', e => { e.preventDefault(); if (!fuoco) spinta = clamp(spinta - e.deltaY * .004, -2.5, 2.5); }, { passive: false });
// trascinare: guardarsi intorno
let trascina = null;
cv.addEventListener('pointerdown', e => { trascina = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch, mosso: 0 }; cv.setPointerCapture?.(e.pointerId); cv.style.cursor = 'grabbing'; });
cv.addEventListener('pointermove', e => {
  if (!trascina || fuoco) return;
  const ddx = e.clientX - trascina.x, ddy = e.clientY - trascina.y; trascina.mosso = Math.max(trascina.mosso, Math.hypot(ddx, ddy));
  cam.yaw = trascina.yaw + ddx * .0042; cam.pitch = clamp(trascina.pitch + ddy * .0032, -.75, .75);
});
const fineTrascina = () => { trascina = null; cv.style.cursor = hover ? 'pointer' : 'grab'; };
function passoCamminata(dt, now) {
  if (fuoco || viaggio || arrivo) return;
  const avanti = avantiDi(cam.yaw, dx), destra = dy.set(-avanti.z, 0, avanti.x);
  let vuole = 0, lato = 0;
  if (tasti.has('arrowup') || tasti.has('w')) vuole += 1;
  if (tasti.has('arrowdown') || tasti.has('s')) vuole -= 1;
  if (tasti.has('a')) lato -= 1;
  if (tasti.has('d')) lato += 1;
  if (tasti.has('arrowleft')) cam.yaw += 1.5 * dt;
  if (tasti.has('arrowright')) cam.yaw -= 1.5 * dt;
  if (spinta) { vuole += clamp(spinta, -1, 1); spinta *= Math.pow(.02, dt); if (Math.abs(spinta) < .02) spinta = 0; }
  if (mano.vista && mano.due) vuole += mano.cammina;
  // il giro da solo: dopo un po' che nessuno tocca niente, la camera cammina lungo il chiostro guardando avanti
  if (!cam.giro && now - ultimoTocco > RIPOSO && !mano.vista) { cam.giro = !reduced; const n = vicinoAnello(cam.pos.x, cam.pos.z); cam.dirGiro = (n.tx * avanti.x + n.tz * avanti.z) >= 0 ? 1 : -1; }
  if (cam.giro) {
    const n = vicinoAnello(cam.pos.x, cam.pos.z), avantiT = puntoAnello(n.t + cam.dirGiro * 1.6 / PERIMETRO);
    const voluto = yawDi(avantiT.x - cam.pos.x, avantiT.z - cam.pos.z);
    cam.yaw += avvolgi(voluto - cam.yaw) * Math.min(1, 1.2 * dt);
    cam.pitch += (-.04 - cam.pitch) * Math.min(1, dt);
    vuole = PASSO_GIRO / PASSO;
    // e piano piano verso il centro del corridoio
    cam.pos.x += (n.px - cam.pos.x) * .3 * dt; cam.pos.z += (n.pz - cam.pos.z) * .3 * dt;
  } else if (Math.abs(vuole) > .05 && mano.vista && mano.due) {
    // con le mani si gira male: camminando, lo sguardo segue il corridoio (nel verso piu' vicino a dove si guarda),
    // mirando a un punto un po' piu' avanti sulla linea centrale: cosi' negli angoli si gira da soli e non si va contro il muro
    const n = vicinoAnello(cam.pos.x, cam.pos.z), segno = (n.tx * avanti.x + n.tz * avanti.z) >= 0 ? 1 : -1;
    const meta = puntoAnello(n.t + segno * Math.sign(vuole) * 1.8 / PERIMETRO);
    let voluto = yawDi(meta.x - cam.pos.x, meta.z - cam.pos.z); if (vuole < 0) voluto += Math.PI;   // indietro: si guarda sempre avanti
    const scarto = avvolgi(voluto - cam.yaw);
    if (Math.abs(scarto) < 1.6) cam.yaw += scarto * Math.min(1, 1.6 * Math.abs(vuole) * dt);
    cam.pitch += (-.04 - cam.pitch) * Math.min(1, .8 * dt);
  }
  cam.vel += (clamp(vuole, -1, 1) * PASSO - cam.vel) * Math.min(1, 4 * dt);
  cam.lat += (lato * PASSO * .7 - cam.lat) * Math.min(1, 5 * dt);
  cam.pos.addScaledVector(avanti, cam.vel * dt).addScaledVector(destra, cam.lat * dt);
  dentro(cam.pos); cam.pos.y = OCCHI;
}
function applicaCamera() {
  if (fuoco || viaggio || arrivo) return;
  camera.position.copy(cam.pos); camera.rotation.set(cam.pitch, cam.yaw, 0);
}
function prendiDallaCamera() {   // dopo un volo: chi cammina riparte da dove la camera e' arrivata, guardando dove guardava
  const d = new THREE.Vector3(); camera.getWorldDirection(d);
  cam.pos.copy(camera.position); dentro(cam.pos); cam.pos.y = OCCHI;
  cam.yaw = yawDi(d.x, d.z); cam.pitch = clamp(Math.asin(clamp(d.y, -1, 1)), -.75, .75); cam.vel = 0; cam.lat = 0;
}

// ---------------- viaggiare lungo il corridoio: per andare a una bolla lontana senza passare dai muri ----------------
// la camera segue la linea centrale dell'anello (dalla parte piu' corta), guardando avanti, e alla fine si gira verso la meta
let viaggio = null;
function viaggiaVerso(meta, guarda, poi) {
  const a = vicinoAnello(cam.pos.x, cam.pos.z), b = vicinoAnello(meta.x, meta.z);
  let dt = b.t - a.t; if (dt > .5) dt -= 1; if (dt < -.5) dt += 1;
  const pts = [cam.pos.clone()], passi = Math.max(2, Math.ceil(Math.abs(dt) * PERIMETRO / .5));
  for (let i = 1; i < passi; i++) { const c = puntoAnello(a.t + dt * i / passi); pts.push(new THREE.Vector3(c.x, OCCHI, c.z)); }
  pts.push(meta.clone());
  const curva = new THREE.CatmullRomCurve3(pts, false, 'centripetal', .2), L = curva.getLength();
  if (L < 2.5) return poi();   // vicina: niente viaggio
  const d0 = new THREE.Vector3(); camera.getWorldDirection(d0);
  viaggio = { curva, L, t0: performance.now(), dur: clamp(L / 3.2, 1.6, 9) * 1000, guarda: guarda.clone(), d0, poi };
  cam.giro = false;
}
const vTmp = new THREE.Vector3(), vTmp2 = new THREE.Vector3();
function passoViaggio(now) {
  if (!viaggio) return;
  const u = clamp((now - viaggio.t0) / viaggio.dur, 0, 1), e = easeIO(u);
  viaggio.curva.getPointAt(e, camera.position);
  // guarda un po' avanti lungo la strada; alla fine verso la meta
  viaggio.curva.getPointAt(Math.min(1, e + 2 / viaggio.L), vTmp); vTmp.sub(camera.position).setY(0);
  if (vTmp.lengthSq() < 1e-6) vTmp.copy(viaggio.d0);
  vTmp.normalize();
  vTmp2.copy(viaggio.guarda).sub(camera.position).normalize();
  vTmp.lerp(vTmp2, sstep(.75, 1, u)).normalize();
  camera.lookAt(vTmp.add(camera.position));
  if (u >= 1) { const poi = viaggio.poi; viaggio = null; prendiDallaCamera(); poi && poi(); }
}

// ---------------- il suono: nasce dal senso ----------------
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
      rev.buffer = ir; riverbero = actx.createGain(); riverbero.gain.value = .55; riverbero.connect(rev); rev.connect(master);   // un chiostro: un po' piu' di eco
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
avviaAudio();
const SCALE = [45, 48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const gradoDi = p => clamp(Math.round(4 + 10 * p.f.mv[0] - 4 * p.f.mv[1] + (p.ph / TAU) * 3), 0, SCALE.length - 1);
function uscita(pan) {
  const out = actx.createGain();
  if (actx.createStereoPanner) { const pn = actx.createStereoPanner(); pn.pan.value = Number.isFinite(pan) ? clamp(pan, -1, 1) : 0; out.connect(pn); pn.connect(master); pn.connect(riverbero); }
  else { out.connect(master); out.connect(riverbero); }
  return out;
}
function nota(p, vol = 1, pan = 0) {
  if (!Number.isFinite(vol)) vol = 1;
  if (!pronto()) return;
  const [, qu, tr, sc] = p.f.mv, t = actx.currentTime, f = mtof(SCALE[gradoDi(p)]);
  const dur = 1.1 + 1.6 * qu, v = .045 * vol * (p.f.provv ? .6 : 1);
  const g = uscita(pan);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  const o = actx.createOscillator(), o2 = actx.createOscillator(), g2 = actx.createGain();
  o.frequency.value = f; o2.frequency.value = f * 2.76; g2.gain.value = .22;
  if (sc > .2) { o.frequency.setValueAtTime(f * Math.pow(2, -3 * sc / 12), t); o.frequency.exponentialRampToValueAtTime(f, t + .4); }
  if (tr > .2) { const l = actx.createOscillator(), lg = actx.createGain(); l.frequency.value = 7.5; lg.gain.value = f * .015 * tr; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur); }
  o.connect(g); o2.connect(g2); g2.connect(g);
  o.start(t); o2.start(t); o.stop(t + dur + .05); o2.stop(t + dur + .05);
}
function accordo(p, vol = 1) {
  if (!pronto()) return;
  const t = actx.currentTime, k = gradoDi(p), lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300;
  const g = uscita(0); lp.connect(g);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.05 * vol, t + .5); g.gain.exponentialRampToValueAtTime(.0001, t + 3.2);
  [k, k + 2, k + 4].forEach(i => [-6, 6].forEach(det => { const o = actx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(SCALE[clamp(i, 0, SCALE.length - 1)] - 12); o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + 3.3); }));
}
function urto() {
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

// ---------------- nascita: appena il piano e' pronto le bolle si accendono, dalle piu' vicine alle piu' lontane ----------------
let nascita = 1e12;   // finche' il piano non e' caricato le bolle restano spente
photos.forEach(p => { p.t0 = 1e12; });

// ---------------- entrare in una bolla: la foto si apre, le sorelle le girano intorno ----------------
let fuoco = null;
const DUR_VOLO = 1600;
function disegnaIntera(c, col, im) {
  const ok = im && im.complete && im.naturalWidth, asp = ok ? im.naturalWidth / im.naturalHeight : 1;
  const L = 1024, w = asp >= 1 ? L : Math.round(L * asp), h = asp >= 1 ? Math.round(L / asp) : L, b = 14;
  c.width = w; c.height = h; const x = c.getContext('2d');
  const [r, g, bl] = col.toArray().map(v => Math.round(v * 255));
  const tondo = (q, R) => { x.beginPath(); x.moveTo(q + R, q); x.arcTo(w - q, q, w - q, h - q, R); x.arcTo(w - q, h - q, q, h - q, R); x.arcTo(q, h - q, q, q, R); x.arcTo(q, q, w - q, q, R); x.closePath(); };
  x.fillStyle = `rgb(${r},${g},${bl})`; tondo(0, 26); x.fill();
  x.save(); tondo(b, 16); x.clip();
  if (ok) x.drawImage(im, b, b, w - 2 * b, h - 2 * b); else { x.fillStyle = '#151219'; x.fillRect(0, 0, w, h); }
  x.restore();
  return asp;
}
function alta(p) {
  if (p.hi) return;
  const can = document.createElement('canvas'), img = new Image(), tex = new THREE.CanvasTexture(can);
  tex.colorSpace = THREE.SRGBColorSpace; p.hi = { can, img, tex, asp: 1 };
  p.hi.asp = disegnaIntera(can, p.col, p.img);
  img.onload = () => { if (p.hi) { p.hi.asp = disegnaIntera(can, p.col, img); tex.dispose(); p.hi.tex = new THREE.CanvasTexture(can); p.hi.tex.colorSpace = THREE.SRGBColorSpace; p.sprite.material.map = p.hi.tex; p.sprite.material.needsUpdate = true; } };
  img.src = fullSrc(p.id);
  p.sprite.material.map = tex; p.sprite.material.color.set(0xffffff); p.sprite.renderOrder = 12; p.sprite.material.needsUpdate = true;
}
function bassa(p) { if (!p.hi) return; p.sprite.material.map = p.tex; p.sprite.material.color.set(0xf2f2f2); p.sprite.renderOrder = 10; p.sprite.material.needsUpdate = true; p.hi.tex.dispose(); p.hi = null; }
const DIST_FOTO = 1.05;   // da quanto lontano si guarda la foto aperta
function vola(p) {
  if (!p || p.hold || arrivo || viaggio) return;
  if (fuoco && fuoco.p === p && !fuoco.uscita) return;
  // lontana (per esempio dalla cronologia): prima si cammina lungo il corridoio fino a lei
  if (!fuoco && camera.position.distanceTo(p.fine) > 4.5) {
    return viaggiaVerso(davantiA(p.fine, 2.2), p.fine, () => vola(p));
  }
  const back = fuoco ? fuoco.back : { pos: camera.position.clone(), quat: camera.quaternion.clone() };
  if (fuoco) { if (fuoco.p !== p) bassa(fuoco.p); fuoco.p.fk = 0; }
  const sorelle = vicineDi(p).slice(0, 10);
  photos.forEach(q => { if (q.orbita && !sorelle.includes(q)) q.orbita.su = false; });
  const centro = p.fine.clone();
  sorelle.forEach((q, i) => { q.orbita = { i, n: sorelle.length, centro, k: q.orbita ? q.orbita.k : 0, su: true }; });
  p.orbita && (p.orbita.su = false);
  // ci si mette davanti alla foto, dal lato da cui la si guarda, dentro il corridoio e piu' o meno all'altezza degli occhi
  const out = camera.position.clone().sub(p.fine).setY(0); if (out.lengthSq() < 1e-6) out.set(0, 0, 1); out.normalize();
  const camDest = dentro(p.fine.clone().addScaledVector(out, DIST_FOTO), MEZZA * .9); camDest.y = clamp(p.fine.y, .5, 1.9);
  if (camDest.distanceTo(p.fine) < .6) camDest.addScaledVector(out, .6);   // contro il muro: un passo indietro lungo il corridoio
  const q0 = camera.quaternion.clone(), m = new THREE.Matrix4().lookAt(camDest, centro, camera.up), q1 = new THREE.Quaternion().setFromRotationMatrix(m);
  fuoco = { p, sorelle, t0: performance.now(), cam0: camera.position.clone(), q0, camDest, q1, back, uscita: false, arrivato: false };
  cam.giro = false;
  accese = new Set([p.id, ...sorelle.map(q => q.id)]);
  filiDa = p; filiA = legami(p).slice(0, 10);
  alta(p);
  document.body.classList.add('infuoco');
  mostraPannello(p);
  accordo(p);
}
function torna() {
  if (!fuoco || fuoco.uscita) return;
  Object.assign(fuoco, { uscita: true, arrivato: false, t0: performance.now(), cam0: camera.position.clone(), q0: camera.quaternion.clone(), camDest: fuoco.back.pos, q1: fuoco.back.quat });
  fuoco.sorelle.forEach(q => { if (q.orbita) q.orbita.su = false; });
  accese = null; filiDa = null; filiA = [];
  $('fuoco').classList.remove('on'); document.body.classList.remove('infuoco');
}
function passoVolo(now) {
  if (!fuoco) return;
  const u = easeIO(clamp((now - fuoco.t0) / DUR_VOLO, 0, 1));
  if (!fuoco.arrivato) { camera.position.lerpVectors(fuoco.cam0, fuoco.camDest, u); camera.quaternion.slerpQuaternions(fuoco.q0, fuoco.q1, u); }
  fuoco.p.fk = fuoco.uscita ? 1 - u : u;
  if (u >= 1 && !fuoco.arrivato) {
    fuoco.arrivato = true;
    if (fuoco.uscita) {
      bassa(fuoco.p); fuoco.p.fk = 0; fuoco = null; prendiDallaCamera(); ultimoTocco = now;
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
$('fx').onclick = () => torna();

// ---------------- la tua foto ti porta dentro ----------------
const SOSTA_NUOVA = 20000;
const regia = { nuova: null, ritorno: 0 };
let ultimaArrivata = null;
function passoRegia(now) {
  if (regia.nuova && !arrivo && !viaggio) {
    const p = regia.nuova; regia.nuova = null;
    if (photoById[p.id] && !(fuoco && fuoco.uscita)) { ultimaArrivata = p; vola(p); regia.ritorno = now + DUR_VOLO + SOSTA_NUOVA; }
    else regia.nuova = p;
    return;
  }
  const libera = now - ultimoTocco > RIPOSO;
  if (regia.ritorno && now > regia.ritorno && libera && fuoco && fuoco.arrivato && !fuoco.uscita) { regia.ritorno = 0; torna(); }
}

// ---------------- puntare e cliccare ----------------
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), mpx = { x: -1, y: -1 };
let hover = null, mossoMouse = false;
cv.addEventListener('pointermove', e => { mpx.x = e.clientX; mpx.y = e.clientY; mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); mossoMouse = true; });
cv.addEventListener('pointerleave', () => { mpx.x = -1; setHover(null); });
cv.addEventListener('pointerup', e => {
  const dito = e.pointerType === 'touch';
  if (trascina && trascina.mosso < (dito ? 12 : 5)) {
    const p = dito ? toccata(e.clientX, e.clientY) : hover;
    if (p) vola(p); else if (fuoco) torna();
  }
  fineTrascina();
});
function visibile(p) { return !p.hold && p.sprite.material.opacity > .45; }
function toccata(x, y) {
  if (arrivo) return null;
  mouse.set(x / innerWidth * 2 - 1, -y / innerHeight * 2 + 1); ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(sprites, false).find(h => visibile(h.object.userData.p));
  return hit ? hit.object.userData.p : piuVicina(x, y);
}
function setHover(p) {
  if (p === hover) return;
  hover = p;
  if (!trascina) cv.style.cursor = p ? 'pointer' : 'grab';
  if (fuoco) return;
  filiA = p ? legami(p) : [];
  accese = p ? new Set([p.id, ...filiA.map(x => x[0].id)]) : null;
  filiDa = p;
}
function pick() {
  if (!mossoMouse || mpx.x < 0 || arrivo || trascina) return;
  mossoMouse = false;
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(sprites, false).find(h => visibile(h.object.userData.p));
  setHover(hit ? hit.object.userData.p : null);
}
$('home').onclick = () => { if (fuoco) { torna(); return; } ultimoTocco = -1e9; cam.giro = !reduced; };
addEventListener('keydown', e => { if (e.key === 'Escape') { if (fuoco) torna(); } });

// ---------------- l'interfaccia si nasconde da sola ----------------
let calmaT = 0;
function sveglia() {
  document.body.classList.remove('calma'); clearTimeout(calmaT);
  calmaT = setTimeout(() => { if (!$('cron').classList.contains('open')) document.body.classList.add('calma'); }, 4000);
}
['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, sveglia, { passive: true }));
sveglia();

// ---------------- modalita' installazione (tasto I), QR (tasto Q) ----------------
function installazione(si) {
  memo('nebulosa-installazione', si ? '1' : '0');
  document.body.classList.toggle('installazione', si);
  if (si) $('cron').classList.remove('open');
}
installazione(new URLSearchParams(location.search).has('installazione') || memo('nebulosa-installazione') === '1');
document.body.classList.toggle('senza-qr', new URLSearchParams(location.search).has('senza-qr') || memo('nebulosa-qr') === 'no');
addEventListener('keydown', e => {
  if (e.target.closest?.('input,select,textarea')) return;
  if (e.key === 'i' || e.key === 'I') installazione(!document.body.classList.contains('installazione'));
  if (e.key === 'q' || e.key === 'Q') memo('nebulosa-qr', document.body.classList.toggle('senza-qr') ? 'no' : 'si');
});

// ---------------- ogni fotogramma ----------------
const orb = new THREE.Vector3(), basso = new THREE.Vector3();
let ultimoFotogramma = 0, ultimoDrone = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const t = now / 1000, dt = Math.min(.05, (now - (ultimoFotogramma || now)) / 1000); ultimoFotogramma = now;
  if (dt > 0 && now > nascita) adattaRisoluzione(dt);
  passoMano(now, dt);
  passoCamminata(dt, now);
  applicaCamera();
  passoVolo(now);
  passoViaggio(now);
  camera.updateMatrixWorld();
  if (pronto() && drone && now - ultimoDrone > 300) { ultimoDrone = now; drone.gain.setTargetAtTime(.07, actx.currentTime, .5); }
  camera.matrixWorld.extractBasis(dx, dy, orb);
  let note = 0;
  photos.forEach(p => {
    if (p.hold) return;
    const [vi, qu, tr] = p.f.mv;
    const m = easeIO(clamp((now - p.t0) / p.dur, 0, 1));
    p.sprite.position.lerpVectors(p.da, p.fine, m);
    if (!reduced && m >= 1) {   // un respiro leggero
      const a = .012 + .025 * vi;
      p.sprite.position.x += Math.sin(t * (.4 + vi) + p.ph) * a + (tr ? Math.sin(t * 19 + p.ph * 5) * .004 * tr : 0);
      p.sprite.position.y += Math.cos(t * (.33 + vi * .8) + p.ph * 1.3) * a;
    }
    let sc = p.base * (1 + .06 * vi * Math.sin(t * 2.4 + p.ph)) * (m < 1 ? .2 + .8 * m : 1);
    if (now < p.t0) sc = 0;
    if (p.orbita) {
      const o = p.orbita; o.k = clamp(o.k + (o.su ? .022 : -.03), 0, 1);
      const e = easeIO(o.k), ang = o.i / o.n * TAU + t * .06, R = (fuoco && fuoco.p.hi ? .36 * Math.max(1, fuoco.p.hi.asp) + .3 : .5) + .04 * Math.sin(t * .35 + o.i);
      orb.copy(o.centro).addScaledVector(dx, Math.cos(ang) * R).addScaledVector(dy, Math.sin(ang) * R * .78);
      p.sprite.position.lerp(orb, e); sc += (BOLLA * .8 - sc) * e;
      if (o.k <= 0 && !o.su) p.orbita = null;
    }
    if (p.fk) { p.sprite.position.lerp(p.fine, p.fk); sc = sc + (.62 - sc) * easeIO(p.fk); }
    if (accese && !fuoco) sc *= p === hover ? 1.6 : accese.has(p.id) ? 1.2 : .9;
    if (fuoco && p === hover && p !== fuoco.p) sc *= 1.25;
    if (p.lampo && now < p.lampo) sc *= 1 + .8 * Math.sin((p.lampo - now) / 2200 * Math.PI);
    p.sprite.scale.setScalar(sc);
    if (p.hi && p.fk) p.sprite.scale.x = sc * (1 + (p.hi.asp - 1) * easeIO(p.fk));
    // da lontano le bolle sfumano (il chiostro e' grande); vicinissime anche, per non coprire tutto mentre si cammina
    const d = camera.position.distanceTo(p.sprite.position);
    const lontananza = fuoco && (p === fuoco.p || p.orbita) ? 1 : (1 - sstep(8, 18, d)) * sstep(.12, .4, d);
    p.sprite.material.opacity = (accese && !accese.has(p.id) ? .12 : 1) * lontananza;
    p.alone.position.copy(p.sprite.position); p.alone.scale.setScalar(sc * 3.2);
    p.alone.material.opacity = (p.fk ? .5 * (1 - p.fk) : .5) * p.sprite.material.opacity * (.85 + .15 * Math.sin(t * 1.7 + p.ph));
    if (!reduced && now > nascita + 2000) {
      const sp = Math.max(.03, .07 + .25 * vi - .04 * qu), u = (t * sp + p.ph) % 1;
      if (u < p.uPrev && pronto() && note < 2 && d < 8) {
        const acc = accese ? accese.has(p.id) : true, prob = accese ? (acc ? .5 : 0) : .06;
        if (Math.random() < prob) { basso.copy(p.sprite.position).project(camera); if (basso.z < 1) { nota(p, clamp(2.5 / d, .25, 1.4), basso.x * .8); note++; } }
      }
      p.uPrev = u;
    }
  });
  aggiornaFili();
  pick();
  passoArrivo(now);
  passoRegia(now);
  renderer.render(scene, camera);
  $('intro').classList.toggle('hide', !!fuoco || now - nascita > 9000 || now - ultimoTocco < 2000);
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

// ---------------- foto dai telefoni, in tempo reale ----------------
// quando arriva una foto: si cammina lungo il corridoio fino al suo posto, lei arriva come una cometa dal fondo del corridoio,
// si posa, e poi ci si entra
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
  $('introp').textContent = `${n} foto${D.luogo ? ' di ' + D.luogo : ''}, raccolte da chi le ha vissute, sparse come bolle di luce lungo il chiostro dell'Accademia ricostruito in 3D: camminando si passa da una foto a quelle che le somigliano. Con due mani allargate si cammina, con la mano verso i bordi ci si gira, tenendo ferma la mano su una bolla ci si entra.` +
    (prov ? ` ${prov === 1 ? '1 foto, quasi grigia, ha' : prov + ' foto, quasi grigie, hanno'} ancora un posto provvisorio, vicino alle foto che le somigliano: aspetta${prov === 1 ? '' : 'no'} di essere lett${prov === 1 ? 'a' : 'e'}.` : '');
}
function addArrival(a, animate) {
  if (!a.dato || photoById[a.id] || arrQueue.some(x => x.id === a.id) || (arrivo && arrivo.a.id === a.id)) return;
  if (animate) { arrQueue.push(a); return; }
  const p = makePhoto(a.id, a.dato); posizionaUna(p); p.da.copy(p.fine); p.t0 = nascita; counts();
}
function nextArrival(now) {
  if (arrivo || viaggio || !arrQueue.length || now < fineUltimo + PAUSA || now < nascita) return;
  if (fuoco) { torna(); return; }
  const a = arrQueue.shift(), p = makePhoto(a.id, a.dato); p.hold = true; p.sprite.scale.setScalar(0); posizionaUna(p); counts();
  $('arrK').textContent = 'Nuova foto' + (a.nome ? ' · da ' + a.nome : ' · dal telefono');
  $('arrW').textContent = a.frase ? '«' + a.frase + '»' : '';
  $('arrQ').textContent = arrQueue.length ? '+ ' + arrQueue.length + ' in arrivo' : '';
  $('arrivo').classList.add('on');
  urto();
  // prima si va li' vicino, lungo il corridoio; poi la cometa
  const meta = davantiA(p.fine, 2.4);
  arrivo = { a, p, attesa: true };
  setHover(null);
  const parti = () => cometa(p, performance.now());
  if (camera.position.distanceTo(p.fine) > 4) viaggiaVerso(meta, p.fine, parti); else parti();
}
function cometa(p, now) {
  camera.updateMatrixWorld();
  const avanti = new THREE.Vector3(), destra = new THREE.Vector3(), su = new THREE.Vector3();
  camera.getWorldDirection(avanti); destra.setFromMatrixColumn(camera.matrixWorld, 0); su.setFromMatrixColumn(camera.matrixWorld, 1);
  // la cometa arriva dal fondo del corridoio, oltre la foto
  const n = vicinoAnello(p.fine.x, p.fine.z), segno = (n.tx * avanti.x + n.tz * avanti.z) >= 0 ? 1 : -1;
  const via = dentro(new THREE.Vector3(p.fine.x + n.tx * segno * 7, 1.9, p.fine.z + n.tz * segno * 7), MEZZA * .6);
  const curva = new THREE.CubicBezierCurve3(via, via.clone().lerp(p.fine, .4).add(new THREE.Vector3(0, .5, 0)), p.fine.clone().add(new THREE.Vector3(0, .6, 0)), p.fine.clone());
  p.pts = new Float32Array(curva.getPoints(160).flatMap(v => [v.x, v.y, v.z])); p.n = p.pts.length / 3;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p.pts, 3)); g.setDrawRange(0, 0);
  const linea = new THREE.Line(g, new THREE.LineBasicMaterial({ color: p.col, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false }));
  const onda = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_ANELLO, color: p.col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  const pc = new Float32Array(CODA * 3), cc = new Float32Array(CODA * 3);
  for (let i = 0; i < CODA; i++) pc.set([via.x, via.y, via.z], i * 3);
  const gc = new THREE.BufferGeometry(); gc.setAttribute('position', new THREE.BufferAttribute(pc, 3)); gc.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  const scia = new THREE.Points(gc, new THREE.PointsMaterial({ map: TEX_PUNTO, size: 16, sizeAttenuation: false, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  scia.frustumCulled = false; linea.renderOrder = onda.renderOrder = scia.renderOrder = 11;
  scene.add(linea, onda, scia);
  const coda = arrQueue.length, f = coda === 0 ? 1 : coda <= 2 ? .72 : .5;
  const q0 = camera.quaternion.clone(), q1 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(camera.position, p.fine, camera.up));
  Object.assign(arrivo, { attesa: false, linea, onda, scia, t0: now, TV: 4200 * f, TP: 2400 * f, q0, q1, cam0: camera.position.clone() });
  renderCron();
}
function passoArrivo(now) {
  nextArrival(now);
  if (!arrivo || arrivo.attesa) return;
  const { p, linea, onda, scia, TV, TP } = arrivo, el = now - arrivo.t0, s = p.sprite;
  s.material.opacity = 1; s.renderOrder = 13;
  camera.position.copy(arrivo.cam0); camera.quaternion.slerpQuaternions(arrivo.q0, arrivo.q1, easeIO(clamp(el / (TV * .6), 0, 1)) * .6);   // la camera si gira un po' verso dove va la foto
  const pc = scia.geometry.attributes.position.array, cc = scia.geometry.attributes.color.array;
  if (el < TV) {
    const u = easeIO(el / TV), j = Math.floor(u * (p.n - 1));
    s.position.set(p.pts[j * 3], p.pts[j * 3 + 1], p.pts[j * 3 + 2]);
    s.scale.setScalar(p.base * (3 - 1.8 * sstep(.55, 1, u)));
    p.alone.position.copy(s.position); p.alone.scale.setScalar(p.base * 5); p.alone.material.opacity = .7;
    linea.geometry.setDrawRange(0, j + 1);
    pc.copyWithin(3, 0, (CODA - 1) * 3); pc[0] = s.position.x; pc[1] = s.position.y; pc[2] = s.position.z;
    for (let i = 0; i < CODA; i++) { const k = Math.pow(1 - i / CODA, 1.6); cc[i * 3] = p.col.r * k; cc[i * 3 + 1] = p.col.g * k; cc[i * 3 + 2] = p.col.b * k; }
    scia.geometry.attributes.position.needsUpdate = scia.geometry.attributes.color.needsUpdate = true;
  } else {
    const v = clamp((el - TV) / TP, 0, 1);
    if (!arrivo.posata) {
      arrivo.posata = true; accordo(p, .8); $('arrivo').classList.remove('on');
      filiDa = p; filiA = legami(p).slice(0, 10); accese = new Set([p.id, ...filiA.map(x => x[0].id)]);
    }
    s.position.copy(p.fine); s.scale.setScalar(p.base * (1 + 1.8 * Math.exp(-v * 5)));
    onda.position.copy(p.fine); onda.scale.setScalar(.15 + 1.4 * v); onda.material.opacity = .9 * (1 - v);
    linea.material.opacity = .5 * (1 - v);
    for (let i = 0; i < CODA * 3; i++) cc[i] *= .93;
    scia.geometry.attributes.color.needsUpdate = true;
    if (v >= 1) {
      p.hold = false; p.da.copy(p.fine); p.t0 = -1e9; s.renderOrder = 10;
      scene.remove(linea, onda, scia); linea.geometry.dispose(); scia.geometry.dispose();
      prendiDallaCamera(); accese = null; filiDa = null; filiA = [];
      p.lampo = now + 2200; toast(arrivo.a); arrivo = null; fineUltimo = now; renderCron(); regia.nuova = p; return;
    }
  }
}
function removePhoto(id) {
  const p = photoById[id]; if (!p) return;
  if (fuoco && (fuoco.p === p || fuoco.sorelle.includes(p))) torna();
  scene.remove(p.sprite, p.alone); p.tex.dispose(); p.sprite.material.dispose(); p.alone.material.dispose(); if (p.hi) p.hi.tex.dispose();
  photos.splice(photos.indexOf(p), 1); sprites.splice(sprites.indexOf(p.sprite), 1); delete photoById[id];
  if (hover === p) setHover(null);
}
function removeArrival(id) {
  cron.delete(id); const qi = arrQueue.findIndex(x => x.id === id); if (qi >= 0) arrQueue.splice(qi, 1);
  if (arrivo && arrivo.a.id === id) {
    if (arrivo.linea) scene.remove(arrivo.linea, arrivo.onda, arrivo.scia);
    arrivo = null; $('arrivo').classList.remove('on'); prendiDallaCamera();
    filiDa = null; filiA = []; accese = null;
  }
  if (photoById[id]) { removePhoto(id); arrivate--; }
  renderCron(); counts();
}
function letta(id, dato) {
  const p = photoById[id]; if (!p || !dato) return;
  const a = cron.get(id); if (a) a.dato = dato;
  if (p.hold) { p.f = dato; return; }
  if (fuoco && (fuoco.p === p || fuoco.sorelle.includes(p))) { p.pending = dato; return; }
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
$('cronbtn').onclick = () => { $('cron').classList.toggle('open'); renderCron(); };
$('cronx').onclick = () => $('cron').classList.remove('open');
$('cronL').addEventListener('click', e => { if (e.target.closest('button')) return; const it = e.target.closest('[data-apri]'); if (!it) return; const p = photoById[it.dataset.apri]; if (p && !p.hold) { $('cron').classList.remove('open'); vola(p); } });
$('cron').addEventListener('click', async e => {
  if (e.target.id !== 'cronAll') return;
  if (!confirm('Rimuovere tutte le ' + cron.size + ' foto arrivate dai telefoni? Verranno cancellate anche dal computer.')) return;
  for (const id of [...cron.keys()]) await fetch('/api/elimina', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {});
});
let inViaggio = 0, chiViaggia = '';
function inArrivo(d, nome) {
  inViaggio = Math.max(0, inViaggio + d); if (nome != null) chiViaggia = nome;
  $('inarr').textContent = '● Una foto sta arrivando' + (chiViaggia ? ' da ' + chiViaggia : '') + (inViaggio > 1 ? ' (+' + (inViaggio - 1) + ')' : '') + '…';
  $('inarr').classList.toggle('on', inViaggio > 0 && !arrivo);
}
setInterval(() => $('inarr').classList.toggle('on', inViaggio > 0 && !arrivo), 500);
function arrivata(a, animate) { if (!cron.has(a.id)) { cron.set(a.id, a); arrivate++; } addArrival(a, animate); renderCron(); }
if (LIVE) {
  fetch('/api/arrivi', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(list => {
    const prova = /prova-arrivo/.test(location.search) && list.length ? list.pop() : null;
    list.forEach(a => arrivata(a, false));
    if (prova) { cron.set(prova.id, prova); arrivate++; removePhoto(prova.id); setTimeout(() => { addArrival(prova, true); renderCron(); }, 4800); }
    counts();
  }).catch(() => {});
  const conn = () => {
    const es = new EventSource('/api/eventi');
    es.onopen = () => setOnline(true);
    es.addEventListener('inarrivo', e => { inArrivo(+1, JSON.parse(e.data).nome || ''); setTimeout(() => inArrivo(-1), 30000); });
    es.addEventListener('annullata', () => inArrivo(-1));
    es.addEventListener('foto', e => { inArrivo(-1); arrivata(JSON.parse(e.data), true); });
    es.addEventListener('letta', e => { const d = JSON.parse(e.data); letta(d.id, d.dato); });
    es.addEventListener('rimossa', e => removeArrival(JSON.parse(e.data).id));
    es.onerror = () => { setOnline(false); es.close(); setTimeout(conn, 2000); };
  };
  conn();
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
if (LIVE) fetch('/api/info').then(r => r.json()).then(inf => {
  const disegna = () => { $('qrfc').innerHTML = ''; new QRCode($('qrfc'), { text: inf.carica, width: 240, height: 240, colorDark: '#06050a', colorLight: '#ffffff' }); $('qrfisso').classList.add('on'); };
  if (window.QRCode) disegna();
  else { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; sc.onload = disegna; document.head.appendChild(sc); }
}).catch(() => {});

// ---------------- la mano: si cammina nel chiostro senza toccare niente, vista dalla webcam (MediaPipe) ----------------
// - una mano: diventa una luce sullo schermo, attirata dalla bolla piu' vicina; ferma su una bolla per un secondo e mezzo: ci si entra
// - la mano verso i bordi fa girare la testa da quella parte (destra, sinistra, un po' su e giu'); al centro sta ferma
// - due mani: allargarle rispetto a quando si sono alzate = camminare avanti, stringerle = indietro; dentro una foto, stringerle = uscire
// - abbassando la mano (fuori dall'inquadratura) per due secondi si esce dalla foto
// Le immagini della webcam restano dentro il browser: non vengono salvate ne' inviate.
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODELLO_MANO = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const OSSA_MANO = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
const SOSTA_MANO = 1500, VIA_MANO = 2000, CONFERMA_MANO = 250;
const mano = { vista: false, ultima: -1e9, aCasa: true, daQuando: 0, x: .5, y: .5, vx: .5, vy: .5, bersaglio: null, da: 0, carica: 0, due: false, vistaDue: 0, ultimaDue: 0, storia: [], d0: 1, dd: 1, pa: null, pb: null, cammina: 0 };
let rilevatore = null, ultimoVideo = -1, ultimaLettura = -1e9;
const video = $('manoVideo'), anteprima = $('manoCanvas'), ctxAnte = anteprima.getContext('2d');
function senzaMano() { rilevatore = null; $('mano').classList.add('assente'); }
async function avviaMano() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return senzaMano();
  if (TELEFONO) return senzaMano();
  try {
    const { FilesetResolver, HandLandmarker } = await import(MP + '/vision_bundle.mjs');
    const files = await FilesetResolver.forVisionTasks(MP + '/wasm');
    rilevatore = await HandLandmarker.createFromOptions(files, {
      // sul processore, non sulla scheda video: la scheda video serve tutta al piano 3D
      baseOptions: { modelAssetPath: MODELLO_MANO, delegate: 'CPU' },
      runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .65, minHandPresenceConfidence: .55, minTrackingConfidence: .4,
    });
    await apriCamera(memo('nebulosa-camera'));
  } catch (e) { senzaMano(); }
}
async function apriCamera(id) {
  if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
  const vincoli = { width: { ideal: 1280 }, height: { ideal: 720 }, ...(id ? { deviceId: { exact: id } } : { facingMode: 'user' }) };
  let flusso;
  try { flusso = await navigator.mediaDevices.getUserMedia({ video: vincoli, audio: false }); }
  catch (e) { if (id) return apriCamera(null); return senzaMano(); }
  video.srcObject = flusso; await video.play();
  const camere = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
  const attuale = flusso.getVideoTracks()[0].getSettings().deviceId;
  if (!id) { const integrata = camere.find(c => /facetime|integrat|built/i.test(c.label)); if (integrata && integrata.deviceId !== attuale) return apriCamera(integrata.deviceId); }
  $('manoCamera').innerHTML = camere.map(c => `<option value="${c.deviceId}"${c.deviceId === attuale ? ' selected' : ''}>${esc(c.label || 'telecamera')}</option>`).join('');
  $('manoStato').textContent = 'Alza una mano davanti allo schermo';
}
$('manoCamera').onchange = e => { memo('nebulosa-camera', e.target.value); apriCamera(e.target.value); };
// il tasto V nasconde e rimette il riquadro della webcam; il tasto B toglie solo il video (W qui serve a camminare)
$('mano').classList.toggle('nascosta', memo('nebulosa-webcam') === 'no');
$('mano').classList.toggle('senza-video', memo('nebulosa-video') === 'no');
addEventListener('keydown', e => {
  if (e.target.closest?.('input,select,textarea')) return;
  if (e.key === 'v' || e.key === 'V') memo('nebulosa-webcam', $('mano').classList.toggle('nascosta') ? 'no' : 'si');
  if (e.key === 'b' || e.key === 'B') memo('nebulosa-video', $('mano').classList.toggle('senza-video') ? 'no' : 'si');
});
function palmo(L) { const k = [0, 5, 9, 13, 17]; return { x: k.reduce((s, i) => s + L[i].x, 0) / 5, y: k.reduce((s, i) => s + L[i].y, 0) / 5 }; }
const taglia = m => Math.hypot(m[0].x - m[9].x, m[0].y - m[9].y);
function leggiMano(now) {
  if (window.__manoFinta !== undefined) {   // per provare senza webcam, dalla console
    const f = window.__manoFinta, mani = !f ? [] : Array.isArray(f[0]) ? f : [f];
    return { L: mani.slice().sort((a, b) => taglia(b) - taglia(a))[0] || null, mani, lati: window.__latiFinti || [] };
  }
  if (!rilevatore || video.readyState < 2 || video.currentTime === ultimoVideo) return null;
  if (now - ultimaLettura < 55) return null;   // le mani si leggono 18 volte al secondo: bastano, e il resto del tempo va al disegno
  ultimoVideo = video.currentTime; ultimaLettura = now;
  const r = rilevatore.detectForVideo(video, now);
  const classi = r.handedness || r.handednesses || [], vere = (r.landmarks || []).map((m, i) => i).filter(i => manoVera(r.landmarks[i], classi[i]));
  const mani = vere.map(i => r.landmarks[i]), lati = vere.map(i => classi[i] && classi[i][0] ? classi[i][0].categoryName : null);
  let L = null, best = 0;
  mani.forEach(m => { const s = taglia(m); if (s > best) { best = s; L = m; } });
  disegnaAnteprima(mani, L);
  return { L, mani, lati };
}
function manoVera(m, classe) {
  if (classe && classe[0] && classe[0].score < .6) return false;
  const Ar = video.videoWidth / (video.videoHeight || 1) || 16 / 9, d = (a, b) => Math.hypot((m[a].x - m[b].x) * Ar, m[a].y - m[b].y);
  const lungo = d(0, 9), largo = d(5, 17), dito = d(9, 12);
  return lungo > .02 && largo < lungo * 2.2 && dito < lungo * 3.5;
}
const ENTRA_DUE = 120, ESCE_DUE = 500;
function dueMani(mani, lati) { return mani.map((m, i) => i).sort((a, b) => taglia(mani[b]) - taglia(mani[a])).slice(0, 2).map(i => ({ p: palmo(mani[i]), t: taglia(mani[i]), lato: lati && lati[i] })); }
function veraCoppia(c) {
  if (c.length < 2) return false;
  const d = Math.hypot(c[0].p.x - c[1].p.x, c[0].p.y - c[1].p.y);
  return d >= .07 && !(c[0].lato && c[0].lato === c[1].lato && d < .15);
}
const misura = c => Math.hypot(c[0].p.x - c[1].p.x, c[0].p.y - c[1].p.y) / Math.max(.02, (c[0].t + c[1].t) / 2);
function aggiornaDueMani(mani, lati, now) {
  const c = dueMani(mani, lati), due = veraCoppia(c);
  if (due) { mano.vistaDue = mano.vistaDue || now; mano.ultimaDue = now; } else mano.vistaDue = 0;
  if (!mano.due && due && now - mano.vistaDue >= ENTRA_DUE) {
    mano.due = true; mano.storia = []; mano.dd = mano.d0 = misura(c); mano.bersaglio = null; mano.carica = 0; setHover(null);
  } else if (mano.due && !due && now - mano.ultimaDue > ESCE_DUE) { mano.due = false; mano.cammina = 0; }
  if (mano.due && due) {
    mano.storia.push(misura(c)); if (mano.storia.length > 3) mano.storia.shift();
    const med = mano.storia.slice().sort((a, b) => a - b)[Math.floor(mano.storia.length / 2)];
    mano.dd += (med - mano.dd) * .5;
    mano.pa = c[0].p; mano.pb = c[1].p;
  }
}
// due mani: quanto si allargano (o si stringono) rispetto a quando si sono alzate decide la velocita'; vicino al punto di partenza si sta fermi
function camminaConDueMani() {
  const r = mano.dd / Math.max(mano.d0, .05) - 1;
  const v = Math.sign(r) * sstep(.08, .45, Math.abs(r));
  if (fuoco) { mano.cammina = 0; if (fuoco.arrivato && !fuoco.uscita && r < -.22) torna(); return; }   // dentro una foto: stringerle per uscire
  mano.cammina = v;
}
const sulloSchermo = q => ({ x: clamp((1 - q.x - .18) / .64, 0, 1) * innerWidth, y: clamp((q.y - .15) / .6, 0, 1) * innerHeight });
const proiezione = new THREE.Vector3();
function piuVicina(x, y) {
  const R = Math.max(70, innerWidth * .06);
  const candidate = fuoco && fuoco.arrivato && !fuoco.uscita ? fuoco.sorelle : photos;
  let best = null, bd = R;
  for (const p of candidate) {
    if (!visibile(p) || p.sprite.scale.x <= 0) continue;
    if (!fuoco && camera.position.distanceTo(p.sprite.position) > 9) continue;   // lontane nel corridoio: troppo piccole per sceglierle
    proiezione.copy(p.sprite.position).project(camera);
    if (proiezione.z > 1) continue;
    const d = Math.hypot((proiezione.x + 1) / 2 * innerWidth - x, (1 - proiezione.y) / 2 * innerHeight - y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
const schermoDi = p => { proiezione.copy(p.sprite.position).project(camera); return { x: (proiezione.x + 1) / 2 * innerWidth, y: (1 - proiezione.y) / 2 * innerHeight }; };
function giraVersoLaMano(dt) {   // la mano verso i bordi: ci si gira da quella parte (e si alza o abbassa un po' lo sguardo)
  if (fuoco || viaggio || arrivo) return;
  const ox = mano.x - .5, oy = mano.y - .5, d = Math.hypot(ox, oy);
  // agganciata a una bolla la vista sta ferma (se no la bolla scappa da sotto la mano); ai bordi si gira sempre
  const forza = mano.bersaglio ? 0 : sstep(.22, .46, d);
  if (forza <= 0) return;
  cam.yaw -= ox / d * forza * 1.1 * dt;
  cam.pitch = clamp(cam.pitch - oy / d * forza * .5 * dt, -.6, .6);
}
function filtro1e(minimo = .5, beta = 7, taglioVelocita = .5) {
  let x = null, v = 0, tPrima = 0;
  const alfa = (taglio, dt) => 1 / (1 + 1 / (2 * Math.PI * taglio * dt));
  return {
    azzera() { x = null; },
    passo(valore, t) {
      if (x === null) { x = valore; v = 0; tPrima = t; return x; }
      const dt = Math.max(1e-3, t - tPrima); tPrima = t;
      v += alfa(taglioVelocita, dt) * ((valore - x) / dt - v);
      x += alfa(minimo + beta * Math.abs(v), dt) * (valore - x);
      return x;
    },
  };
}
const filtroManoX = filtro1e(), filtroManoY = filtro1e();
function passoMano(now, dt) {
  const r = leggiMano(now);
  if (r) {
    if (!r.L) mano.daQuando = 0; else if (!mano.daQuando) mano.daQuando = now;
    if (r.L && (mano.vista || now - mano.daQuando >= CONFERMA_MANO)) {
      const pt = palmo(r.L);
      const tx = clamp((1 - pt.x - .18) / .64, 0, 1), ty = clamp((pt.y - .15) / .6, 0, 1);
      if (!mano.vista) { filtroManoX.azzera(); filtroManoY.azzera(); }
      mano.x = filtroManoX.passo(tx, now / 1000); mano.y = filtroManoY.passo(ty, now / 1000);
      mano.vista = true; mano.ultima = now; ultimoTocco = now; mano.aCasa = false; cam.giro = false;
    } else if (mano.vista && now - mano.ultima > 350) {
      mano.vista = false; mano.due = false; mano.cammina = 0; mano.vistaDue = 0; mano.bersaglio = null; mano.carica = 0; setHover(null);
    }
  }
  // senza mano per un po': si esce dalla foto in cui si era entrati con la mano
  if (!mano.vista && !mano.aCasa && now - mano.ultima > VIA_MANO) {
    if (fuoco && !fuoco.uscita && fuoco.arrivato && mano.ultima >= fuoco.t0 - 500) torna();
    mano.aCasa = true;
  }
  if (r) aggiornaDueMani(r.mani || [], r.lati, now);
  if (mano.vista && !arrivo && mano.due) camminaConDueMani();
  else if (mano.vista && !arrivo) {
    mano.cammina = 0;
    giraVersoLaMano(dt);
    const hx = mano.x * innerWidth, hy = mano.y * innerHeight;
    const aiBordi = !fuoco && Math.hypot(mano.x - .5, mano.y - .5) > .4;   // la mano ai bordi serve a girarsi: li' non si aggancia niente
    const b = (fuoco && (!fuoco.arrivato || fuoco.uscita)) || viaggio || aiBordi ? null : piuVicina(hx, hy);
    if (b !== mano.bersaglio) { mano.bersaglio = b; mano.da = now; mano.carica = 0; setHover(b); }
    const mosso = Math.hypot(hx - mano.vx * innerWidth, hy - mano.vy * innerHeight);
    if (mosso > Math.max(40, innerWidth * .035)) { mano.vx = mano.x; mano.vy = mano.y; mano.da = now; }
    if (b) {
      mano.carica = clamp((now - mano.da) / SOSTA_MANO, 0, 1);
      if (mano.carica >= 1) { regia.ritorno = 0; mano.bersaglio = null; mano.carica = 0; vola(b); setHover(null); }
    } else mano.carica = 0;
  }
  aggiornaCursore();
}
function aggiornaCursore() {
  const c = $('manoCursore');
  c.classList.toggle('on', mano.vista && !arrivo && !mano.due);
  const dm = $('manoDue'); dm.classList.toggle('on', !!(mano.vista && !arrivo && mano.due && mano.pa));
  if (mano.due && mano.pa) {
    const a = sulloSchermo(mano.pa), b = sulloSchermo(mano.pb), [ia, ib] = dm.querySelectorAll('i'), l = dm.querySelector('b');
    ia.style.transform = `translate(${a.x}px,${a.y}px)`; ib.style.transform = `translate(${b.x}px,${b.y}px)`;
    l.style.width = Math.hypot(b.x - a.x, b.y - a.y) + 'px'; l.style.transform = `translate(${a.x}px,${a.y}px) rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`;
  }
  c.classList.toggle('aggancio', !!mano.bersaglio);
  let x = mano.x * innerWidth, y = mano.y * innerHeight;
  if (mano.bersaglio) { const s = schermoDi(mano.bersaglio); x += (s.x - x) * .85; y += (s.y - y) * .85; }
  c.style.transform = `translate(${x}px, ${y}px)`;
  c.style.setProperty('--p', (mano.carica * 100).toFixed(1) + '%');
  const aiuto = !mano.vista || arrivo ? '' : mano.due ? (fuoco ? 'Due mani: stringile per tornare nel corridoio' : mano.cammina > .05 ? 'Stai camminando avanti · stringi le mani per fermarti' : mano.cammina < -.05 ? 'Stai tornando indietro' : 'Due mani: allargale per camminare, stringile per tornare indietro')
    : fuoco && !fuoco.uscita ? (mano.bersaglio ? 'Tieni ferma la mano per passare a questa foto' : 'Porta la mano su una sorella · abbassala per tornare')
    : mano.bersaglio ? 'Tieni ferma la mano: stai entrando in questa foto' : 'Muovi la mano: la luce si aggancia alle bolle · verso i bordi ti giri';
  if ($('manoAiuto').textContent !== aiuto) $('manoAiuto').textContent = aiuto;
  $('manoAiuto').classList.toggle('on', !!aiuto);
  $('manoStato').textContent = !rilevatore ? $('manoStato').textContent : mano.vista ? (mano.due ? 'due mani: cammini' : mano.bersaglio ? 'mano agganciata a una bolla' : 'mano vista') : 'nessuna mano';
}
function disegnaAnteprima(mani, principale) {
  const W2 = anteprima.width, H2 = anteprima.height;
  ctxAnte.save(); ctxAnte.translate(W2, 0); ctxAnte.scale(-1, 1);
  ctxAnte.drawImage(video, 0, 0, W2, H2);
  ctxAnte.strokeStyle = 'rgba(255,255,255,.25)'; ctxAnte.setLineDash([4, 4]); ctxAnte.strokeRect(.18 * W2, .15 * H2, .64 * W2, .6 * H2); ctxAnte.setLineDash([]);
  for (const m of mani) {
    const on = m === principale;
    ctxAnte.strokeStyle = on ? 'rgba(160,210,255,.95)' : 'rgba(255,255,255,.35)'; ctxAnte.lineWidth = 2;
    for (const [a, b] of OSSA_MANO) { ctxAnte.beginPath(); ctxAnte.moveTo(m[a].x * W2, m[a].y * H2); ctxAnte.lineTo(m[b].x * W2, m[b].y * H2); ctxAnte.stroke(); }
    if (on) { const p = palmo(m); ctxAnte.fillStyle = '#ffd9a0'; ctxAnte.beginPath(); ctxAnte.arc(p.x * W2, p.y * H2, 5, 0, TAU); ctxAnte.fill(); }
  }
  ctxAnte.restore();
}

counts();
cv.style.cursor = 'grab';
requestAnimationFrame(frame);
avviaMano();
caricato;

window.__mano = { mano, piuVicina, palmo, passoMano };
window.__nebulosa = { photos, photoById, camera, cam, vola, torna, regia, legami, puntoAnello, vicinoAnello, get fuoco() { return fuoco; }, get viaggio() { return viaggio; }, get arrivo() { return arrivo; },
  passo(dt, now) { passoMano(now, dt); passoCamminata(dt, now); applicaCamera(); } };   // per provare dalla console: un passo della camminata
