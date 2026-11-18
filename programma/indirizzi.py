"""Gli unici indirizzi che il server mostra in rete, e il file che corrisponde a ciascuno."""
import os, re

from config import PROGETTO, VIVI

INDIRIZZI = [
    (r'/(index\.html)?', 'pagine/versioni/accademia.html'),   # la pagina principale: la nebulosa nei corridoi
    (r'/versioni/via-lattea(\.html)?', 'pagine/index.html'),   # la via lattea, la pagina principale di prima
    (r'/carica/?', 'pagine/carica.html'),
    (r'/qr/?', 'pagine/qr.html'),   # solo il QR, per lo schermo del computer (cosi' non finisce nella proiezione)
    (r'/versioni/([\w-]+?)(\.html)?', 'pagine/versioni/{0}.html'),
    (r'/(css|js)/([\w-]+\.(?:css|js))', 'pagine/{0}/{1}'),   # il CSS e il JS della pagina principale
    (r'/dati\.js', 'dati/dati.js'),
    # il piano dell'Accademia in 3D, per la nebulosa nei corridoi
    (r'/modello/(accademia\.splat|accademia-leggero\.splat|corridoi\.json|foto-nel-corridoio\.json)', 'modello/{0}'),
    # il modello a pezzi (strumenti/pezzi_modello.py); i .ply sono i pezzi alla massima qualita'
    (r'/modello/pezzi/([\w-]+\.(?:splat|json|ply))', 'modello/pezzi/{0}'),
    (r'/foto/(full|thumb)/([\w-]+\.jpg)', 'foto/{0}/{1}'),
]
DAI_DATI = ('dati/', 'foto/')   # questi stanno nella cartella dei dati vivi (VIVI), il resto nel progetto
VECCHI = {'versione-3d-regia': '3d-regia', 'versione-3d-volo': '3d-volo', 'versione-3d': '3d-carosello',   # i link di prima del riordino
          'versione-nebulosa': '2d', 'versione-archi': 'archi'}

SPOSTATE = {'accademia': '/'}   # versioni diventate la pagina principale: il vecchio indirizzo mostra la pagina principale

def file_per(percorso):
    """Il file da mostrare per un indirizzo (percorso completo), oppure None se l'indirizzo non e' tra quelli permessi."""
    m = re.fullmatch(r'/versioni/([\w-]+?)(\.html)?', percorso)
    if m and m.group(1) in SPOSTATE:
        percorso = SPOSTATE[m.group(1)]
    m = re.fullmatch(r'/(versione-[\w-]+)\.html', percorso)
    if m and m.group(1) in VECCHI:
        percorso = '/versioni/' + VECCHI[m.group(1)]
    for modello, file in INDIRIZZI:
        m = re.fullmatch(modello, percorso)
        if m:
            f = file.format(*[g for g in m.groups() if g and not g.startswith('.')])
            f = os.path.join(VIVI if f.startswith(DAI_DATI) else PROGETTO, f)
            return f if os.path.isfile(f) else None
    return None
