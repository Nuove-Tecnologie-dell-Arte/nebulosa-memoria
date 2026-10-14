import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// LE VENATURE: tutte le foto hanno qualcosa in comune con almeno un'altra. Ogni foto e' legata a quella con cui ha
// piu' tag in comune, e i legami formano un'unica rete che si dirama come le venature di una foglia, le radici,
// il micelio di un fungo: dalla radice, in basso nella luce, si apre a ventaglio verso l'alto. Le vene sono tanto piu'
// grosse quante piu' foto portano; qualche filo sottile chiude un anello tra foto vicine e molto simili.
// Passando su una foto si accende il suo cammino fino alla radice. La mappa in basso a sinistra mostra il ventaglio e dove guardi.

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
const camera = new THREE.PerspectiveCamera(52, 1, .1, 500);
const CASA = new THREE.Vector3(0, 20, 66);   // di fronte al ventaglio: si vede tutta la rete
camera.position.copy(CASA);
const controls = new OrbitControls(camera, cv);
controls.target.set(0, 18, 0);
Object.assign(controls, { enableDamping: true, dampingFactor: .06, autoRotate: !reduced, autoRotateSpeed: .35, minDistance: 1.2, maxDistance: 130, rotateSpeed: .6, zoomSpeed: .8 });
let fermo = 0;
const riprendiGiro = () => { clearTimeout(fermo); fermo = setTimeout(() => { if (!fuoco) controls.autoRotate = !reduced; }, 9000); };
controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(fermo); });
controls.addEventListener('end', riprendiGiro);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .8, .45, .82);
composer.addPass(bloom); composer.addPass(new OutputPass());
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// le stelle lontane
let stelle;
{
  const n = 1800, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(120 + Math.random() * 120); a.set([v.x, v.y, v.z], i * 3); }
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

// ---------------- i colori: quattro modi di vedere la stessa memoria ----------------
// temperatura e spettro sono quelli di sempre (luminosi, con il bagliore); notte opaca e carta sono calmi:
// niente bagliore, un colore tenue per ogni gruppo di senso
const FUOCO = [[0, [70, 120, 255]], [.25, [150, 150, 235]], [.45, [230, 60, 40]], [.7, [255, 140, 30]], [.88, [255, 215, 90]], [1, [255, 250, 230]]];
function temperatura(t) {
  for (let k = 1; k < FUOCO.length; k++) if (t <= FUOCO[k][0] || k === FUOCO.length - 1) {
    const [a, ca] = FUOCO[k - 1], [b, cb] = FUOCO[k], u = clamp((t - a) / (b - a), 0, 1);
    return new THREE.Color().setRGB(...ca.map((v, i) => (v + (cb[i] - v) * u) / 255), THREE.SRGBColorSpace);
  }
}
const PALETTE = ['fuoco', 'spettro', 'notte', 'carta'];
const NOME_PALETTE = { fuoco: 'temperatura', spettro: 'spettro', notte: 'notte opaca', carta: 'carta' };
let palette = PALETTE.includes(memo('nebulosa-colori')) ? memo('nebulosa-colori') : 'fuoco';
const chiaro = () => palette === 'carta';
const opaco = () => palette === 'notte' || palette === 'carta';
const FONDO = { fuoco: 0x06050a, spettro: 0x06050a, notte: 0x0d0c11, carta: 0xefe8dc };
// un colore tenue per gruppo: le tinte saltano di 5/12 di giro, cosi' gruppi vicini nell'elenco non si confondono
function coloreGruppo(k) {
  const h = (k * 5 % 12) / 12;
  return chiaro() ? new THREE.Color().setHSL(h, .4, .42, THREE.SRGBColorSpace) : new THREE.Color().setHSL(h, .32, .7, THREE.SRGBColorSpace);
}
function colore(p) {
  const f = p.f; let c;
  if (opaco()) c = p.gruppo >= 0 ? coloreGruppo(p.gruppo) : chiaro() ? new THREE.Color(.42, .4, .37) : new THREE.Color(.8, .78, .74);
  else {
    const [vi, qu, , sc] = f.mv;
    c = palette === 'spettro' ? new THREE.Color().setHSL(f.h / 360, .78, clamp(f.l / 100, .45, .68), THREE.SRGBColorSpace) : temperatura(clamp(.5 + .55 * vi - .5 * qu + .1 * sc, 0, 1));
  }
  return f.provv ? c.lerp(chiaro() ? new THREE.Color(.66, .64, .6) : new THREE.Color(.78, .77, .75), .6) : c;   // non ancora letta: quasi grigia
}

