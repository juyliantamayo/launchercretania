<#
.SYNOPSIS
  build-store.ps1 — Pipeline completo MSIX para Lucerion Launcher.

.DESCRIPTION
  Ejecuta el pipeline completo de empaquetado MSIX:
    1. Regenera icon.ico desde Square310x310Logo.png (siempre fresco)
    2. Compila con electron-builder (genera win-unpacked + __appx-x64/mapping.txt)
    3. Incrusta el icono en el .exe con rcedit
    4. Parchea AppxManifest.xml generado por electron-builder
    5. Construye mapping personalizado con assets Lucerion (reemplaza SampleAppx)
    6. MakeAppx pack /f con el mapping personalizado (genera BlockMap válido para signtool)
    7. Firma con signtool (certificado lucerion-store.pfx)

  Prerequisitos:
    - Node.js 18+ y npm instalados
    - Windows SDK 10.0.26100.0 (makeappx, signtool)
    - lucerion-store.pfx en el directorio mc-launcher/
    - store-assets/ con los 16 PNGs de Lucerion

  Salida: dist/store/LucerionLauncher-Store.msix  (firmado)

.NOTES
  Standalone build: npm run build:standalone  (genera dist/LucerionLauncher.exe)
  Store build:      .\scripts\build-store.ps1  (genera dist/store/LucerionLauncher-Store.msix)

  IMPORTANTE: No usar makeappx unpack + pack /d para reempaquetar MSIX — genera
  un BlockMap incompatible con signtool (error 0x800700C1). Siempre usar pack /f
  con un mapping.txt construido desde las fuentes originales.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$root       = (Join-Path $ScriptDir "..") | Resolve-Path | Select-Object -ExpandProperty Path

Push-Location $root

