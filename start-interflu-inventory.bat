@echo off
title Interflu Inventory - Control de Inventario Fisico
color 0B
echo ======================================================================
echo           INTERFLU INVENTORY - CONTROL DE INVENTARIO FISICO
echo               Compatible con Aspel SAE - Version Piloto
echo ======================================================================
echo.
echo Iniciando sistema en http://localhost:8080/ ...
echo.
cd /d "%~dp0backend"
java -jar target\interflu-inventory-0.1.0-SNAPSHOT.jar
pause