// ---------------- la rete: ogni foto e' legata a quella con cui ha piu' in comune ----------------
// Tutte le foto hanno qualcosa in comune con almeno un'altra. Si parte dai legami piu' forti e si aggiungono
// finche' tutte sono collegate, senza anelli (un albero di somiglianze): ne nasce una rete che si dirama
// come le venature di una foglia, le radici, il micelio di un fungo. La radice sta in basso, nella luce;
// le vene si aprono a ventaglio verso l'alto e sono tanto piu' grosse quante piu' foto portano.
const NUCLEI = (D.nuclei || []).map(n => n.id);
const datiDi = id => (photoById[id] && photoById[id].f) || D.foto[id];
function trovaGruppo(f) {   // il gruppo di senso (serve solo ai colori «notte opaca» e «carta»)
  const k = NUCLEI.indexOf(f.nucleo); if (k >= 0) return k;
  const voti = NUCLEI.map(() => 0);
  for (const [id, w] of f.vicine || []) { const g = datiDi(id), j = g ? NUCLEI.indexOf(g.nucleo) : -1; if (j >= 0) voti[j] += w; }
  const m = Math.max(0, ...voti);
  return m > 0 ? voti.indexOf(m) : -1;
}
// quanto si somigliano due foto: i tag in comune, pesati (i primi tag contano di piu', quelli rari di piu' di quelli comuni).
// Una foto non ancora letta non ha tag: valgono le somiglianze nell'aspetto o nella frase che ha gia'
const PESO_POS = [1.3, 1.15, 1, .9, .85, .8];
let rarita = new Map();
function pesaTag() {
  const df = new Map(); photos.forEach(p => new Set(p.f.tag || []).forEach(t => df.set(t, (df.get(t) || 0) + 1)));
  rarita = new Map([...df].map(([t, n]) => [t, Math.log(1 + photos.length / n)]));
  photos.forEach(vettore);
}
function vettore(p) {
  p.vt = new Map((p.f.tag || []).map((t, i) => [t, PESO_POS[Math.min(i, 5)] * (rarita.get(t) || Math.log(1 + photos.length))]));
  p.nt = Math.sqrt([...p.vt.values()].reduce((s, v) => s + v * v, 0)) || 1;
  p.vic = new Map(p.f.vicine || []);
}
function somiglianza(p, q) {
  if (p.vt.size && q.vt.size) { let s = 0; for (const [t, v] of p.vt) s += v * (q.vt.get(t) || 0); return s / p.nt / q.nt; }
  return p.vic.get(q.id) || q.vic.get(p.id) || 0;
}
// l'albero: dai legami piu' forti, finche' tutte sono collegate (algoritmo di Prim)
function costruisciAlbero() {
  const ps = photos.filter(p => !p.hold), n = ps.length; if (!n) return;
  const best = new Float64Array(n).fill(-1), da = new Int32Array(n).fill(-1), dentro = new Uint8Array(n);
  best[0] = 0;
  for (let giro = 0; giro < n; giro++) {
    let u = -1; for (let i = 0; i < n; i++) if (!dentro[i] && (u < 0 || best[i] > best[u])) u = i;
    dentro[u] = 1;
    for (let v = 0; v < n; v++) if (!dentro[v]) { const s = somiglianza(ps[u], ps[v]); if (s > best[v]) { best[v] = s; da[v] = u; } }
  }
  ps.forEach(p => { p.vicini = []; });
  ps.forEach((p, i) => { if (da[i] >= 0) { p.vicini.push(ps[da[i]]); ps[da[i]].vicini.push(p); p.forza = best[i]; } });
  // la radice: la foto al centro della rete (a meta' del cammino piu' lungo), cosi' i rami sono il piu' corti possibile
  const lontano = s => { const d = new Map([[s, 0]]), q = [s]; for (const u of q) for (const w of u.vicini) if (!d.has(w)) { d.set(w, d.get(u) + 1); q.push(w); } return d; };
  const d0 = lontano(ps[0]), a = [...d0].sort((x, y) => y[1] - x[1])[0][0], da2 = lontano(a), b = [...da2].sort((x, y) => y[1] - x[1])[0][0], db = lontano(b);
  radice = ps.reduce((m, p) => Math.max(da2.get(p), db.get(p)) < Math.max(da2.get(m), db.get(m)) ? p : m, ps[0]);
  // da radice in su: padri, figli, profondita', quante foto porta ogni vena
  ps.forEach(p => { p.padre = null; p.figli = []; });
  const coda = [radice]; radice.prof = 0;
  for (const u of coda) for (const w of u.vicini) if (w !== u.padre && w !== radice && !w.padre) { w.padre = u; w.prof = u.prof + 1; u.figli.push(w); coda.push(w); }
  [...coda].reverse().forEach(p => { p.porta = 1 + p.figli.reduce((s, c) => s + c.porta, 0); });
  ordine = coda;
}
let radice = null, ordine = [];
const BASE = new THREE.Vector3(0, 0, 0);
const APERTURA = 1.35;                                   // mezzo ventaglio, in radianti (circa 77 gradi per parte)
const R0 = 4, PASSO = 1.55, CURVA = 60;                  // altezza della radice, distanza tra un livello e l'altro, quanto il ventaglio e' incurvato
const DMIN = 1.1;                                        // la distanza minima tra due foto: nessuna copre l'altra
const dx = new THREE.Vector3(), dy = new THREE.Vector3();
// il ventaglio: ogni vena prende uno spicchio grande quanto le foto che porta; le piu' grandi stanno in mezzo
function disponi() {
  if (!radice) return;
  const spicchio = new Map([[radice, [-APERTURA, APERTURA]]]);
  for (const p of ordine) {
    const [a0, a1] = spicchio.get(p), fig = p.figli.slice().sort((x, y) => y.porta - x.porta);
    const ord = []; fig.forEach((c, i) => i % 2 ? ord.push(c) : ord.unshift(c));   // la piu' grande in mezzo, le altre ai lati
    const tot = ord.reduce((s, c) => s + Math.pow(c.porta, .85), 0); let a = a0;
    ord.forEach(c => { const w = (a1 - a0) * Math.pow(c.porta, .85) / tot; spicchio.set(c, [a, a + w]); a += w; });
    const th = (a0 + a1) / 2, r = R0 + PASSO * Math.pow(p.prof, .95), r0 = seme(p.id);
    const x = Math.sin(th) * r * 1.05, y = Math.cos(th) * r;
    p.fine.set(x, y, -(x * x) / (2 * CURVA) + (r0() - .5) * (.6 + p.prof * .06));   // un ventaglio un po' incurvato, come quelli di mare
    p.nido = p.fine.clone();
  }
  spingi(photos.filter(p => !p.hold), 60);
}
function spingi(ps, giri, mobili) {                      // le foto troppo vicine si allontanano (anche in profondita'), restando vicine al loro posto
  for (let g = 0; g < giri; g++) {
    for (let a = 0; a < ps.length; a++) for (let b = a + 1; b < ps.length; b++) {
      const A = ps[a].fine, B = ps[b].fine;
      const ex = A.x - B.x, ey = A.y - B.y, ez = A.z - B.z; if (ex * ex + ey * ey + ez * ez >= DMIN * DMIN) continue;
      const ma = !mobili || mobili.has(ps[a]), mb = !mobili || mobili.has(ps[b]); if (!ma && !mb) continue;
      const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
      dx.set(ex, ey, ez * 2.5); if (d < 1e-4) dx.set(Math.sin(a + g), Math.cos(b), 1); dx.setLength((DMIN - d) / (ma && mb ? 2 : 1));
      if (ma) A.add(dx); if (mb) B.sub(dx);
    }
    for (const p of ps) if ((!mobili || mobili.has(p)) && p.nido) p.fine.lerp(p.nido, .02);
  }
}
// una foto nuova: si attacca alla foto con cui ha piu' in comune, un po' piu' in fuori (la rete intera si rifa' solo dopo una lettura)
function posizionaUna(p) {
  vettore(p); p.figli = []; p.vicini = []; p.porta = 1;
  let best = null, bs = -1;
  photos.forEach(q => { if (q !== p && !q.hold && q.vt) { const s = somiglianza(p, q); if (s > bs) { bs = s; best = q; } } });
  if (!best) { p.padre = null; p.prof = 0; p.fine.set(0, R0, 0); p.nido = p.fine.clone(); return; }
  p.padre = best; p.forza = bs; p.prof = best.prof + 1; best.figli.push(p); best.vicini.push(p); p.vicini.push(best);
  for (let a = best; a; a = a.padre) a.porta++;          // le vene che la portano si ingrossano
  const fuori = best.fine.clone().sub(best.padre ? best.padre.fine : BASE).normalize(), r0 = seme(p.id);
  p.fine.copy(best.fine).addScaledVector(fuori, 1.6).add(new THREE.Vector3(r0() - .5, r0() - .5, r0() - .5).multiplyScalar(1.2));
  p.nido = p.fine.clone();
  spingi(photos.filter(q => !q.hold || q === p), 50, new Set([p]));
}
const vicineDi = p => legami(p);
// le sorelle (quelle che girano intorno alla foto aperta): prima quelle legate a lei nella rete, poi le piu' simili
function legami(p) {
  const vicini = [p.padre, ...(p.figli || [])].filter(q => q && !q.hold);
  const altri = photos.filter(q => q !== p && !q.hold && !vicini.includes(q)).map(q => [q, somiglianza(p, q)]).sort((a, b) => b[1] - a[1]).slice(0, Math.max(0, 10 - vicini.length)).map(x => x[0]);
  return [...vicini, ...altri].slice(0, 10);
}
const SU = new THREE.Vector3(0, 1, 0);

