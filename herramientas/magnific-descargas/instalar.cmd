@echo off
rem Instala la herramienta de descargas de Magnific como skill de Claude Code en esta computadora.
rem Copia esta carpeta a %USERPROFILE%\.claude\skills\magnific-descargas (sin borrar nada mas).
setlocal
set "DESTINO=%USERPROFILE%\.claude\skills\magnific-descargas"
echo Instalando en "%DESTINO%"...
robocopy "%~dp0." "%DESTINO%" /E /XF instalar.cmd /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (echo No pude copiar los archivos. & pause & exit /b 1)
echo.
where node >nul 2>nul || echo OJO: falta Node.js 22.13 o mas nuevo ^(nodejs.org^).
if not exist "%ProgramFiles%\Mozilla Firefox\firefox.exe" echo OJO: falta Firefox ^(mozilla.org^).
echo.
echo Listo. En Claude Code pide, por ejemplo: "baja estas fotos de Magnific" y pega los enlaces.
pause
