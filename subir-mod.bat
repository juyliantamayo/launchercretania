@echo off
chcp 65001 >nul
setlocal

if "%~1"=="" goto :usage
if "%~2"=="" goto :usage

echo.
echo  Launcher Cretania - Subir mod
echo  --------------------------------
echo  Viejo : %~1
echo  Nuevo : %~2
if not "%~3"=="" echo  Nota  : %~3
echo.

powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0subir-mod.ps1" -OldJar "%~1" -NewJar "%~2" -PatchNote "%~3"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  ERROR: algo fallo. Revisa los mensajes de arriba.
    pause
    exit /b %ERRORLEVEL%
)

echo.
pause
exit /b 0

:usage
echo.
echo  Uso:
echo    subir-mod.bat "old-mod.jar" "new-mod.jar" ["Descripcion opcional"]
echo.
echo  Ejemplos:
echo    subir-mod.bat "no-more-villagers-1.3.5.jar" "no-more-villagers-1.3.6.jar"
echo    subir-mod.bat "serverpad-1.0.2.jar" "serverpad-1.0.3.jar" "ServerPad: fix de comandos"
echo    subir-mod.bat "createnewrecipes-1.0.1+1.20.1.jar" "createnewrecipes-1.0.2+1.20.1.jar"
echo.
echo  IMPORTANTE: Copia primero el .jar nuevo a my-modpack/mods/ antes de ejecutar.
echo.
pause
exit /b 1
