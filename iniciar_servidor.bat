@echo off
title PelisMaster TV Server
echo ====================================================
echo   Iniciando Servidor PelisMaster TV...
echo   No cierres esta ventana mientras uses la TV.
echo ====================================================
cd /d "%~dp0"
node server/src/index.js
pause
