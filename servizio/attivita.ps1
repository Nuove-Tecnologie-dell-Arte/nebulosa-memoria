# Crea o toglie l'attività di Windows che accende la nebulosa (dentro WSL) a ogni accesso dell'utente.
# Non si lancia a mano: lo usano installa.sh e rimuovi.sh.
param([Parameter(Mandatory)][ValidateSet('installa', 'rimuovi')][string]$Azione,
      [string]$Distro, [string]$Utente, [string]$Script)

$ErrorActionPreference = 'Stop'   # al primo errore ci si ferma: niente «creata» se non e' vero
$nome = 'Nebulosa'
if ($Azione -eq 'rimuovi') {
  Stop-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $nome -Confirm:$false -ErrorAction Stop
  Write-Output "Attivita' '$nome' tolta."
  return
}

# wsl.exe resta aperto finche' gira il server: e' questo che tiene sveglio WSL
$comando = "Start-Process -WindowStyle Hidden -Wait wsl.exe -ArgumentList '-d','$Distro','-u','$Utente','--exec','bash','$Script'"
# l'utente di Windows con il nome che il sistema riconosce (in ssh USERDOMAIN puo' essere sbagliato, per esempio WORKGROUP)
$utente = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$cosaFare = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -Command `"$comando`""
$quando = New-ScheduledTaskTrigger -AtLogOn -User $utente
$regole = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $nome -Action $cosaFare -Trigger $quando -Settings $regole -Force `
  -Description 'Accende il server della nebulosa in WSL' | Out-Null
Start-ScheduledTask -TaskName $nome
Write-Output "Attivita' '$nome' creata e avviata: parte da sola a ogni accesso a Windows."
