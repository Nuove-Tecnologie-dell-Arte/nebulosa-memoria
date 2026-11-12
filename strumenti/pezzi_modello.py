"""Divide il modello del chiostro in pezzi, per disegnare solo quelli che si vedono (come nei videogiochi).

Ogni macchia del Gaussian Splat va al pezzo del corridoio piu' vicino: 6 tratti per ognuno dei 4 lati dell'anello
(con le stanze e le porte che si affacciano su quel tratto, e il blocco dello scalone sul lato 4). Le macchie in mezzo
al cortile vanno a 4 pezzi «cortile», uno per lato.
Per ogni pezzo scrive due file in modello/pezzi/:
- <nome>.splat          il pezzo intero
- <nome>-ridotto.splat  solo le macchie piu' importanti (un quarto): per i pezzi lontani o visti dalle finestre.
                        Non fonde le macchie (i livelli di dettaglio di Spark lo facevano, e lasciavano veli): sono solo piu' rade
e indice.json con, per ogni pezzo, il lato, il tratto dell'anello (t0-t1) e la scatola che lo contiene (sullo schermo).

Il modello originale non viene toccato. Uso, dalla cartella New Nebulosa:
    .venv\\Scripts\\python.exe strumenti\\pezzi_modello.py "C:\\percorso\\splat.ply"
    .venv\\Scripts\\python.exe strumenti\\pezzi_modello.py "C:\\percorso\\splat.ply" --massima
Con --massima scrive anche <nome>-max.ply: il pezzo con tutte le proprieta' del .ply originale, compresi i colori che
cambiano con il punto di vista (riflessi su marmo e vetri). La pagina li usa con ?qualita=massima, scaricandoli solo
quando servono.
"""
import json, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from leggi_splat import apri
from prepara_modello import SH_C0

PROGETTO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USCITA = os.path.join(PROGETTO, 'modello', 'pezzi')
SCALA = 10            # come nella pagina: un'unita' del modello = 10 sullo schermo
TRATTI = 6            # pezzi per lato
QUOTA_RIDOTTO = .25   # quante macchie tiene la versione ridotta
CORTILE = .25         # oltre questa distanza dalla linea centrale, verso il cortile, una macchia e' «del cortile»
SCALONE = (.83, .91)  # il tratto del lato 4 dove lo scalone entra nel cortile: le sue macchie restano al corridoio
MASSIMA = '--massima' in sys.argv   # anche i pezzi alla massima qualita' (<nome>-max.ply, con i riflessi): circa 520 MB in tutto


def splat_bytes(v, idx, op):
    out = np.zeros(len(idx), dtype=[('p', '<f4', 3), ('s', '<f4', 3), ('c', 'u1', 4), ('r', 'u1', 4)])
    for i, k in enumerate('xyz'): out['p'][:, i] = v[k][idx]
    for i in range(3): out['s'][:, i] = np.exp(v[f'scale_{i}'][idx])
    for i in range(3): out['c'][:, i] = np.clip((.5 + SH_C0 * v[f'f_dc_{i}'][idx]) * 255, 0, 255).astype(np.uint8)
    out['c'][:, 3] = np.clip(op[idx] * 255, 0, 255).astype(np.uint8)
    q = np.stack([v[f'rot_{i}'][idx] for i in range(4)], 1).astype(np.float32)
    q /= np.maximum(np.linalg.norm(q, axis=1, keepdims=True), 1e-9)
    out['r'] = np.clip(q * 128 + 128, 0, 255).astype(np.uint8)
    s = np.sort(out['s'], axis=1)
    peso = op[idx] * s[:, 1] * s[:, 2]               # opache e larghe prima (le pareti sono macchie piatte)
    return out[np.argsort(-peso)]


def scrivi_ply(percorso, v, idx):
    """Il pezzo alla massima qualita': il .ply originale (3DGS) con tutte le proprieta', compresi i colori che cambiano
    con il punto di vista (f_rest, le armoniche sferiche). Solo le normali (nx, ny, nz) restano fuori: Spark non le usa."""
    nomi = [k for k in v.dtype.names if k not in ('nx', 'ny', 'nz')]
    out = np.empty(len(idx), dtype=[(k, '<f4') for k in nomi])
    for a in range(0, len(idx), 500_000):   # a pezzi: il file originale e' grande
        parte = np.asarray(v[idx[a:a + 500_000]])
        for k in nomi: out[k][a:a + len(parte)] = parte[k]
    testa = ('ply\nformat binary_little_endian 1.0\n' f'element vertex {len(idx)}\n' +
             ''.join(f'property float {k}\n' for k in nomi) + 'end_header\n')
    with open(percorso, 'wb') as f:
        f.write(testa.encode()); out.tofile(f)
    return os.path.getsize(percorso)


