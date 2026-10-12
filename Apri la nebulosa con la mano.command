#!/bin/bash
# Apre la versione in cui si esplora la nebulosa con la mano, davanti alla webcam.
# Se la nebulosa e' gia' accesa apre solo la pagina; altrimenti accende anche il server.
cd "$(dirname "$0")" || exit 1
PAGINA="versioni/mano" exec "./Apri la nebulosa.command"
