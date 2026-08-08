@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title GuiaSys Memora Web - Publicar GitHub
where git >nul 2>nul || (echo Git nao encontrado no PATH.& pause & exit /b 1)
git rev-parse --is-inside-work-tree >nul 2>nul || (echo Repositorio WEB ainda nao vinculado. Execute VINCULAR_GITHUB.bat na pasta principal.& pause & exit /b 1)

set "MSG="
set /p MSG=Mensagem do commit: 
if "%MSG%"=="" set "MSG=Atualiza GuiaSys Memora"

git add --all || goto :erro
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "%MSG%" || goto :erro
) else (
  echo Nenhuma alteracao local nova para commit.
)

git pull --rebase origin main || goto :erro
git push origin main || goto :erro

echo.
echo Publicacao WEB concluida com sucesso.
pause
exit /b 0

:erro
echo.
echo O Git retornou um erro. Nenhum force push foi executado.
pause
exit /b 1
