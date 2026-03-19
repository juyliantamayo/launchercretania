<#
.SYNOPSIS
  build-store.ps1 — Compila la variante Microsoft Store del Lucerion Launcher.

.DESCRIPTION
  Genera un paquete MSIX/AppX usando electron-builder con la configuración
  de electron-builder.store.json, que inyecta storeBuild:true en package.json
  (via extraMetadata) para desactivar self-update y user mods JAR.

  Prerequisitos:
    - Node.js 18+ y npm instalados
    - electron-builder >= 24 en node_modules
    - identityName, publisherDisplayName y publisher configurados en
      electron-builder.store.json para coincidir con tu cuenta de Partner Center
    - Certificado de firma configurado en las variables de entorno de electron-builder
      o en electron-builder.store.json (campos "certificateFile" + "certificatePassword")
    - Assets visuales en ./store-assets/ (ver QA-CHECKLIST-STORE.md)

  Salida: dist/store/LucerionLauncher-Store.appx

.NOTES
  Standalone build: npm run build:standalone  (genera dist/LucerionLauncher.exe)
  Store build:      npm run build:store        (genera dist/store/LucerionLauncher-Store.appx)
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LauncherDir = Join-Path $ScriptDir ".."
Push-Location $LauncherDir

try {
    Write-Host "`n== Lucerion Launcher — Build Microsoft Store ==" -ForegroundColor Cyan
    Write-Host "Directorio: $LauncherDir" -ForegroundColor Gray

    # Verificar que la configuración Store existe
    if (-not (Test-Path "electron-builder.store.json")) {
        Write-Error "No se encontró electron-builder.store.json en $LauncherDir"
    }

    # Instalar dependencias si faltan
    if (-not (Test-Path "node_modules")) {
        Write-Host "`n[1/3] Instalando dependencias npm..." -ForegroundColor Yellow
        npm install
    } else {
        Write-Host "`n[1/3] Dependencias ya instaladas." -ForegroundColor Green
    }

    # Limpiar build anterior de Store
    $storeOut = Join-Path $LauncherDir "dist\store"
    if (Test-Path $storeOut) {
        Write-Host "`n[2/3] Limpiando build anterior en dist/store..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force $storeOut
    }

    # Ejecutar build Store
    Write-Host "`n[3/3] Compilando variante Store (MSIX)..." -ForegroundColor Yellow
    Write-Host "      Configuración: electron-builder.store.json" -ForegroundColor Gray
    Write-Host "      storeBuild=true será inyectado via extraMetadata" -ForegroundColor Gray
    npm run build:store

    Write-Host "`n== Build completado ==" -ForegroundColor Green
    Write-Host "Paquete: dist/store/LucerionLauncher-Store.appx" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Próximo paso: validar con la QA Checklist antes de subir a Partner Center." -ForegroundColor Yellow
    Write-Host "  Ver: QA-CHECKLIST-STORE.md" -ForegroundColor Yellow

} catch {
    Write-Error "Build fallido: $_"
} finally {
    Pop-Location
}
