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

# 0) Docker (Docker Desktop puede no estar corriendo tras un reinicio)
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  $dd = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
  if (Test-Path $dd) {
    Write-Host '[demo] Docker no responde. Iniciando Docker Desktop y esperando hasta 3 min...'
    Start-Process -FilePath $dd | Out-Null
    $dsw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($dsw.Elapsed.TotalSeconds -lt 180) {
      Start-Sleep -Seconds 5
      docker info *> $null
      if ($LASTEXITCODE -eq 0) { break }
    }
  }
  docker info *> $null
  if ($LASTEXITCODE -ne 0) { Fail 'Docker no esta disponible. Inicia Docker Desktop, espera a que diga "running" y reintenta.' }
}
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

# 2b) Agente de IA (OPCIONAL). Solo si existen su .env y su .venv; si no, la demo corre con AI_ENABLED=false.
# Sin build: uvicorn desde el venv del agente. El secreto HMAC se genera por corrida (no se lee ni se guarda el del .env).
$agentDir = if (Test-Path (Join-Path $rootDir 'apps\agent')) { Join-Path $rootDir 'apps\agent' } else { Join-Path $rootDir 'okr-platform-agent' }
$agentPy  = Join-Path $agentDir '.venv\Scripts\python.exe'
$agentPidFile = Join-Path $demoDir '.agent.pid'
$agentLog = Join-Path $demoDir '.agent.log'
$agentPort = 8098
$env:AI_ENABLED = 'false'
$env:ASSISTANT_ENABLED = 'false'
if ((Test-Path (Join-Path $agentDir '.env')) -and (Test-Path $agentPy) -and -not (Port-InUse $agentPort)) {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $env:AGENT_SHARED_SECRET = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
  $env:AGENT_PORT = "$agentPort"
  Write-Host "[demo] Iniciando agente de IA (uvicorn) en :$agentPort..."
  $agentProc = Start-Process -FilePath $agentPy `
    -ArgumentList @('-m', 'uvicorn', 'okr_agent.api.main:app', '--host', '127.0.0.1', '--port', "$agentPort") `
    -WorkingDirectory $agentDir -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $agentLog -RedirectStandardError "$agentLog.err"
  Set-Content -Path $agentPidFile -Value $agentProc.Id
  $agentUp = $false
  for ($i = 0; $i -lt 60 -and -not $agentUp; $i++) {
    $agentProc.Refresh()
    if ($agentProc.HasExited) { break }
    try {
      $r = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$agentPort/health"); $r.Proxy = $null; $r.Timeout = 2000
      $resp = $r.GetResponse(); $agentUp = ([int]$resp.StatusCode -eq 200); $resp.Close()
    } catch { }
    if (-not $agentUp) { Start-Sleep -Seconds 1 }
  }
  if ($agentUp) {
    $env:AI_ENABLED = 'true'
    $env:ASSISTANT_ENABLED = 'true'
    $env:AGENT_URL = "http://127.0.0.1:$agentPort"
    Write-Host "[demo] Agente de IA saludable (PID $($agentProc.Id)). AI_ENABLED=true." -ForegroundColor Green
  } else {
    Write-Host "[demo] AVISO: el agente no respondio en /health. La demo sigue con AI_ENABLED=false. Ver $agentLog.err" -ForegroundColor Yellow
    if (-not $agentProc.HasExited) { taskkill /PID $agentProc.Id /T /F | Out-Null }
    Remove-Item $agentPidFile -Force -ErrorAction SilentlyContinue
  }
} else {
  Write-Host '[demo] Sin agente de IA (falta okr-platform-agent\.env o .venv, o el puerto esta ocupado): AI_ENABLED=false.'
}

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

# OJO: usar 127.0.0.1 y NO localhost. Node escucha en IPv4 (0.0.0.0); localhost resuelve primero a ::1,
# Windows tarda ~2s en rechazar esa conexion y Invoke-WebRequest (-TimeoutSec 2) expira antes de reintentar en IPv4.
function Test-Health($url) {
  try {
    $req = [System.Net.HttpWebRequest]::Create($url)
    $req.Proxy = $null
    $req.Timeout = 2000
    $req.ReadWriteTimeout = 2000
    $req.KeepAlive = $false
    $resp = $req.GetResponse()
    $code = [int]$resp.StatusCode
    $resp.Close()
    return ($code -eq 200)
  } catch { return $false }
}

$healthy = $false
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$maxSeconds = 300
while ($sw.Elapsed.TotalSeconds -lt $maxSeconds) {
  $proc.Refresh()
  if ($proc.HasExited) { Fail "La API termino inesperadamente. Ver $apiLog.err" }
  if (Test-Health 'http://127.0.0.1:3100/health') { $healthy = $true; break }
  if ([int]$sw.Elapsed.TotalSeconds % 10 -eq 0) { Write-Host "[demo] Esperando /health... $([int]$sw.Elapsed.TotalSeconds)s" }
  Start-Sleep -Seconds 1
}
if (-not $healthy) { Fail "La API no respondio en /health tras ${maxSeconds}s. Ver $apiLog.err" }
Write-Host '[demo] API saludable.'

# 4) Datos de ejemplo
node (Join-Path $demoDir 'seed-demo.mjs')
if ($LASTEXITCODE -ne 0) { Fail 'El loader fallo (la API y la DB siguen arriba; demo-down.ps1 para limpiar).' }

Write-Host ''
Write-Host '[demo] Listo. Front: cd okr-platform-front; $env:API_URL="http://localhost:3100"; npx next dev -p 3101' -ForegroundColor Green
