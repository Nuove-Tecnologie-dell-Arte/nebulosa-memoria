"""Il server della nebulosa.

Serve le pagine, riceve le foto dai telefoni (stessa rete Wi-Fi) e le manda in tempo reale
a tutte le nebulose aperte. Ogni foto nuova entra subito tra le altre, con un posto provvisorio
vicino alle foto che le somigliano; poi il lettore (lettore.py) la guarda a fondo e la foto prende
il suo posto definitivo, nato dal senso. Senza lettore resta col posto provvisorio finche' non viene
letta a mano (scrivendo in dati/analisi.json, poi: python3 programma/genera_dati.py).

Uso (dalla cartella nebulosa-memoria):  python3 programma/server.py   (oppure doppio clic su «Apri la nebulosa.command»,
su Windows «Apri la nebulosa.bat»)
Poi apri http://localhost:8002 sul computer; i telefoni aprono l'indirizzo /carica mostrato nel terminale
(o inquadrano il QR code nella nebulosa).

Con un tunnel (per esempio cloudflared o ngrok verso la porta 8002) la nebulosa si apre anche da internet, in https.
Perche' il QR porti i telefoni al tunnel anche quando la nebulosa e' aperta su localhost, dai l'indirizzo pubblico:
    INDIRIZZO=https://nebulosa.esempio.it python3 programma/server.py
Quello che arriva dal tunnel non conta mai come «dal computer della nebulosa»: da li' non si possono eliminare foto.

In rete il server mostra solo quello che serve alle pagine (vedi INDIRIZZI): le pagine, le foto ridotte e dati.js.
Gli originali, i programmi e gli altri dati restano sul computer.
"""
import base64, glob, io, json, os, queue, re, socket, sys, threading, time, urllib.parse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from PIL import Image, ImageOps

import genera_dati, lettore

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

# gli unici indirizzi che il server mostra in rete, e il file che corrisponde a ciascuno
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
MAX_BYTES = 15 * 1024 * 1024
MAX_ORIGINALE = 80 * 1024 * 1024
ESTENSIONI = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif', 'image/webp': 'webp', 'image/gif': 'gif', 'image/tiff': 'tiff'}
blocco = threading.Lock()
DATI = {'foto': {}}   # gli stessi dati di dati.js, aggiornati a ogni foto che arriva o viene letta


# ---------------- arrivi e tempo reale ----------------
def leggi_arrivi():
    try:
        return json.load(open(ARRIVI, encoding='utf-8'))
    except Exception:
        return []

def scrivi_arrivi(lista):
    tmp = ARRIVI + '.tmp'
    json.dump(lista, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    os.replace(tmp, ARRIVI)

ascoltatori = set()
def annuncia(evento, dati):
    msg = f'event: {evento}\ndata: {json.dumps(dati, ensure_ascii=False)}\n\n'.encode()
    for q in list(ascoltatori):
        q.put(msg)

def ip_locale():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('10.255.255.255', 1)); ip = s.getsockname()[0]; s.close(); return ip
    except Exception:
        return '127.0.0.1'


