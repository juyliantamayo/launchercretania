<#
.SYNOPSIS
    Sube TODOS los mods del modpack cretaniaTF4 a la release de GitHub.

.PARAMETER SourceDir
    Directorio donde están los .jar de Forge. Ej:
      .\subir-mods-todos.ps1 -SourceDir "C:\Users\julian\AppData\Roaming\PrismLauncher\instances\cretaniaTF4\.minecraft\mods"
    Si se omite, busca automáticamente en el directorio de juego del launcher.

.PARAMETER DryRun
    Simula la subida sin hacer cambios reales.

.EXAMPLE
    .\subir-mods-todos.ps1 -SourceDir "C:\MisCarpetas\mods-forge"
    .\subir-mods-todos.ps1 -DryRun
#>
param(
    [string]$SourceDir = "",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# ── Config ─────────────────────────────────────────────────────────────────────
$RepoOwner   = "juyliantamayo"
$RepoName    = "launchercretania"
$ReleaseTag  = "cretaniaTF4-v1.0.0"
$ManifestPath = Join-Path $PSScriptRoot "my-modpack\manifest.json"

# ── Buscar directorio fuente si no se especificó ────────────────────────────────
if (-not $SourceDir) {
    $candidates = @(
        "$env:APPDATA\lucerion-launcher\cretaniaTF4\mods",
        "$env:APPDATA\.cretania-minecraft\cretaniaTF4\mods",
        (Join-Path $PSScriptRoot "modpacks\hardrock-normal\mods")
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) {
            $jars = Get-ChildItem $c -Filter "*.jar" -ErrorAction SilentlyContinue
            if ($jars.Count -gt 0) {
                $SourceDir = $c
                Write-Host "[auto] Usando directorio fuente: $SourceDir ($($jars.Count) jars)" -ForegroundColor Cyan
                break
            }
        }
    }
    if (-not $SourceDir) {
        Write-Error "No se encontró un directorio de mods con JARs.`n`nEspecifica el directorio con:`n    .\subir-mods-todos.ps1 -SourceDir ""C:\ruta\a\tus\mods"""
        exit 1
    }
}

if (-not (Test-Path $SourceDir)) {
    Write-Error "El directorio no existe: $SourceDir"
    exit 1
}

# ── Token de GitHub ─────────────────────────────────────────────────────────────
$credLines = "protocol=https`nhost=github.com`n" | git credential fill
$credData  = $credLines | ConvertFrom-StringData
$token     = $credData.password

if (-not $token) {
    Write-Error "No se encontró token de GitHub. Asegúrate de estar logueado:\n    git credential approve"
    exit 1
}

$ghHeaders  = @{ Authorization = "token $token"; Accept = "application/vnd.github+json" }
$jarHeaders = @{ Authorization = "token $token"; "Content-Type" = "application/java-archive" }

