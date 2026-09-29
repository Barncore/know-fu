param([ValidateSet('start','stop','status','restart')][string]$Action='status')
$ErrorActionPreference='Stop'
$localScript=Join-Path $PSScriptRoot 'graph-service.sh'
$linuxScript=(& wsl.exe -d Ubuntu -- wslpath -a $localScript).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Ubuntu path mapping failed.' }
& wsl.exe -d Ubuntu -u root -- bash $linuxScript $Action
if ($LASTEXITCODE -ne 0) { throw "FalkorDB $Action failed (exit $LASTEXITCODE)." }
