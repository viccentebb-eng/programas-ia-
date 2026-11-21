#!/usr/bin/env node
// Abre Firefox con la extensión «Descargas de Magnific» y una lista ya cargada, que arranca sola.
//
//   node lanzar.mjs --lista <archivo .txt|.json> [--carpeta <subcarpeta en Descargas>] [--destino <carpeta final>]
//                   [--perfil sesion|copia|<ruta>] [--sin-sesion] [--firefox <firefox.exe>] [--manual] [--sin-lanzar] [--no-auto]
//
// Perfiles:
//   sesion (predeterminado)  Perfil propio de esta herramienta en %LOCALAPPDATA%\magnific-descargas\perfil-firefox.
//                            Antes de abrirlo copia SÓLO las cookies de magnific.com y freepik.com de tu perfil de
//                            Firefox (lectura; tu perfil no se modifica). Requiere tu Firefox cerrado para copiarlas.
//   copia                    web-ext usa una copia temporal completa de tu perfil (lento si tu perfil es grande).
//   <ruta>                   Otro perfil dedicado (nunca uno de los que aparecen en profiles.ini).
//   --manual                 No abre nada: indica cómo cargarla en tu Firefox abierto (about:debugging).
import { spawn, execFileSync } from 'node:child_process';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { leerLista, limpiarCarpeta } from './lista.mjs';

const WEB_EXT = 'web-ext@10.8.0';
const AQUI = dirname(fileURLToPath(import.meta.url));
export const EXTENSION = resolve(AQUI, '..', 'extension');
export const DATOS = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'magnific-descargas');
export const PERFIL_SESION = join(DATOS, 'perfil-firefox');
export const ULTIMO = join(DATOS, 'ultimo-lote.json');
const FILTRO_MAGNIFIC = "(host IN ('magnific.com','freepik.com') OR host LIKE '%.magnific.com' OR host LIKE '%.freepik.com')";

const falla = mensaje => { console.error(`\nNo se pudo: ${mensaje}\n`); process.exit(1); };

/* ---------- Firefox ---------- */

export const carpetaFirefox = () => join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Mozilla', 'Firefox');

function leerIni(texto) {
  const secciones = [];
  let actual = null;
  for (const linea of texto.split(/\r?\n/)) {
    const s = linea.match(/^\s*\[(.+)\]\s*$/);
    if (s) { actual = { seccion: s[1] }; secciones.push(actual); continue; }
    const kv = linea.match(/^\s*([^=;#]+?)\s*=\s*(.*)$/);
    if (kv && actual) actual[kv[1]] = kv[2].trim();
  }
  return secciones;
}

/** Todos los perfiles de profiles.ini y el que usa Firefox al abrir (sección [Install…], si no Default=1). */
export function perfilesDeFirefox(base = carpetaFirefox()) {
  const ini = join(base, 'profiles.ini');
  if (!existsSync(ini)) return { principal: null, todos: [] };
  const secciones = leerIni(readFileSync(ini, 'utf8'));
  const ruta = (p, relativo) => resolve(relativo && !isAbsolute(p) ? join(base, p) : p);
  const todos = secciones.filter(s => /^Profile\d+$/.test(s.seccion) && s.Path)
    .map(s => ({ nombre: s.Name || basename(s.Path), ruta: ruta(s.Path, s.IsRelative !== '0'), predeterminado: s.Default === '1' }));
  const install = secciones.find(s => s.seccion.startsWith('Install') && s.Default);
  const rutaInstall = install ? ruta(install.Default, true) : null;
  const principal = (rutaInstall && (todos.find(p => mismaRuta(p.ruta, rutaInstall)) || { nombre: basename(rutaInstall), ruta: rutaInstall }))
    || todos.find(p => p.predeterminado) || todos[0] || null;
  return { principal, todos };
}

export const mismaRuta = (a, b) => process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);

/** En Windows, Firefox abre parent.lock en exclusiva mientras usa el perfil. */
export function perfilEnUso(dir) {
  if (process.platform !== 'win32') return existsSync(join(dir, 'lock'));
  try { closeSync(openSync(join(dir, 'parent.lock'), 'r')); return false; } catch (error) {
    return ['EBUSY', 'EPERM', 'EACCES'].includes(error.code);
  }
}

function firefoxAbierto() {
  if (process.platform !== 'win32') return false;
  try { return /firefox\.exe/i.test(execFileSync('tasklist', ['/FI', 'IMAGENAME eq firefox.exe', '/NH'], { encoding: 'utf8' })); } catch { return false; }
}

function descargasDeWindows() {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders',
      '/v', '{374DE290-123F-4565-9164-39C4925E467B}'], { encoding: 'utf8' });
    const m = out.match(/REG_(?:EXPAND_)?SZ\s+(.+)/);
    return m ? m[1].trim().replace(/%([^%]+)%/g, (_, v) => process.env[v] ?? `%${v}%`) : null;
  } catch { return null; }
}

