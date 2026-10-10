# Apaga la DEMO: API (verificando su linea de comandos), DB demo (compose project okr-demo) y front demo opcional.
$ErrorActionPreference = 'Continue'
$demoDir  = $PSScriptRoot
$rootDir  = Split-Path (Split-Path $demoDir -Parent) -Parent
# Soporta el workspace (okr-platform-back/) y el monorepo (apps/back/)
$backRoot = if (Test-Path (Join-Path $rootDir 'apps\back')) { Join-Path $rootDir 'apps\back' } else { Join-Path $rootDir 'okr-platform-back' }

function Stop-Verified($pidFile, $pattern, $label) {
  if (-not (Test-Path $pidFile)) { Write-Host "[demo] $label : sin pidfile, nada que detener."; return }
  $procId = [int](Get-Content $pidFile | Select-Object -First 1)
  $p = Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction SilentlyContinue
  if (-not $p) { Write-Host "[demo] $label : PID $procId ya no existe."; Remove-Item $pidFile -Force; return }
  if ($p.CommandLine -match $pattern) {
    taskkill /PID $procId /T /F | Out-Null
    Write-Host "[demo] $label : PID $procId detenido."
    Remove-Item $pidFile -Force
  } else {
    Write-Host "[demo] $label : el PID $procId NO coincide con lo esperado, no se mata. Linea: $($p.CommandLine)" -ForegroundColor Yellow
  }
}

# Back: node ... ts-node ... src/main.ts dentro de okr-platform-back
Stop-Verified (Join-Path $demoDir '.api.pid') '(okr-platform-back|apps[\\/]back).*ts-node.*src[\\/]main\.ts' 'API'
# Front (opcional): next dev -p 3101 lanzado desde okr-platform-front
Stop-Verified (Join-Path $demoDir '.front.pid') 'next.*dev.*3101|3101.*next|okr-platform-front-demo.*next[\\/]dist[\\/]server' 'Front'

Push-Location $backRoot
$env:DB_TEST_PORT = '55435'
docker compose -p okr-demo down -v
Pop-Location

foreach ($p in 3100, 55435) {
  if (Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue) {
    Write-Host "[demo] ATENCION: el puerto $p sigue ocupado." -ForegroundColor Yellow
  } else {
    Write-Host "[demo] Puerto $p libre."
  }
}