class Gestore(SimpleHTTPRequestHandler):
    # su Windows il tipo dei file viene dal registro e a volte e' sbagliato (.js come testo): lo fissiamo qui
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map, **{
        '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg'})

    def __init__(self, *a, **k):
        super().__init__(*a, directory=PROGETTO, **k)

    def log_message(self, fmt, *args):
        pass   # silenzio: stampiamo solo gli arrivi

    def end_headers(self):
        if self.path.split('?')[0].endswith(('.js', '.html', '.json')):
            self.send_header('Cache-Control', 'no-store')   # i dati cambiano dopo ogni lettura
        super().end_headers()

    def json_out(self, dati, code=200):
        b = json.dumps(dati, ensure_ascii=False).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)

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
            return
        if self.mostra(p):
            super().do_GET()

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
            return self.carica(corpo)
        if p == '/api/elimina':
            if not self.da_qui():
                return self.json_out({'errore': 'si può eliminare solo dal computer della nebulosa'}, 403)
            return self.elimina(corpo.get('id', ''))
        self.json_out({'errore': 'non trovato'}, 404)

    def carica(self, corpo):
        try:
            raw = base64.b64decode(corpo['img'].split(',', 1)[-1])
            im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB')
        except Exception:
            annuncia('annullata', {})
            return self.json_out({'errore': 'non riesco a leggere questa immagine'}, 400)
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
        self.json_out(arrivo)
        piccola = im.copy(); piccola.thumbnail((1024, 1024)); b = io.BytesIO(); piccola.save(b, 'JPEG', quality=82)
        threading.Thread(target=leggi, args=(fid, b.getvalue(), frase), daemon=True).start()

    def originale(self):
        """Il file originale di una foto appena arrivata, intatto: viene solo conservato, la nebulosa usa la versione ridotta."""
        fid = self.headers.get('X-Id', '')
        n = int(self.headers.get('Content-Length', '0'))
        ext = ESTENSIONI.get(self.headers.get('Content-Type', '').split(';')[0].strip().lower())
        if not re.fullmatch(r'u\d{4,}', fid) or not ext:
            return self.json_out({'errore': 'richiesta non valida'}, 400)
        if n <= 0 or n > MAX_ORIGINALE:
            return self.json_out({'errore': 'originale troppo grande o vuoto'}, 413)
        with blocco:
            if not any(a['id'] == fid for a in leggi_arrivi()) or glob.glob(os.path.join(ORIGINALI, fid + '.*')):
                return self.json_out({'errore': 'foto sconosciuta o originale gia\' salvato'}, 409)
        os.makedirs(ORIGINALI, exist_ok=True)
        dest = os.path.join(ORIGINALI, f'{fid}.{ext}'); tmp = dest + '.parziale'
        letti = 0
        with open(tmp, 'wb') as f:
            while letti < n:
                pezzo = self.rfile.read(min(1 << 20, n - letti))
                if not pezzo:
                    break
                f.write(pezzo); letti += len(pezzo)
        if letti < n:
            os.remove(tmp)
            return self.json_out({'errore': 'originale arrivato a meta\''}, 400)
        os.replace(tmp, dest)
        with blocco:
            lista = leggi_arrivi()
            for a in lista:
                if a['id'] == fid:
                    a['originale'] = os.path.basename(dest); a['originale_byte'] = n
            scrivi_arrivi(lista)
        print(f'    originale di {fid} salvato ({n / 1024 / 1024:.1f} MB)')
        self.json_out({'ok': True, 'byte': n})

    def elimina(self, fid):
        with blocco:
            lista = leggi_arrivi(); nuova = [a for a in lista if a['id'] != fid]
            if len(nuova) == len(lista):
                return self.json_out({'errore': 'foto non trovata'}, 404)
            scrivi_arrivi(nuova)
            for f in [os.path.join(FULL, fid + '.jpg'), os.path.join(THUMB, fid + '.jpg')] + glob.glob(os.path.join(ORIGINALI, fid + '.*')):
                try:
                    os.remove(f)
                except OSError:
                    pass
            DATI.update(genera_dati.dimentica(fid))
        print(f'  - {fid} rimossa')
        annuncia('rimossa', {'id': fid})
        self.json_out({'ok': True})


def aggiorna():
    DATI.update(genera_dati.genera())


def leggi(fid, jpeg, frase):
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


if __name__ == '__main__':
    aggiorna()
    srv = ThreadingHTTPServer(('0.0.0.0', PORTA), Gestore)
    srv.daemon_threads = True
    ip = ip_locale()
    print('\n  La Nebulosa è accesa.')
    print(f'  Su questo computer:  http://localhost:{PORTA}')
    print(f'  Dai telefoni:        http://{ip}:{PORTA}/carica   (stessa rete Wi-Fi)')
    if INDIRIZZO:
        print(f'  Dal tunnel:          {INDIRIZZO}   (il QR porta qui)')
    print('  Lettura delle foto nuove: ' + ('automatica (Claude)' if lettore.disponibile() else 'a mano (manca il pacchetto anthropic o la chiave): intanto entrano con un posto provvisorio'))
    print('  Per spegnere: chiudi questa finestra.\n')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
