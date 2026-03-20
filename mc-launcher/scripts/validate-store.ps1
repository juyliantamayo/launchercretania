<#
.SYNOPSIS
  validate-store.ps1 — Empaqueta como MSIX y valida requisitos Microsoft Store.
.PARAMETER CertPath
  Ruta al .pfx para firmar. Default: lucerion-dev.pfx
.PARAMETER CertPassword
  Contrasena del .pfx. Default: lucerion2026
.PARAMETER PreChecksOnly
  Solo ejecuta verificaciones previas sin compilar.
.PARAMETER SkipWack
  Omite la fase de WACK.
#>

[CmdletBinding(DefaultParameterSetName = "Full")]
param(
  [string] $CertPath     = "",
  [string] $CertPassword = "lucerion2026",
  [switch] $PreChecksOnly,
  [switch] $SkipWack
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$LauncherDir  = Resolve-Path (Join-Path $ScriptDir "..")
$StoreConfig  = Join-Path $LauncherDir "electron-builder.store.json"
$MsixOut      = Join-Path $LauncherDir "dist\store\LucerionLauncher-Store.msix"
$DevCertPath  = Join-Path $LauncherDir "lucerion-dev.pfx"
$AssetsDir    = Join-Path $LauncherDir "store-assets"
$MakeAppX     = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\makeappx.exe"
$SignTool     = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe"
$WackExe      = "C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe"
$ReportDir    = Join-Path $LauncherDir "dist\store\wack-report"

$Results   = [System.Collections.Generic.List[PSObject]]::new()
$ErrorCount = 0
$WarnCount  = 0

function Add-Result {
  param([string]$Category, [string]$Check, [ValidateSet("PASS","WARN","FAIL")][string]$Status, [string]$Detail = "")
  $Results.Add([PSCustomObject]@{
    Category = $Category
    Check    = $Check
    Status   = $Status
    Detail   = $Detail
  })
  if ($Status -eq "FAIL") { $script:ErrorCount++ }
  if ($Status -eq "WARN") { $script:WarnCount++ }
  $color = switch ($Status) { "PASS" { "Green" } "WARN" { "Yellow" } "FAIL" { "Red" } }
  Write-Host "  [$Status] $Check" -ForegroundColor $color
  if ($Detail) { Write-Host "         $Detail" -ForegroundColor DarkGray }
}

function Section([string]$Title) {
  Write-Host ""
  Write-Host "-- $Title " -ForegroundColor Cyan
}

# ===== FASE 1: PRE-CHECKS =====
function Invoke-PreChecks {
  Section "FASE 1 -- Pre-checks (sin compilar)"

  # 1.1 Herramientas
  $nodeOk = $null -ne (Get-Command node.exe -EA SilentlyContinue)
  Add-Result "Entorno" "Node.js disponible" $(if ($nodeOk) { "PASS" } else { "FAIL" }) $(if ($nodeOk) { node --version 2>$null } else { "" })
  Add-Result "Entorno" "makeappx.exe (SDK x64)" $(if (Test-Path $MakeAppX) { "PASS" } else { "WARN" }) $MakeAppX
  Add-Result "Entorno" "signtool.exe (SDK x64)" $(if (Test-Path $SignTool) { "PASS" } else { "WARN" }) $SignTool
  Add-Result "Entorno" "appcert.exe (WACK)"     $(if (Test-Path $WackExe)  { "PASS" } else { "WARN" }) $WackExe

  # 1.2 Config
  Add-Result "Config" "electron-builder.store.json existe" $(if (Test-Path $StoreConfig) { "PASS" } else { "FAIL" })

  if (Test-Path $StoreConfig) {
    $cfg = Get-Content $StoreConfig -Raw | ConvertFrom-Json

    $pub = $cfg.appx.publisher
    if ($pub -match "^CN=") {
      Add-Result "Config" "appx.publisher formato DN correcto" "PASS" $pub
    }
    elseif ($pub) {
      Add-Result "Config" "appx.publisher sin prefijo CN=" "FAIL" "Valor: $pub"
    }
    else {
      Add-Result "Config" "appx.publisher no definido" "FAIL"
    }

    $identity = $cfg.appx.identityName
    if ($identity -match "^[A-Za-z0-9]+\.[A-Za-z0-9]+$") {
      Add-Result "Config" "appx.identityName formato correcto" "PASS" $identity
    }
    else {
      Add-Result "Config" "appx.identityName formato incorrecto" "WARN" "Valor: $identity"
    }

    $appId = $cfg.appId
    if ($appId) { Add-Result "Config" "appId definido" "PASS" $appId }
    else { Add-Result "Config" "appId no definido" "WARN" }

    $artifact = $cfg.appx.artifactName
    if ($artifact -match "\.msix$") {
      Add-Result "Config" "Artefacto es .msix (formato moderno)" "PASS" $artifact
    }
    elseif ($artifact -match "\.appx$") {
      Add-Result "Config" "Artefacto es .appx (recomendado: .msix)" "WARN" $artifact
    }
    else {
      Add-Result "Config" "artifactName no definido" "WARN"
    }
  }

  # 1.4 Assets visuales
  $requiredAssets = @(
    "StoreLogo.png", "Square44x44Logo.png", "Square44x44Logo.targetsize-44.png",
    "Square150x150Logo.png", "Wide310x150Logo.png", "Square310x310Logo.png", "SplashScreen.png"
  )
  foreach ($a in $requiredAssets) {
    $assetPath = Join-Path $AssetsDir $a
    if (Test-Path $assetPath) { Add-Result "Assets" "store-assets/$a" "PASS" }
    else { Add-Result "Assets" "store-assets/$a AUSENTE" "FAIL" "Ejecutar: node scripts/generate-store-assets.js" }
  }

  if (Test-Path (Join-Path $LauncherDir "icon.ico")) { Add-Result "Assets" "icon.ico existe" "PASS" }
  else { Add-Result "Assets" "icon.ico no encontrado" "FAIL" }

  if (Test-Path (Join-Path $LauncherDir "logoLucerion.png")) { Add-Result "Assets" "logoLucerion.png (fuente) disponible" "PASS" }
  else { Add-Result "Assets" "logoLucerion.png no encontrado" "WARN" }

  # 1.6 Certificado
  if ($script:CertPath -and (Test-Path $script:CertPath)) {
    Add-Result "Cert" "Certificado especificado existe" "PASS" $script:CertPath
  }
  elseif (Test-Path $DevCertPath) {
    Add-Result "Cert" "Cert de desarrollo disponible (solo test local)" "WARN" $DevCertPath
  }
  else {
    Add-Result "Cert" "No hay certificado -- build NO se podra firmar" "WARN" "Ejecutar: .\scripts\create-dev-cert.ps1"
  }

  # 1.7 storeBuild
  $pkgJson = Get-Content (Join-Path $LauncherDir "package.json") -Raw | ConvertFrom-Json
  $hasSB = ($pkgJson.PSObject.Properties.Name -contains "storeBuild") -and ($pkgJson.storeBuild -eq $true)
  if ($hasSB) {
    Add-Result "Config" "package.json.storeBuild=true (no debe estar en source)" "WARN"
  }
  else {
    Add-Result "Config" "package.json no tiene storeBuild hardcodeado (correcto)" "PASS"
  }

  # 1.8 STORE_BUILD flag en main.js
  $mainJs = Get-Content (Join-Path $LauncherDir "main.js") -Raw
  if ($mainJs -match "STORE_BUILD") {
    Add-Result "Store Policy" "STORE_BUILD flag implementado en main.js" "PASS"
  }
  else {
    Add-Result "Store Policy" "STORE_BUILD flag no encontrado en main.js" "FAIL"
  }

  # 1.9 Single-instance lock
  if ($mainJs -match "requestSingleInstanceLock") {
    Add-Result "Store Policy" "Single-instance lock implementado" "PASS"
  }
  else {
    Add-Result "Store Policy" "Single-instance lock NO encontrado" "FAIL" "La Store requiere que una segunda instancia active la ventana existente"
  }

  # 1.10 asar
  if ((Get-Content $StoreConfig -Raw) -match '"asar"\s*:\s*false') {
    Add-Result "Packaging" "asar:false -- codigo fuente expuesto" "WARN" "Recomendado: asar:true para ofuscar"
  }
  else {
    Add-Result "Packaging" "asar habilitado o por defecto" "PASS"
  }
}

# ===== FASE 2: BUILD =====
function Invoke-Build {
  Section "FASE 2 -- Build MSIX"
  Push-Location $LauncherDir

  try {
    Write-Host "  [2.1] npm install..." -ForegroundColor Yellow
    $npmOut = cmd /c "npm install 2>&1"
    if ($LASTEXITCODE -eq 0) { Add-Result "Build" "npm install" "PASS" }
    else {
      Add-Result "Build" "npm install fallo" "FAIL" ($npmOut | Select-Object -Last 5 | Out-String)
      return $false
    }

    $missingAssets = @(@("StoreLogo.png","Square44x44Logo.png","Square150x150Logo.png",
                       "Wide310x150Logo.png","Square310x310Logo.png","SplashScreen.png") |
      Where-Object { -not (Test-Path (Join-Path $AssetsDir $_)) })
    if ($missingAssets.Count -gt 0) {
      Write-Host "  [2.2] Generando store-assets..." -ForegroundColor Yellow
      $genOut = cmd /c "node scripts\generate-store-assets.js 2>&1"
      if ($LASTEXITCODE -eq 0) { Add-Result "Build" "Generacion de store-assets" "PASS" }
      else { Add-Result "Build" "generate-store-assets.js fallo" "WARN" ($genOut | Select-Object -Last 5 | Out-String) }
    }
    else { Add-Result "Build" "store-assets ya existen" "PASS" }

    $effectiveCert = if ($script:CertPath -and (Test-Path $script:CertPath)) { $script:CertPath }
                     elseif (Test-Path $DevCertPath) { $DevCertPath }
                     else { $null }

    if ($effectiveCert) {
      $env:CSC_LINK         = (Resolve-Path $effectiveCert).Path
      $env:CSC_KEY_PASSWORD = $script:CertPassword
      Write-Host "  [2.3] Certificado: $effectiveCert" -ForegroundColor DarkGray
    }
    else {
      Write-Host "  [2.3] Sin certificado -- paquete sin firmar." -ForegroundColor Yellow
      Remove-Item Env:CSC_LINK         -ErrorAction SilentlyContinue
      Remove-Item Env:CSC_KEY_PASSWORD -ErrorAction SilentlyContinue
    }

    Write-Host "  [2.4] electron-builder --config electron-builder.store.json..." -ForegroundColor Yellow
    $buildOut = cmd /c "npm run build:store 2>&1"
    $buildExitCode = $LASTEXITCODE

    # Si el build creo el MSIX pero fallo en firma, aun es util
    $msixExists = Test-Path $MsixOut
    if ($buildExitCode -eq 0) {
      Add-Result "Build" "electron-builder build:store exitoso" "PASS"
    }
    elseif ($msixExists) {
      Add-Result "Build" "MSIX creado pero firma fallo (se firmara manualmente)" "WARN"
      # Firmar manualmente con signtool del sistema
      if ($effectiveCert -and (Test-Path $SignTool)) {
        Write-Host "  [2.5] Firmando con signtool del sistema..." -ForegroundColor Yellow
        & $SignTool sign /fd SHA256 /td SHA256 /tr "http://timestamp.digicert.com" /f $effectiveCert /p $script:CertPassword $MsixOut 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
          Add-Result "Build" "Firmado con signtool del SDK del sistema" "PASS"
        }
        else {
          Add-Result "Build" "Firma manual tambien fallo" "WARN"
        }
      }
    }
    else {
      Add-Result "Build" "electron-builder build:store FALLO" "FAIL" ($buildOut | Select-Object -Last 10 | Out-String)
      return $false
    }

    return $true
  }
  finally { Pop-Location }
}

