"""Genera dati/dati.js (i dati che la nebulosa disegna) da dati/analisi.json, dati/mappa.json e dalle foto in foto/full.

analisi.json contiene la lettura di ogni foto:  {"lettura": cosa rappresenta, "tag": [...]}
I tag non si vedono nella nebulosa: servono solo a capire quanto due foto si somigliano nel senso.

mappa.json conserva il posto di ogni foto, cosi' le foto nuove si aggiungono senza spostare le altre:
  p3 / p2   la posizione nello spazio (3D) e nel piano (2D): le foto simili stanno vicine
  h, l      il colore: foto vicine nel senso hanno colori vicini
  provv     true se il posto e' provvisorio (foto arrivata dal telefono e non ancora letta)

Una foto appena arrivata entra subito tra le altre, vicino a quelle che le somigliano: per la sua frase
(se chi l'ha mandata ne ha scritta una) o, in mancanza, per l'aspetto. Quando viene letta, il suo posto
diventa definitivo e nasce dal senso, come per tutte le altre.

Uso (dalla cartella nebulosa-memoria):
      python3 programma/genera_dati.py               aggiorna dati.js (le foto nuove trovano posto, le altre restano dove sono)
      python3 programma/genera_dati.py --ridisponi   ricalcola da capo i posti di tutte le foto
      python3 programma/genera_dati.py --da-leggere  elenca le foto ancora senza lettura
"""
import json, math, os, re, sys, zlib
import numpy as np

PROGETTO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # la cartella nebulosa-memoria
DATI = os.path.join(PROGETTO, 'dati')
ANALISI = os.path.join(DATI, 'analisi.json')
MAPPA = os.path.join(DATI, 'mappa.json')
ARRIVI = os.path.join(DATI, 'arrivi.json')
DATI_JS = os.path.join(DATI, 'dati.js')
FULL = os.path.join(PROGETTO, 'foto', 'full')
THUMB = os.path.join(PROGETTO, 'foto', 'thumb')

# il carattere del movimento: quali letture fanno muovere una foto in quale modo
MOTI = [
    {'comunità', 'lavorare insieme', 'dialogo', 'amicizia', 'complicità', 'gioia', 'presenza di molti', 'gioco', 'voce collettiva',
     'festa', 'incontro', 'noi umani', 'protesta', 'ironia', 'passare il sapere', 'abitare lo spazio', 'emozione', 'movimento'},   # vita
    {'vuoto', 'assenza', 'silenzio', 'buio', 'attesa', 'solitudine', 'malinconia', 'riposo', 'quiete', 'stanchezza', 'dopo la fatica',
     'angoli dimenticati', 'nostalgia'},                                                                                         # quiete
    {'ferita e cura', 'consumo', 'fragilità', 'rovina', 'inquietudine', 'angoscia', 'scarto', 'errore', 'precarietà'},          # tremore
    {'passaggio', 'soglia', 'attraversare', 'salire', 'vertigine', 'profondità', 'guardare attraverso', 'viaggio', 'trasportare',
     'uscita', 'orientarsi'},                                                                                                    # scivolare
]
POS = [1.3, 1.15, 1.0, .9, .85, .8]   # i primi tag di una lettura contano un po' di piu'
K = 10                                 # quante vicine per foto
RC = lambda n: .33 * math.sqrt(math.pi / max(n, 1))   # raggio di una foto nel cerchio 2D


def carica(nome, vuoto):
    try:
        return json.load(open(nome, encoding='utf-8'))
    except (FileNotFoundError, json.JSONDecodeError):
        return vuoto

