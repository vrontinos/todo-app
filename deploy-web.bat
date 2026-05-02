@echo off
cd /d %~dp0

echo ==========================
echo Deploying web version...
echo ==========================

git add .
git commit -m "web update"
git push

echo.
echo ==========================
echo DONE - Web updated
echo ==========================
pause