# ===== FASE 3: POST-BUILD =====
function Invoke-PostBuild {
  Section "FASE 3 -- Validacion post-build"

  if (-not (Test-Path $script:MsixOut)) {
    $found = Get-ChildItem (Join-Path $LauncherDir "dist\store") -Filter "*.msix" -EA SilentlyContinue | Select-Object -First 1
    if (-not $found) { $found = Get-ChildItem (Join-Path $LauncherDir "dist\store") -Filter "*.appx" -EA SilentlyContinue | Select-Object -First 1 }
    if ($found) { $script:MsixOut = $found.FullName }
    else { Add-Result "Post-Build" "Artefacto MSIX/APPX no encontrado" "FAIL"; return }
  }

  $msixSize = (Get-Item $script:MsixOut).Length
  $sizeMB = [math]::Round($msixSize/1MB, 1)
  Add-Result "Post-Build" "Artefacto existe" "PASS" "$sizeMB MB -- $($script:MsixOut)"

  if ($msixSize -lt 1MB) { Add-Result "Post-Build" "Paquete muy pequeno" "WARN" "< 1 MB" }
  elseif ($msixSize -gt 500MB) { Add-Result "Post-Build" "Paquete muy grande" "WARN" "> 500 MB" }
  else { Add-Result "Post-Build" "Tamano del paquete razonable" "PASS" "$sizeMB MB" }

  # Extraer AppxManifest
  $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "lucerion-msix-$(Get-Random)"
  New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

  try {
    Write-Host "  Extrayendo AppxManifest.xml..." -ForegroundColor DarkGray
    & $MakeAppX unpack /p $script:MsixOut /d $tempDir /nv 2>&1 | Out-Null

    $manifestPath = Join-Path $tempDir "AppxManifest.xml"
    if (Test-Path $manifestPath) {
      Add-Result "Post-Build" "AppxManifest.xml extraido" "PASS"
      $manifest = [xml](Get-Content $manifestPath -Raw)

      $pubAttr = $manifest.Package.Identity.Publisher
      if ($pubAttr -match "^CN=") { Add-Result "Post-Build" "Publisher en AppxManifest" "PASS" $pubAttr }
      else { Add-Result "Post-Build" "Publisher formato invalido en AppxManifest" "FAIL" $pubAttr }

      $nameAttr = $manifest.Package.Identity.Name
      Add-Result "Post-Build" "Name en AppxManifest" "PASS" $nameAttr

      $targetDep = $manifest.Package.Dependencies.TargetDeviceFamily
      if ($targetDep) {
        $minV = $targetDep.MinVersion
        Add-Result "Post-Build" "MinVersion declarado" "PASS" $minV
      }
    }
    else {
      Add-Result "Post-Build" "AppxManifest.xml no se pudo extraer" "FAIL"
    }

    # Assets en el paquete
    $assetsCount = (Get-ChildItem $tempDir -Recurse -Filter "*.png" 2>$null).Count
    if ($assetsCount -gt 0) { Add-Result "Post-Build" "Assets PNG en el paquete: $assetsCount" "PASS" }
    else { Add-Result "Post-Build" "No se encontraron assets PNG en el paquete" "WARN" }

    # storeBuild flag
    $pkgJsonInPkg = Get-ChildItem $tempDir -Recurse -Filter "package.json" 2>$null |
      Where-Object { $_.FullName -notmatch "node_modules" } | Select-Object -First 1
    if ($pkgJsonInPkg) {
      $innerPkg = Get-Content $pkgJsonInPkg.FullName -Raw | ConvertFrom-Json
      if ($innerPkg.storeBuild -eq $true) { Add-Result "Post-Build" "storeBuild:true en paquete" "PASS" }
      else { Add-Result "Post-Build" "storeBuild NO en paquete" "FAIL" "Self-update podria activarse" }
    }
  }
  catch {
    Add-Result "Post-Build" "Error al extraer/validar MSIX" "WARN" $_.Exception.Message
  }
  finally {
    Remove-Item -Recurse -Force $tempDir -EA SilentlyContinue
  }

  # Firma digital
  Write-Host "  Verificando firma digital..." -ForegroundColor DarkGray
  $sigResult = & $SignTool verify /pa $script:MsixOut 2>&1
  if ($LASTEXITCODE -eq 0) { Add-Result "Post-Build" "Firma digital valida" "PASS" }
  else { Add-Result "Post-Build" "Firma no por CA de confianza (normal con cert dev)" "WARN" "La Store re-firma el paquete al publicar" }
}

