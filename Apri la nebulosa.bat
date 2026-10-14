@echo off
rem Accende il server della nebulosa e la apre in Chrome. Per Windows (doppio clic, oppure dal Prompt dei comandi).
rem Se la nebulosa e' gia' accesa, apre solo la pagina (non accende un secondo server).
rem Le impostazioni (porta, indirizzo del tunnel, cartella dei dati) sono in .env: vedi .env.example.
rem Per spegnere, chiudi questa finestra.
setlocal
if "%~1"==":apri" goto apri
cd /d "%~dp0"
rem la porta: da .env, altrimenti 8002
if not defined PORTA if exist .env for /f "usebackq tokens=1,* delims==" %%a in (".env") do if /i "%%a"=="PORTA" set PORTA=%%b
if not defined PORTA set PORTA=8002
set PORTA=%PORTA: =%

rem quale Python c'e': quello della cartella .venv, "py" (dal sito python.org) oppure "python"
set PY=
if exist ".venv\Scripts\python.exe" set PY=".venv\Scripts\python.exe"
if not defined PY where py >nul 2>nul && set PY=py -3
if not defined PY where python >nul 2>nul && set PY=python
if not defined PY (
  echo.
  echo   Manca Python. Scaricalo da https://www.python.org/downloads/
  echo   e durante l'installazione spunta "Add python.exe to PATH". Poi riapri questo file.
  echo.
  pause
  exit /b 1
)

curl -s --max-time 1 http://localhost:%PORTA%/api/info 2>nul | find "carica" >nul
if not errorlevel 1 (
  echo.
  echo   La nebulosa e' gia' accesa: apro la pagina in Chrome.
  echo.
  call :apri
  exit /b 0
)

rem la prima volta installa le librerie che servono (Pillow, numpy)
%PY% -c "import PIL, numpy" >nul 2>nul || %PY% -m pip install -r requirements.txt

rem la pagina si apre tra 3 secondi, quando il server e' acceso
start "" /min cmd /c ""%~f0" :apri"
%PY% avvia.py
pause
exit /b 0

:apri
if not defined PORTA set PORTA=8002
set URL=http://localhost:%PORTA%/%PAGINA%
timeout /t 3 /nobreak >nul
rem Chrome con un profilo tutto suo per la nebulosa: il suono parte da solo e il permesso della webcam resta ricordato
set CHROME=
for %%p in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe") do if exist %%p set CHROME=%%p
if defined CHROME (
  start "" %CHROME% --user-data-dir="%LOCALAPPDATA%\nebulosa-chrome" --autoplay-policy=no-user-gesture-required --no-first-run --no-default-browser-check --new-window "%URL%"
) else (
  start "" "%URL%"
)
exit /b 0
