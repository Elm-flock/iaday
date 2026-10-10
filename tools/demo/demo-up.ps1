# Levanta el entorno DEMO: DB efimera (:55435) + API (:3100) + datos de ejemplo.
# No compila nada. No toca puertos 3000/3001/55434 ni otros contenedores.
$ErrorActionPreference = 'Continue'
$demoDir  = $PSScriptRoot
$rootDir  = Split-Path (Split-Path $demoDir -Parent) -Parent
# Soporta el workspace (okr-platform-back/) y el monorepo (apps/back/)
$backRoot = if (Test-Path (Join-Path $rootDir 'apps\back')) { Join-Path $rootDir 'apps\back' } else { Join-Path $rootDir 'okr-platform-back' }
$appDir   = Join-Path $backRoot 'okr-platform'
$pidFile  = Join-Path $demoDir '.api.pid'
$apiLog   = Join-Path $demoDir '.api.log'
$container = 'okr-demo-db-test-1'

function Fail($msg) { Write-Host "[demo] ERROR: $msg" -ForegroundColor Red; exit 1 }
function Port-InUse($port) { [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) }

if (-not (Test-Path $appDir)) { Fail "No existe $appDir" }
foreach ($p in 3100, 55435) {
  if (Port-InUse $p) { Fail "El puerto $p ya esta en uso. Si es una demo previa, ejecuta demo-down.ps1." }
}

$dbUrl = 'postgresql://postgres:postgres@localhost:55435/okr-platform-test'

# 1) DB
Write-Host '[demo] Levantando DB demo (compose project okr-demo, puerto 55435)...'
Push-Location $backRoot
$env:DB_TEST_PORT = '55435'
docker compose -p okr-demo up -d db-test
$rc = $LASTEXITCODE
Pop-Location
if ($rc -ne 0) { Fail 'docker compose fallo' }

Write-Host '[demo] Esperando a Postgres...'
$ok = 0
for ($i = 0; $i -lt 60 -and $ok -lt 3; $i++) {
  docker exec $container pg_isready -h 127.0.0.1 -U postgres -d okr-platform-test *> $null
  if ($LASTEXITCODE -eq 0) { $ok++ } else { $ok = 0 }
  Start-Sleep -Seconds 1
}
if ($ok -lt 3) { Fail 'Postgres no quedo listo a tiempo' }

# 2) Migraciones + seed (admin y raiz)
$env:DATABASE_URL = $dbUrl
$env:SEED_ADMIN_EMAIL = 'admin@flockit.com.ar'
$env:SEED_ADMIN_PASSWORD = 'DemoFlock2026'
$env:SEED_ADMIN_NAME = 'Admin Flockit'
$env:SEED_ORG_NAME = 'Flockit'
Push-Location $appDir
Write-Host '[demo] prisma migrate deploy...'
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail 'prisma migrate deploy fallo' }
Write-Host '[demo] prisma db seed...'
npx prisma db seed
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail 'prisma db seed fallo' }

# 3) API (sin build: ts-node). Se invoca el bin de ts-node con node para tener el PID real del proceso.
$env:PORT = '3100'
$env:FRONT_ORIGIN = 'http://localhost:3101'
$env:JWT_ACCESS_SECRET = 'demo-flockit-okr-secret-2026-not-for-production-use-0123456789'
$env:LOGIN_THROTTLE_LIMIT = '1000'   # el loader hace varios logins seguidos
$tsNode = Join-Path $appDir 'node_modules\ts-node\dist\bin.js'
Write-Host '[demo] Iniciando API (ts-node src/main.ts) en :3100...'
$proc = Start-Process -FilePath 'node' `
  -ArgumentList @("`"$tsNode`"", '-r', 'tsconfig-paths/register', 'src/main.ts') `
  -WorkingDirectory $appDir -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput $apiLog -RedirectStandardError "$apiLog.err"
Pop-Location
Set-Content -Path $pidFile -Value $proc.Id
Write-Host "[demo] API PID $($proc.Id) (guardado en .api.pid, logs en .api.log)"

$healthy = $false
for ($i = 0; $i -lt 300; $i++) {
  if ($proc.HasExited) { Fail "La API termino inesperadamente. Ver $apiLog.err" }
  try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3100/health' -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -eq 200) { $healthy = $true; break }
  } catch { }
  Start-Sleep -Seconds 1
}
if (-not $healthy) { Fail "La API no respondio en /health. Ver $apiLog.err" }
Write-Host '[demo] API saludable.'

# 4) Datos de ejemplo
node (Join-Path $demoDir 'seed-demo.mjs')
if ($LASTEXITCODE -ne 0) { Fail 'El loader fallo (la API y la DB siguen arriba; demo-down.ps1 para limpiar).' }

Write-Host ''
Write-Host '[demo] Listo. Front: cd okr-platform-front; $env:API_URL="http://localhost:3100"; npx next dev -p 3101' -ForegroundColor Green
