#!/bin/bash
# Accende il server della nebulosa e la apre in Chrome.
# Se la nebulosa e' gia' accesa, apre solo la pagina (non accende un secondo server).
# I telefoni sulla stessa rete Wi-Fi possono caricare foto dall'indirizzo /carica che compare qui sotto.
# Per spegnere, chiudi questa finestra del Terminale.

cd "$(dirname "$0")" || exit 1
PAGINA="${PAGINA:-}"     # quale pagina aprire: vuoto = la nebulosa per l'installazione
PORTA=8002

apri() {
  URL="http://localhost:$1/$PAGINA"
  if [ -d "/Applications/Google Chrome.app" ]; then
    # Chrome con un profilo tutto suo per la nebulosa: qui il suono puo' partire da solo, senza clic,
    # e il permesso della webcam, una volta dato, resta ricordato.
    open -na "Google Chrome" --args --user-data-dir="$HOME/.nebulosa-chrome" \
      --autoplay-policy=no-user-gesture-required --no-first-run --no-default-browser-check --new-window "$URL"
  else
    open "$URL"
  fi
}

if curl -s --max-time 1 "http://localhost:$PORTA/api/info" | grep -q carica; then
  echo
  echo "  La nebulosa è già accesa: apro la pagina in Chrome."
  echo "  (Puoi chiudere questa finestra: il server resta acceso nell'altra.)"
  echo
  apri "$PORTA"
  exit 0
fi
while lsof -i :"$PORTA" >/dev/null 2>&1; do PORTA=$((PORTA + 1)); done
(sleep 1.5; apri "$PORTA") &
PORTA=$PORTA python3 programma/server.py
