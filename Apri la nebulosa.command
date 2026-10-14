#!/bin/bash
# Accende il server della nebulosa e la apre in Chrome. Per Mac.
# Se la nebulosa e' gia' accesa, apre solo la pagina (non accende un secondo server).
# Le impostazioni (porta, indirizzo del tunnel, cartella dei dati) sono in .env: vedi .env.example.
# I telefoni sulla stessa rete Wi-Fi possono caricare foto dall'indirizzo /carica che compare qui sotto.
# Per spegnere, chiudi questa finestra del Terminale.

cd "$(dirname "$0")" || exit 1
PAGINA="${PAGINA:-}"     # quale pagina aprire: vuoto = la nebulosa
PORTA="${PORTA:-$(sed -n 's/^[[:space:]]*PORTA[[:space:]]*=[[:space:]]*//p' .env 2>/dev/null | tr -d '\r"'"'"' ' | tail -1)}"
PORTA="${PORTA:-8002}"
URL="http://localhost:$PORTA/$PAGINA"

apri() {
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
  apri
  exit 0
fi
if lsof -i :"$PORTA" -sTCP:LISTEN >/dev/null 2>&1; then
  # niente porta di riserva: il tunnel e i QR gia' stampati puntano a questa
  echo
  echo "  La porta $PORTA è occupata da un altro programma. Chiudilo, oppure cambia PORTA in .env."
  echo
  exit 1
fi
PY=python3
[ -x .venv/bin/python ] && PY=.venv/bin/python
(sleep 1.5; apri) &
PORTA=$PORTA "$PY" avvia.py
