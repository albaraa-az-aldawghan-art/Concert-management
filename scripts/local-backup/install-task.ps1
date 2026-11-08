param([switch]$AllowPendingFirstBackup)
$ErrorActionPreference = 'Stop'
$backupRoot = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Concert-Backups'
if (-not (Test-Path -LiteralPath (Join-Path $backupRoot 'last-status.json'))) { throw 'Create and verify the initial backup before installing the schedule.' }
$status = Get-Content -Raw -LiteralPath (Join-Path $backupRoot 'last-status.json') | ConvertFrom-Json
if ($status.status -notin @('success','success_with_warnings') -or -not $status.restoreRoundTripVerified) {
  if (-not $AllowPendingFirstBackup) { throw 'Initial backup has not passed verification.' }
  $selfTest = Get-Content -Raw -LiteralPath (Join-Path $backupRoot 'self-test.json') | ConvertFrom-Json
  if (-not $selfTest.passed -or -not $selfTest.windowsKeyRoundTrip) { throw 'Local encryption and recovery-format checks have not passed.' }
}
if ((Get-TimeZone).Id -ne 'Arab Standard Time') { throw 'This schedule requires the Windows time zone to be Riyadh (Arab Standard Time).' }
$runner = Join-Path $PSScriptRoot 'run.ps1'
$powershell = Join-Path $PSHOME 'powershell.exe'
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $runner + '"'
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Weekly -WeeksInterval 1 -DaysOfWeek Sunday -At '12:00'
$triggers = @($trigger)
if ($AllowPendingFirstBackup -and $status.status -eq 'failed') {
  $firstAttempt = (Get-Date).Date.AddDays(1).AddHours(12)
  $triggers += New-ScheduledTaskTrigger -Once -At $firstAttempt
}
$options = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask -Action $action -Trigger $triggers -Settings $options -Principal $principal -Description 'Encrypted weekly Concert management backup. Sunday 12:00 Riyadh. Keeps 4 verified snapshots. Current Windows user must be logged in; network and repository dependencies are required. Initial backup may be pending quota reset; see last-status.json.'
Register-ScheduledTask -TaskName 'Concert Management - Weekly Backup' -InputObject $task -Force | Out-Null
$registered = Get-ScheduledTask -TaskName 'Concert Management - Weekly Backup'
$info = Get-ScheduledTaskInfo -TaskName $registered.TaskName
$settingsPath = Join-Path $backupRoot 'settings.json'
$settings = Get-Content -Raw -LiteralPath $settingsPath | ConvertFrom-Json
$settings.time = '12:00'
[IO.File]::WriteAllText($settingsPath, ($settings | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
[pscustomobject]@{TaskName=$registered.TaskName;State=$registered.State;NextRunTime=$info.NextRunTime;RunWhenMissed=$registered.Settings.StartWhenAvailable;User=$registered.Principal.UserId;LogonType=$registered.Principal.LogonType} | ConvertTo-Json -Compress
