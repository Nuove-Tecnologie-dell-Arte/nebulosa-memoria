# Preparazione comune a installa.sh e rimuovi.sh: funziona anche in una sessione ssh dentro WSL,
# dove WSL_DISTRO_NAME e WSL_INTEROP non sono impostati. Da includere con: source wsl.sh
grep -qi microsoft /proc/version 2>/dev/null || { echo "Questo script va lanciato da dentro WSL."; exit 1; }
if [ -z "$WSL_DISTRO_NAME" ]; then   # il nome della distribuzione, dal percorso di Windows della radice (\\wsl.localhost\NOME\)
  WSL_DISTRO_NAME="$(wslpath -w / 2>/dev/null | sed -E 's#^\\\\[^\\]+\\([^\\]+).*#\1#')"
fi
[ -n "$WSL_DISTRO_NAME" ] || { echo "Non riesco a capire il nome della distribuzione WSL."; exit 1; }
if [ -z "$WSL_INTEROP" ]; then       # il collegamento con Windows: in ssh va indicato a mano (l'ultimo aperto)
  WSL_INTEROP="$(ls -t /run/WSL/*_interop 2>/dev/null | head -1)"; export WSL_INTEROP
fi
PS="$(command -v powershell.exe)"     # in ssh il PATH non include Windows: provo il percorso fisso
[ -n "$PS" ] || PS=/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe
[ -x "$PS" ] || { echo "Non trovo powershell.exe ($PS): il disco C: è visibile in /mnt/c?"; exit 1; }
"$PS" -NoProfile -Command exit 0 >/dev/null 2>&1 || { echo "Non riesco a chiamare Windows da qui (WSL_INTEROP=${WSL_INTEROP:-vuoto})."; exit 1; }
