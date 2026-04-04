<#
.SYNOPSIS
    Sube creatnia_tfc4-1.0.0.jar al launcher cada vez que lo compilas.
    - Reemplaza el asset en la release de GitHub
    - Actualiza SHA1 + size en manifest.json
    - Regenera manifest.enc y hace push
#>

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# ── Config ──────────────────────────────────────────────────────────────────────
$JarSrc       = "D:\modsfortrerrafirma\HardRockTFC-Forge\build\libs\creatnia_tfc4-1.0.0.jar"
$JarName      = "creatnia_tfc4-1.0.0.jar"
$ModFile      = "mods/$JarName"          # como aparece en manifest.json
$ModId        = "creatnia-tfc4-1-0-0"   # id en manifest.json
$ReleaseId    = "303984033"              # cretaniaTF4-v1.0.0
$ReleaseTag   = "cretaniaTF4-v1.0.0"
$RepoOwner    = "juyliantamayo"
$RepoName     = "launchercretania"
$ManifestPath = Join-Path $PSScriptRoot "my-modpack\manifest.json"
$ModsDir      = Join-Path $PSScriptRoot "my-modpack\mods"

# ── Token ───────────────────────────────────────────────────────────────────────
$token = & "C:\Program Files\GitHub CLI\gh.exe" auth token 2>$null
if (-not $token) {
    Write-Host ""
    Write-Host "  ERROR: No se encontro el token de GitHub." -ForegroundColor Red
    Write-Host "  Ejecuta: gh auth login" -ForegroundColor Cyan
    exit 1
}
$ghHeaders  = @{ Authorization = "token $token"; Accept = "application/vnd.github+json" }
$jarHeaders = @{ Authorization = "token $token"; "Content-Type" = "application/java-archive" }

# ── 1. Verificar JAR ────────────────────────────────────────────────────────────
if (-not (Test-Path $JarSrc)) {
    Write-Error "No se encontró el JAR en: $JarSrc`nCompila el proyecto primero."
    exit 1
}
Write-Host "[1/5] JAR encontrado: $JarSrc" -ForegroundColor Green

# ── 2. SHA1 + tamaño ────────────────────────────────────────────────────────────
Write-Host "[2/5] Calculando SHA1..." -ForegroundColor Cyan
$sha1 = (Get-FileHash $JarSrc -Algorithm SHA1).Hash.ToLower()
$size = (Get-Item $JarSrc).Length
Write-Host "      SHA1 : $sha1"
Write-Host "      Size : $size bytes"

# ── 3. Reemplazar asset en la release ───────────────────────────────────────────
Write-Host "`n[3/5] Actualizando asset en GitHub release..." -ForegroundColor Cyan

# Obtener assets actuales de la release
$assets = Invoke-RestMethod -Uri "https://api.github.com/repos/$RepoOwner/$RepoName/releases/$ReleaseId/assets" `
    -Headers $ghHeaders -Method Get

# Borrar asset viejo si existe
$old = $assets | Where-Object { $_.name -eq $JarName }
if ($old) {
    Write-Host "      Borrando asset viejo (id=$($old.id))..."
    Invoke-RestMethod -Uri "https://api.github.com/repos/$RepoOwner/$RepoName/releases/assets/$($old.id)" `
        -Headers $ghHeaders -Method Delete | Out-Null
}

# Subir nuevo asset
Write-Host "      Subiendo $JarName..."
$uploadUrl = "https://uploads.github.com/repos/$RepoOwner/$RepoName/releases/$ReleaseId/assets?name=$JarName"
$jarBytes  = [System.IO.File]::ReadAllBytes($JarSrc)
Invoke-RestMethod -Uri $uploadUrl -Headers $jarHeaders -Method Post -Body $jarBytes | Out-Null
Write-Host "      Subido OK" -ForegroundColor Green

# ── 4. Actualizar manifest.json ─────────────────────────────────────────────────
Write-Host "`n[4/5] Actualizando manifest.json..." -ForegroundColor Cyan
$manifest  = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$tf4       = $manifest.modpacks | Where-Object { $_.id -eq "cretaniaTF4" }
$modEntry  = $tf4.mods | Where-Object { $_.file -eq $ModFile }
$modUrl    = "https://github.com/$RepoOwner/$RepoName/releases/download/$ReleaseTag/$JarName"

if ($modEntry) {
    # Actualizar entrada existente
    $modEntry.sha1 = $sha1
    $modEntry.size = $size
    $modEntry.url  = $modUrl
    Write-Host "      Entrada actualizada en manifest (id=$($modEntry.id))"
} else {
    # Agregar nueva entrada
    $newMod = [PSCustomObject]@{
        id   = $ModId
        file = $ModFile
        sha1 = $sha1
        size = $size
        url  = $modUrl
    }
    $tf4.mods += $newMod
    Write-Host "      Nueva entrada agregada: $ModId" -ForegroundColor Yellow
}

# Guardar manifest.json (UTF-8 sin BOM para que Node lo pueda leer)
$json = $manifest | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($ManifestPath, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "      manifest.json guardado"

# Copiar JAR a my-modpack/mods/ para referencia local
Copy-Item $JarSrc -Destination (Join-Path $ModsDir $JarName) -Force

# ── 5. Regenerar enc + push ─────────────────────────────────────────────────────
Write-Host "`n[5/5] Regenerando manifest.enc y subiendo a git..." -ForegroundColor Cyan
node my-modpack/generate-manifest.js --enc-only
git add my-modpack/manifest.json my-modpack/manifest.enc
git commit -m "chore: update creatnia_tfc4 build (sha1: $($sha1.Substring(0,8)))"
git push

Write-Host "`n✅ Listo! $JarName subido al launcher." -ForegroundColor Green
