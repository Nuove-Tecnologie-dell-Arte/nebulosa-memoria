#!/usr/bin/env bash
# Accende solo il server della nebulosa, senza aprire il browser: per un server Linux (o Mac), anche dietro un tunnel.
# Uso, dalla cartella nebulosa-memoria:
#   bash avvia-server.sh
#   INDIRIZZO=https://indirizzo-del-tunnel bash avvia-server.sh     (cosi' il QR porta i telefoni al tunnel)
# La porta e' 8002 (si cambia con PORTA=...). Per spegnere: Ctrl+C.
# Su Windows non serve: si usa «Apri la nebulosa.bat» con un doppio clic.

cd "$(dirname "$0")" || exit 1
export PORTA="${PORTA:-8002}"

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

exec "$PY" -u programma/server.py   # -u: le righe degli arrivi si vedono subito anche nei log