// ---------------- le foto ----------------
// la sfera: la foto dentro, il vetro intorno; e' sempre rivolta verso chi guarda, da qualsiasi lato.
// Nei colori opachi e' una stampa rotonda: la foto e un bordo sottile del colore del suo gruppo di senso
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
  const p = { id, f, ph: seme(id)() * TAU, uPrev: 0, gruppo: trovaGruppo(f), fine: new THREE.Vector3(), da: new THREE.Vector3(), t0: -1e9, dur: DUR_MOSSA, padre: null, figli: [], vicini: [], prof: 0, porta: 1 };
  p.col = colore(p);
  p.can = document.createElement('canvas'); disegnaSfera(p.can, 160, p.col, null);
  p.tex = new THREE.CanvasTexture(p.can); p.tex.colorSpace = THREE.SRGBColorSpace;
  p.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: p.tex, transparent: true, depthWrite: false, color: luceSfera() }));
  p.base = .62 * (f.s || .9); p.sprite.scale.setScalar(p.base); p.sprite.userData.p = p;
  p.img = new Image(); p.img.onload = () => ridisegna(p); p.img.src = thumbSrc(id);
  scene.add(p.sprite); photos.push(p); photoById[id] = p; sprites.push(p.sprite);
  return p;
}
function aggiornaFoto(p, f) {   // la foto e' stata letta: ha i suoi tag, e la rete si rifa' con lei dentro
  p.f = f; p.gruppo = trovaGruppo(f);
  p.col = colore(p); p.base = .62 * (f.s || .9); ridisegna(p); p.lampo = performance.now() + 2200;
  rifaiTutto();
}
D.tutte.forEach(id => { if (D.foto[id]) makePhoto(id, D.foto[id]); });
pesaTag(); costruisciAlbero(); disponi();
photos.forEach(p => p.da.copy(p.fine));

