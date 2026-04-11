<#
.SYNOPSIS
  build-store.ps1 — Pipeline completo MSIX para Lucerion Launcher.

.DESCRIPTION
  Ejecuta el pipeline completo de empaquetado MSIX:
    1. Regenera icon.ico desde Square310x310Logo.png (siempre fresco)
    2. Compila con electron-builder SIN firma (genera MSIX sin firmar)
    3. Incrusta el icono en el .exe con rcedit
    4. Desempaqueta el MSIX generado por electron-builder
    5. Reemplaza iconos con los de store-assets/ y parchea AppxManifest.xml
    6. Re-empaqueta MSIX con MakeAppx pack /d
    7. Firma con signtool del SDK de Windows

  Prerequisitos:
    - Node.js 18+ y npm instalados
    - Windows SDK 10.0.26100.0 (makeappx, signtool)
    - lucerion-store.pfx en el directorio mc-launcher/
    - store-assets/ con los PNGs de Lucerion

  Salida: dist/store/LucerionLauncher-Store.msix  (firmado)

.NOTES
  Standalone build: npm run build:standalone  (genera dist/LucerionLauncher.exe)
  Store build:      .\scripts\build-store.ps1  (genera dist/store/LucerionLauncher-Store.msix)

  Esta pipeline quita temporalmente certificateFile/certificatePassword del
  electron-builder.store.json para que electron-builder genere el MSIX sin firmar.
  Luego firma con el signtool del SDK (que sí funciona correctamente).
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
    $winUnpacked  = Join-Path $storeOut "win-unpacked"
    $srcAssets    = Join-Path $root "store-assets"
    $ebConfig     = Join-Path $root "electron-builder.store.json"

    Write-Host ""
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "  Lucerion Launcher - Build MSIX Completo" -ForegroundColor Cyan
    Write-Host "================================================" -ForegroundColor Cyan

    # ── [1/7] Regenerar icon.ico ─────────────────────────────────────────────
    Write-Host "`n[1/7] Regenerando icon.ico desde Square310x310Logo.png..." -ForegroundColor Yellow
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

    # ── [2/7] Compilar con electron-builder (sin firma) ──────────────────────
    Write-Host "`n[2/7] Compilando con electron-builder (sin firma)..." -ForegroundColor Yellow

    # Quitar certificateFile y certificatePassword del config para que e-b no intente firmar
    $ebJson = Get-Content $ebConfig -Raw | ConvertFrom-Json
    $hadCertFile = $null
    $hadCertPass = $null
    if ($ebJson.win.PSObject.Properties['certificateFile']) {
        $hadCertFile = $ebJson.win.certificateFile
        $ebJson.win.PSObject.Properties.Remove('certificateFile')
    }
    if ($ebJson.win.PSObject.Properties['certificatePassword']) {
        $hadCertPass = $ebJson.win.certificatePassword
        $ebJson.win.PSObject.Properties.Remove('certificatePassword')
    }
    $ebJson | ConvertTo-Json -Depth 10 | Set-Content $ebConfig -Encoding UTF8
    Write-Host "  Config: certificado removido temporalmente." -ForegroundColor Gray

    if (Test-Path $storeOut) { Remove-Item $storeOut -Recurse -Force }
    try {
        npm run build:store
    } finally {
        # Restaurar certificado siempre, incluso si el build falla
        if ($hadCertFile) { $ebJson.win | Add-Member -NotePropertyName 'certificateFile' -NotePropertyValue $hadCertFile }
        if ($hadCertPass) { $ebJson.win | Add-Member -NotePropertyName 'certificatePassword' -NotePropertyValue $hadCertPass }
        $ebJson | ConvertTo-Json -Depth 10 | Set-Content $ebConfig -Encoding UTF8
        Write-Host "  Config: certificado restaurado." -ForegroundColor Gray
    }

    # Buscar el MSIX sin firmar generado por electron-builder
    $ebMsix = Get-ChildItem $storeOut -Filter "*.msix" | Select-Object -First 1
    if (-not $ebMsix) { throw "electron-builder no generó un .msix en $storeOut" }
    $unsignedMsix = $ebMsix.FullName
    Write-Host "  MSIX base: $($ebMsix.Name) ($([math]::Round($ebMsix.Length/1MB,1)) MB)" -ForegroundColor Green

    # ── [3/7] Incrustar icono en el .exe con rcedit ───────────────────────────
    Write-Host "`n[3/7] Incrustando icono Lucerion en el .exe..." -ForegroundColor Yellow
    $exePath = Join-Path $winUnpacked "Lucerion Launcher.exe"
    if (Test-Path $exePath) {
        & $rcedit $exePath --set-icon (Join-Path $root "icon.ico")
        if ($LASTEXITCODE -ne 0) { Write-Warning "rcedit no pudo parchear el exe (no es crítico)." }
        else { Write-Host "  + Icono Lucerion incrustado en exe." -ForegroundColor Green }
    } else {
        Write-Warning "No se encontró: $exePath"
    }

    # ── [4/7] Desempaquetar MSIX ─────────────────────────────────────────────
    Write-Host "`n[4/7] Desempaquetando MSIX para reemplazar iconos..." -ForegroundColor Yellow
    $unpackDir = Join-Path $storeOut "_msix-unpacked"
    if (Test-Path $unpackDir) { Remove-Item $unpackDir -Recurse -Force }
    & $makeappx unpack /p $unsignedMsix /d $unpackDir /o
    if ($LASTEXITCODE -ne 0) { throw "MakeAppx unpack falló" }
    Write-Host "  Desempaquetado en: $unpackDir" -ForegroundColor Green

    # ── [5/7] Reemplazar iconos y parchear manifest ──────────────────────────
    Write-Host "`n[5/7] Reemplazando iconos con store-assets y parcheando manifest..." -ForegroundColor Yellow
    $assetsDir = Join-Path $unpackDir "assets"
    if (-not (Test-Path $assetsDir)) { New-Item $assetsDir -ItemType Directory -Force | Out-Null }

    # Copiar todos los PNGs de store-assets a assets/
    $copied = 0
    Get-ChildItem $srcAssets -Filter "*.png" | ForEach-Object {
        Copy-Item $_.FullName (Join-Path $assetsDir $_.Name) -Force
        Write-Host "  + $($_.Name)" -ForegroundColor Gray
        $copied++
    }
    Write-Host "  $copied iconos copiados." -ForegroundColor Green

    # Parchear AppxManifest.xml
    $manifestPath = Join-Path $unpackDir "AppxManifest.xml"
    $xml = Get-Content $manifestPath -Raw
    $xml = $xml -replace 'MinVersion="[^"]*"',       'MinVersion="10.0.17763.0"'
    $xml = $xml -replace 'MaxVersionTested="[^"]*"', 'MaxVersionTested="10.0.26100.0"'
    $xml = $xml -replace '<Resource Language="[^"]*"', '<Resource Language="es"'
    Set-Content $manifestPath $xml -Encoding UTF8
    Write-Host "  Manifest parcheado: MinVersion=10.0.17763.0  MaxVersionTested=10.0.26100.0  Language=es" -ForegroundColor Green

    # Eliminar AppxBlockMap.xml y AppxSignature.p7x (se regenerarán al re-empaquetar)
    Remove-Item (Join-Path $unpackDir "AppxBlockMap.xml") -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $unpackDir "AppxSignature.p7x") -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $unpackDir "[Content_Types].xml") -Force -ErrorAction SilentlyContinue

    # ── [6/7] Re-empaquetar MSIX ──────────────────────────────────────────────
    Write-Host "`n[6/7] Re-empaquetando MSIX con MakeAppx pack /d..." -ForegroundColor Yellow
    if (Test-Path $msixPath) { Remove-Item $msixPath -Force }
    & $makeappx pack /d $unpackDir /p $msixPath /o
    if ($LASTEXITCODE -ne 0) { throw "MakeAppx pack /d falló" }
    $msixSize = (Get-Item $msixPath).Length
    Write-Host "  MSIX generado: $([math]::Round($msixSize/1MB,1)) MB" -ForegroundColor Green

    # Limpiar directorio de unpack
    Remove-Item $unpackDir -Recurse -Force -ErrorAction SilentlyContinue
    # Eliminar MSIX original de electron-builder si es distinto al final
    if ($unsignedMsix -ne $msixPath -and (Test-Path $unsignedMsix)) {
        Remove-Item $unsignedMsix -Force -ErrorAction SilentlyContinue
    }

    # ── [7/7] Firmar con signtool ─────────────────────────────────────────────
    Write-Host "`n[7/7] Firmando con signtool..." -ForegroundColor Yellow
    & $signtool sign /fd SHA256 /a /f $pfx /p $pfxPass $msixPath
    if ($LASTEXITCODE -ne 0) { throw "signtool falló al firmar el MSIX" }
    Write-Host "  Firma aplicada." -ForegroundColor Green

    # ── [POST] Verificación de iconos ─────────────────────────────────────────
    Write-Host "`n[POST] Verificando iconos dentro del MSIX firmado..." -ForegroundColor Yellow
    $verifyDir = Join-Path $storeOut "_msix-verify"
    if (Test-Path $verifyDir) { Remove-Item $verifyDir -Recurse -Force }
    & $makeappx unpack /p $msixPath /d $verifyDir /o 2>&1 | Out-Null
    $requiredAssets = @(
        "Square44x44Logo.png",
        "Square44x44Logo.targetsize-16.png",
        "Square44x44Logo.targetsize-24.png",
        "Square44x44Logo.targetsize-32.png",
        "Square44x44Logo.targetsize-44.png",
        "Square44x44Logo.targetsize-48.png",
        "Square44x44Logo.targetsize-256.png",
        "Square44x44Logo.targetsize-16_altform-unplated.png",
        "Square44x44Logo.targetsize-24_altform-unplated.png",
        "Square44x44Logo.targetsize-32_altform-unplated.png",
        "Square44x44Logo.targetsize-48_altform-unplated.png",
        "Square44x44Logo.targetsize-256_altform-unplated.png",
        "Square150x150Logo.png",
        "Wide310x150Logo.png",
        "StoreLogo.png"
    )
    $iconErrors = 0
    foreach ($asset in $requiredAssets) {
        $msixFile   = Join-Path "$verifyDir\assets" $asset
        $sourceFile = Join-Path $srcAssets $asset
        if (-not (Test-Path $msixFile)) {
            Write-Host "  FALTA: $asset" -ForegroundColor Red
            $iconErrors++
        } elseif (Test-Path $sourceFile) {
            $h1 = (Get-FileHash $msixFile).Hash
            $h2 = (Get-FileHash $sourceFile).Hash
            if ($h1 -ne $h2) {
                Write-Host "  DIFIERE: $asset" -ForegroundColor Red
                $iconErrors++
            } else {
                Write-Host "  OK: $asset" -ForegroundColor Green
            }
        }
    }
    Remove-Item $verifyDir -Recurse -Force -ErrorAction SilentlyContinue
    if ($iconErrors -gt 0) {
        throw "Verificación de iconos fallida: $iconErrors asset(s) incorrectos."
    }
    Write-Host "  Todos los iconos verificados correctamente." -ForegroundColor Green

    Write-Host ""
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "  BUILD EXITOSO - MSIX firmado y verificado" -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "  Paquete: $msixPath" -ForegroundColor Cyan
    Write-Host ""

} catch {
    Write-Host "`nBUILD FALLIDO: $_" -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}
