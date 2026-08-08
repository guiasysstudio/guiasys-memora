@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias de teste local...
  call npm install
)
start "" http://localhost:5500
call npm run dev