// ---------------- le vene: tubi che si assottigliano verso le punte ----------------
// ogni legame e' una vena che parte dalla foto padre e continua la sua direzione, curvando verso la foto figlia;
// lo spessore dice quante foto porta. In piu' qualche filo sottile chiude un anello tra due foto vicine e molto simili
const LATI = 6, TRATTI = 10;
const vene = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
vene.renderOrder = -1; vene.frustumCulled = false; scene.add(vene);
let archi = [], PROF_MAX = 1;
let accese = null;   // le foto accese (la foto indicata o aperta e quelle legate a lei), oppure null = tutte
const spessore = p => .03 + .026 * Math.sqrt(p.porta || 1);
function arcoDi(da, a, r0, r1) {
  const P0 = da ? da.fine : BASE, dir = da ? da.fine.clone().sub(da.padre ? da.padre.fine : BASE).normalize() : SU.clone();
  const len = P0.distanceTo(a.fine);
  return { da, a, r0, r1, prof: a.prof, curva: new THREE.QuadraticBezierCurve3(P0.clone(), P0.clone().addScaledVector(dir, len * .45), a.fine.clone()) };
}
function costruisciVene() {
  archi = [];
  if (radice) archi.push(arcoDi(null, radice, spessore(radice) * 1.5, spessore(radice)));
  for (const p of photos) if (!p.hold && p.padre) archi.push(arcoDi(p.padre, p, spessore(p), spessore(p) * .8));
  // gli anelli della rete (come nel micelio): fili sottili tra foto vicine e molto simili che non sono gia' legate
  const cand = [];
  photos.forEach(p => { if (p.hold || !p.vt.size) return; photos.forEach(q => {
    if (q.id <= p.id || q.hold || !q.vt.size || q.padre === p || p.padre === q) return;
    if (p.fine.distanceTo(q.fine) < 6.5) { const s = somiglianza(p, q); if (s > .62) cand.push([s, p, q]); }
  }); });
  cand.sort((a, b) => b[0] - a[0]).slice(0, 140).forEach(([, p, q]) => {
    const m = p.fine.clone().add(q.fine).multiplyScalar(.5).add(new THREE.Vector3(0, .5, .5));
    archi.push({ da: p, a: q, r0: .02, r1: .02, prof: Math.max(p.prof, q.prof) + .5, sottile: true, curva: new THREE.QuadraticBezierCurve3(p.fine.clone(), m, q.fine.clone()) });
  });
  archi.sort((a, b) => a.prof - b.prof);
  const nv = archi.length * (TRATTI + 1) * (LATI + 1), pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint32Array(archi.length * TRATTI * LATI * 6);
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  let v = 0, k = 0;
  archi.forEach(ar => {
    ar.v0 = v; const fr = ar.curva.computeFrenetFrames(TRATTI, false);
    for (let i = 0; i <= TRATTI; i++) {
      const t = i / TRATTI, r = ar.r0 + (ar.r1 - ar.r0) * t; ar.curva.getPointAt(t, P);
      for (let j = 0; j <= LATI; j++) {
        const a = j / LATI * TAU; N.copy(fr.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(fr.binormals[i], Math.sin(a));
        pos[v * 3] = P.x + N.x * r; pos[v * 3 + 1] = P.y + N.y * r; pos[v * 3 + 2] = P.z + N.z * r; v++;
      }
    }
    for (let i = 0; i < TRATTI; i++) for (let j = 0; j < LATI; j++) { const a = ar.v0 + i * (LATI + 1) + j, b = a + LATI + 1; idx.set([a, b, a + 1, b, b + 1, a + 1], k); k += 6; }
    ar.v1 = v; ar.k1 = k;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  vene.geometry.dispose(); vene.geometry = g;
  PROF_MAX = Math.max(1, ...archi.map(a => a.prof));
  bordi = null;
  coloraVene();
}
// i colori: da quello della foto padre a quello della figlia. Sulla foto indicata (o aperta) si accende il suo cammino
// fino alla radice, le vene verso le sue figlie e i suoi fili sottili; il resto si abbassa
function coloraVene() {
  const c = vene.geometry.getAttribute('color'); if (!c) return;
  const fp = fuoco ? fuoco.p : hover, cammino = new Set();
  for (let a = fp; a; a = a.padre) cammino.add(a);
  const inch = new THREE.Color(0x2a2420), ca = new THREE.Color(), cb = new THREE.Color(), tmp = new THREE.Color();
  const base = chiaro() ? .9 : opaco() ? .8 : .5;
  archi.forEach(ar => {
    ca.copy(ar.da ? ar.da.col : ar.a.col); cb.copy(ar.a.col);
    if (chiaro()) { ca.lerp(inch, .35); cb.lerp(inch, .35); }
    let f = base * (ar.sottile ? .55 : 1);
    if (fp) {
      const acceso = ar.sottile ? ar.da === fp || ar.a === fp : (cammino.has(ar.a) && (!ar.da || cammino.has(ar.da))) || ar.da === fp;
      f = acceso ? (chiaro() ? 1 : opaco() ? .95 : .7) : chiaro() ? .22 : .08;
    }
    for (let v = ar.v0; v < ar.v1; v++) { tmp.copy(ca).lerp(cb, Math.floor((v - ar.v0) / (LATI + 1)) / TRATTI).multiplyScalar(f); c.setXYZ(v, tmp.r, tmp.g, tmp.b); }
  });
  c.needsUpdate = true;
}
function temaVene() {
  const m = vene.material; m.blending = opaco() ? THREE.NormalBlending : THREE.AdditiveBlending; m.opacity = chiaro() ? .92 : opaco() ? .85 : .9; m.needsUpdate = true;
}
// all'apertura le vene crescono dalla radice verso le punte
function crescita(fronte) {
  let k = 0; for (const ar of archi) { if (ar.prof > fronte) break; k = ar.k1; }
  vene.geometry.setDrawRange(0, fronte >= PROF_MAX + 1 ? Infinity : k);
}
// dopo una lettura o un'eliminazione: la rete si rifa' e le foto vanno piano al loro nuovo posto
function rifaiTutto() {
  const ora = performance.now();
  photos.forEach(p => { if (!p.hold) { p.da.copy(p.sprite.position); p.t0 = ora; } });
  pesaTag(); costruisciAlbero(); disponi(); costruisciVene();
}

// ---------------- il tema: fondo, bagliore, stelle, centro ----------------
function applicaTema() {
  scene.background = new THREE.Color(FONDO[palette]);
  scene.fog = new THREE.Fog(FONDO[palette], 70, chiaro() ? 150 : 170);   // le parti lontane sfumano: si capisce cosa e' vicino
  bloom.enabled = !opaco();
  stelle.visible = !chiaro(); stelle.material.opacity = palette === 'notte' ? .28 : .55;
  nucleo.visible = alone.visible = !opaco(); centroOpaco.visible = opaco();
  centroOpaco.material.color.set(chiaro() ? 0x8a7f72 : 0xd9d2c8); centroOpaco.material.opacity = chiaro() ? .55 : .3;
  document.body.classList.toggle('tema-carta', chiaro()); document.body.classList.toggle('tema-opaco', opaco());
  for (const p of photos) { p.col = colore(p); ridisegna(p); if (!p.hi) p.sprite.material.color.set(luceSfera()); }
  costruisciVene(); temaVene();
}

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

// ---------------- nascita: all'apertura la rete cresce dalla radice verso le punte, e le foto si aprono quando la loro vena arriva ----------------
let nascita = reduced ? -1e9 : performance.now();
const DUR_NASCITA = 6500;

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
  accese = new Set([p.id, ...sorelle.map(q => q.id)]); coloraVene();
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
  accese = null; coloraVene();
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
  $('fk').innerHTML = (p === ultimaArrivata ? '<span class="nuova">appena arrivata</span> · ' : 'una foto · ') + (n ? `e le ${n} foto legate a lei, che le girano intorno` : '');
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
  else if (!fuoco) controls.autoRotateSpeed = Math.sign(controls.autoRotateSpeed || 1) * .35;
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
  accese = p ? new Set([p.id, ...[p.padre, ...p.figli].filter(Boolean).map(q => q.id)]) : null;
  coloraVene();
}
function pick() {
  if (!mossoMouse || mpx.x < 0 || arrivo) return;
  mossoMouse = false;
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(sprites, false).find(h => !h.object.userData.p.hold && h.object.material.opacity > .5);
  setHover(hit ? hit.object.userData.p : null);
}
$('home').onclick = () => { if (fuoco) { torna(); return; } verso(new THREE.Vector3(0, 18, 0), CASA.clone()); };
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

// ---------------- viaggiare nella rete: la camera vola piano verso un punto ----------------
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

// ---------------- la mappa: il ventaglio visto di fronte, e dove stai guardando ----------------
// ogni foto e' un puntino del suo colore; il cerchio e' il punto che guardi. Toccando la mappa ci si vola davanti
const mappa = $('mappa'), cm = mappa.getContext('2d');
// la mappa si adatta alla rete: quanto e' larga e alta (si ricalcola quando la rete cambia)
let bordi = null;
function misuraRete() {
  let x0 = 0, x1 = 0, y0 = 0, y1 = 1; photos.forEach(p => { x0 = Math.min(x0, p.fine.x); x1 = Math.max(x1, p.fine.x); y1 = Math.max(y1, p.fine.y); });
  bordi = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, lato: Math.max(x1 - x0, y1 - y0) * 1.12 };
}
function suMappa(v) { if (!bordi) misuraRete(); const W = mappa.width, k = W * .78 / bordi.lato; return { x: W / 2 + (v.x - bordi.cx) * k, y: W / 2 - (v.y - bordi.cy) * k }; }
let ultimaMappa = 0;
function disegnaMappa(now) {
  if (now - ultimaMappa < 120) return; ultimaMappa = now;
  const dpr = Math.min(devicePixelRatio || 1, 2), L = Math.round(mappa.clientWidth * dpr);
  if (!L) return;
  if (mappa.width !== L) mappa.width = mappa.height = L;
  const W = L, k = dpr, inchiostro = chiaro() ? '42,36,30' : '236,230,225';
  cm.clearRect(0, 0, W, W);
  cm.fillStyle = chiaro() ? 'rgba(239,232,220,.86)' : 'rgba(8,7,12,.72)'; cm.beginPath(); cm.arc(W / 2, W / 2, W / 2 - k, 0, TAU); cm.fill();
  cm.strokeStyle = `rgba(${inchiostro},.22)`; cm.lineWidth = k; cm.stroke();
  cm.save(); cm.beginPath(); cm.arc(W / 2, W / 2, W / 2 - 2 * k, 0, TAU); cm.clip();
  for (const p of photos) {   // la rete in piccolo: le vene come linee sottili, le foto come puntini
    if (p.hold || !p.padre) continue;
    const a = suMappa(p.padre.fine), b = suMappa(p.fine);
    cm.strokeStyle = `rgba(${p.col.toArray().map(v => Math.round(v * 255)).join(',')},${opaco() ? .7 : .55})`; cm.lineWidth = Math.max(.6, Math.sqrt(p.porta) * .35) * k;
    cm.beginPath(); cm.moveTo(a.x, a.y); cm.lineTo(b.x, b.y); cm.stroke();
  }
  const b0 = suMappa(BASE), r = radice ? suMappa(radice.fine) : b0;
  cm.strokeStyle = `rgba(${inchiostro},.5)`; cm.lineWidth = 2 * k; cm.beginPath(); cm.moveTo(b0.x, b0.y); cm.lineTo(r.x, r.y); cm.stroke();
  const t = suMappa(fuoco ? fuoco.p.fine : controls.target);
  cm.strokeStyle = chiaro() ? '#2a2420' : '#fff4e6'; cm.lineWidth = 1.6 * k; cm.beginPath(); cm.arc(t.x, t.y, 6 * k, 0, TAU); cm.stroke();
  cm.restore();
}
mappa.addEventListener('click', e => {
  const rr = mappa.getBoundingClientRect(), dpr = mappa.width / rr.width, x = (e.clientX - rr.left) * dpr, y = (e.clientY - rr.top) * dpr;
  let best = null, bd = 1e9;
  photos.forEach(p => { if (p.hold) return; const q = suMappa(p.fine), d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = p; } });
  const vai = () => { if (best) verso(best.fine.clone(), best.fine.clone().add(new THREE.Vector3(0, 2, 15))); };
  if (fuoco) { torna(); setTimeout(vai, DUR_VOLO + 50); } else vai();
});