/** Carpeta donde Firefox guarda las descargas según prefs.js del perfil (sin modificarlo). */
export function carpetaDescargas(perfil) {
  const archivo = perfil ? join(perfil, 'prefs.js') : '';
  const prefs = archivo && existsSync(archivo) ? readFileSync(archivo, 'utf8') : '';
  const pref = nombre => {
    const m = prefs.match(new RegExp(`user_pref\\("${nombre.replace(/\./g, '\\.')}",\\s*("(?:[^"\\\\]|\\\\.)*"|[^)]+)\\);`));
    return m ? m[1].trim() : null;
  };
  const lista = pref('browser.download.folderList');
  const dir = pref('browser.download.dir');
  if (lista === '2' && dir) { try { return JSON.parse(dir); } catch { /* sigue */ } }
  if (lista === '0') return join(homedir(), 'Desktop');
  return descargasDeWindows() || join(homedir(), 'Downloads');
}

/* ---------- sesión ---------- */

/** Copia sólo las cookies de Magnific/Freepik de tu perfil al perfil de descargas. Tu perfil sólo se lee. */
export async function copiarSesion(principal, dedicado) {
  const origen = join(principal, 'cookies.sqlite');
  if (!existsSync(origen)) return { copiadas: 0, motivo: 'tu perfil no tiene cookies.sqlite' };
  let DatabaseSync;
  try { ({ DatabaseSync } = await import('node:sqlite')); } catch {
    return { copiadas: 0, motivo: 'esta versión de Node no trae node:sqlite (usa Node 22.13 o más nuevo)' };
  }
  mkdirSync(dedicado, { recursive: true });
  const tmp = join(dedicado, 'cookies-origen.tmp.sqlite');
  const borrarTmp = () => ['', '-wal', '-shm', '-journal'].forEach(s => rmSync(tmp + s, { force: true }));
  borrarTmp();
  try {
    copyFileSync(origen, tmp);
    if (existsSync(`${origen}-wal`)) copyFileSync(`${origen}-wal`, `${tmp}-wal`);
    const db = new DatabaseSync(tmp);
    let n = 0;
    try {
      db.exec(`DELETE FROM moz_cookies WHERE NOT ${FILTRO_MAGNIFIC}`);
      n = db.prepare('SELECT COUNT(*) AS n FROM moz_cookies').get().n;
      if (n) { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.exec('PRAGMA journal_mode=DELETE'); db.exec('VACUUM'); }
    } finally { db.close(); }
    if (!n) return { copiadas: 0, motivo: 'tu perfil no tiene sesión guardada de Magnific' };
    const destino = join(dedicado, 'cookies.sqlite');
    if (!existsSync(destino)) { copyFileSync(tmp, destino); return { copiadas: n }; }
    // Ya existe: las cookies de Magnific de tu perfil reemplazan a las del perfil de descargas; lo demás se conserva.
    const dest = new DatabaseSync(destino);
    try {
      const columnas = t => dest.prepare(`PRAGMA ${t}.table_info(moz_cookies)`).all().map(c => c.name);
      dest.exec(`ATTACH DATABASE '${tmp.replace(/'/g, "''")}' AS origen`);
      const comunes = columnas('main').filter(c => c !== 'id' && columnas('origen').includes(c)).map(c => `"${c}"`).join(', ');
      dest.exec('BEGIN');
      dest.exec(`DELETE FROM main.moz_cookies WHERE ${FILTRO_MAGNIFIC}`);
      dest.exec(`INSERT OR REPLACE INTO main.moz_cookies (${comunes}) SELECT ${comunes} FROM origen.moz_cookies`);
      dest.exec('COMMIT');
      dest.exec('DETACH DATABASE origen');
    } finally { dest.close(); }
    return { copiadas: n };
  } finally { borrarTmp(); }
}