def salva(nome, dati):
    tmp = nome + '.tmp'
    json.dump(dati, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    os.replace(tmp, nome)

def leggi():
    return carica(ANALISI, {'luogo': '', 'foto': {}})

def scrivi(a):
    salva(ANALISI, a)

def tutte():
    return sorted(f[:-4] for f in os.listdir(FULL) if f.endswith('.jpg'))

def caso(fid):
    return np.random.default_rng(zlib.crc32(fid.encode()))


# ---------------- quanto due foto si somigliano nel senso ----------------
def somiglianze(ids, foto):
    """Tag in comune, pesati per rarita' (0..1)."""
    tag = sorted({t for i in ids for t in foto[i]['tag']})
    col = {t: k for k, t in enumerate(tag)}
    X = np.zeros((len(ids), len(tag)))
    for r, i in enumerate(ids):
        for k, t in enumerate(foto[i]['tag']):
            X[r, col[t]] = max(X[r, col[t]], POS[min(k, len(POS) - 1)])
    df = (X > 0).sum(0)
    X *= np.log((1 + len(ids)) / (1 + df)) + 1
    X /= np.linalg.norm(X, axis=1, keepdims=True) + 1e-9
    S = X @ X.T
    np.fill_diagonal(S, 0)
    return S


# ---------------- la disposizione completa (solo la prima volta, o con --ridisponi) ----------------
def mappa_spettrale(S):
    """Le prime direzioni in cui le foto si separano per senso (servono per il colore e per la partenza)."""
    n = len(S)
    W = np.zeros_like(S)
    for i in range(n):
        for j in np.argsort(-S[i])[:K]:
            if S[i, j] > 0:
                W[i, j] = W[j, i] = max(W[i, j], S[i, j])
    A = W + .01 * S
    d = A.sum(1) + 1e-9
    L = np.eye(n) - A / np.sqrt(d[:, None] * d[None, :])
    val, vec = np.linalg.eigh(L)
    E = vec[:, 1:4] / np.sqrt(d)[:, None]
    return (E - E.mean(0)) / (E.std(0) + 1e-9)

def affinita(S, perplessita=18):
    """Per ogni foto, quanto ciascuna altra le e' vicina (come in t-SNE)."""
    n = len(S)
    D = (1 - S) ** 2
    P = np.zeros_like(S)
    for i in range(n):
        lo, hi, beta = 1e-3, 1e4, 1.0
        d = np.delete(D[i], i)
        for _ in range(60):
            p = np.exp(-(d - d.min()) * beta); p /= p.sum()
            H = -(p * np.log(p + 1e-12)).sum()
            if abs(H - math.log(perplessita)) < 1e-4:
                break
            if H > math.log(perplessita):
                lo = beta; beta = beta * 2 if hi >= 1e4 else (beta + hi) / 2
            else:
                hi = beta; beta = (beta + lo) / 2
        P[i, np.arange(n) != i] = p
    P = (P + P.T) / (2 * n)
    return np.maximum(P, 1e-12)

def tsne(P, Y):
    """Le foto simili si raccolgono in nuvole, separate da vuoti."""
    V = np.zeros_like(Y)
    for it in range(1000):
        esag = 12 if it < 250 else 1
        D = Y[:, None, :] - Y[None, :, :]
        num = 1 / (1 + (D ** 2).sum(-1)); np.fill_diagonal(num, 0)
        Q = np.maximum(num / num.sum(), 1e-12)
        G = 4 * (((esag * P - Q) * num)[:, :, None] * D).sum(1)
        V = (.5 if it < 250 else .8) * V - 200 * G
        Y += V
        Y -= Y.mean(0)
    r = np.sqrt((Y ** 2).sum(1))
    return Y * (.9 / np.percentile(r, 99))

def senza_sovrapposizioni(Y, raggi):
    for it in range(300):
        D = Y[:, None, :] - Y[None, :, :]
        dist = np.sqrt((D ** 2).sum(-1)) + 1e-6
        sov = np.clip((raggi[:, None] + raggi[None, :]) * 1.05 - dist, 0, None); np.fill_diagonal(sov, 0)
        Y += (D / dist[:, :, None] * sov[:, :, None]).sum(1) * .5
        r = np.sqrt((Y ** 2).sum(1)); lim = .98 - raggi
        Y[r > lim] *= (lim / r)[r > lim, None]
    return Y

def colori(E):
    """Il colore viene dalla mappa del senso: tinta dall'angolo nelle prime due direzioni, luce dalla terza."""
    ang = np.arctan2(E[:, 1], E[:, 0])
    h = np.argsort(np.argsort(ang)) / len(ang) * 360
    l = 60 + 12 * np.tanh(E[:, 2] / 1.5)
    return h, l

def disponi_tutto(ids, S, n_tutte):
    print('  ricalcolo il posto di tutte le foto (qualche secondo)…')
    E = mappa_spettrale(S)
    P = affinita(S)
    legami = np.sort(S, 1)[:, -K:].sum(1)
    s = .82 + .45 * (legami - legami.min()) / (np.ptp(legami) + 1e-9)
    p2 = senza_sovrapposizioni(tsne(P, E[:, :2] * 1e-2), RC(n_tutte) * s)
    p3 = tsne(P, E[:, :3] * 1e-2)
    # il colore si sfuma tra vicine
    Wn = np.zeros_like(S)
    for r in range(len(ids)):
        j = np.argsort(-S[r])[:K]; Wn[r, j] = S[r, j]
    Wn = Wn / (Wn.sum(1, keepdims=True) + 1e-9)
    Es = E.copy()
    for _ in range(2):
        Es = .5 * E + .5 * Wn @ Es
    h, l = colori(Es)
    return {i: {'p2': [round(float(v), 4) for v in p2[r]], 'p3': [round(float(v), 4) for v in p3[r]],
                'h': round(float(h[r])), 'l': round(float(l[r]))} for r, i in enumerate(ids)}


# ---------------- una foto nuova trova posto tra le altre, senza spostarle ----------------
def colloca(fid, vicine, mappa):
    """Posto e colore dalla media delle vicine (pesata per somiglianza), con un piccolo scarto tutto suo."""
    v = [(j, s) for j, s in vicine if j in mappa and not mappa[j].get('provv')][:K]
    rng = caso(fid)
    if not v:
        a = rng.normal(size=3); a /= np.linalg.norm(a)
        return {'p3': [round(float(x), 4) for x in a * .85], 'p2': [round(float(x), 4) for x in a[:2] / (np.linalg.norm(a[:2]) + 1e-9) * .85], 'h': 30, 'l': 62}
    w = np.array([s for _, s in v]) + 1e-6; w /= w.sum()
    p3 = sum(wi * np.array(mappa[j]['p3']) for (j, _), wi in zip(v, w)) + rng.normal(0, .045, 3)
    p2 = sum(wi * np.array(mappa[j]['p2']) for (j, _), wi in zip(v, w)) + rng.normal(0, .03, 2)
    ang = np.radians([mappa[j]['h'] for j, _ in v])
    h = math.degrees(math.atan2((w * np.sin(ang)).sum(), (w * np.cos(ang)).sum())) % 360
    l = float((w * np.array([mappa[j]['l'] for j, _ in v])).sum())
    return {'p3': [round(float(x), 4) for x in p3], 'p2': [round(float(x), 4) for x in p2], 'h': round(h), 'l': round(l)}


PAROLE_VUOTE = set('della delle dello degli dalla dalle nella nelle nello negli sulla sulle questa questo quella quello sono come anche dove quando perché perche ogni tutto tutti tutte molto più piu sempre ancora stata stato essere fatto fanno hanno dentro sopra sotto mentre verso prima dopo cosa cose foto'.split())
def parole(testo):
    return {w[:6] for w in re.findall(r"[a-zàèéìòù]{4,}", testo.lower()) if w not in PAROLE_VUOTE}

_aspetto = {}
def aspetto(fid):
    """Una impronta semplice dell'aspetto (colori e luce): serve solo quando non c'e' nessuna frase."""
    if fid not in _aspetto:
        from PIL import Image
        im = Image.open(os.path.join(THUMB, fid + '.jpg')).convert('RGB')
        hsv = np.asarray(im.resize((48, 48)).convert('HSV')).reshape(-1, 3) / 256
        hist = np.histogramdd(hsv, bins=(8, 3, 3), range=((0, 1),) * 3)[0].ravel()
        grigio = np.asarray(im.resize((12, 12)).convert('L'), float).ravel()
        grigio = (grigio - grigio.mean()) / (grigio.std() + 1e-6)
        v = np.concatenate([np.sqrt(hist / hist.sum()), grigio * .08])
        _aspetto[fid] = v / np.linalg.norm(v)
    return _aspetto[fid]

def vicine_provvisorie(fid, frase, lette):
    """Le foto lette piu' vicine a una foto non ancora letta: per la sua frase, se c'e', o per l'aspetto."""
    if frase:
        q = parole(frase)
        if q:
            df = {}
            doc = {i: parole(f['lettura'] + ' ' + ' '.join(f['tag'])) for i, f in lette.items()}
            for ws in doc.values():
                for w in ws:
                    df[w] = df.get(w, 0) + 1
            pt = {i: sum(math.log(len(doc) / df[w]) for w in q & ws) for i, ws in doc.items()}
            migliori = sorted((s, i) for i, s in pt.items() if s > 0)[::-1][:K]
            if migliori:
                m = migliori[0][0]
                return [[i, round(s / m * .5, 3)] for s, i in migliori], 'frase'
    try:
        a = aspetto(fid)
        sim = sorted(((float(a @ aspetto(i)), i) for i in lette), reverse=True)[:K]
        return [[i, round(max(0, s) * .4, 3)] for s, i in sim], 'aspetto'
    except Exception:
        return [], ''


# ---------------- tutto insieme ----------------
def genera(ridisponi=False):
    a = leggi()
    ids_tutte = tutte()
    insieme = set(ids_tutte)
    lette = {k: v for k, v in a['foto'].items() if k in insieme and v.get('lettura')}
    ids = sorted(lette)
    mappa = {k: v for k, v in carica(MAPPA, {}).items() if k in insieme}
    frasi = {x['id']: x.get('frase', '') for x in carica(ARRIVI, [])}
    out_foto = {}
    S = somiglianze(ids, lette) if len(ids) >= 2 else np.zeros((len(ids), len(ids)))
    riga = {i: r for r, i in enumerate(ids)}
    mancano = [i for i in ids if i not in mappa or mappa[i].get('provv')]
    if len(ids) >= 5 and (ridisponi or len(mancano) > .3 * len(ids)):
        mappa.update(disponi_tutto(ids, S, len(ids_tutte)))
        mancano = []
    # le foto lette ma senza posto definitivo: lo prendono dalle foto che piu' le somigliano
    for i in mancano:
        r = riga[i]
        vic = [(ids[j], float(S[r, j])) for j in np.argsort(-S[r]) if S[r, j] > 0]
        mappa[i] = colloca(i, vic, mappa)
    # le foto non ancora lette: un posto provvisorio tra le altre
    for i in ids_tutte:
        if i in lette or (i in mappa and mappa[i].get('provv')):
            continue
        vic, come = vicine_provvisorie(i, frasi.get(i, ''), lette)
        mappa[i] = dict(colloca(i, vic, mappa), provv=True, come=come, vicine=vic)
    salva(MAPPA, mappa)

    legami = np.sort(S, 1)[:, -K:].sum(1) if len(ids) else np.zeros(0)
    lmin, lmax = (legami.min(), legami.max()) if len(ids) else (0, 1)
    for i in ids_tutte:
        m = mappa[i]
        if i in lette:
            r = riga[i]
            tg = set(lette[i]['tag'])
            mv = [round(min(1, len(tg & mo) / 2), 2) for mo in MOTI]
            vic = [[ids[j], round(float(S[r, j]), 3)] for j in np.argsort(-S[r])[:K] if S[r, j] > .12]
            u = 1 - (legami[r] - lmin) / (lmax - lmin + 1e-9)
            e = {'lettura': lette[i]['lettura'], 'mv': mv, 'vicine': vic, 's': round(float(.82 + .45 * (1 - u)), 3), 'u': round(float(u), 3),
                 'tag': lette[i]['tag'], 'nucleo': lette[i].get('nucleo', '')}   # tag e nucleo servono solo a versione-archi.html
        else:
            vic = [v for v in m.get('vicine', []) if v[0] in lette]
            mvs = [out_foto[j]['mv'] for j, _ in vic if j in out_foto] or [[0, .5, 0, 0]]
            e = {'lettura': None, 'mv': [round(float(x), 2) for x in np.mean(mvs, 0)], 'vicine': vic, 's': .9, 'u': .6, 'provv': True, 'come': m.get('come', '')}
        e.update({'p': m['p3'], 'x': m['p2'][0], 'y': m['p2'][1], 'h': m['h'], 'l': m['l']})
        out_foto[i] = e
    out = {'luogo': a.get('luogo', ''), 'rc': round(RC(len(ids_tutte)), 4), 'foto': out_foto, 'tutte': ids_tutte,
           'nuclei': a.get('nuclei', [])}
    open(DATI_JS, 'w', encoding='utf-8').write('window.NEBULOSA = ' + json.dumps(out, ensure_ascii=False) + ';\n')
    print(f'  {len(ids_tutte)} foto · {len(lette)} lette · {len(ids_tutte) - len(lette)} con un posto provvisorio')
    return out

def dimentica(fid):
    """Una foto tolta dalla nebulosa: via anche la sua lettura e il suo posto."""
    a = leggi()
    if a['foto'].pop(fid, None) is not None:
        scrivi(a)
    m = carica(MAPPA, {})
    if m.pop(fid, None) is not None:
        salva(MAPPA, m)
    return genera()

def da_leggere():
    lette = leggi()['foto']
    return [k for k in tutte() if not (k in lette and lette[k].get('lettura'))]


if __name__ == '__main__':
    if '--da-leggere' in sys.argv:
        print('\n'.join(da_leggere()) or 'Tutte le foto sono state lette.')
    else:
        genera(ridisponi='--ridisponi' in sys.argv)