// ---------------- ogni fotogramma ----------------
const orb = new THREE.Vector3();
let ultimoDrone = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const t = now / 1000;
  passoVolo(now);
  passoViaggio(now);
  passoMano(now);
  // il ventaglio e' quasi piatto: da solo non gira tutto intorno (di taglio sarebbe un groviglio), oscilla piano di qua e di la'
  if (controls.autoRotate && !fuoco) { const az = controls.getAzimuthalAngle(); if ((controls.autoRotateSpeed > 0 && az < -.75) || (controls.autoRotateSpeed < 0 && az > .75)) controls.autoRotateSpeed *= -1; }
  controls.update();
  const nb = clamp((now - nascita) / DUR_NASCITA, 0, 1), eb = easeIO(nb), fronte = nb < 1 ? eb * (PROF_MAX + 1.5) - .5 : Infinity;
  crescita(fronte);
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
    const m = easeIO(clamp((now - p.t0) / p.dur, 0, 1));   // dal posto di prima verso quello nuovo (dopo una lettura)
    p.sprite.position.lerpVectors(p.da, p.fine, m);
    if (!reduced && m >= 1) {   // un respiro leggero: chi e' piena di vita si muove un po' di piu', chi e' ferita trema
      const a = .015 + .035 * vi;
      p.sprite.position.x += Math.sin(t * (.4 + vi) + p.ph) * a + (tr ? Math.sin(t * 19 + p.ph * 5) * .015 * tr : 0);
      p.sprite.position.y += Math.cos(t * (.33 + vi * .8) + p.ph * 1.3) * a;
    }
    let sc = p.base * (1 + .06 * vi * Math.sin(t * 2.4 + p.ph)) * (m < 1 ? .4 + .6 * m : 1) * sstep(p.prof - .3, p.prof + .7, fronte);
    if (p.orbita) {   // sorella: si stacca dalla rete e gira intorno alla foto scelta
      const o = p.orbita; o.k = clamp(o.k + (o.su ? .022 : -.03), 0, 1);
      const e = easeIO(o.k), ang = o.i / o.n * TAU + t * .12, R = (fuoco && fuoco.p.hi ? 1.5 * Math.max(1, fuoco.p.hi.asp) + 1.1 : 2.35) + .25 * Math.sin(t * .7 + o.i);   // con la foto aperta l'orbita si allarga: le sorelle le girano intorno senza coprirla
      orb.copy(o.centro).addScaledVector(dx, Math.cos(ang) * R).addScaledVector(dy, Math.sin(ang) * R * .82);
      p.sprite.position.lerp(orb, e); sc *= 1 + .45 * e;
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
  pick();
  passoArrivo(now);
  passoRegia(now);
  composer.render();
  disegnaMappa(now);
  $('intro').classList.toggle('hide', camera.position.distanceTo(controls.target) < 35 || !!fuoco);
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
  $('introp').textContent = `${n} foto${D.luogo ? ' di ' + D.luogo : ''}, raccolte da chi le ha vissute. Ogni foto ha qualcosa in comune con almeno un'altra, ed è legata a quella con cui ne ha di più: così la memoria cresce come le venature di una foglia, le radici, il micelio di un fungo. Le vene sono tanto più grosse quante più foto portano. Passa su una foto: si accende il suo cammino fino alla radice.` +
    (prov ? ` ${prov === 1 ? '1 foto, quasi grigia, ha' : prov + ' foto, quasi grigie, hanno'} ancora un posto provvisorio, vicino alle foto che le somigliano: aspetta${prov === 1 ? '' : 'no'} di essere lett${prov === 1 ? 'a' : 'e'}.` : '');
  $('qrmeta').textContent = arrivate + ' foto arrivate dai telefoni';
}
function addArrival(a, animate) {
  if (!a.dato || photoById[a.id] || arrQueue.some(x => x.id === a.id) || (arrivo && arrivo.a.id === a.id)) return;
  if (animate) { arrQueue.push(a); return; }
  const p = makePhoto(a.id, a.dato); posizionaUna(p); p.da.copy(p.fine); costruisciVene(); counts();
}
function nextArrival(now) {
  if (arrivo || !arrQueue.length || now < fineUltimo + PAUSA) return;
  if (fuoco) { torna(); return; }   // l'arrivo deve vedersi: prima si torna alla nebulosa
  const a = arrQueue.shift(), p = makePhoto(a.id, a.dato); p.hold = true; posizionaUna(p); counts();
  // la strada: dalla luce alla radice, poi lungo le vene fino alla foto a cui si attacca
  const tappe = []; for (let q = p.padre; q; q = q.padre) tappe.unshift(q.fine.clone());
  const curva = new THREE.CatmullRomCurve3([BASE.clone(), ...tappe, p.fine.clone()]);
  p.pts = new Float32Array(curva.getPoints(40 + 8 * tappe.length).flatMap(v => [v.x, v.y, v.z])); p.n = p.pts.length / 3;
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
    s.position.set(0, 0, 0); s.scale.setScalar(p.base * 5.5 * sstep(0, T1 * .7, el));
  } else if (el < T2) {                                     // 2. risale le vene fino al suo posto, lasciando una scia
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
    linea.material.opacity = 1 - v;                         // la scia sparisce: resta la foto, con la sua vena
    if (el >= T3) {
      p.hold = false; p.da.copy(p.fine); p.t0 = -1e9; scene.remove(linea, onda); linea.geometry.dispose(); costruisciVene();
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
  rifaiTutto();
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

applicaTema();
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
const mano = { vista: false, ultima: -1e9, x: .5, y: .5, vx: .5, vy: .5, bersaglio: null, da: 0, carica: 0, due: false, contaDue: 0, d0: 1, r0: 34, dd: 1, pa: null, pb: null };
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
      runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .55, minHandPresenceConfidence: .55, minTrackingConfidence: .5,
    });
    await apriCamera(memo('nebulosa-camera'));
  } catch (e) {
    senzaMano();
  }
}
async function apriCamera(id) {
  if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
  const vincoli = { width: 640, height: 480, ...(id ? { deviceId: { exact: id } } : { facingMode: 'user' }) };
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
    return { L: mani.slice().sort((a, b) => taglia(b) - taglia(a))[0] || null, mani };
  }
  if (!rilevatore || video.readyState < 2 || video.currentTime === ultimoVideo) return null;
  ultimoVideo = video.currentTime;
  const r = rilevatore.detectForVideo(video, now);
  // la mano che comanda: la piu' grande, cioe' la piu' vicina
  let L = null, best = 0;
  (r.landmarks || []).forEach(m => { const s = Math.hypot(m[0].x - m[9].x, m[0].y - m[9].y); if (s > best) { best = s; L = m; } });
  disegnaAnteprima(r.landmarks || [], L);
  return { L, mani: r.landmarks || [] };
}
const taglia = m => Math.hypot(m[0].x - m[9].x, m[0].y - m[9].y);   // quanto e' grande una mano nell'inquadratura

