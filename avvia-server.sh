#!/usr/bin/env bash
# Accende il server della nebulosa e la apre nel browser, come «Apri la nebulosa.command» (Mac) e «.bat» (Windows).
# Per Linux, WSL (Windows) e Mac, anche dietro un tunnel. Se la nebulosa e' gia' accesa, apre solo la pagina.
# Uso, dalla cartella nebulosa-memoria:
#   bash avvia-server.sh            la nebulosa per l'installazione
# Le impostazioni (porta, indirizzo del tunnel, cartella dei dati) sono in .env: vedi .env.example.
# Su un server senza schermo scrive solo l'indirizzo. Per spegnere: Ctrl+C.
# Per tenerla accesa sempre, anche dopo un riavvio di Windows, in WSL c'e' invece: bash servizio/installa.sh

cd "$(dirname "$0")" || exit 1
PORTA="${PORTA:-$(sed -n 's/^[[:space:]]*PORTA[[:space:]]*=[[:space:]]*//p' .env 2>/dev/null | tr -d '\r"'"'"' ' | tail -1)}"
export PORTA="${PORTA:-8002}"
PAGINA="${PAGINA:-}"
URL="http://localhost:$PORTA/$PAGINA"
FLAG="--autoplay-policy=no-user-gesture-required --no-first-run --no-default-browser-check --new-window"

# apre la pagina: Chrome con un profilo tutto suo (il suono parte da solo, il permesso della webcam resta ricordato)
apri() {
  if grep -qi microsoft /proc/version 2>/dev/null && ls /proc/sys/fs/binfmt_misc/WSLInterop* >/dev/null 2>&1; then   # WSL: il Chrome di Windows
    for c in "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"; do
      [ -f "$c" ] && { "$c" --user-data-dir='C:\nebulosa-chrome' $FLAG "$URL" >/dev/null 2>&1 & return; }
    done
    command -v wslview >/dev/null && { wslview "$URL" >/dev/null 2>&1 & return; }
    [ -x /mnt/c/Windows/explorer.exe ] && { /mnt/c/Windows/explorer.exe "$URL" >/dev/null 2>&1 & return; }
  elif [ "$(uname)" = "Darwin" ]; then                                         # Mac
    if [ -d "/Applications/Google Chrome.app" ]; then
      open -na "Google Chrome" --args --user-data-dir="$HOME/.nebulosa-chrome" $FLAG "$URL"; return
    fi
    open "$URL"; return
  elif [ -n "$DISPLAY$WAYLAND_DISPLAY" ]; then                                 # Linux con lo schermo
    for c in google-chrome google-chrome-stable chromium chromium-browser; do
      command -v "$c" >/dev/null && { "$c" --user-data-dir="$HOME/.nebulosa-chrome" $FLAG "$URL" >/dev/null 2>&1 & return; }
    done
    command -v xdg-open >/dev/null && { xdg-open "$URL" >/dev/null 2>&1 & return; }
  fi
  echo "  Apri nel browser: $URL"                                             # server senza schermo
}

if curl -s --max-time 1 "http://localhost:$PORTA/api/info" 2>/dev/null | grep -q carica; then
  echo
  echo "  La nebulosa è già accesa: apro la pagina."
  echo
  apri
  exit 0
fi

PY="$(command -v python3 || command -v python)"
if [ -z "$PY" ]; then
  echo "  Manca Python 3. Su Ubuntu/Debian: sudo apt install python3 python3-venv"; exit 1
fi

# le librerie (Pillow, numpy): se nel sistema non ci sono, le metto in una cartella .venv tutta della nebulosa
if [ -x .venv/bin/python ]; then
  PY=.venv/bin/python
elif ! "$PY" -c "import PIL, numpy" 2>/dev/null; then
  echo "  Preparo le librerie Python (solo la prima volta)..."
  if "$PY" -m venv .venv && .venv/bin/python -m pip install -q -r requirements.txt; then
    PY=.venv/bin/python
  else
    rm -rf .venv
    echo "  Non riesco a installare le librerie. Su Ubuntu/Debian prova: sudo apt install python3-venv  (poi riprova)"; exit 1
  fi
fi

(sleep 3; apri) &                                                              # la pagina si apre quando il server e' acceso
exec "$PY" -u avvia.py   # -u: le righe degli arrivi si vedono subito anche nei log
