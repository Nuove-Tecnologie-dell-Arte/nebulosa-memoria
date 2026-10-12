#!/usr/bin/env bash
# Da WSL: crea l'attività di Windows che accende la nebulosa a ogni accesso e la avvia subito.
# Uso, dalla cartella nebulosa-memoria:   bash servizio/installa.sh
cd "$(dirname "$0")" || exit 1
source ./wsl.sh
if curl -s --max-time 1 "http://localhost:${PORTA:-8002}/api/info" 2>/dev/null | grep -q carica; then
  echo "La nebulosa è già accesa a mano: chiudila (Ctrl+C) prima, altrimenti il servizio non riesce a partire."; exit 1
fi
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w "$PWD/attivita.ps1")" \
  -Azione installa -Distro "$WSL_DISTRO_NAME" -Utente "$(id -un)" -Script "$PWD/esegui.sh"
