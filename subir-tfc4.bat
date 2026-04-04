@echo off
chcp 65001 >nul
echo.
echo  Subiendo creatnia_tfc4 al launcher...
echo.
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0subir-tfc4.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  ERROR. Revisa los mensajes de arriba.
    pause
    exit /b %ERRORLEVEL%
)
pause
