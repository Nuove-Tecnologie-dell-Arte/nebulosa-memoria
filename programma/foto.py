"""Cosa succede a una foto: arriva dal telefono, viene compressa subito e letta, viene eliminata.
Dell'originale non resta niente: la nebulosa usa solo la versione compressa.

Nessuna di queste funzioni sa di HTTP: se qualcosa non va alzano ErroreFoto, e il gestore lo traduce in una risposta.
"""
import base64, io, os, threading, time
from PIL import Image, ImageOps

import genera_dati, lettore
from config import FULL, THUMB, LATO_FULL, LATO_THUMB, QUALITA_FULL, QUALITA_THUMB
from stato import DATI, blocco, leggi_arrivi, scrivi_arrivi, aggiorna, annuncia


class ErroreFoto(Exception):
    def __init__(self, messaggio, codice=400):
        super().__init__(messaggio)
        self.messaggio, self.codice = messaggio, codice


def salva_full(im, percorso):
    """La foto ridotta per lo schermo. Ridimensiona, toglie i metadati (GPS compreso) e comprime."""
    im = im.copy(); im.thumbnail((LATO_FULL, LATO_FULL))
    im.save(percorso, 'JPEG', quality=QUALITA_FULL, optimize=True, progressive=True)
    return im


def salva_thumb(im, percorso):
    im = im.copy(); im.thumbnail((LATO_THUMB, LATO_THUMB))
    im.save(percorso, 'JPEG', quality=QUALITA_THUMB, optimize=True, progressive=True)


def accogli(corpo):
    """Salva una foto arrivata dal telefono (corpo: {img, nome, frase}) e la fa leggere. Restituisce l'arrivo."""
    try:
        raw = base64.b64decode(corpo['img'].split(',', 1)[-1])
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB')
    except Exception:
        raise ErroreFoto('non riesco a leggere questa immagine')
    nome = str(corpo.get('nome', ''))[:40].strip()
    frase = str(corpo.get('frase', ''))[:200].strip()
    with blocco:
        lista = leggi_arrivi()
        num = max([int(a['id'][1:]) for a in lista] + [0]) + 1
        while os.path.exists(os.path.join(FULL, f'u{num:04d}.jpg')):
            num += 1
        fid = f'u{num:04d}'
        im = salva_full(im, os.path.join(FULL, fid + '.jpg'))
        salva_thumb(im, os.path.join(THUMB, fid + '.jpg'))
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


def elimina(fid):
    with blocco:
        lista = leggi_arrivi(); nuova = [a for a in lista if a['id'] != fid]
        if len(nuova) == len(lista):
            raise ErroreFoto('foto non trovata', 404)
        scrivi_arrivi(nuova)
        for f in (os.path.join(FULL, fid + '.jpg'), os.path.join(THUMB, fid + '.jpg')):
            try:
                os.remove(f)
            except OSError:
                pass
        DATI.update(genera_dati.dimentica(fid))
    print(f'  - {fid} rimossa')
    annuncia('rimossa', {'id': fid})
