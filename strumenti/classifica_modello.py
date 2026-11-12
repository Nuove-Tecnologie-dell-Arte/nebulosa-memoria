"""Riconosce pavimento e pareti nel Gaussian Splat dell'Accademia e li salva in file che si aprono con altri programmi.

Scrive nella cartella modello/:
- accademia-classi.ply        nuvola di punti (x, y, z, colore, classe): pavimento verde, pareti rosse, il resto
                              con il suo colore vero. Si apre con CloudCompare, MeshLab, Blender.
                              La proprieta' «classe» vale 0 = altro, 1 = pavimento, 2 = parete.
- accademia-pavimento-pareti.ply  lo splat vero (formato 3DGS, con tutte le proprieta') con solo pavimento e pareti:
                              si apre con SuperSplat o con qualsiasi visore di Gaussian Splat
- pianta.png                  la pianta vista dall'alto: pavimento verde, pareti rosse, linea centrale del corridoio bianca

Le regole sono le stesse di prepara_modello.py: il modello ha z verso l'alto, il pavimento a z ~ 0.
- pavimento: le macchie tra z -0,04 e 0,025, nei quadretti di pianta (1 cm del modello) dove il pavimento e' fitto
- pareti:    le macchie tra z 0,03 e 0,3 nei quadretti dove, all'altezza di una persona (z 0,06-0,16), c'e' molta materia

Uso, dalla cartella New Nebulosa:
    .venv\\Scripts\\python.exe strumenti\\classifica_modello.py "C:\\percorso\\splat.ply"
"""
import json, os, sys
import numpy as np
from scipy import ndimage as nd
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from leggi_splat import apri
from prepara_modello import griglie, punto_rettangolo, CELLA, SH_C0

PROGETTO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USCITA = os.path.join(PROGETTO, 'modello')


def classi(P, op):
    lo, pavimento, muri = griglie(P, op)
    H, W = muri.shape
    zona_pav = nd.binary_closing(pavimento > .5, iterations=2) & ~(muri > 12)
    zona_muro = nd.binary_dilation(muri > 12, iterations=1)
    i = np.clip(((P[:, 0] - lo[0]) / CELLA).astype(int), 0, W - 1)
    j = np.clip(((P[:, 1] - lo[1]) / CELLA).astype(int), 0, H - 1)
    c = np.zeros(len(P), np.uint8)
    c[(P[:, 2] > -.04) & (P[:, 2] < .025) & zona_pav[j, i]] = 1
    c[(P[:, 2] >= .03) & (P[:, 2] < .3) & zona_muro[j, i]] = 2
    return c, lo, zona_pav, zona_muro


def scrivi_nuvola(percorso, P, rgb, c):
    out = np.zeros(len(P), dtype=[('x', '<f4'), ('y', '<f4'), ('z', '<f4'), ('red', 'u1'), ('green', 'u1'), ('blue', 'u1'), ('classe', 'u1')])
    out['x'], out['y'], out['z'] = P[:, 0], P[:, 1], P[:, 2]
    col = rgb.copy()
    col[c == 1] = (60, 200, 90)
    col[c == 2] = (225, 60, 50)
    out['red'], out['green'], out['blue'] = col[:, 0], col[:, 1], col[:, 2]
    out['classe'] = c
    testa = ('ply\nformat binary_little_endian 1.0\n'
             'comment Accademia: classe 0 = altro, 1 = pavimento, 2 = parete\n'
             f'element vertex {len(P)}\n'
             'property float x\nproperty float y\nproperty float z\n'
             'property uchar red\nproperty uchar green\nproperty uchar blue\nproperty uchar classe\nend_header\n')
    with open(percorso, 'wb') as f:
        f.write(testa.encode()); out.tofile(f)


def scrivi_splat_ply(percorso, v, tieni):
    """Lo splat originale (tutte le proprieta' 3DGS) con solo le macchie scelte."""
    nomi = v.dtype.names
    testa = ('ply\nformat binary_little_endian 1.0\n' f'element vertex {int(tieni.sum())}\n' +
             ''.join(f'property float {k}\n' for k in nomi) + 'end_header\n')
    with open(percorso, 'wb') as f:
        f.write(testa.encode())
        idx = np.nonzero(tieni)[0]
        for a in range(0, len(idx), 500_000):   # a pezzi: il file originale e' grande
            np.asarray(v[idx[a:a + 500_000]]).tofile(f)


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    os.makedirs(USCITA, exist_ok=True)
    v = apri(sys.argv[1])
    P = np.stack([v['x'], v['y'], v['z']], 1).astype(np.float32)
    op = 1 / (1 + np.exp(-v['opacity'].astype(np.float32)))
    rgb = np.clip((.5 + SH_C0 * np.stack([v[f'f_dc_{i}'] for i in range(3)], 1)) * 255, 0, 255).astype(np.uint8)
    c, lo, zona_pav, zona_muro = classi(P, op)
    n1, n2 = int((c == 1).sum()), int((c == 2).sum())
    print(f'  pavimento: {n1} macchie · pareti: {n2} · altro: {len(c) - n1 - n2}')

    scrivi_nuvola(os.path.join(USCITA, 'accademia-classi.ply'), P, rgb, c)
    print('  accademia-classi.ply')
    scrivi_splat_ply(os.path.join(USCITA, 'accademia-pavimento-pareti.ply'), v, c > 0)
    print('  accademia-pavimento-pareti.ply')

    # la pianta
    H, W = zona_muro.shape
    img = np.full((H, W, 3), 12, np.uint8)
    img[zona_pav] = (60, 200, 90)
    img[zona_muro] = (225, 60, 50)
    try:
        cor = json.load(open(os.path.join(USCITA, 'corridoi.json')))
        x0, y0, x1, y1 = cor['anello']
        for t in np.linspace(0, 1, 4000, endpoint=False):
            p = punto_rettangolo(x0, y0, x1, y1, t)
            img[int((p[1] - lo[1]) / CELLA), int((p[0] - lo[0]) / CELLA)] = (255, 255, 255)
    except FileNotFoundError:
        pass
    Image.fromarray(img[::-1]).resize((W * 4, H * 4), Image.NEAREST).save(os.path.join(USCITA, 'pianta.png'))
    print('  pianta.png')


if __name__ == '__main__':
    main()
