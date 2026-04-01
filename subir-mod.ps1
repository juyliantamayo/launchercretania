<#
.SYNOPSIS
    Actualiza un mod del modpack: manifest.json + git push + assets de la release de GitHub.

.PARAMETER OldJar
    Nombre del .jar antiguo (solo el nombre, sin ruta). Ej: "mod-1.0.0.jar"

.PARAMETER NewJar
    Nombre del .jar nuevo (solo el nombre, sin ruta). Ej: "mod-1.0.1.jar"

.PARAMETER PatchNote
    Texto para la nota de parche (opcional). Si se omite, se genera automáticamente.

.EXAMPLE
    .\subir-mod.ps1 -OldJar "no-more-villagers-1.3.5.jar" -NewJar "no-more-villagers-1.3.6.jar"
    .\subir-mod.ps1 -OldJar "serverpad-1.0.2.jar" -NewJar "serverpad-1.0.3.jar" -PatchNote "ServerPad: fix de comandos"
#>
param(
    [Parameter(Mandatory=$true)]  [string]$OldJar,
    [Parameter(Mandatory=$true)]  [string]$NewJar,
    [string]$PatchNote = ""
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# ── Rutas ──────────────────────────────────────────────────────────────────────
$ModpackDir   = Join-Path $PSScriptRoot "my-modpack"
$ModsDir      = Join-Path $ModpackDir "mods"
$ManifestPath = Join-Path $ModpackDir "manifest.json"
$ManifestEncPath = Join-Path $ModpackDir "manifest.enc"

# ── GitHub config ──────────────────────────────────────────────────────────────
$RepoOwner = "juyliantamayo"
$RepoName  = "launchercretania"
$ReleaseId = "303984033"   # ID de la release cretaniaTF4-v1.0.0

# ── Token (desde git credential helper) ───────────────────────────────────────
$credLines  = "protocol=https`nhost=github.com`n" | git credential fill
$credData   = $credLines | ConvertFrom-StringData
$token      = $credData.password

if (-not $token) {
    Write-Error "No se encontró token de GitHub en git credential helper. Asegúrate de estar logueada en git."
    exit 1
}

$ghHeaders   = @{ Authorization = "token $token"; Accept = "application/vnd.github+json" }
$jarHeaders  = @{ Authorization = "token $token"; "Content-Type" = "application/java-archive" }
$jsonHeaders = @{ Authorization = "token $token"; "Content-Type" = "application/json" }

# ── 1. Verificar que el nuevo jar existe ───────────────────────────────────────
$newJarPath = Join-Path $ModsDir $NewJar
if (-not (Test-Path $newJarPath)) {
    Write-Error "Archivo no encontrado: $newJarPath`nAsegurate de que el .jar esté en my-modpack/mods/ antes de ejecutar el script."
    exit 1
}

# ── 2. SHA1 y tamaño ───────────────────────────────────────────────────────────
Write-Host "[1/5] Calculando SHA1 de $NewJar..." -ForegroundColor Cyan
$sha1 = (Get-FileHash $newJarPath -Algorithm SHA1).Hash.ToLower()
$size = (Get-Item $newJarPath).Length
Write-Host "      SHA1 : $sha1"
Write-Host "      Size : $size bytes"

# ── 3. Actualizar manifest.json ────────────────────────────────────────────────
Write-Host "`n[2/5] Actualizando manifest.json..." -ForegroundColor Cyan
$manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json

$targetModpack = if ($manifest.formatVersion -eq 2 -and $manifest.modpacks.Count -gt 0) { $manifest.modpacks[0] } else { $manifest }

# Buscar la entrada del mod viejo en el array de mods
$modEntry = $targetModpack.mods | Where-Object { $_.file -eq "mods/$OldJar" }
if (-not $modEntry) {
    Write-Error "No se encontró la entrada para 'mods/$OldJar' en manifest.json.`nVerifica que el nombre del archivo viejo sea exactamente correcto."
    exit 1
}

# Nuevo ID: nombre sin .jar, caracteres especiales -> guion
$newId = ($NewJar -replace '\.jar$', '' -replace '[+.]', '-').ToLower()

# Actualizar entrada del mod (in-place, porque PSObject es por referencia)
$modEntry.id   = $newId
$modEntry.file = "mods/$NewJar"
$modEntry.sha1 = $sha1
$modEntry.size = [long]$size

# Incrementar la última cifra de la versión del modpack
$verParts      = $targetModpack.version -split '\.'
$oldVersion    = $targetModpack.version
$verParts[-1]  = ([int]$verParts[-1] + 1).ToString()
$newVersion    = $verParts -join '.'
$targetModpack.version = $newVersion

# Generar texto de patch note si no se pasó uno
$months = "Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
$today  = "$(Get-Date -Format 'd') de $($months[(Get-Date).Month - 1]), $(Get-Date -Format 'yyyy')"

if (-not $PatchNote) {
    $modBase    = ($NewJar -replace '-[\d.+]+\.jar$', '' -replace '[_-]', ' ').Trim()
    $modVer     = if ($NewJar -match '-(\d[\d.]+)[+.]') { $Matches[1] } else { "" }
    $PatchNote  = "$modBase actualizado a v$modVer".Trim()
}

# Crear nueva entrada de patch notes
$newNote = [PSCustomObject]@{
    version    = $newVersion
    date       = $today
    categories = @(
        [PSCustomObject]@{
            type    = "changed"
            title   = "Mejoras"
            icon    = [string][char]0x2191
            entries = @( [PSCustomObject]@{ text = $PatchNote } )
        }
    )
}

# Insertar al inicio del array patchNotes
$targetModpack.patchNotes = @($newNote) + @($targetModpack.patchNotes)

# Guardar manifest con indentación
$manifest | ConvertTo-Json -Depth 20 | Set-Content $ManifestPath -Encoding UTF8

Write-Host "      Regenerando manifest cifrado..."
Push-Location $ModpackDir
node generate-manifest.js
Pop-Location

Write-Host "      Version : $oldVersion -> $newVersion"
Write-Host "      Nota    : $PatchNote"

# ── 4. Git commit + push ───────────────────────────────────────────────────────
Write-Host "`n[3/5] Git commit y push..." -ForegroundColor Cyan
Push-Location $ModpackDir
git add manifest.json "mods/$NewJar"
if ($OldJar -ne $NewJar) { git add "mods/$OldJar" }
$commitMsg = "chore: update $($OldJar -replace '\.jar$','') -> $($NewJar -replace '\.jar$',''), bump modpack to v$newVersion"
git commit -m $commitMsg
git push
Pop-Location
Write-Host "      OK: pusheado a main"

# ── 5. Actualizar assets en la release de GitHub ───────────────────────────────
Write-Host "`n[4/5] Actualizando assets en la release..." -ForegroundColor Cyan

# Obtener todos los assets (paginado hasta 5 páginas x 100)
$allAssets = @()
for ($p = 1; $p -le 5; $p++) {
    $page = Invoke-RestMethod -Uri "https://api.github.com/repos/$RepoOwner/$RepoName/releases/$ReleaseId/assets?per_page=100&page=$p" -Headers $ghHeaders
    if ($page.Count -eq 0) { break }
    $allAssets += $page
}

# Eliminar jar viejo y manifest viejo
$iconAssets = @()
if ($manifest.formatVersion -eq 2 -and $manifest.modpacks) {
    $iconAssets = $manifest.modpacks |
        ForEach-Object { $_.image } |
        Where-Object { $_ -and -not ($_ -match '^https?://') } |
        Select-Object -Unique
}

foreach ($assetName in @($OldJar, "manifest.json", "manifest.enc") + $iconAssets) {
    $asset = $allAssets | Where-Object { $_.name -eq $assetName }
    if ($asset) {
        Write-Host "      Eliminando : $($asset.name) (id=$($asset.id))"
        Invoke-RestMethod -Method Delete -Uri "https://api.github.com/repos/$RepoOwner/$RepoName/releases/assets/$($asset.id)" -Headers $ghHeaders | Out-Null
    }
}

# Subir nuevo jar (el + se encode como %2B para preservar el nombre correcto)
$uploadBase  = "https://uploads.github.com/repos/$RepoOwner/$RepoName/releases/$ReleaseId/assets"
$encodedName = [Uri]::EscapeDataString($NewJar)
Write-Host "      Subiendo   : $NewJar"
$r1 = Invoke-RestMethod -Method Post -Uri "$uploadBase`?name=$encodedName" -Headers $jarHeaders -InFile $newJarPath
Write-Host "      OK          : $($r1.name) ($($r1.size) bytes)"

# Subir nuevo manifest
Write-Host "      Subiendo   : manifest.json"
$r2 = Invoke-RestMethod -Method Post -Uri "$uploadBase`?name=manifest.json" -Headers $jsonHeaders -InFile $ManifestPath
Write-Host "      OK          : $($r2.name)"

Write-Host "      Subiendo   : manifest.enc"
$r3 = Invoke-RestMethod -Method Post -Uri "$uploadBase`?name=manifest.enc" -Headers $jsonHeaders -InFile $ManifestEncPath
Write-Host "      OK          : $($r3.name)"

foreach ($iconName in $iconAssets) {
    $iconPath = Join-Path $ModpackDir $iconName
    if (Test-Path $iconPath) {
        Write-Host "      Subiendo   : $iconName"
        $encodedIconName = [Uri]::EscapeDataString($iconName)
        $iconHeaders = @{ Authorization = "token $token"; "Content-Type" = "application/octet-stream" }
        $iconResp = Invoke-RestMethod -Method Post -Uri "$uploadBase`?name=$encodedIconName" -Headers $iconHeaders -InFile $iconPath
        Write-Host "      OK          : $($iconResp.name)"
    }
}

# ── Resumen final ──────────────────────────────────────────────────────────────
Write-Host "`n[5/5] Completado." -ForegroundColor Green
Write-Host "      Modpack v$newVersion desplegado correctamente." -ForegroundColor Green
Write-Host "      - Repo   : https://github.com/$RepoOwner/$RepoName"
Write-Host "      - Release: https://github.com/$RepoOwner/$RepoName/releases/tag/cretaniaTF4-v1.0.0"