# ── Obtener / crear la release ──────────────────────────────────────────────────
Write-Host "`n[1/4] Buscando release '$ReleaseTag' en GitHub..." -ForegroundColor Cyan
try {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$RepoOwner/$RepoName/releases/tags/$ReleaseTag" -Headers $ghHeaders
    Write-Host "      Release encontrada: id=$($release.id)"
} catch {
    Write-Host "      Release no existe, creándola..." -ForegroundColor Yellow
    if (-not $DryRun) {
        $body = @{ tag_name = $ReleaseTag; name = $ReleaseTag; draft = $false; prerelease = $false } | ConvertTo-Json
        $release = Invoke-RestMethod -Method Post `
            -Uri "https://api.github.com/repos/$RepoOwner/$RepoName/releases" `
            -Headers ($ghHeaders + @{ "Content-Type" = "application/json" }) `
            -Body $body
        Write-Host "      Creada: id=$($release.id)"
    } else {
        Write-Host "      [DryRun] Omitiría la creación" -ForegroundColor DarkGray
        $release = @{ id = "DRYRUN" }
    }
}

$releaseId  = $release.id
$uploadBase = "https://uploads.github.com/repos/$RepoOwner/$RepoName/releases/$releaseId/assets"

# ── Obtener assets ya subidos ───────────────────────────────────────────────────
Write-Host "`n[2/4] Obteniendo assets ya subidos..." -ForegroundColor Cyan
$allAssets = @()
if (-not $DryRun) {
    for ($p = 1; $p -le 20; $p++) {
        $page = Invoke-RestMethod -Uri "https://api.github.com/repos/$RepoOwner/$RepoName/releases/$releaseId/assets?per_page=100&page=$p" -Headers $ghHeaders
        if ($page.Count -eq 0) { break }
        $allAssets += $page
    }
}
Write-Host "      Assets ya en release: $($allAssets.Count)"
$existingNames = $allAssets | ForEach-Object { $_.name }

# ── Leer manifest.json ──────────────────────────────────────────────────────────
Write-Host "`n[3/4] Leyendo manifest.json..." -ForegroundColor Cyan
$manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json

# Soporta formatVersion 2 (array de modpacks) y 1 (objeto directo)
$targetPack = if ($manifest.formatVersion -eq 2) {
    $manifest.modpacks | Where-Object { $_.id -eq "cretaniaTF4" } | Select-Object -First 1
} else { $manifest }

if (-not $targetPack) {
    Write-Error "No se encontró el modpack 'cretaniaTF4' en manifest.json"
    exit 1
}

$modEntries = $targetPack.mods
Write-Host "      Mods en manifest: $($modEntries.Count)"

# ── Subir mods ─────────────────────────────────────────────────────────────────
Write-Host "`n[4/4] Subiendo mods faltantes..." -ForegroundColor Cyan

$ok      = 0
$skipped = 0
$missing = 0
$failed  = 0
$failedList = @()

foreach ($entry in $modEntries) {
    # entry.file = "mods/something.jar"
    $relPath   = $entry.file          # e.g. "mods/AI-Improvements.jar"
    $jarName   = Split-Path $relPath -Leaf   # e.g. "AI-Improvements.jar"
    
    # El asset en GitHub debe llamarse "mods/something.jar" para que la URL coincida
    $assetName = $relPath.Replace("\", "/")  # normalizar a forward slash

    # ¿Ya existe?
    if ($existingNames -contains $assetName) {
        $skipped++
        continue
    }

    # Buscar el archivo en el directorio fuente
    $localPath = Join-Path $SourceDir $jarName
    if (-not (Test-Path $localPath)) {
        Write-Host "  [FALTANTE] $jarName" -ForegroundColor Red
        $missing++
        $failedList += $jarName
        continue
    }

    $encodedAsset = [Uri]::EscapeDataString($assetName)

    if ($DryRun) {
        Write-Host "  [DryRun] Subiría: $assetName ($(([int]((Get-Item $localPath).Length / 1024)))KB)" -ForegroundColor DarkGray
        $ok++
        continue
    }

    try {
        Write-Host "  Subiendo: $assetName..." -NoNewline
        $resp = Invoke-RestMethod -Method Post `
            -Uri "$uploadBase`?name=$encodedAsset" `
            -Headers $jarHeaders `
            -InFile $localPath
        Write-Host " OK ($($resp.size) bytes)" -ForegroundColor Green
        $ok++
    } catch {
        Write-Host " ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $failed++
        $failedList += $jarName
    }
}

# ── Subir manifest.json y manifest.enc ─────────────────────────────────────────
$ManifestEncPath = Join-Path $PSScriptRoot "my-modpack\manifest.enc"
$jsonHeaders     = @{ Authorization = "token $token"; "Content-Type" = "application/json" }

foreach ($mfile in @("manifest.json", "manifest.enc")) {
    if ($existingNames -contains $mfile) {
        # Borrar el viejo para resubir actualizado
        $old = $allAssets | Where-Object { $_.name -eq $mfile }
        if ($old -and -not $DryRun) {
            Invoke-RestMethod -Method Delete -Uri "https://api.github.com/repos/$RepoOwner/$RepoName/releases/assets/$($old.id)" -Headers $ghHeaders | Out-Null
        }
    }
    $mpath = if ($mfile -eq "manifest.json") { $ManifestPath } else { $ManifestEncPath }
    if (Test-Path $mpath) {
        if (-not $DryRun) {
            Write-Host "  Subiendo: $mfile..." -NoNewline
            $r = Invoke-RestMethod -Method Post -Uri "$uploadBase`?name=$mfile" -Headers $jsonHeaders -InFile $mpath
            Write-Host " OK" -ForegroundColor Green
        } else {
            Write-Host "  [DryRun] Subiría: $mfile" -ForegroundColor DarkGray
        }
    }
}

# ── Resumen ────────────────────────────────────────────────────────────────────
Write-Host "`n════ Resumen ════" -ForegroundColor Cyan
Write-Host "  OK       : $ok"
Write-Host "  Saltados : $skipped (ya estaban en la release)"
Write-Host "  Faltantes: $missing (no encontrados en $SourceDir)"
Write-Host "  Errores  : $failed"

if ($failedList.Count -gt 0) {
    Write-Host "`nArchivos no subidos:" -ForegroundColor Yellow
    $failedList | ForEach-Object { Write-Host "  - $_" }
}

if ($ok -gt 0) {
    Write-Host "`nRelease: https://github.com/$RepoOwner/$RepoName/releases/tag/$ReleaseTag" -ForegroundColor Green
}
