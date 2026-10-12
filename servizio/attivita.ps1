# Crea o toglie l'attività di Windows che accende la nebulosa (dentro WSL) a ogni accesso dell'utente.
# Non si lancia a mano: lo usano installa.sh e rimuovi.sh.
param([Parameter(Mandatory)][ValidateSet('installa', 'rimuovi')][string]$Azione,
      [string]$Distro, [string]$Utente, [string]$Script)

$nome = 'Nebulosa'
if ($Azione -eq 'rimuovi') {
  Stop-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $nome -Confirm:$false -ErrorAction Stop
  Write-Output "Attività '$nome' tolta."
  return
}

# wsl.exe resta aperto finche' gira il server: e' questo che tiene sveglio WSL
$comando = "Start-Process -WindowStyle Hidden -Wait wsl.exe -ArgumentList '-d','$Distro','-u','$Utente','--exec','bash','$Script'"
$azione = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -Command `"$comando`""
$quando = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$regole = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $nome -Action $azione -Trigger $quando -Settings $regole -Force `
  -Description 'Accende il server della nebulosa in WSL' | Out-Null
Start-ScheduledTask -TaskName $nome
Write-Output "Attività '$nome' creata e avviata: parte da sola a ogni accesso a Windows."
