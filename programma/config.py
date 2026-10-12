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
ORIGINALI = os.path.join(PROGETTO, 'foto', 'originali')   # i file cosi' come sono arrivati dal telefono, a piena risoluzione

MAX_BYTES = 15 * 1024 * 1024
MAX_ORIGINALE = 80 * 1024 * 1024
ESTENSIONI = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif', 'image/webp': 'webp', 'image/gif': 'gif', 'image/tiff': 'tiff'}