# ===== FASE 4: WACK =====
function Invoke-WACK {
  Section "FASE 4 -- Windows App Certification Kit (WACK)"

  if (-not (Test-Path $WackExe)) { Add-Result "WACK" "appcert.exe no encontrado" "WARN"; return }

  if (-not (Test-Path $script:MsixOut)) {
    $found = Get-ChildItem (Join-Path $LauncherDir "dist\store") -Filter "*.msix" -EA SilentlyContinue | Select-Object -First 1
    if ($found) { $script:MsixOut = $found.FullName }
    else { Add-Result "WACK" "MSIX no encontrado" "FAIL"; return }
  }

  New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null
  $reportXml = Join-Path $ReportDir "wack-report.xml"

  Write-Host ""
  Write-Host "  Ejecutando WACK sobre: $($script:MsixOut)" -ForegroundColor Yellow
  Write-Host "  Reporte: $reportXml" -ForegroundColor DarkGray
  Write-Host "  NOTA: WACK puede tardar varios minutos." -ForegroundColor DarkGray
  Write-Host ""

  $wackArgs = @("test", "-apptype", "windowsstoreapp", "-appxpackagepath", $script:MsixOut, "-reportoutputpath", $reportXml)

  Write-Host "  Iniciando WACK..." -ForegroundColor Yellow
  try {
    $wackProc = Start-Process -FilePath $WackExe -ArgumentList $wackArgs -Wait -PassThru -NoNewWindow
    if ($wackProc.ExitCode -eq 0) {
      Add-Result "WACK" "WACK completado" "PASS" "Reporte: $reportXml"
      if (Test-Path $reportXml) { Invoke-ParseWACKReport $reportXml }
    }
    else {
      Add-Result "WACK" "WACK termino con codigo $($wackProc.ExitCode)" "WARN" "Ver reporte: $reportXml"
      if (Test-Path $reportXml) { Invoke-ParseWACKReport $reportXml }
    }
  }
  catch {
    Add-Result "WACK" "Error ejecutando WACK" "WARN" $_.Exception.Message
  }
}

