"""Lo stato condiviso del server: i dati della nebulosa, l'elenco degli arrivi e gli eventi in tempo reale."""
import json, os, queue, socket, threading

import genera_dati
from config import ARRIVI

blocco = threading.Lock()
DATI = {'foto': {}}   # gli stessi dati di dati.js, aggiornati a ogni foto che arriva o viene letta


def aggiorna():
    DATI.update(genera_dati.genera())


def leggi_arrivi():
    try:
        return json.load(open(ARRIVI, encoding='utf-8'))
    except Exception:
        return []

def scrivi_arrivi(lista):
    tmp = ARRIVI + '.tmp'
    json.dump(lista, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    os.replace(tmp, ARRIVI)


ascoltatori = set()   # una coda per ogni nebulosa aperta
def annuncia(evento, dati):
    msg = f'event: {evento}\ndata: {json.dumps(dati, ensure_ascii=False)}\n\n'.encode()
    for q in list(ascoltatori):
        q.put(msg)


def ip_locale():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('10.255.255.255', 1)); ip = s.getsockname()[0]; s.close(); return ip
    except Exception:
        return '127.0.0.1'
