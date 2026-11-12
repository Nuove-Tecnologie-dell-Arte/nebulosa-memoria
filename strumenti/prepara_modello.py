"""Prepara il modello 3D del piano dell'Accademia per la nebulosa nei corridoi.

Legge il Gaussian Splat (.ply, formato 3DGS) e scrive nella cartella modello/:
- accademia.splat  il modello alleggerito (formato .splat: 32 byte a macchia, senza i riflessi che cambiano col punto di vista)
- accademia-leggero.splat  solo le macchie piu' importanti, per i computer meno potenti (la pagina usa quello intero; con ?qualita=bassa questo)
- corridoi.json    dove passa il corridoio (la linea centrale dell'anello), quanto e' largo, l'altezza del pavimento,
                   e la pianta dei muri (per nascondere le bolle che stanno dietro un muro)

Il modello ha l'asse z verso l'alto, il pavimento a z~0 e il soffitto delle arcate a z~0.27.

Uso, dalla cartella New Nebulosa:
    .venv\\Scripts\\python.exe strumenti\\prepara_modello.py "C:\\percorso\\splat.ply"
"""
import base64, json, os, sys
import numpy as np
from scipy import ndimage as nd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from leggi_splat import apri

PROGETTO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USCITA = os.path.join(PROGETTO, 'modello')
SH_C0 = 0.28209479177387814
OPACITA_MIN = 0.02      # le macchie quasi trasparenti non si vedono: via
CELLA = 0.01            # la pianta dei muri: un quadretto ogni 0,01 unita'
MACCHIE_LEGGERO = 900_000   # la versione leggera (accademia-leggero.splat), per i computer con la scheda video integrata


def scrivi_splat(v, percorso):
    op = 1 / (1 + np.exp(-v['opacity'].astype(np.float32)))
    tieni = op > OPACITA_MIN
    n = int(tieni.sum())
    out = np.zeros(n, dtype=[('p', '<f4', 3), ('s', '<f4', 3), ('c', 'u1', 4), ('r', 'u1', 4)])
    for i, k in enumerate('xyz'):
        out['p'][:, i] = v[k][tieni]
    for i in range(3):
        out['s'][:, i] = np.exp(v[f'scale_{i}'][tieni])
    for i in range(3):
        out['c'][:, i] = np.clip((.5 + SH_C0 * v[f'f_dc_{i}'][tieni]) * 255, 0, 255).astype(np.uint8)
    out['c'][:, 3] = np.clip(op[tieni] * 255, 0, 255).astype(np.uint8)
    q = np.stack([v[f'rot_{i}'][tieni] for i in range(4)], 1).astype(np.float32)   # w, x, y, z
    q /= np.maximum(np.linalg.norm(q, axis=1, keepdims=True), 1e-9)
    out['r'] = np.clip(q * 128 + 128, 0, 255).astype(np.uint8)
    # le macchie piu' importanti per prime: opache e larghe (l'area delle due misure maggiori: le pareti sono macchie piatte,
    # col volume sparirebbero). Cosi' mentre il file arriva si vede subito la forma, e la versione leggera e' l'inizio del file
    s = np.sort(out['s'], axis=1)
    peso = op[tieni] * s[:, 1] * s[:, 2]
    out = out[np.argsort(-peso)]
    out.tofile(percorso)
    out[:min(n, MACCHIE_LEGGERO)].tofile(percorso.replace('.splat', '-leggero.splat'))
    return n, len(v)


def griglie(P, op):
    lo = P[:, :2].min(0) - .02
    hi = P[:, :2].max(0) + .02
    W, H = (np.ceil((hi - lo) / CELLA)).astype(int)
    def griglia(sel):
        g = np.zeros((H, W), np.float32)
        i = ((P[sel, 0] - lo[0]) / CELLA).astype(int); j = ((P[sel, 1] - lo[1]) / CELLA).astype(int)
        np.add.at(g, (j, i), op[sel])
        return g
    pavimento = griglia((P[:, 2] > -.04) & (P[:, 2] < .025) & (op > .2))
    muri = griglia((P[:, 2] > .06) & (P[:, 2] < .16) & (op > .3))
    return lo, pavimento, muri


