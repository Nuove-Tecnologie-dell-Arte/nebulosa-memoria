"""Le impostazioni del server: cartelle, porta, indirizzo pubblico e limiti.

Si leggono da .env nella cartella nebulosa-memoria (copia .env.example); una variabile gia' presente
nell'ambiente vince su quella del file. Cosi' valgono per tutti i modi di accendere e per i programmi a mano.
"""
import os, shutil, sys

PROGETTO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # la cartella nebulosa-memoria


def carica_env(percorso):
    """Legge le righe CHIAVE=valore di un file .env (senza librerie); # inizia un commento."""
    try:
        righe = open(percorso, encoding='utf-8').read().splitlines()
    except FileNotFoundError:
        return
    for riga in righe:
        riga = riga.strip()
        if not riga or riga.startswith('#') or '=' not in riga:
            continue
        chiave, valore = riga.split('=', 1)
        chiave, valore = chiave.strip(), valore.strip()
        if len(valore) >= 2 and valore[0] == valore[-1] and valore[0] in '"\'':
            valore = valore[1:-1]
        os.environ.setdefault(chiave, valore)

carica_env(os.path.join(PROGETTO, '.env'))

PORTA = int(os.environ.get('PORTA', '8002'))
INDIRIZZO = os.environ.get('INDIRIZZO', '').strip().rstrip('/')   # l'indirizzo pubblico del tunnel, se c'e' (https://...)
LOCALI = ('127.0.0.1', '::1', '::ffff:127.0.0.1')
INOLTRO = ('X-Forwarded-For', 'X-Forwarded-Host', 'X-Forwarded-Proto', 'X-Real-IP', 'Forwarded', 'Cf-Connecting-IP', 'Cf-Ray')

# su Windows il terminale non sempre scrive « » e ✓: meglio un carattere sbagliato che un errore
for flusso in (sys.stdout, sys.stderr):
    try:
        flusso.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# Dove vivono le foto e i dati della nebulosa (dati/ e foto/). Di solito dentro il progetto.
# Su un server conviene una cartella fuori dal repository (CARTELLA_DATI in .env): cosi' le foto che arrivano
# non bloccano «git pull» e i nomi di chi le manda non finiscono per sbaglio su GitHub.
# La prima volta la cartella viene riempita con le foto e i dati del repository.
VIVI = os.path.abspath(os.path.expanduser(os.environ.get('CARTELLA_DATI', '').strip() or PROGETTO))
if VIVI != PROGETTO:
    for parte in ('dati', os.path.join('foto', 'full'), os.path.join('foto', 'thumb')):
        if not os.path.isdir(os.path.join(VIVI, parte)):
            shutil.copytree(os.path.join(PROGETTO, parte), os.path.join(VIVI, parte))
DATI = os.path.join(VIVI, 'dati')
ARRIVI = os.path.join(DATI, 'arrivi.json')
FULL, THUMB = os.path.join(VIVI, 'foto', 'full'), os.path.join(VIVI, 'foto', 'thumb')

MAX_BYTES = 15 * 1024 * 1024

# la compressione: lato lungo in pixel e qualita' JPEG
LATO_FULL, QUALITA_FULL = 1400, 84
LATO_THUMB, QUALITA_THUMB = 360, 74
