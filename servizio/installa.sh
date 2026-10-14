#!/usr/bin/env bash
# Da WSL: crea l'attività di Windows che accende la nebulosa all'avvio di Windows e la avvia subito.
# Uso, dalla cartella nebulosa-memoria:   bash servizio/installa.sh
cd "$(dirname "$0")" || exit 1
source ./wsl.sh
# le impostazioni: se .env non c'e' lo creo; le foto che arrivano vanno fuori dal repository,
# cosi' «git pull» non si blocca e i nomi di chi manda le foto non finiscono su GitHub
[ -f ../.env ] || { cp ../.env.example ../.env; echo "Creato .env (dalla copia .env.example)."; }
if ! grep -qE '^[[:space:]]*CARTELLA_DATI[[:space:]]*=[[:space:]]*[^[:space:]]' ../.env; then
  sed -i '/^[[:space:]]*CARTELLA_DATI[[:space:]]*=/d' ../.env
  echo "CARTELLA_DATI=$HOME/nebulosa-dati" >> ../.env
  echo "Le foto e i dati vivi staranno in $HOME/nebulosa-dati (alla prima accensione ci copio quelli di adesso)."
fi
if curl -s --max-time 1 "http://localhost:$PORTA/api/info" 2>/dev/null | grep -q carica; then
  echo "La nebulosa è già accesa a mano: chiudila (Ctrl+C) prima, altrimenti il servizio non riesce a partire."; exit 1
fi
"$PS" -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w "$PWD/attivita.ps1")" \
  -Azione installa -Distro "$WSL_DISTRO_NAME" -Utente "$(id -un)" -Script "$PWD/esegui.sh"