try {
    # ── Configuración ────────────────────────────────────────────────────────
    $sdkBin    = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64"
    $makeappx  = Join-Path $sdkBin "makeappx.exe"
    $signtool  = Join-Path $sdkBin "signtool.exe"
    $rcedit    = Join-Path $root "node_modules\rcedit\bin\rcedit-x64.exe"
    $pfx       = Join-Path $root "lucerion-store.pfx"
    $pfxPass   = "lucerion2026"
    $storeOut  = Join-Path $root "dist\store"
    $msixPath  = Join-Path $storeOut "LucerionLauncher-Store.msix"
    $ebMappingDir = Join-Path $storeOut "__appx-x64"
    $winUnpacked  = Join-Path $storeOut "win-unpacked"
    $srcAssets    = Join-Path $root "store-assets"
    $tmpMsix      = Join-Path $env:TEMP "LucerionLauncher-tmp.msix"

    Write-Host ""
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "  Lucerion Launcher - Build MSIX Completo" -ForegroundColor Cyan
    Write-Host "================================================" -ForegroundColor Cyan

    # ── [1/7] Regenerar icon.ico ─────────────────────────────────────────────
    Write-Host "`n[1/7] Regenerando icon.ico desde Square310x310Logo.png..." -ForegroundColor Yellow
    # Guardar en $root para que require('png-to-ico') resuelva node_modules del proyecto
    $genIconJs = Join-Path $root "_gen-icon-tmp.js"
    Set-Content $genIconJs @'
const pngToIco = require('png-to-ico').default;
const fs = require('fs');
const p = require('path').resolve('store-assets/Square310x310Logo.png');
pngToIco(p).then(function(buf) {
  fs.writeFileSync('icon.ico', buf);
  console.log('  icon.ico generado:', buf.length, 'bytes');
}).catch(function(e) { console.error('ERROR:', e.message); process.exit(1); });
'@
    node $genIconJs
    if ($LASTEXITCODE -ne 0) { throw "Fallo al generar icon.ico" }
    Remove-Item $genIconJs -Force -ErrorAction SilentlyContinue

    # ── [2/7] Compilar con electron-builder ──────────────────────────────────
    Write-Host "`n[2/7] Compilando con electron-builder (npm run build:store)..." -ForegroundColor Yellow
    if (Test-Path $storeOut) { Remove-Item $storeOut -Recurse -Force }
    npm run build:store
    # electron-builder genera win-unpacked/ y __appx-x64/mapping.txt con los paths reales.
    # Puede fallar al firmar (signtool del cache), pero necesitamos esos directorios.
    if (-not (Test-Path $ebMappingDir)) { throw "electron-builder no generó __appx-x64/: $ebMappingDir" }
    if (-not (Test-Path $winUnpacked))  { throw "electron-builder no generó win-unpacked/: $winUnpacked" }
    Write-Host "  Directorios de build listos." -ForegroundColor Gray

    # ── [3/7] Incrustar icono en el .exe con rcedit ───────────────────────────
    Write-Host "`n[3/7] Incrustando icono Lucerion en el .exe con rcedit..." -ForegroundColor Yellow
    $exePath = Join-Path $winUnpacked "Lucerion Launcher.exe"
    if (Test-Path $exePath) {
        & $rcedit $exePath --set-icon (Join-Path $root "icon.ico")
        if ($LASTEXITCODE -ne 0) { Write-Warning "rcedit no pudo parchear el exe (no es crítico)." }
        else { Write-Host "  + Icono Lucerion incrustado en exe." -ForegroundColor Green }
    } else {
        Write-Warning "No se encontró: $exePath"
    }

    # ── [4/7] Parchear AppxManifest.xml ──────────────────────────────────────
    Write-Host "`n[4/7] Parcheando AppxManifest.xml..." -ForegroundColor Yellow
    $manifestPath = Join-Path $ebMappingDir "AppxManifest.xml"
    $xml = Get-Content $manifestPath -Raw
    $xml = $xml -replace 'MinVersion="[^"]*"',       'MinVersion="10.0.17763.0"'
    $xml = $xml -replace 'MaxVersionTested="[^"]*"', 'MaxVersionTested="10.0.26100.0"'
    $xml = $xml -replace '<Resource Language="[^"]*"', '<Resource Language="es"'
    Set-Content $manifestPath $xml -Encoding UTF8
    Write-Host "  OK: MinVersion=10.0.17763.0  MaxVersionTested=10.0.26100.0  Language=es" -ForegroundColor Green

    # ── [5/7] Construir mapping personalizado con assets Lucerion ─────────────
    Write-Host "`n[5/7] Construyendo mapping con assets Lucerion..." -ForegroundColor Yellow
    $ebMappingFile = Join-Path $ebMappingDir "mapping.txt"

    # Leer mapping de electron-builder, quitar:
    #   - la línea [Files]
    #   - los assets genéricos de SampleAppx (appxAssets de winCodeSign)
    #   - la línea del AppxManifest de __appx-x64 (la sustituimos por la nuestra parcheada)
    $appLines = Get-Content $ebMappingFile | Where-Object {
        $_ -ne "[Files]" -and
        $_ -notlike '"*appxAssets*"' -and
        $_ -notlike '"*__appx-x64\AppxManifest*"'
    }

    $newMapping = @("[Files]")
    # Manifest parcheado
    $newMapping += "`"$manifestPath`" `"AppxManifest.xml`""

    # Assets Lucerion (reemplazando los SampleAppx de electron-builder)
    $assetMap = [ordered]@{
        "Square44x44Logo.png"                            = "assets\Square44x44Logo.png"
        "Square44x44Logo.targetsize-16.png"              = "assets\Square44x44Logo.targetsize-16.png"
        "Square44x44Logo.targetsize-24.png"              = "assets\Square44x44Logo.targetsize-24.png"
        "Square44x44Logo.targetsize-32.png"              = "assets\Square44x44Logo.targetsize-32.png"
        "Square44x44Logo.targetsize-44.png"              = "assets\Square44x44Logo.targetsize-44.png"
        "Square44x44Logo.targetsize-48.png"              = "assets\Square44x44Logo.targetsize-48.png"
        "Square44x44Logo.targetsize-256.png"             = "assets\Square44x44Logo.targetsize-256.png"
        "Square44x44Logo.targetsize-16_altform-unplated.png" = "assets\Square44x44Logo.targetsize-16_altform-unplated.png"
        "Square44x44Logo.targetsize-24_altform-unplated.png" = "assets\Square44x44Logo.targetsize-24_altform-unplated.png"
        "Square44x44Logo.targetsize-32_altform-unplated.png" = "assets\Square44x44Logo.targetsize-32_altform-unplated.png"
        "Square44x44Logo.targetsize-48_altform-unplated.png" = "assets\Square44x44Logo.targetsize-48_altform-unplated.png"
        "Square44x44Logo.targetsize-256_altform-unplated.png"= "assets\Square44x44Logo.targetsize-256_altform-unplated.png"
        "Square150x150Logo.png"  = "assets\Square150x150Logo.png"
        "StoreLogo.png"          = "assets\StoreLogo.png"
        "Wide310x150Logo.png"    = "assets\Wide310x150Logo.png"
        "SplashScreen.png"       = "assets\SplashScreen.png"
    }
    foreach ($k in $assetMap.Keys) {
        $src = Join-Path $srcAssets $k
        if (Test-Path $src) {
            $newMapping += "`"$src`" `"$($assetMap[$k])`""
            Write-Host "  + $k" -ForegroundColor Gray
        } else {
            Write-Warning "Asset no encontrado: $src"
        }
    }

    # Archivos de la app (win-unpacked, rutas originales de electron-builder)
    $newMapping += $appLines

    $customMappingPath = Join-Path $storeOut "lucerion-mapping.txt"
    $newMapping | Set-Content $customMappingPath -Encoding UTF8
    Write-Host "  Mapping guardado: $customMappingPath ($($newMapping.Count) entradas)" -ForegroundColor Green

    # ── [6/7] Empaquetar MSIX con mapping personalizado ───────────────────────
    Write-Host "`n[6/7] Empaquetando MSIX con MakeAppx..." -ForegroundColor Yellow
    if (Test-Path $tmpMsix) { Remove-Item $tmpMsix -Force }
    & $makeappx pack /f $customMappingPath /p $tmpMsix
    if ($LASTEXITCODE -ne 0) { throw "MakeAppx pack falló" }
    $msixSize = (Get-Item $tmpMsix).Length
    Write-Host "  MSIX generado: $([math]::Round($msixSize/1MB,1)) MB" -ForegroundColor Green

    # ── [7/7] Firmar con signtool ─────────────────────────────────────────────
    Write-Host "`n[7/7] Firmando con signtool..." -ForegroundColor Yellow
    & $signtool sign /fd SHA256 /f $pfx /p $pfxPass /v $tmpMsix
    if ($LASTEXITCODE -ne 0) { throw "signtool falló al firmar el MSIX" }

    # Mover MSIX firmado al destino final
    if (Test-Path $msixPath) { Remove-Item $msixPath -Force }
    Move-Item $tmpMsix $msixPath
    Write-Host "  MSIX firmado correctamente." -ForegroundColor Green

    # Verificar firma
    & $signtool verify /pa $msixPath
    if ($LASTEXITCODE -ne 0) { throw "Verificación de firma falló" }

    Write-Host ""
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "  MSIX listo y firmado correctamente." -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "  Paquete: $msixPath" -ForegroundColor Cyan
    Write-Host ""

} catch {
    Write-Host "`nBUILD FALLIDO: $_" -ForegroundColor Red
    if (Test-Path $tmpMsix) { Remove-Item $tmpMsix -Force -ErrorAction SilentlyContinue }
    exit 1
} finally {
    Pop-Location
}
