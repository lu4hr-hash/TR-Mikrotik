@echo off
title MikroTik REST API Dashboard
color 0b
echo ============================================================
echo   MIKROTIK REST API WEB DASHBOARD
echo   Tugas Rancang Dasar Pemrograman Jaringan
echo ============================================================
echo.

:: Cek Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Python tidak terdeteksi di sistem PATH.
    echo     Pastikan Python 3.9+ sudah terpasang dan dicentang 'Add to PATH'.
    pause
    exit /b
)

echo [*] Memeriksa modul Flask dan Requests...
python -c "import flask, requests" >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] Menginstall dependencies dari requirements.txt...
    python -m pip install -r requirements.txt
)

echo.
echo [*] Menjalankan Web Dashboard...
echo [*] Buka browser di http://127.0.0.1:5000
echo.
python app.py

pause