/* ---------- web-ext ---------- */

function correrWebExt(args) {
  const win = process.platform === 'win32';
  const comillas = a => (/^[\w@.=/-]+$/.test(a) ? a : `"${String(a).replace(/"/g, '')}"`);
  console.log(`\n> npx ${args.map(comillas).join(' ')}\n`);
  // En Windows, npx es un .cmd y Node exige shell para lanzarlo.
  const hijo = win
    ? spawn(['npx', ...args].map(comillas).join(' '), { stdio: 'inherit', shell: true })
    : spawn('npx', args, { stdio: 'inherit' });
  return new Promise(res => hijo.on('exit', code => res(code ?? 1)));
}

/* ---------- principal ---------- */

async function main() {
  const { values: o } = parseArgs({ options: {
    lista: { type: 'string' }, carpeta: { type: 'string' }, destino: { type: 'string' }, perfil: { type: 'string', default: 'sesion' },
    firefox: { type: 'string' }, manual: { type: 'boolean' }, 'sin-lanzar': { type: 'boolean' }, 'no-auto': { type: 'boolean' },
    'sin-sesion': { type: 'boolean' }, ayuda: { type: 'boolean', short: 'h' }
  } });
  if (o.ayuda || !o.lista) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n'));
    process.exit(o.ayuda ? 0 : 1);
  }
  const rutaLista = resolve(o.lista);
  if (!existsSync(rutaLista)) falla(`no existe la lista ${rutaLista}`);
  const { elementos, errores } = leerLista(rutaLista);
  if (errores.length) falla(`la lista tiene errores:\n  - ${errores.join('\n  - ')}`);
  if (!elementos.length) falla('la lista no tiene enlaces de magnific.com');

  const carpeta = limpiarCarpeta(o.carpeta || basename(rutaLista).replace(/\.[^.]+$/, '')) || 'magnific';
  const destino = o.destino ? resolve(o.destino) : null;
  const { principal, todos } = perfilesDeFirefox();
  const descargas = carpetaDescargas(principal?.ruta);
  const ahora = new Date();
  const lote = [ahora.getFullYear(), ahora.getMonth() + 1, ahora.getDate(), ahora.getHours(), ahora.getMinutes(), ahora.getSeconds()]
    .map(n => String(n).padStart(2, '0')).join('');

  const escribir = () => {
    const lista = { lote, carpeta, destino, autoiniciar: !o['no-auto'], creado: new Date().toISOString(), elementos };
    writeFileSync(join(EXTENSION, 'lista.json'), `${JSON.stringify(lista, null, 2)}\n`);
    mkdirSync(DATOS, { recursive: true });
    const carpetaAbs = join(descargas, ...carpeta.split('/'));
    const ultimo = { lote, lista: rutaLista, carpeta: carpetaAbs, manifiesto: join(carpetaAbs, `manifiesto-${lote}.json`), destino, creado: lista.creado };
    writeFileSync(ULTIMO, `${JSON.stringify(ultimo, null, 2)}\n`);

    console.log(`Lista: ${elementos.length} recursos (${elementos.filter(e => e.tipo === 'video').length} videos) desde ${rutaLista}`);
    console.log(`Se guardarán en: ${carpetaAbs}`);
    console.log(`Manifiesto esperado: ${ultimo.manifiesto}`);
    if (destino) console.log(`Destino final (al renombrar): ${destino}`);
  };
  // La lista se escribe en la extensión sólo después de revisar el perfil, para no dejar una lista que nadie va a correr.
  if (o.manual) {
    escribir();
    console.log(`
Modo manual, en tu Firefox de siempre (con tu sesión de Magnific; puede estar abierto):
  1. Abre about:debugging#/runtime/this-firefox
  2. Pulsa «Cargar complemento temporal…» y elige:
     ${join(EXTENSION, 'manifest.json')}
  3. Se abre el panel «Descargas de Magnific» y la lista empieza sola a los 5 segundos.
     Si Firefox pregunta dónde guardar cada archivo, desactiva «Preguntar siempre dónde guardar» mientras corre.
  4. Al terminar: node "${join(AQUI, 'renombrar.mjs')}" --ultimo`);
    return;
  }

  const prefs = ['browser.download.useDownloadDir=true', 'browser.download.always_ask_before_handling_new_types=false',
    'browser.download.alwaysOpenPanel=false'];
  const args = ['-y', WEB_EXT, 'run', '--source-dir', EXTENSION, '--no-reload', '--no-input', '--start-url', 'https://www.magnific.com/'];
  if (o.firefox) args.push('--firefox', o.firefox);

  if (o.perfil === 'copia') {
    if (!principal) falla('no encontré tu perfil de Firefox en profiles.ini. Usa --manual.');
    if (perfilEnUso(principal.ruta)) falla(`Firefox está abierto con tu perfil «${principal.nombre}» (${principal.ruta}).
Ciérralo por completo (también desde la bandeja) y vuelve a correr, o usa --manual para cargar la extensión en el Firefox abierto.`);
    console.log(`Perfil: copia temporal de «${principal.nombre}». Si tu perfil es grande, copiarlo puede tardar varios minutos.`);
    args.push('--firefox-profile', principal.ruta);
  } else {
    const dedicado = o.perfil === 'sesion' ? PERFIL_SESION : resolve(o.perfil);
    if (todos.some(p => mismaRuta(p.ruta, dedicado))) {
      falla(`«${dedicado}» es un perfil tuyo de Firefox. Esta herramienta no lo usa directo porque web-ext cambiaría sus ajustes.
Usa --perfil sesion (copia sólo la sesión de Magnific), --perfil copia o --manual.`);
    }
    if (perfilEnUso(dedicado)) falla(`ya hay un Firefox de descargas abierto con ${dedicado}. Ciérralo y vuelve a correr.`);
    const sesionPrevia = existsSync(join(dedicado, 'cookies.sqlite'));
    if (o['sin-sesion']) {
      console.log('Perfil de descargas sin copiar sesión: inicia sesión en Magnific en la ventana que se abre y pulsa «Reanudar» en el panel.');
    } else if (!principal) {
      console.log('No encontré tu perfil de Firefox: inicia sesión en Magnific en la ventana que se abre y pulsa «Reanudar».');
    } else if (perfilEnUso(principal.ruta)) {
      if (!sesionPrevia) {
        falla(`Firefox está abierto con tu perfil «${principal.nombre}» y necesito copiar tu sesión de Magnific.
Opciones:
  - Cierra Firefox por completo (también desde la bandeja) y vuelve a correr este comando.
  - O corre con --manual para cargar la extensión en tu Firefox abierto.
  - O corre con --sin-sesion e inicia sesión una vez en la ventana de descargas (queda guardada para la próxima).`);
      }
      console.log('Firefox está abierto: uso la sesión de Magnific que quedó guardada en el perfil de descargas. Si caducó, inicia sesión en esa ventana y pulsa «Reanudar».');
    } else if (o['sin-lanzar']) {
      console.log(`(simulación) Copiaría sólo las cookies de magnific.com y freepik.com de «${principal.nombre}» a ${dedicado}.`);
    } else {
      const r = await copiarSesion(principal.ruta, dedicado);
      if (r.copiadas) console.log(`Sesión: copié ${r.copiadas} cookies de Magnific/Freepik de «${principal.nombre}» (tu perfil no se modificó).`);
      else console.log(`Sesión: no copié cookies (${r.motivo}). Inicia sesión en Magnific en la ventana que se abre y pulsa «Reanudar».`);
    }
    args.push('--firefox-profile', dedicado, '--keep-profile-changes', '--profile-create-if-missing');
    prefs.push('browser.download.folderList=2', `browser.download.dir=${descargas}`);
  }
  for (const p of prefs) args.push('--pref', p);

  escribir();
  if (o['sin-lanzar']) {
    console.log(`\n(simulación) No abro Firefox. Comando:\n> npx ${args.join(' ')}`);
    return;
  }
  if (firefoxAbierto() && o.perfil === 'sesion') console.log('Nota: tu Firefox de siempre sigue abierto; la ventana de descargas es otra instancia aparte.');
  console.log('Abriendo Firefox… La lista arranca sola. Cuando el panel diga «Terminado», cierra esa ventana de Firefox.');
  const code = await correrWebExt(args);
  console.log(`\nFirefox se cerró (código ${code}). Siguiente paso:\n  node "${join(AQUI, 'renombrar.mjs')}" --ultimo            (simula)\n  node "${join(AQUI, 'renombrar.mjs')}" --ultimo --aplicar  (renombra)`);
  process.exit(code);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => falla(error.message));
}
