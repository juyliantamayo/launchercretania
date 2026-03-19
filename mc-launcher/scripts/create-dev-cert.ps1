# =============================================================
#  create-dev-cert.ps1
#  Genera un certificado autofirmado de Code Signing (desarrollo)
#  NOTA: Solo sirve para pruebas locales. SmartScreen NO lo
#        acepta como confiable en otros equipos.
#        Para distribuir sin avisos necesitas un certificado OV/EV
#        comprado a DigiCert, Sectigo, GlobalSign, etc.
# =============================================================

$certSubject  = "CN=Lucerion Launcher, O=Lucerion, C=ES"
$pfxPath      = Join-Path $PSScriptRoot "..\lucerion-dev.pfx"
$pfxPassword  = "lucerion2026"

Write-Host "Creando certificado autofirmado..." -ForegroundColor Cyan

$cert = New-SelfSignedCertificate `
    -Subject $certSubject `
    -Type CodeSigningCert `
    -KeyUsage DigitalSignature `
    -FriendlyName "Lucerion Launcher Dev" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -HashAlgorithm SHA256 `
    -NotAfter (Get-Date).AddYears(3)

$securePass = ConvertTo-SecureString -String $pfxPassword -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePass | Out-Null

Write-Host ""
Write-Host "Certificado creado:" -ForegroundColor Green
Write-Host "  Archivo : $pfxPath"
Write-Host "  Password: $pfxPassword"
Write-Host ""
Write-Host "Para que Windows confie en el cert en este equipo (opcional):" -ForegroundColor Yellow
Write-Host "  Import-Certificate -FilePath '$pfxPath' -CertStoreLocation 'Cert:\LocalMachine\TrustedPublisher'"
Write-Host ""
Write-Host "Para compilar con firma:" -ForegroundColor Cyan
Write-Host '  $env:CSC_LINK         = "scripts\lucerion-dev.pfx"'
Write-Host "  `$env:CSC_KEY_PASSWORD = `"$pfxPassword`""
Write-Host "  npm run build:signed"
