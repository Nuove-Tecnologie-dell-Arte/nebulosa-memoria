#!/usr/bin/env bash
# Da WSL: dice se il servizio della nebulosa è acceso e, se no, perché. Uso:   bash servizio/stato.sh
cd "$(dirname "$0")" || exit 1
source ./wsl.sh
echo "--- attività di Windows"
"$PS" -NoProfile -Command "\$t = Get-ScheduledTask -TaskName Nebulosa -ErrorAction SilentlyContinue; if (-not \$t) { 'non esiste' } else { \$i = Get-ScheduledTaskInfo -TaskName Nebulosa; 'stato: ' + \$t.State; 'ultima esecuzione: ' + \$i.LastRunTime; 'esito: 0x{0:X} (0 = ok, 0x41303 = non e\' ancora partita)' -f \$i.LastTaskResult }" | tr -d '\r'
echo "--- processi dentro WSL"
ps -eo pid,args | grep -E "esegui.sh|avvia.py" | grep -v grep || echo "nessuno"
echo "--- porta"
if curl -s --max-time 2 "http://localhost:${PORTA:-8002}/api/info" | grep -q carica; then echo "il server risponde"; else echo "il server non risponde"; fi
echo "--- ultime righe di servizio.log"
tail -n 8 ../servizio.log 2>/dev/null || echo "(non c'è ancora)"
