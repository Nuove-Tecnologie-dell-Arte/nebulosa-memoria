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

In rete il server mostra solo quello che serve alle pagine (vedi indirizzi.py): le pagine, le foto ridotte e dati.js.
I programmi e gli altri dati restano sul computer.

I pezzi: config.py (impostazioni), stato.py (dati condivisi ed eventi), indirizzi.py (cosa si puo' vedere in rete),
foto.py (cosa succede a una foto), gestore.py (le richieste HTTP).
"""
from http.server import ThreadingHTTPServer

import lettore
from config import PORTA, INDIRIZZO
from gestore import Gestore
from stato import aggiorna, ip_locale


def main():
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


if __name__ == '__main__':
    main()
