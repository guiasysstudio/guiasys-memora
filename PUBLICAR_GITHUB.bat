@echo off
setlocal
cd /d "%~dp0"
where git >nul 2>nul || (
  echo Git nao encontrado no PATH.
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>nul || (
  echo Esta pasta ainda nao foi inicializada/publicada pelo GitHub Desktop.
  echo Faca a primeira publicacao pelo GitHub Desktop e depois use este arquivo.
  pause
  exit /b 1
)

set "MSG="
set /p MSG=Mensagem do commit: 
if "%MSG%"=="" set "MSG=Atualiza GuiaSys Memora"

git add --all
git diff --cached --quiet && (
  echo Nenhuma alteracao para publicar.
  pause
  exit /b 0
)

git commit -m "%MSG%" || goto :erro
git push || goto :erro

echo.
echo Publicacao concluida com sucesso.
pause
exit /b 0

:erro
echo.
echo O Git retornou um erro. Leia a mensagem acima.
pause
exit /b 1
