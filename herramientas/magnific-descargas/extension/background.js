/* Cola de descargas de Magnific con la sesión de este Firefox.
   Abre cada enlace en una pestaña de fondo, pide a content.js que pulse «Download» y registra cada descarga que la
   página dispara (id de Firefox, archivo real, nombre deseado). Para dejar el nombre de la lista, primero pide una copia
   con ese nombre; sólo cuando la copia terminó bien quita la descarga original. Si no se puede (enlace blob:/data:,
   enlace de un solo uso, descarga tardía), conserva el archivo con el nombre de Magnific y lo anota en el manifiesto
   para renombrarlo en disco con scripts/renombrar.mjs. Una a la vez, con pausas, para no saturar la cuenta. */
'use strict';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ESPERA_INICIO = 90000;      // tiempo para que la página empiece la descarga después del clic
const ESPERA_CON_AVISO = 15000;   // si tras el clic apareció un aviso de sesión o Premium
const ESPERA_FIN = 20 * 60000;    // tiempo máximo para que termine una descarga
const VENTANA_TARDIA = 5 * 60000; // una descarga que llega tarde se asigna al último trabajo que se quedó sin archivo
const VIGENCIA_LISTA = 6 * 3600000; // una lista incluida más vieja que esto no arranca sola

const nuevoEstado = (extra = {}) => ({
  lote: null, carpeta: 'magnific', destino: null, running: false, terminado: false, pausa: '',
  manifiesto: '', ultimaActividad: 0, jobs: [], sinDueno: [], ...extra
});
let state = nuevoEstado();
let actual = null;            // trabajo cuya página acaba de recibir el clic
const esperas = new Map();    // nombre del trabajo -> resolve de su primera descarga
const propias = new Set();    // URLs que estamos pidiendo nosotros (respaldo de byExtensionId)

const guardar = () => browser.storage.local.set({ state }).catch(() => {});

const MOTIVOS = {
  premium: 'la página pide Premium: revisa que la sesión de Magnific esté iniciada con la cuenta Premium',
  login: 'la página pide iniciar sesión en Magnific',
  'sin-boton': 'no encontré el botón de descarga',
  'sin-descarga': 'la descarga no empezó a tiempo; si empieza después, se registra igual'
};

/* ---------- lista ---------- */

