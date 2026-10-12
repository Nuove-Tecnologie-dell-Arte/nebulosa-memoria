"""Le impostazioni del server: cartelle, porta, indirizzo pubblico e limiti."""
import os, sys

PROGETTO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # la cartella nebulosa-memoria
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

ARRIVI = os.path.join(PROGETTO, 'dati', 'arrivi.json')
FULL, THUMB = os.path.join(PROGETTO, 'foto', 'full'), os.path.join(PROGETTO, 'foto', 'thumb')

MAX_BYTES = 15 * 1024 * 1024

# la compressione: lato lungo in pixel e qualita' JPEG
LATO_FULL, QUALITA_FULL = 1400, 84
LATO_THUMB, QUALITA_THUMB = 360, 74
