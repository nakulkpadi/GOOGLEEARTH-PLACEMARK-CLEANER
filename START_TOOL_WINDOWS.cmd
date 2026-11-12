@echo off
setlocal
TITLE WEBNIX STUDIO - Google Earth Placemark Cleaner
color 0F
cls
echo.
echo  =====================================================
echo       APP CREATED BY WEBNIX STUDIO
echo       GOOGLE EARTH PLACEMARK CLEANER
echo       NO PYTHON REQUIRED - LOCAL PROCESSING
echo  =====================================================
echo.
start "" "%~dp0index.html"
if errorlevel 1 (
  echo Could not launch your browser automatically.
  echo Open the file index.html in Edge or Chrome.
  pause
)
endlocal
