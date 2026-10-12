"""Gli unici indirizzi che il server mostra in rete, e il file che corrisponde a ciascuno."""
import os, re

from config import PROGETTO

INDIRIZZI = [
    (r'/(index\.html)?', 'pagine/index.html'),
    (r'/carica/?', 'pagine/carica.html'),
    (r'/versioni/([\w-]+?)(\.html)?', 'pagine/versioni/{0}.html'),
    (r'/dati\.js', 'dati/dati.js'),
    (r'/foto/(full|thumb)/([\w-]+\.jpg)', 'foto/{0}/{1}'),
]
VECCHI = {'versione-3d-regia': '3d-regia', 'versione-3d-volo': '3d-volo', 'versione-3d': '3d-carosello',   # i link di prima del riordino
          'versione-nebulosa': '2d', 'versione-archi': 'archi'}

def file_per(percorso):
    """Il file da mostrare per un indirizzo, oppure None se l'indirizzo non e' tra quelli permessi."""
    m = re.fullmatch(r'/(versione-[\w-]+)\.html', percorso)
    if m and m.group(1) in VECCHI:
        percorso = '/versioni/' + VECCHI[m.group(1)]
    for modello, file in INDIRIZZI:
        m = re.fullmatch(modello, percorso)
        if m:
            f = file.format(*[g for g in m.groups() if g and not g.startswith('.')])
            return f if os.path.isfile(os.path.join(PROGETTO, f)) else None
    return None
