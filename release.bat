@echo off
cd /d %~dp0

echo ==========================
echo Running release script...
echo ==========================

npm run release:patch

echo.
echo ==========================
echo DONE
echo ==========================
pause