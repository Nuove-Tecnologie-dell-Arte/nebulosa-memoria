#!/usr/bin/env bash
# Tiene acceso il server della nebulosa: se si ferma, lo riaccende dopo qualche secondo.
# Lo lancia l'attività di Windows creata da installa.sh; si può usare anche a mano.
# Scrive in servizio.log (nella cartella nebulosa-memoria).

cd "$(dirname "$0")/.." || exit 1
while true; do
  echo "$(date '+%Y-%m-%d %H:%M:%S')  accendo il server" >> servizio.log
  python3 -u avvia.py >> servizio.log 2>&1
  echo "$(date '+%Y-%m-%d %H:%M:%S')  il server si è fermato (codice $?), riprovo tra 10 secondi" >> servizio.log
  sleep 10
done
