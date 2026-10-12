#!/usr/bin/env bash
# Da WSL: crea l'attività di Windows che accende la nebulosa a ogni accesso e la avvia subito.
# Uso, dalla cartella nebulosa-memoria:   bash servizio/installa.sh
cd "$(dirname "$0")" || exit 1
[ -n "$WSL_DISTRO_NAME" ] || { echo "Questo script va lanciato da dentro WSL."; exit 1; }
command -v powershell.exe >/dev/null || { echo "Non trovo powershell.exe: l'integrazione con Windows di WSL è spenta?"; exit 1; }
if curl -s --max-time 1 "http://localhost:${PORTA:-8002}/api/info" 2>/dev/null | grep -q carica; then
  echo "La nebulosa è già accesa a mano: chiudila (Ctrl+C) prima, altrimenti il servizio non riesce a partire."; exit 1
fi
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w "$PWD/attivita.ps1")" \
  -Azione installa -Distro "$WSL_DISTRO_NAME" -Utente "$(id -un)" -Script "$PWD/esegui.sh"
