// Accende la nebulosa e la apre in Chrome: lo stesso di «Apri la nebulosa» e avvia-server.sh, ma con un solo comando,
// uguale su Mac, Windows e Linux/WSL:
//
//   npm run dev                  accende il server e apre la pagina
//   npm run server               accende solo il server, senza aprire il browser (per un server senza schermo)
//
// Il server resta in Python (avvia.py): questo file lo prepara e lo accende. Non servono pacchetti npm.
// Le impostazioni (porta, indirizzo del tunnel, cartella dei dati) sono in .env: vedi .env.example.
// Se la nebulosa e' gia' accesa apre solo la pagina. Per spegnere: Ctrl+C.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const WIN = process.platform === 'win32', MAC = process.platform === 'darwin';
const SENZA_BROWSER = process.argv.includes('--senza-browser');
const dice = (...righe) => console.log(['', ...righe.map(r => '  ' + r), ''].join('\n'));

// la porta: dall'ambiente, poi da .env, altrimenti 8002 (come fa programma/config.py)
function leggiPorta() {
  if (process.env.PORTA) return process.env.PORTA.trim();
  try {
    const riga = readFileSync(join(QUI, '.env'), 'utf8').split(/\r?\n/).filter(r => /^\s*PORTA\s*=/.test(r)).pop();
    if (riga) return riga.split('=')[1].replace(/["'\s]/g, '');
  } catch { /* niente .env: va bene */ }
  return '8002';
}
const PORTA = leggiPorta();
const URL_PAGINA = `http://localhost:${PORTA}/${process.env.PAGINA || ''}`;   // PAGINA: quale pagina aprire, vuoto = la nebulosa

const gia_accesa = async () => {
  try { return (await (await fetch(`http://localhost:${PORTA}/api/info`, { signal: AbortSignal.timeout(1000) })).text()).includes('carica'); }
  catch { return false; }
};
const porta_occupata = () => new Promise(ok => {
  const s = connect({ port: Number(PORTA), host: '127.0.0.1' }).once('connect', () => { s.destroy(); ok(true); }).once('error', () => ok(false));
});

// ---------------- quale Python ----------------
// quello della cartella .venv (con Pillow e numpy), altrimenti quello del sistema; se mancano le librerie si prepara .venv
const prova = (cmd, args) => spawnSync(cmd, args, { stdio: 'ignore', cwd: QUI }).status === 0;
const venvPy = join(QUI, '.venv', WIN ? 'Scripts/python.exe' : 'bin/python');
function trovaPython() {
  if (existsSync(venvPy)) return [venvPy];
  const candidati = WIN ? [['py', '-3'], ['python']] : [['python3'], ['python']];
  return candidati.find(([c, ...a]) => prova(c, [...a, '--version'])) || null;
}
function preparaPython() {
  const py = trovaPython();
  if (!py) {
    dice(WIN ? 'Manca Python. Scaricalo da https://www.python.org/downloads/ e spunta «Add python.exe to PATH».'
      : MAC ? 'Manca Python 3. Installalo da https://www.python.org/downloads/ oppure con: brew install python'
        : 'Manca Python 3. Su Ubuntu/Debian: sudo apt install python3 python3-venv',
    'Poi rilancia: npm run dev');
    process.exit(1);
  }
  const [cmd, ...pre] = py;
  if (py[0] === venvPy || prova(cmd, [...pre, '-c', 'import PIL, numpy'])) return py;
  dice('Preparo le librerie Python (solo la prima volta)...');
  const crea = spawnSync(cmd, [...pre, '-m', 'venv', '.venv'], { stdio: 'inherit', cwd: QUI });
  const installa = crea.status === 0 && spawnSync(venvPy, ['-m', 'pip', 'install', '-q', '-r', 'requirements.txt'], { stdio: 'inherit', cwd: QUI });
  if (!installa || installa.status !== 0) {
    dice('Non riesco a installare le librerie.', WIN ? '' : 'Su Ubuntu/Debian prova: sudo apt install python3-venv   (poi riprova)',
      'A mano:  pip3 install -r requirements.txt');
    process.exit(1);
  }
  return [venvPy];
}

// ---------------- aprire Chrome ----------------
// Chrome con un profilo tutto suo per la nebulosa: il suono parte da solo, senza un clic, e il permesso della webcam,
// una volta dato, resta ricordato.
const FLAG = ['--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check', '--new-window'];
const lancia = (cmd, args) => { try { spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => { }).unref(); return true; } catch { return false; } };
const in_wsl = () => { try { return /microsoft/i.test(readFileSync('/proc/version', 'utf8')); } catch { return false; } };
function apri() {
  const url = URL_PAGINA;
  if (MAC) {
    if (existsSync('/Applications/Google Chrome.app')) return lancia('open', ['-na', 'Google Chrome', '--args', `--user-data-dir=${join(homedir(), '.nebulosa-chrome')}`, ...FLAG, url]);
    return lancia('open', [url]);
  }
  if (WIN) {
    const dove = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean).map(d => join(d, 'Google/Chrome/Application/chrome.exe'));
    const chrome = dove.find(existsSync);
    if (chrome) return lancia(chrome, [`--user-data-dir=${join(process.env.LOCALAPPDATA || homedir(), 'nebulosa-chrome')}`, ...FLAG, url]);
    return lancia('cmd', ['/c', 'start', '', url]);
  }
  if (in_wsl()) {   // WSL: il Chrome di Windows
    const chrome = ['/mnt/c/Program Files/Google/Chrome/Application/chrome.exe', '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
    if (chrome) return lancia(chrome, ['--user-data-dir=C:\\nebulosa-chrome', ...FLAG, url]);
    if (prova('which', ['wslview'])) return lancia('wslview', [url]);
    if (existsSync('/mnt/c/Windows/explorer.exe')) return lancia('/mnt/c/Windows/explorer.exe', [url]);
  } else if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) {   // Linux con lo schermo
    const chrome = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].find(c => prova('which', [c]));
    if (chrome) return lancia(chrome, [`--user-data-dir=${join(homedir(), '.nebulosa-chrome')}`, ...FLAG, url]);
    if (prova('which', ['xdg-open'])) return lancia('xdg-open', [url]);
  }
  console.log(`  Apri nel browser: ${url}`);   // un server senza schermo
  return false;
}

// ---------------- si parte ----------------
if (await gia_accesa()) {
  dice('La nebulosa e\' gia\' accesa: apro la pagina.');
  if (!SENZA_BROWSER) apri();
  process.exit(0);
}
if (await porta_occupata()) {
  // niente porta di riserva: il tunnel e i QR gia' stampati puntano a questa
  dice(`La porta ${PORTA} e' occupata da un altro programma. Chiudilo, oppure cambia PORTA in .env.`);
  process.exit(1);
}
const [cmd, ...pre] = preparaPython();
const server = spawn(cmd, [...pre, '-u', 'avvia.py'], { cwd: QUI, stdio: 'inherit', env: { ...process.env, PORTA } });   // -u: le righe degli arrivi si vedono subito
server.on('error', e => { dice('Non riesco ad accendere il server: ' + e.message); process.exit(1); });
server.on('exit', (codice, segnale) => process.exit(codice ?? (segnale ? 130 : 1)));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => server.kill(s));   // Ctrl+C: spegne anche il server
if (!SENZA_BROWSER) {   // la pagina si apre quando il server e' acceso
  for (let i = 0; i < 60 && !(await gia_accesa()); i++) await new Promise(r => setTimeout(r, 500));
  apri();
}
