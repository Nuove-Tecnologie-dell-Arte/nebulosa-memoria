"""Cosa succede a una foto: arriva dal telefono, viene letta, si conserva l'originale, viene eliminata.

Nessuna di queste funzioni sa di HTTP: se qualcosa non va alzano ErroreFoto, e il gestore lo traduce in una risposta.
"""
import base64, glob, io, os, re, threading, time
from PIL import Image, ImageOps

import genera_dati, lettore
from config import FULL, THUMB, ORIGINALI, MAX_ORIGINALE
from stato import DATI, blocco, leggi_arrivi, scrivi_arrivi, aggiorna, annuncia


class ErroreFoto(Exception):
    def __init__(self, messaggio, codice=400):
        super().__init__(messaggio)
        self.messaggio, self.codice = messaggio, codice


def accogli(corpo):
    """Salva una foto arrivata dal telefono (corpo: {img, nome, frase}) e la fa leggere. Restituisce l'arrivo."""
    try:
        raw = base64.b64decode(corpo['img'].split(',', 1)[-1])
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB')
    except Exception:
        raise ErroreFoto('non riesco a leggere questa immagine')
    nome = str(corpo.get('nome', ''))[:40].strip()
    frase = str(corpo.get('frase', ''))[:200].strip()
    im.thumbnail((1400, 1400))
    with blocco:
        lista = leggi_arrivi()
        num = max([int(a['id'][1:]) for a in lista] + [0]) + 1
        while os.path.exists(os.path.join(FULL, f'u{num:04d}.jpg')):
            num += 1
        fid = f'u{num:04d}'
        im.save(os.path.join(FULL, fid + '.jpg'), 'JPEG', quality=84)
        t = im.copy(); t.thumbnail((360, 360)); t.save(os.path.join(THUMB, fid + '.jpg'), 'JPEG', quality=74)
        arrivo = {'id': fid, 'nome': nome, 'frase': frase, 'quando': time.strftime('%Y-%m-%d %H:%M:%S')}
        lista.append(arrivo); scrivi_arrivi(lista)
        aggiorna()   # entra subito tra le altre, con un posto provvisorio
    print(f'  + {fid} da {nome or "anonimo"}' + (f'  «{frase}»' if frase else ''))
    annuncia('foto', dict(arrivo, dato=DATI['foto'].get(fid)))
    piccola = im.copy(); piccola.thumbnail((1024, 1024)); b = io.BytesIO(); piccola.save(b, 'JPEG', quality=82)
    threading.Thread(target=leggi_in_secondo_piano, args=(fid, b.getvalue(), frase), daemon=True).start()
    return arrivo


def leggi_in_secondo_piano(fid, jpeg, frase):
    """Il lettore guarda la foto a fondo; poi la foto prende il suo posto definitivo e tutte le nebulose aperte lo vedono."""
    if not lettore.disponibile():
        return
    res = lettore.leggi_foto(jpeg, frase, genera_dati.leggi())
    if not res:
        return
    with blocco:
        if not os.path.exists(os.path.join(FULL, fid + '.jpg')):
            return   # nel frattempo e' stata tolta
        a = genera_dati.leggi(); a['foto'][fid] = res; genera_dati.scrivi(a)
        aggiorna()
    print(f'  ✓ {fid} letta: {res["lettura"]}')
    annuncia('letta', {'id': fid, 'dato': DATI['foto'].get(fid)})


def conserva_originale(fid, ext, n, flusso):
    """Il file originale di una foto appena arrivata, intatto: viene solo conservato, la nebulosa usa la versione ridotta.
    Legge n byte da flusso. Restituisce i byte salvati."""
    if not re.fullmatch(r'u\d{4,}', fid) or not ext:
        raise ErroreFoto('richiesta non valida')
    if n <= 0 or n > MAX_ORIGINALE:
        raise ErroreFoto('originale troppo grande o vuoto', 413)
    with blocco:
        if not any(a['id'] == fid for a in leggi_arrivi()) or glob.glob(os.path.join(ORIGINALI, fid + '.*')):
            raise ErroreFoto("foto sconosciuta o originale gia' salvato", 409)
    os.makedirs(ORIGINALI, exist_ok=True)
    dest = os.path.join(ORIGINALI, f'{fid}.{ext}'); tmp = dest + '.parziale'
    letti = 0
    with open(tmp, 'wb') as f:
        while letti < n:
            pezzo = flusso.read(min(1 << 20, n - letti))
            if not pezzo:
                break
            f.write(pezzo); letti += len(pezzo)
    if letti < n:
        os.remove(tmp)
        raise ErroreFoto("originale arrivato a meta'")
    os.replace(tmp, dest)
    with blocco:
        lista = leggi_arrivi()
        for a in lista:
            if a['id'] == fid:
                a['originale'] = os.path.basename(dest); a['originale_byte'] = n
        scrivi_arrivi(lista)
    print(f'    originale di {fid} salvato ({n / 1024 / 1024:.1f} MB)')
    return n


def elimina(fid):
    with blocco:
        lista = leggi_arrivi(); nuova = [a for a in lista if a['id'] != fid]
        if len(nuova) == len(lista):
            raise ErroreFoto('foto non trovata', 404)
        scrivi_arrivi(nuova)
        for f in [os.path.join(FULL, fid + '.jpg'), os.path.join(THUMB, fid + '.jpg')] + glob.glob(os.path.join(ORIGINALI, fid + '.*')):
            try:
                os.remove(f)
            except OSError:
                pass
        DATI.update(genera_dati.dimentica(fid))
    print(f'  - {fid} rimossa')
    annuncia('rimossa', {'id': fid})
