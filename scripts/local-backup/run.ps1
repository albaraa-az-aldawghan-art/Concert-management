param([ValidateSet('run','self-test')][string]$Mode = 'run')
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$backupRoot = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Concert-Backups'
$nodePath = 'C:\Program Files\nodejs\node.exe'
Set-Location -LiteralPath $repoRoot
$log = Join-Path $backupRoot $(if ($Mode -eq 'run') { 'last-run.log' } else { 'self-test-run.log' })
$errorLog = $log + '.errors.txt'
$arguments = '"{0}" {1}' -f (Join-Path $PSScriptRoot 'backup.mjs'), $Mode
$process = Start-Process -FilePath $nodePath -ArgumentList $arguments -WorkingDirectory $repoRoot -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $log -RedirectStandardError $errorLog
exit $process.ExitCode
