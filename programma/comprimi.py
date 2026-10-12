"""Comprime tutte le foto gia' nella nebulosa e cancella gli originali (non li usa nessuno).

    python3 programma/comprimi.py --prova    mostra cosa farebbe, senza toccare niente
    python3 programma/comprimi.py            lo fa

Si puo' lanciare a nebulosa accesa. Una foto viene riscritta solo se ci guadagna almeno il 3%,
cosi' rilanciarlo non la peggiora ogni volta.
"""
import glob, io, json, os, shutil, sys
from PIL import Image

import config
from config import FULL, THUMB, ARRIVI, PROGETTO, LATO_FULL, LATO_THUMB, QUALITA_FULL, QUALITA_THUMB

ORIGINALI = os.path.join(PROGETTO, 'foto', 'originali')   # la vecchia cartella degli originali


def ricomprimi(percorso, lato, qualita, davvero):
    """Restituisce (byte prima, byte dopo)."""
    prima = os.path.getsize(percorso)
    with Image.open(percorso) as im:
        im.load(); im = im.convert('RGB')
    im.thumbnail((lato, lato))
    b = io.BytesIO(); im.save(b, 'JPEG', quality=qualita, optimize=True, progressive=True)
    dopo = len(b.getvalue())
    if dopo > prima * 0.97:
        return prima, prima
    if davvero:
        tmp = percorso + '.tmp'
        with open(tmp, 'wb') as f:
            f.write(b.getvalue())
        os.replace(tmp, percorso)
    return prima, dopo


def main():
    davvero = '--prova' not in sys.argv
    tot = [0, 0]
    for cartella, lato, q in ((FULL, LATO_FULL, QUALITA_FULL), (THUMB, LATO_THUMB, QUALITA_THUMB)):
        files = sorted(glob.glob(os.path.join(cartella, '*.jpg')))
        a = [0, 0]; cambiate = 0
        for f in files:
            try:
                p, d = ricomprimi(f, lato, q, davvero)
            except Exception as e:
                print(f'  ! {os.path.basename(f)}: {e}'); continue
            a[0] += p; a[1] += d; cambiate += d < p
        tot[0] += a[0]; tot[1] += a[1]
        print(f'{os.path.basename(cartella)}: {len(files)} foto, {cambiate} compresse, {a[0] / 1e6:.1f} -> {a[1] / 1e6:.1f} MB')
    if os.path.isdir(ORIGINALI):
        n = len(os.listdir(ORIGINALI))
        mb = sum(os.path.getsize(os.path.join(ORIGINALI, x)) for x in os.listdir(ORIGINALI)) / 1e6
        print(f'originali: {n} file, {mb:.1f} MB da cancellare')
        tot[0] += mb * 1e6
        if davvero:
            shutil.rmtree(ORIGINALI)
    if davvero and os.path.exists(ARRIVI):
        with open(ARRIVI, encoding='utf-8') as f:
            lista = json.load(f)
        if any('originale' in a for a in lista):
            for a in lista:
                a.pop('originale', None); a.pop('originale_byte', None)
            with open(ARRIVI + '.tmp', 'w', encoding='utf-8') as f:
                json.dump(lista, f, ensure_ascii=False, indent=1)
            os.replace(ARRIVI + '.tmp', ARRIVI)
    print(('Fatto' if davvero else 'Prova (non ho toccato niente)') + f': {tot[0] / 1e6:.1f} -> {tot[1] / 1e6:.1f} MB (originali esclusi dal dopo)')


if __name__ == '__main__':
    main()