const limpiarNombre = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\w.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 120);
const limpiarCarpeta = s => String(s || '').split(/[\\/]+/).map(limpiarNombre).filter(p => p && p !== '..').join('/') || 'magnific';
const tipoDe = url => /-video\/|\/video\//i.test(url) ? 'video' : 'foto';
const enlaceValido = url => /^https:\/\/([a-z0-9-]+\.)*(magnific|freepik)\.com\//i.test(url);
const idRecurso = url => (String(url || '').match(/_(\d{3,})(?:\.htm)?(?:[?#/]|$)/) || [])[1] || null;

/** Texto «nombre | enlace» (una por renglón, # para comentarios) a elementos de lista. */
function leerTexto(texto) {
  const elementos = [];
  String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')).forEach((line, i) => {
    const partes = line.split('|').map(s => s.trim());
    const enlace = partes.length > 1 ? partes[1] : partes[0];
    const nombre = partes.length > 1 ? partes[0] : `archivo-${i + 1}`;
    elementos.push({ nombre, enlace });
  });
  return elementos;
}

/** Valida y deja la lista lista para la cola. Devuelve { ok, error }. */
function cargar(lista) {
  const vistos = new Set();
  const jobs = [];
  for (const el of lista.elementos || []) {
    const enlace = String(el.enlace || el.url || '').trim();
    const nombre = limpiarNombre(el.nombre);
    if (!enlaceValido(enlace)) return { ok: false, error: `enlace no válido de Magnific: ${enlace || '(vacío)'}` };
    if (!nombre) return { ok: false, error: `falta el nombre para ${enlace}` };
    if (vistos.has(nombre.toLowerCase())) return { ok: false, error: `nombre repetido: ${nombre}` };
    vistos.add(nombre.toLowerCase());
    jobs.push({ nombre, enlace, tipo: el.tipo === 'video' || el.tipo === 'foto' ? el.tipo : tipoDe(enlace),
      status: 'pendiente', detail: '', codigo: '', descargas: [], archivo: null, renombrado: null, ext: null, fin: 0 });
  }
  if (!jobs.length) return { ok: false, error: 'la lista no tiene enlaces de magnific.com' };
  state = nuevoEstado({
    lote: limpiarNombre(lista.lote) || new Date().toISOString().replace(/\D/g, '').slice(0, 14),
    carpeta: limpiarCarpeta(lista.carpeta), destino: lista.destino || null, jobs
  });
  return { ok: true };
}

/* ---------- descargas ---------- */

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov',
  'application/zip': 'zip', 'application/x-zip-compressed': 'zip', 'image/svg+xml': 'svg', 'application/postscript': 'eps' };
function extDe(reg) {
  const nombre = String(reg.original || '').split(/[\\/]/).pop();
  const m = nombre.match(/\.([a-z0-9]{2,4})$/i) || String(reg.url).match(/\.([a-z0-9]{2,4})(?:$|[?#])/i);
  if (m && !/^(htm|html|php|aspx?)$/i.test(m[1])) return m[1].toLowerCase();
  return EXT[reg.mime] || 'bin';
}

async function estadoDescarga(id) {
  const [d] = await browser.downloads.search({ id }).catch(() => []);
  return d ? { id, state: d.state, filename: d.filename || '', bytes: d.fileSize || d.bytesReceived || 0,
    total: d.totalBytes || 0, error: d.error || '', exists: d.exists !== false } : { id, state: 'desconocido', filename: '', bytes: 0 };
}

/** Espera a que la descarga termine o se interrumpa (o a que pase el tiempo) y devuelve su estado. */
function esperarFin(id, timeout = ESPERA_FIN) {
  return new Promise(resolve => {
    let hecho = false;
    let reloj = null;
    const terminar = () => {
      if (hecho) return;
      hecho = true;
      browser.downloads.onChanged.removeListener(oyente);
      clearTimeout(reloj);
      estadoDescarga(id).then(resolve);
    };
    const oyente = delta => { if (delta.id === id && delta.state && delta.state.current !== 'in_progress') terminar(); };
    browser.downloads.onChanged.addListener(oyente);
    reloj = setTimeout(terminar, timeout);
    estadoDescarga(id).then(d => { if (d.state !== 'in_progress') terminar(); });
  });
}

/** ¿De qué trabajo es esta descarga? Primero por el id del recurso en la página que la pidió, luego el trabajo en curso,
    y si nada coincide, el último que se quedó sin descarga hace poco (descarga tardía). */
function duenoDe(item) {
  const ref = idRecurso(item.referrer);
  if (ref) {
    const porRef = state.jobs.find(j => idRecurso(j.enlace) === ref);
    if (porRef) return porRef;
  }
  if (actual) return actual;
  const ahora = Date.now();
  return [...state.jobs].reverse().find(j => j.codigo === 'sin-descarga' && !j.archivo && ahora - j.fin < VENTANA_TARDIA) || null;
}

browser.downloads.onCreated.addListener(item => {
  if (!state.lote) return;
  if (item.byExtensionId === browser.runtime.id || propias.has(item.url)) return;
  const reg = { id: item.id, url: item.url, original: item.filename || '', referrer: item.referrer || '',
    mime: item.mime || '', total: item.totalBytes || 0, creada: Date.now() };
  const job = duenoDe(item);
  if (!job) {
    if (state.running || Date.now() - state.ultimaActividad < VENTANA_TARDIA) { state.sinDueno.push(reg); void guardar(); }
    return;
  }
  job.descargas.push(reg);
  void guardar();
  const resolver = esperas.get(job.nombre);
  if (resolver) { esperas.delete(job.nombre); resolver(reg); return; }
  if (job.codigo === 'sin-descarga' && !job.archivo) void procesarTardia(job, reg);
});

/** Deja el archivo con el nombre de la lista. Nunca borra el original sin tener antes la copia completa. */
async function procesar(job, reg) {
  job.ext = extDe(reg);
  job.deseado = `${state.carpeta}/${job.nombre}.${job.ext}`;
  job.idPrincipal = reg.id;
  if (/^https?:/i.test(reg.url)) {
    propias.add(reg.url);
    let copia = null;
    try {
      const id = await browser.downloads.download({ url: reg.url, filename: job.deseado, conflictAction: 'uniquify', saveAs: false });
      copia = await esperarFin(id);
      if (copia.state === 'complete' && copia.bytes > 0) {
        const original = await estadoDescarga(reg.id);
        const mismoTamano = !(original.state === 'complete' && original.bytes > 0 && original.bytes !== copia.bytes);
        if (mismoTamano) {
          if (original.state === 'in_progress') await browser.downloads.cancel(reg.id).catch(() => {});
          else if (original.state === 'complete' && original.filename !== copia.filename) await browser.downloads.removeFile(reg.id).catch(() => {});
          await browser.downloads.erase({ id: reg.id }).catch(() => {});
          reg.descartada = true;
        } else {
          job.nota = 'el original y la copia tienen tamaños distintos: se dejaron los dos para revisar';
        }
        job.idPrincipal = id;
        job.archivo = copia.filename;
        job.renombrado = 'navegador';
        return { ok: true, note: job.nota || '' };
      }
      await browser.downloads.erase({ id }).catch(() => {});
      job.nota = `no se pudo volver a pedir con nombre (${copia.error || copia.state})`;
    } catch (error) {
      job.nota = `no se pudo volver a pedir con nombre (${error.message})`;
    } finally {
      setTimeout(() => propias.delete(reg.url), 5000);
    }
  } else {
    job.nota = 'la página generó el archivo en el navegador (blob/data)';
  }
  const fin = await esperarFin(reg.id);
  if (fin.state !== 'complete') return { ok: false, reason: `la descarga de la página no terminó (${fin.error || fin.state})` };
  job.archivo = fin.filename;
  job.renombrado = 'pendiente';
  return { ok: true, note: `${job.nota}; quedó con el nombre de Magnific y se renombra en disco con renombrar.mjs` };
}

async function procesarTardia(job, reg) {
  job.status = 'descargando'; job.detail = 'descarga tardía'; await guardar();
  const r = await procesar(job, reg).catch(e => ({ ok: false, reason: `error inesperado (${e.message})` }));
  job.status = r.ok ? 'listo' : 'error'; job.codigo = r.ok ? '' : 'tardia';
  job.detail = r.ok ? `descarga tardía${r.note ? `; ${r.note}` : ''}` : r.reason;
  await guardar();
  if (r.ok && job.tabId != null) { await browser.tabs.remove(job.tabId).catch(() => {}); job.tabId = null; }
  if (!state.running) await exportarManifiesto().catch(() => {});
}

/* ---------- cola ---------- */

function esperarCarga(tabId, timeout) {
  return new Promise(resolve => {
    const listo = (id, info) => { if (id === tabId && info.status === 'complete') fin(); };
    const reloj = setTimeout(() => fin(), timeout);
    function fin() { browser.tabs.onUpdated.removeListener(listo); clearTimeout(reloj); resolve(); }
    browser.tabs.onUpdated.addListener(listo);
  });
}

async function pedirClic(tabId, tipo) {
  for (let i = 0; i < 5; i++) {
    try { return await browser.tabs.sendMessage(tabId, { cmd: 'magnific-descargar', tipo }); } catch (error) {
      if (i === 4) return { ok: false, reason: `la página no respondió (${error.message})` };
      await sleep(2000);
    }
  }
  return { ok: false, reason: 'la página no respondió' };
}

/** Una página: abrir, pulsar «Download», esperar la descarga y dejarla con su nombre. Si falla, la pestaña queda abierta. */
async function runJob(job) {
  if (job.tabId != null) await browser.tabs.remove(job.tabId).catch(() => {});
  const tab = await browser.tabs.create({ url: job.enlace, active: false });
  job.tabId = tab.id;
  await esperarCarga(tab.id, 45000);
  await sleep(1500);
  const yaTenia = job.descargas.length;
  const primera = new Promise(resolve => esperas.set(job.nombre, resolve));
  actual = job;
  const clic = await pedirClic(tab.id, job.tipo);
  if (!clic?.ok) {
    actual = null; esperas.delete(job.nombre);
    const codigo = clic?.reason in MOTIVOS ? clic.reason : 'pagina';
    return { ok: false, codigo, reason: MOTIVOS[clic?.reason] || clic?.reason || 'la página no respondió' };
  }
  const limite = clic.aviso ? ESPERA_CON_AVISO : ESPERA_INICIO;
  const reg = job.descargas.length > yaTenia ? job.descargas[yaTenia] : await Promise.race([primera, sleep(limite).then(() => null)]);
  esperas.delete(job.nombre);
  if (!reg) {
    actual = null;
    if (clic.aviso) return { ok: false, codigo: clic.aviso, reason: MOTIVOS[clic.aviso] };
    return { ok: false, codigo: 'sin-descarga', reason: MOTIVOS['sin-descarga'] };
  }
  await sleep(4000); // la página puede disparar una segunda descarga casi junto con la primera
  actual = null;
  return procesar(job, reg);
}

async function run() {
  if (state.running || !state.jobs.length) return;
  state.running = true; state.terminado = false; state.pausa = '';
  await guardar();
  for (const job of state.jobs) {
    if (!state.running) break;
    if (job.status === 'listo') continue;
    job.status = 'descargando'; job.detail = ''; job.codigo = ''; job.nota = '';
    await guardar();
    let r;
    try { r = await runJob(job); } catch (error) { r = { ok: false, codigo: 'error', reason: `error inesperado (${error.message})` }; }
    if (job.status === 'listo') continue; // una descarga tardía lo resolvió mientras tanto
    job.status = r.ok ? 'listo' : 'error';
    job.codigo = r.ok ? '' : (r.codigo || 'error');
    job.detail = r.ok ? (r.note || '') : r.reason;
    job.fin = Date.now();
    state.ultimaActividad = Date.now();
    await guardar();
    if (r.ok && job.tabId != null) { await browser.tabs.remove(job.tabId).catch(() => {}); job.tabId = null; }
    if (!r.ok && (job.codigo === 'login' || job.codigo === 'premium')) {
      state.pausa = `${r.reason}. Inicia sesión en la pestaña que quedó abierta y pulsa «Reanudar».`;
      break;
    }
    await sleep(4000 + Math.random() * 3000);
  }
  state.running = false;
  state.terminado = !state.pausa && state.jobs.every(j => j.status !== 'pendiente' && j.status !== 'descargando');
  state.ultimaActividad = Date.now();
  await guardar();
  await exportarManifiesto().catch(error => { state.pausa = `no se pudo guardar el manifiesto (${error.message})`; return guardar(); });
}

/* ---------- manifiesto ---------- */

async function exportarManifiesto() {
  if (!state.lote) return null;
  const elementos = [];
  for (const j of state.jobs) {
    const extras = [];
    for (const d of j.descargas || []) {
      if (d.descartada || d.id === j.idPrincipal) continue;
      const e = await estadoDescarga(d.id);
      extras.push({ archivo: e.filename || d.original, estado: e.state, url: /^https?:/.test(d.url) ? d.url.split('?')[0] : d.url.slice(0, 20) });
    }
    elementos.push({ nombre: j.nombre, enlace: j.enlace, tipo: j.tipo, estado: j.status, detalle: j.detail || '',
      archivo: j.archivo || null, renombrado: j.renombrado || null, ext: j.ext || null, extras });
  }
  const sinDueno = [];
  for (const d of state.sinDueno) {
    const e = await estadoDescarga(d.id);
    sinDueno.push({ archivo: e.filename || d.original, estado: e.state, referrer: d.referrer });
  }
  const datos = { formato: 'magnific-descargas/1', lote: state.lote, carpeta: state.carpeta, destino: state.destino,
    generado: new Date().toISOString(), elementos, sinDueno };
  const url = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }));
  propias.add(url);
  try {
    const id = await browser.downloads.download({ url, filename: `${state.carpeta}/manifiesto-${state.lote}.json`,
      conflictAction: 'overwrite', saveAs: false });
    const fin = await esperarFin(id, 30000);
    await browser.downloads.erase({ id }).catch(() => {}); // sólo lo quita de la lista de descargas, no del disco
    state.manifiesto = fin.filename || '';
    await guardar();
    return state.manifiesto;
  } finally {
    setTimeout(() => { URL.revokeObjectURL(url); propias.delete(url); }, 60000);
  }
}

/* ---------- arranque y mensajes ---------- */

async function abrirPanel() {
  const url = browser.runtime.getURL('panel.html');
  const [abierta] = await browser.tabs.query({ url }).catch(() => []);
  if (abierta) await browser.tabs.update(abierta.id, { active: true });
  else await browser.tabs.create({ url, active: true });
}
browser.browserAction.onClicked.addListener(() => { void abrirPanel(); });

/** Si el lanzador dejó lista.json dentro de la extensión, la carga y arranca sola (una vez por lote). */
async function iniciarConListaIncluida() {
  const { state: guardado } = await browser.storage.local.get('state').catch(() => ({}));
  if (guardado?.lote) state = { ...nuevoEstado(), ...guardado, running: false };
  let lista = null;
  try {
    const r = await fetch(browser.runtime.getURL('lista.json'));
    if (r.ok) lista = await r.json();
  } catch { lista = null; }
  if (!lista) return;
  if (guardado?.lote && guardado.lote === limpiarNombre(lista.lote)) { await abrirPanel(); return; }
  const r = cargar(lista);
  if (!r.ok) { state = nuevoEstado({ pausa: `La lista incluida no es válida: ${r.error}` }); await guardar(); await abrirPanel(); return; }
  const reciente = lista.creado && Date.now() - Date.parse(lista.creado) < VIGENCIA_LISTA;
  if (!(lista.autoiniciar !== false && reciente)) state.pausa = 'Lista cargada. Pulsa «Iniciar» cuando la sesión de Magnific esté lista.';
  await guardar();
  await abrirPanel();
  if (lista.autoiniciar !== false && reciente) { await sleep(5000); void run(); }
}

browser.runtime.onMessage.addListener(async msg => {
  switch (msg?.cmd) {
    case 'estado': return state;
    case 'cargar': {
      if (state.running) return { ...state, error: 'Detén la cola antes de cargar otra lista.' };
      const r = cargar({ lote: '', carpeta: msg.carpeta, elementos: leerTexto(msg.texto) });
      await guardar();
      return r.ok ? state : { ...state, error: r.error };
    }
    case 'iniciar': void run(); return { ...state, running: true };
    case 'detener': state.running = false; state.pausa = 'Detenido. Termina la descarga en curso y se detiene.'; await guardar(); return state;
    case 'manifiesto': {
      try { await exportarManifiesto(); return state; } catch (error) { return { ...state, error: `no se pudo guardar el manifiesto (${error.message})` }; }
    }
    default: return undefined;
  }
});

void iniciarConListaIncluida();
