# =============================================================
#  sign-app.ps1
#  Firma el .exe ya compilado con signtool (Windows SDK)
#  Uso:
#    .\scripts\sign-app.ps1 -CertPath "mi-cert.pfx" -CertPassword "pass"
#    .\scripts\sign-app.ps1   (usa variables de entorno CSC_LINK / CSC_KEY_PASSWORD)
# =============================================================

param(
    [string]$CertPath     = $env:CSC_LINK,
    [string]$CertPassword = $env:CSC_KEY_PASSWORD,
    [string]$ExePath      = ".\dist\LucerionLauncher.exe",
    [string]$TimestampUrl = "http://timestamp.digicert.com"
)

# ── Validar parámetros ────────────────────────────────────────
if (-not $CertPath) {
    Write-Error "No se especificó certificado. Usa -CertPath o la variable de entorno CSC_LINK."
    exit 1
}
if (-not (Test-Path $CertPath)) {
    Write-Error "No se encuentra el archivo de certificado: $CertPath"
    exit 1
}
if (-not (Test-Path $ExePath)) {
    Write-Error "No se encuentra el ejecutable: $ExePath  (¿ya ejecutaste npm run build:win?)"
    exit 1
}

# ── Buscar signtool.exe (Windows SDK) ────────────────────────
$signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" `
    -Recurse -Filter "signtool.exe" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like "*x64*" } |
    Sort-Object FullName -Descending |
    Select-Object -First 1 -ExpandProperty FullName

if (-not $signtool) {
    # Probar ruta de Windows Kits 11
    $signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\11\bin" `
        -Recurse -Filter "signtool.exe" -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -like "*x64*" } |
        Sort-Object FullName -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}

if (-not $signtool) {
    Write-Error @"
signtool.exe no encontrado. Instala el Windows SDK:
  https://developer.microsoft.com/windows/downloads/windows-sdk/
O instala las 'Build Tools for Visual Studio' (incluye signtool).
"@
    exit 1
}

Write-Host ""
Write-Host "signtool : $signtool"       -ForegroundColor DarkGray
Write-Host "Ejecutable: $ExePath"       -ForegroundColor Cyan
Write-Host "Certificado: $CertPath"     -ForegroundColor Cyan
Write-Host "Timestamp: $TimestampUrl"   -ForegroundColor DarkGray
Write-Host ""

# ── Firmar ───────────────────────────────────────────────────
$args = @(
    "sign",
    "/fd", "SHA256",
    "/td", "SHA256",
    "/tr", $TimestampUrl,
    "/f",  $CertPath
)
if ($CertPassword) { $args += "/p"; $args += $CertPassword }
$args += $ExePath

& $signtool @args

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Firmado correctamente." -ForegroundColor Green
    # Verificar firma
    & $signtool verify /pa /v $ExePath 2>&1 | Select-String "Successfully"
} else {
    Write-Error "La firma falló (código $LASTEXITCODE)"
    exit $LASTEXITCODE
}
