"""Il gestore delle richieste HTTP: legge la richiesta, chiama il resto, risponde."""
import json, queue, re, urllib.parse
from http.server import SimpleHTTPRequestHandler

import foto
from config import PROGETTO, PORTA, INDIRIZZO, LOCALI, INOLTRO, MAX_BYTES, ESTENSIONI
from indirizzi import file_per
from stato import DATI, ascoltatori, annuncia, ip_locale, leggi_arrivi


class Gestore(SimpleHTTPRequestHandler):
    # su Windows il tipo dei file viene dal registro e a volte e' sbagliato (.js come testo): lo fissiamo qui
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map, **{
        '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg'})

    def __init__(self, *a, **k):
        super().__init__(*a, directory=PROGETTO, **k)

    def log_message(self, fmt, *args):
        pass   # silenzio: stampiamo solo gli arrivi

    def end_headers(self):
        if self.path.split('?')[0].endswith(('.js', '.css', '.html', '.json')):
            self.send_header('Cache-Control', 'no-store')   # i dati cambiano dopo ogni lettura
        super().end_headers()

    def json_out(self, dati, code=200):
        b = json.dumps(dati, ensure_ascii=False).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)

    # ---------------- da dove arriva la richiesta ----------------
    def dal_tunnel(self):
        """Vero se la richiesta arriva da fuori attraverso un tunnel (che si collega al server da questo stesso computer)."""
        host = (self.headers.get('Host') or '').rsplit(':', 1)[0].strip('[]').lower()
        return any(self.headers.get(h) for h in INOLTRO) or host not in ('localhost', '127.0.0.1', '::1', ip_locale())

    def da_qui(self):
        """Vero solo per chi usa la nebulosa seduto al suo computer: non per i telefoni, ne' per chi arriva dal tunnel."""
        return self.client_address[0] in LOCALI and not self.dal_tunnel()

    def indirizzo_carica(self):
        """L'indirizzo del QR: quello del tunnel se c'e', altrimenti quello del computer nella rete Wi-Fi."""
        if INDIRIZZO:
            return INDIRIZZO + '/carica'
        if self.client_address[0] in LOCALI and self.dal_tunnel():
            host = (self.headers.get('X-Forwarded-Host') or self.headers.get('Host') or '').split(',')[0].strip()
            proto = (self.headers.get('X-Forwarded-Proto') or 'https').split(',')[0].strip()
            if re.fullmatch(r'[\w.-]+(:\d+)?', host) and proto in ('http', 'https'):
                return f'{proto}://{host}/carica'
        return f'http://{ip_locale()}:{PORTA}/carica'

    # ---------------- pagine e file ----------------
    def mostra(self, p):
        """Mostra un file solo se l'indirizzo e' tra quelli permessi; per tutto il resto: non trovato."""
        f = file_per(urllib.parse.unquote(p))
        if not f:
            self.send_error(404, 'non trovato')
            return False
        self.path = '/' + f
        return True

    def do_HEAD(self):
        if self.mostra(self.path.split('?')[0]):
            super().do_HEAD()

    def do_GET(self):
        p = self.path.split('?')[0]
        if p == '/api/info':
            return self.json_out({'carica': self.indirizzo_carica(), 'arrivi': len(leggi_arrivi())})
        elif p == '/api/arrivi':
            return self.json_out([dict(a, dato=DATI['foto'].get(a['id'])) for a in leggi_arrivi()])
        elif p == '/api/eventi':
            return self.eventi()
        if self.mostra(p):
            super().do_GET()

    def eventi(self):
        """Lo stream degli eventi in tempo reale: resta aperto finche' la nebulosa e' aperta."""
        self.send_response(200); self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache'); self.send_header('X-Accel-Buffering', 'no')   # i tunnel non devono trattenere gli eventi
        self.end_headers()
        q = queue.Queue(); ascoltatori.add(q)
        try:
            self.wfile.write(b': ciao\n\n'); self.wfile.flush()
            while True:
                try:
                    self.wfile.write(q.get(timeout=20))
                except queue.Empty:
                    self.wfile.write(b': ping\n\n')
                self.wfile.flush()
        except Exception:
            pass
        finally:
            ascoltatori.discard(q)

    # ---------------- foto in arrivo ----------------
    def do_POST(self):
        p = self.path.split('?')[0]
        if p == '/api/originale':
            return self.originale()
        if p == '/api/upload':
            # avviso subito la nebulosa: la foto e' partita dal telefono
            annuncia('inarrivo', {'nome': urllib.parse.unquote(self.headers.get('X-Nome', ''))[:40]})
        n = int(self.headers.get('Content-Length', '0'))
        if n <= 0 or n > MAX_BYTES:
            annuncia('annullata', {})
            return self.json_out({'errore': 'foto troppo grande o vuota'}, 413)
        try:
            corpo = json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception:
            annuncia('annullata', {})
            return self.json_out({'errore': 'richiesta non valida'}, 400)
        if p == '/api/upload':
            try:
                return self.json_out(foto.accogli(corpo))
            except foto.ErroreFoto as e:
                annuncia('annullata', {})
                return self.json_out({'errore': e.messaggio}, e.codice)
        if p == '/api/elimina':
            if not self.da_qui():
                return self.json_out({'errore': 'si può eliminare solo dal computer della nebulosa'}, 403)
            try:
                foto.elimina(corpo.get('id', ''))
            except foto.ErroreFoto as e:
                return self.json_out({'errore': e.messaggio}, e.codice)
            return self.json_out({'ok': True})
        self.json_out({'errore': 'non trovato'}, 404)

    def originale(self):
        fid = self.headers.get('X-Id', '')
        n = int(self.headers.get('Content-Length', '0'))
        ext = ESTENSIONI.get(self.headers.get('Content-Type', '').split(';')[0].strip().lower())
        try:
            byte = foto.conserva_originale(fid, ext, n, self.rfile)
        except foto.ErroreFoto as e:
            return self.json_out({'errore': e.messaggio}, e.codice)
        self.json_out({'ok': True, 'byte': byte})