def scatola(P):   # la scatola sullo schermo (x, alto, -y), senza le macchie sperdute
    lo, hi = np.percentile(P, .5, axis=0), np.percentile(P, 99.5, axis=0)
    a = np.array([lo[0], lo[2], -hi[1]]) * SCALA; b = np.array([hi[0], hi[2], -lo[1]]) * SCALA
    return [round(float(x), 3) for x in a], [round(float(x), 3) for x in b]


def main():
    if len([a for a in sys.argv[1:] if not a.startswith("--")]) < 1:
        print(__doc__); sys.exit(1)
    os.makedirs(USCITA, exist_ok=True)
    cor = json.load(open(os.path.join(PROGETTO, 'modello', 'corridoi.json')))
    x0, y0, x1, y1 = cor['anello']
    W, H = x1 - x0, y1 - y0; PER = 2 * (W + H)
    # i lati nello stesso ordine e verso della pagina (t da 0 a 1): sullo schermo z = -y
    lati = [((x0, y1), (1, 0), W), ((x1, y1), (0, -1), H), ((x1, y0), (-1, 0), W), ((x0, y0), (0, 1), H)]
    v = apri(sys.argv[1])
    P = np.stack([v['x'], v['y'], v['z']], 1).astype(np.float32)
    op = 1 / (1 + np.exp(-v['opacity'].astype(np.float32)))
    n = len(P)
    best = np.full(n, 1e9, np.float32); lato = np.zeros(n, np.int8); s_l = np.zeros(n, np.float32); lat = np.zeros(n, np.float32)
    s0 = 0
    for k, ((ax, ay), (dx, dy), L) in enumerate(lati):
        rel = P[:, :2] - np.array([ax, ay], np.float32)
        s = rel @ np.array([dx, dy], np.float32); l = rel @ np.array([dy, -dx], np.float32)   # l > 0 verso il cortile
        sc = np.clip(s, 0, L); d = np.hypot(s - sc, l)
        m = d < best; best[m] = d[m]; lato[m] = k; s_l[m] = sc[m]; lat[m] = l[m]
    inizio = np.cumsum([0] + [L for _, _, L in lati])[:4]
    t = (inizio[lato] + s_l) / PER
    cortile = (lat > CORTILE) & ~((lato == 3) & (t > SCALONE[0]) & (t < SCALONE[1]))
    lunghi = np.array([L for _, _, L in lati], np.float32)
    tratto = np.clip((s_l / lunghi[lato] * TRATTI).astype(int), 0, TRATTI - 1)   # per indice: nessuna macchia resta fuori
    pezzi = []
    for k, (_, _, L) in enumerate(lati):
        t0k, t1k = inizio[k] / PER, (inizio[k] + L) / PER
        for j in range(TRATTI):
            a, b = t0k + (t1k - t0k) * j / TRATTI, t0k + (t1k - t0k) * (j + 1) / TRATTI
            idx = np.nonzero((lato == k) & ~cortile & (tratto == j))[0]
            pezzi.append((f'lato{k + 1}-{j + 1}', k, a, b, idx, False))
        idx = np.nonzero((lato == k) & cortile)[0]
        pezzi.append((f'cortile{k + 1}', k, t0k, t1k, idx, True))
    indice = []
    for nome, k, a, b, idx, ecortile in pezzi:
        if len(idx) == 0: continue
        dati = splat_bytes(v, idx, op)
        dati.tofile(os.path.join(USCITA, nome + '.splat'))
        r = max(2000, int(len(dati) * QUOTA_RIDOTTO))
        dati[:r].tofile(os.path.join(USCITA, nome + '-ridotto.splat'))
        lo, hi = scatola(P[idx])
        voce = {'nome': nome, 'lato': int(k), 't0': round(float(a), 5), 't1': round(float(b), 5), 'cortile': ecortile,
                'macchie': int(len(dati)), 'ridotte': int(r), 'min': lo, 'max': hi}
        if MASSIMA:
            voce['massima'] = scrivi_ply(os.path.join(USCITA, nome + '-max.ply'), v, idx)
        indice.append(voce)
        print(f'  {nome:12s} {len(dati):8d} macchie, ridotto {r:7d}' + (f', massima {voce["massima"] / 1e6:.0f} MB' if MASSIMA else ''))
    json.dump({'scala': SCALA, 'pezzi': indice}, open(os.path.join(USCITA, 'indice.json'), 'w'), indent=1)
    print(f'  {len(indice)} pezzi, {sum(p["macchie"] for p in indice)} macchie in tutto -> {USCITA}')


if __name__ == '__main__':
    main()