def anello(lo, pavimento, muri):
    """La linea centrale del corridoio ad anello: un rettangolo tra il muro esterno e le arcate verso il cortile."""
    muro = muri > 12
    ys, xs = np.nonzero(nd.binary_closing(pavimento > .5, iterations=3))
    c = np.array([xs.mean(), ys.mean()])
    medi = []
    for th in np.linspace(0, 2 * np.pi, 1440, endpoint=False):
        d = np.array([np.cos(th), np.sin(th)]); colpi = []
        for r in np.arange(max(muro.shape), 10, -.5):
            x, y = (c + d * r).astype(int)
            if 0 <= x < muro.shape[1] and 0 <= y < muro.shape[0] and muro[y, x]:
                colpi.append(r)
        if not colpi:
            continue
        fuori = colpi[0]
        dentro = next((h for h in colpi if fuori - h > 12), None)   # le arcate: almeno 12 cm piu' dentro
        if dentro:
            medi.append(c + d * (fuori + dentro) / 2)
    M = np.array(medi)
    rel = M - c
    mezzo = np.abs(rel).max(0)
    lato_x = np.abs(rel[:, 0]) / mezzo[0] > np.abs(rel[:, 1]) / mezzo[1]
    sx = np.median(M[lato_x & (rel[:, 0] < 0), 0]); dx = np.median(M[lato_x & (rel[:, 0] > 0), 0])
    giu = np.median(M[~lato_x & (rel[:, 1] < 0), 1]); su = np.median(M[~lato_x & (rel[:, 1] > 0), 1])
    # in coordinate del modello
    x0, x1 = lo[0] + sx * CELLA, lo[0] + dx * CELLA
    y0, y1 = lo[1] + giu * CELLA, lo[1] + su * CELLA
    # la mezza larghezza utile: dalla linea centrale al muro piu' vicino, presa bassa (meglio non toccare i muri)
    dist = nd.distance_transform_edt(~muro) * CELLA
    campioni = []
    for t in np.linspace(0, 1, 400, endpoint=False):
        p = punto_rettangolo(x0, y0, x1, y1, t)
        i, j = int((p[0] - lo[0]) / CELLA), int((p[1] - lo[1]) / CELLA)
        campioni.append(dist[j, i])
    return [float(x0), float(y0), float(x1), float(y1)], float(np.percentile(campioni, 20))


def punto_rettangolo(x0, y0, x1, y1, t):
    w, h = x1 - x0, y1 - y0; s = (t % 1) * 2 * (w + h)
    if s < w: return np.array([x0 + s, y0])
    s -= w
    if s < h: return np.array([x1, y0 + s])
    s -= h
    if s < w: return np.array([x1 - s, y1])
    return np.array([x0, y1 - (s - w)])


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    os.makedirs(USCITA, exist_ok=True)
    v = apri(sys.argv[1])
    n, tot = scrivi_splat(v, os.path.join(USCITA, 'accademia.splat'))
    print(f'  accademia.splat: {n} macchie su {tot}')
    P = np.stack([v['x'], v['y'], v['z']], 1).astype(np.float32)
    op = 1 / (1 + np.exp(-v['opacity'].astype(np.float32)))
    lo, pavimento, muri = griglie(P, op)
    rett, mezza = anello(lo, pavimento, muri)
    muro = nd.binary_dilation(muri > 12, iterations=1)
    H, W = muro.shape
    bit = np.packbits(muro.astype(np.uint8).ravel())
    dati = {
        'asse_su': 'z', 'pavimento': 0.0, 'soffitto': 0.27,
        'anello': rett, 'mezza_larghezza': round(mezza, 4),
        'pianta': {'origine': [float(lo[0]), float(lo[1])], 'cella': CELLA, 'larghezza': int(W), 'altezza': int(H),
                   'muri': base64.b64encode(bit.tobytes()).decode()},
    }
    json.dump(dati, open(os.path.join(USCITA, 'corridoi.json'), 'w'), indent=1)
    print(f'  corridoi.json: anello {np.round(rett, 3).tolist()}, mezza larghezza {mezza:.3f}')


if __name__ == '__main__':
    main()
