#!/usr/bin/env bash
# Da WSL: ferma e toglie l'attività di Windows. Uso:   bash servizio/rimuovi.sh
cd "$(dirname "$0")" || exit 1
source ./wsl.sh
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w "$PWD/attivita.ps1")" -Azione rimuovi
# l'attività ferma wsl.exe, ma il ciclo dentro WSL può restare: lo fermo
pkill -f "servizio/esegui.sh" 2>/dev/null; pkill -f "python3 -u avvia.py" 2>/dev/null; exit 0