// ---------------- lo zoom con due mani: allargarle avvicina, stringerle allontana ----------------
// conta solo la distanza tra i due palmi: nessuna forma delle dita
function dueMani(mani) { return mani.slice().sort((a, b) => taglia(b) - taglia(a)).slice(0, 2).map(palmo); }
function aggiornaDueMani(mani) {
  // due palmi quasi sovrapposti sono la stessa mano vista due volte: non contano come due mani
  let due = mani.length >= 2;
  if (due) { const [a, b] = dueMani(mani); if (Math.hypot(a.x - b.x, a.y - b.y) < .07) due = false; }
  // con un po' di pazienza: la webcam a volte perde una mano per un attimo
  mano.contaDue = due === mano.due ? 0 : mano.contaDue + 1;
  if (mano.contaDue >= (due ? 3 : 6)) {
    mano.due = due; mano.contaDue = 0;
    if (due) {
      const [a, b] = dueMani(mani);
      mano.d0 = Math.hypot(a.x - b.x, a.y - b.y); mano.r0 = camera.position.distanceTo(controls.target);
      mano.bersaglio = null; mano.carica = 0; setHover(null);
    }
  }
  if (mano.due && due) {
    const [a, b] = dueMani(mani), d = Math.hypot(a.x - b.x, a.y - b.y);
    // un salto improvviso della distanza (una mano persa o scambiata per un attimo) non e' un gesto vero: lo ignoro
    if (!mano.pa || Math.abs(d - mano.dd) < Math.max(.06, mano.dd * .3)) { mano.pa = a; mano.pb = b; mano.dd = d; }
  }
}
function zoomDueMani() {
  if (fuoco && (!fuoco.arrivato || fuoco.uscita)) return;   // durante un volo la camera e' gia' in movimento
  // da quando le mani si sono alzate insieme: il doppio della distanza tra i palmi = circa due volte e mezzo piu' vicino
  // limiti dello zoom con le mani: non si entra nel nucleo luminoso al centro, e non ci si allontana oltre un po' piu' della vista iniziale
  const vicino = fuoco ? 2.2 : 4, lontano = fuoco ? 14 : 110;
  const voluto = clamp(mano.r0 * Math.pow(mano.d0 / Math.max(mano.dd, .02), 1.2), vicino, lontano);
  scarto.copy(camera.position).sub(controls.target); sferica.setFromVector3(scarto);
  sferica.radius += (voluto - sferica.radius) * .2;
  scarto.setFromSpherical(sferica); camera.position.copy(controls.target).add(scarto);
}
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
  sferica.theta -= ox / d * forza * .4 * dt;           // mano a destra: la nebulosa gira verso destra
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
      mano.vista = false; mano.due = false; mano.contaDue = 0; mano.bersaglio = null; mano.carica = 0; setHover(null); riprendiGiro();
    }
  }
  // senza mano per un po': si torna alla nebulosa (solo se ci si era entrati con la mano)
  // vale anche per la foto appena arrivata dal QR, se mentre si e' dentro una mano e' stata vista (se nessuno c'e', la foto nuova resta i suoi 20 secondi)
  if (!mano.vista && fuoco && !fuoco.uscita && fuoco.arrivato && mano.ultima >= fuoco.t0 - 500 && now - mano.ultima > VIA_MANO) { torna(); }
  if (r && r.L) aggiornaDueMani(r.mani || []);
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
    : mano.bersaglio ? 'Tieni ferma la mano: stai entrando in questa foto' : 'Muovi la mano: la luce si aggancia alle foto · verso i bordi la nebulosa gira';
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
window.__nebulosa = { photos, photoById, camera, controls, setHover, vola, torna, regia, legami, NUCLEI, get radice() { return radice; }, archi: () => archi, get fuoco() { return fuoco; }, get palette() { return palette; } };   // per provare dalla console
