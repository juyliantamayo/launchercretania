# =============================================================
#  build-signed.ps1
#  Compila el launcher y lo firma en un solo paso.
#
#  Uso con certificado real (.pfx):
#    .\scripts\build-signed.ps1 -CertPath "C:\certs\mi-cert.pfx" -CertPassword "pass"
#
#  Uso con cert de desarrollo (crear primero con create-dev-cert.ps1):
#    .\scripts\build-signed.ps1 -CertPath ".\lucerion-dev.pfx" -CertPassword "lucerion2026"
#
#  Uso con variables de entorno:
#    $env:CSC_LINK = "C:\certs\mi-cert.pfx"
#    $env:CSC_KEY_PASSWORD = "pass"
#    .\scripts\build-signed.ps1
# =============================================================

param(
    [string]$CertPath     = $env:CSC_LINK,
    [string]$CertPassword = $env:CSC_KEY_PASSWORD,
    [string]$TimestampUrl = "http://timestamp.digicert.com"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

# ── Validar cert ─────────────────────────────────────────────
if (-not $CertPath) {
    Write-Error "Especifica -CertPath o establece la variable de entorno CSC_LINK."
    exit 1
}
if (-not (Test-Path $CertPath)) {
    Write-Error "No se encuentra: $CertPath"
    exit 1
}

# ── Exportar vars para electron-builder ──────────────────────
$env:CSC_LINK         = (Resolve-Path $CertPath).Path
$env:CSC_KEY_PASSWORD = $CertPassword

Write-Host ""
Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Lucerion Launcher — Build + Sign"         -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Cert : $env:CSC_LINK"
Write-Host "  TS   : $TimestampUrl"
Write-Host ""

# ── Compilar ─────────────────────────────────────────────────
Push-Location $root
Write-Host "► npm run build:signed ..." -ForegroundColor Yellow
npm run build:signed
if ($LASTEXITCODE -ne 0) { Write-Error "Build falló"; exit 1 }
Pop-Location

# ── Verificar firma ───────────────────────────────────────────
$exePath = Join-Path $root "dist\LucerionLauncher.exe"
Write-Host ""
Write-Host "► Verificando firma..." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot "sign-app.ps1") `
    -CertPath $env:CSC_LINK `
    -CertPassword $env:CSC_KEY_PASSWORD `
    -ExePath $exePath `
    -TimestampUrl $TimestampUrl

Write-Host ""
Write-Host "══════════════════════════════════════════" -ForegroundColor Green
Write-Host "  Listo: dist\LucerionLauncher.exe"         -ForegroundColor Green
Write-Host "══════════════════════════════════════════" -ForegroundColor Green