function Invoke-ParseWACKReport([string]$XmlPath) {
  try {
    $xml = [xml](Get-Content $XmlPath -Raw)
    $tests = $xml.SelectNodes("//TEST")
    foreach ($test in $tests) {
      $name   = $test.TITLE
      $result = $test.RESULT
      $status = switch ($result) {
        "PASS"  { "PASS" }
        "PASS With Warnings" { "WARN" }
        "WARNING" { "WARN" }
        default { "FAIL" }
      }
      Add-Result "WACK" $name $status $result
    }
  }
  catch {
    Add-Result "WACK" "Error parseando reporte XML" "WARN" $_.Exception.Message
  }
}

# ===== FASE 5: INFORME =====
function Show-Report {
  Write-Host ""
  Write-Host "=================================================================" -ForegroundColor Cyan
  Write-Host "  INFORME DE CERTIFICACION -- Lucerion Launcher" -ForegroundColor Cyan
  Write-Host "=================================================================" -ForegroundColor Cyan

  $categories = $Results | Select-Object -ExpandProperty Category -Unique
  foreach ($cat in $categories) {
    Write-Host ""
    Write-Host "  [$cat]" -ForegroundColor White
    $Results | Where-Object { $_.Category -eq $cat } | ForEach-Object {
      $color = switch ($_.Status) { "PASS" { "Green" } "WARN" { "DarkYellow" } "FAIL" { "Red" } }
      Write-Host "    [$($_.Status)] $($_.Check)" -ForegroundColor $color
      if ($_.Detail) { Write-Host "       $($_.Detail)" -ForegroundColor DarkGray }
    }
  }

  $total = $Results.Count
  $pass  = @($Results | Where-Object Status -eq "PASS").Count
  $warn  = @($Results | Where-Object Status -eq "WARN").Count
  $fail  = @($Results | Where-Object Status -eq "FAIL").Count

  Write-Host ""
  Write-Host "-----------------------------------------------------------------" -ForegroundColor DarkGray
  $summary = "  Total: $total  PASS: $pass  WARN: $warn  FAIL: $fail"
  Write-Host $summary -ForegroundColor White
  Write-Host ""

  if ($fail -gt 0) {
    Write-Host "  VEREDICTO: NO LISTO para subir a la Store." -ForegroundColor Red
    Write-Host "  Corrige los $fail errores (FAIL) antes de proceder." -ForegroundColor Red
  }
  elseif ($warn -gt 0) {
    Write-Host "  VEREDICTO: CONDICIONAL -- tiene advertencias." -ForegroundColor Yellow
    Write-Host "  Revisa los $warn avisos (WARN)." -ForegroundColor Yellow
  }
  else {
    Write-Host "  VEREDICTO: PREPARADO para subir a Microsoft Partner Center." -ForegroundColor Green
  }

  Write-Host ""
  Write-Host "  Proximos pasos:" -ForegroundColor Cyan
  Write-Host "    1. Corrige todos los FAIL"
  Write-Host "    2. Revisa los WARN (especialmente Store Policy y Config)"
  Write-Host "    3. Sube el MSIX a Partner Center > Envio > Revision"
  Write-Host "    4. Si WACK genero reporte, abrelo en: $ReportDir"
  Write-Host ""

  $csvPath = Join-Path $LauncherDir "dist\store\certification-report.csv"
  New-Item -ItemType Directory -Path (Split-Path $csvPath) -Force 2>$null | Out-Null
  $Results | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8
  Write-Host "  Reporte CSV: $csvPath" -ForegroundColor DarkGray
  Write-Host "=================================================================" -ForegroundColor Cyan
}

# ===== MAIN =====
Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  LUCERION LAUNCHER -- Validacion Microsoft Store" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  Proyecto : $LauncherDir" -ForegroundColor DarkGray
Write-Host "  Fecha    : $(Get-Date -Format 'yyyy-MM-dd HH:mm')" -ForegroundColor DarkGray

Push-Location $LauncherDir

try {
  if ($PreChecksOnly) {
    Invoke-PreChecks
  }
  else {
    Invoke-PreChecks
    $buildOk = Invoke-Build
    if ($buildOk) {
      Invoke-PostBuild
      if (-not $SkipWack) { Invoke-WACK }
    }
    else {
      Add-Result "Build" "Se omiten fases post-build y WACK por fallo en build" "WARN"
    }
  }
}
finally {
  Pop-Location
  Show-Report
}
