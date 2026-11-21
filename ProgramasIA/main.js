// =====================================================================
//  PROGRAMAS IA - panel para InDesign (UXP)
//  Archivos: marcado.js (parser y fechas), prompts.js (instrucciones),
//  fuentes.js (bajar/instalar fuentes), engine.jsx (motor ExtendScript).
// =====================================================================
const uxp = require("uxp");
const fsys = uxp.storage.localFileSystem;
const fmts = uxp.storage.formats;
const indesign = require("indesign");
const app = indesign.app;

let JSZipLib = (typeof window !== "undefined" && window.JSZip) ? window.JSZip : null;
if (!JSZipLib) { try { JSZipLib = require("./lib/jszip.min.js"); } catch (e) { JSZipLib = null; } }

const $ = (id) => document.getElementById(id);
const S = {
  archivos: [],          // {nombre, tipo, data(base64) | texto}
  avisos: [],            // {origen, tipo, texto, sugerencia}
  params: {},            // parametros que cambia Claude en correcciones
  docId: null,
  chat: [],
  usoSesion: 0,
  ocupado: false
};
const MODELO_DEF = "claude-sonnet-5-5";

// ------------------------------------------------------------------ ajustes guardados
const DEF_FORMATOS = "Una carpeta oficio (Atemajac 2027) | 330.298 | 464.989 | 0";
function cfg(k, d) { try { const v = localStorage.getItem("pia_" + k); return v === null ? d : v; } catch (e) { return d; } }
function setCfg(k, v) { try { localStorage.setItem("pia_" + k, v); } catch (e) {} }

// ------------------------------------------------------------------ utilidades de interfaz
function estado(t, tipo) {
  $("estado").textContent = t;
  $("barra").className = "barra" + (tipo ? " " + tipo : (/^error|no pude|falta/i.test(t) ? " error" : ""));
}
function ocupado(si, texto) {
  S.ocupado = si;
  $("girando").hidden = !si;
  document.querySelectorAll(".btn.prim").forEach(b => { b.disabled = si; });
  if (texto) estado(texto, si ? "trabajando" : "");
}
// Envuelve una accion: no deja picar dos veces y siempre quita el "trabajando"
function accion(fn, texto) {
  return async (...args) => {
    if (S.ocupado) return;
    ocupado(true, texto);
    try { await fn(...args); }
    catch (e) { estado("Error: " + e.message, "error"); }
    finally { ocupado(false); }
  };
}
function tab(id) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.id === id));
  document.querySelectorAll(".paso").forEach(b => b.classList.toggle("on", b.getAttribute("data-t") === id));
  try { document.querySelector("main").scrollTop = 0; } catch (e) {}
  if (id === "t2") crecer($("marcado"));
}
function marcarPasos() {
  const hecho = { t1: !!$("marcado").value.trim(), t2: !!$("marcado").value.trim() && !!S.docId, t3: docVivo() };
  document.querySelectorAll(".paso").forEach(b => b.classList.toggle("hecho", !!hecho[b.getAttribute("data-t")] && !b.classList.contains("on")));
}
// los cuadros de texto crecen con su contenido: nada de barritas de scroll dentro del panel
function crecer(el) {
  try { el.style.height = "auto"; el.style.height = Math.max(el.scrollHeight + 4, 60) + "px"; } catch (e) {}
}
function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function abrirWeb(url) { try { uxp.shell.openExternal(url); } catch (e) { estado("Abre en tu navegador: " + url); } }
function b64(buf) {
  const bytes = new Uint8Array(buf), chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "", i;
  for (i = 0; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + chars[(n >> 6) & 63] + chars[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) { const n = bytes[i] << 16; out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + "=="; }
  else if (rest === 2) { const n = (bytes[i] << 16) | (bytes[i + 1] << 8); out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + chars[(n >> 6) & 63] + "="; }
  return out;
}
function jsonDe(texto) {
  const a = texto.indexOf("{"), b = texto.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("Claude no regresó el formato esperado. Intenta otra vez.");
  return JSON.parse(texto.slice(a, b + 1));
}

// ------------------------------------------------------------------ modelos, precios y uso
// Precio por millón de tokens [entrada, salida] (precios públicos de Anthropic).
const PRECIOS = [
  [/^claude-fable-5-2/, 8, 40], [/^claude-fable-5/, 10, 50], [/^claude-mythos/, 8, 40],
  [/^claude-opus-5-5/, 4, 20], [/^claude-opus-(5|4)/, 5, 25],
  [/^claude-sonnet-5/, 2, 10], [/^claude-sonnet-4/, 3, 15],
  [/^claude-haiku-5-5/, 0.10, 0.50], [/^claude-haiku-4/, 1, 5]
];
function precio(modelo) { for (const p of PRECIOS) if (p[0].test(modelo)) return [p[1], p[2]]; return null; }
const NOTA_MODELO = [
  [/sonnet-5-5/, "Recomendado: lee bien letra a mano y es barato."],
  [/opus/, "Lee mejor la letra difícil; cuesta el doble que Sonnet."],
  [/haiku/, "Muy barato; úsalo con Word o texto limpio, no con fotos difíciles."],
  [/fable|mythos/, "El más capaz y el más caro. Casi nunca hace falta."],
  [/sonnet/, "Buena calidad, barato."]
];
function costoDe(modelo, u) {
  const p = precio(modelo) || precio(MODELO_DEF);
  const entrada = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.1;
  return (entrada * p[0] + (u.output_tokens || 0) * p[1]) / 1e6;
}
function registrarUso(modelo, u) {
  if (!u) return;
  const usd = costoDe(modelo, u), mes = new Date().toISOString().slice(0, 7);
  let d; try { d = JSON.parse(cfg("uso", "{}")); } catch (e) { d = {}; }
  d.total = d.total || { usd: 0, n: 0, tin: 0, tout: 0 };
  d.meses = d.meses || {};
  const m = d.meses[mes] = d.meses[mes] || { usd: 0, n: 0, tin: 0, tout: 0 };
  for (const x of [d.total, m]) { x.usd += usd; x.n += 1; x.tin += u.input_tokens || 0; x.tout += u.output_tokens || 0; }
  setCfg("uso", JSON.stringify(d));
  S.usoSesion += usd;
  pintarUso();
}
function dinero(v) { return "$" + (v < 0.01 && v > 0 ? v.toFixed(3) : v.toFixed(2)); }
function pintarUso() {
  let d; try { d = JSON.parse(cfg("uso", "{}")); } catch (e) { d = {}; }
  const m = (d.meses || {})[new Date().toISOString().slice(0, 7)] || { usd: 0, n: 0, tin: 0, tout: 0 };
  const t = d.total || { usd: 0, n: 0 };
  $("usoSesion").textContent = dinero(S.usoSesion);
  $("usoMes").textContent = dinero(m.usd);
  $("usoTotal").textContent = dinero(t.usd);
  $("chipUso").textContent = dinero(m.usd) + " este mes";
  $("usoDetalle").textContent = m.n ? "Este mes: " + m.n + " consultas, " + Math.round(m.tin / 1000) + " mil tokens de entrada y " + Math.round(m.tout / 1000) + " mil de salida." : "Todavía no hay consultas este mes.";
}

async function cargarModelos() {
  const key = cfg("apiKey", "");
  const sel = $("modelo"), actual = cfg("modelo", MODELO_DEF);
  let lista = [];
  if (key) {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } });
    if (res.status === 401 || res.status === 403) throw new Error("La clave no es válida o ya venció.");
    if (!res.ok) throw new Error("La API respondió " + res.status + ".");
    const j = await res.json();
    lista = (j.data || []).filter(m => /^claude-/.test(m.id));
  }
  if (!lista.length) lista = [{ id: actual, display_name: actual }];
  // primero el recomendado, luego lo mas nuevo
  lista.sort((a, b) => (b.id === MODELO_DEF) - (a.id === MODELO_DEF) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
  sel.innerHTML = "";
  for (const m of lista) {
    const o = document.createElement("option"); o.value = m.id;
    const p = precio(m.id);
    o.textContent = (m.display_name || m.id) + (m.id === MODELO_DEF ? " (recomendado)" : "") + (p ? " · ~" + dinero((7000 * p[0] + 5000 * p[1]) / 1e6) + " por lectura" : "");
    sel.appendChild(o);
  }
  sel.value = lista.some(m => m.id === actual) ? actual : lista[0].id;
  setCfg("modelo", sel.value);
  infoModelo();
  return lista.length;
}
function infoModelo() {
  const id = $("modelo").value || cfg("modelo", MODELO_DEF);
  const n = NOTA_MODELO.find(x => x[0].test(id));
  $("infoModelo").textContent = (n ? n[1] : "") + " Una lectura típica de un programa cuesta lo que dice la lista; una corrección, menos.";
}
async function conectar() {
  const nueva = $("apiKey").value.trim();
  if (!nueva) { estado("Pega primero tu clave (empieza con sk-ant-).", "error"); return; }
  if (nueva !== cfg("apiKey", "")) setCfg("apiKeyFecha", String(Date.now()));
  setCfg("apiKey", nueva);
  estado("Probando la clave...", "trabajando");
  try {
    const n = await cargarModelos();
    $("estadoClave").textContent = "Conectado. Hay " + n + " modelos disponibles en tu cuenta.";
    $("bienvenida").hidden = true;
    estado("Listo, ya puedes leer programas.", "ok");
  } catch (e) {
    $("estadoClave").textContent = e.message;
    estado("No pude conectar: " + e.message, "error");
  }
}
function revisarClave() {
  const key = cfg("apiKey", ""), f = parseInt(cfg("apiKeyFecha", "0"), 10);
  if (!key) { pedirClave("Para empezar, pega tu clave de Claude y da «Conectar»."); return false; }
  if (f) {
    const dias = Math.floor((Date.now() - f) / 86400000);
    if (dias >= 25) estado("Tu clave tiene " + dias + " días. Si caduca, el panel te pedirá la nueva.");
  }
  return true;
}
function pedirClave(msg) {
  tab("t5");
  $("bienvenida").hidden = false;
  $("apiKey").value = "";
  try { $("apiKey").focus(); } catch (e) {}
  estado(msg, "error");
}

// ------------------------------------------------------------------ Claude
// Modelos que aceptan el respaldo del servidor cuando el filtro de seguridad rechaza
// (a veces pasa con textos religiosos que mencionan sangre, muerte, etc.).
const CON_RESPALDO = /^claude-(sonnet-5-5|opus-5-5|opus-5|fable-5)/;
const espera = (ms) => new Promise(r => setTimeout(r, ms));

async function claude(system, content, maxTokens) {
  const key = cfg("apiKey", "");
  if (!key) { pedirClave("Falta la clave de Claude: pégala aquí y da «Conectar»."); throw new Error("Falta la clave de Claude."); }
  const model = cfg("modelo", MODELO_DEF);
  let respaldo = CON_RESPALDO.test(model);
  for (let intento = 0; intento < 4; intento++) {
    const headers = { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
    const body = { model, max_tokens: maxTokens || 32000, system, messages: [{ role: "user", content }] };
    if (respaldo) { headers["anthropic-beta"] = "server-side-fallback-2026-07-01"; body.fallbacks = "default"; }
    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(body) });
    } catch (e) {
      if (intento < 2) { estado("Sin conexión con Claude, reintentando...", "trabajando"); await espera(4000); continue; }
      throw new Error("No hay conexión con Claude. Revisa el internet.");
    }
    const txt = await res.text();
    if (res.status === 401 || res.status === 403) {
      pedirClave("La clave ya no sirve (venció o la revocaron). Pega la nueva y da «Conectar».");
      throw new Error("Clave vencida o inválida.");
    }
    if (res.status === 400 && respaldo && /fallback/i.test(txt)) { respaldo = false; continue; }
    if ((res.status === 429 || res.status >= 500) && intento < 3) {
      estado("Claude está ocupado, reintento en unos segundos...", "trabajando");
      await espera(5000 * (intento + 1)); continue;
    }
    if (res.status === 400 && /credit balance/i.test(txt)) throw new Error("tu cuenta de Claude se quedó sin saldo. Recárgala en console.anthropic.com.");
    if (res.status === 404 && /model/i.test(txt)) throw new Error("ese modelo ya no existe. Elige otro en Ajustes.");
    if (!res.ok) throw new Error("la API respondió " + res.status + ": " + txt.slice(0, 300));
    const j = JSON.parse(txt);
    registrarUso(j.model || model, j.usage);
    if (j.stop_reason === "refusal") throw new Error("Claude no quiso procesar este contenido. Prueba otro modelo en Ajustes o pega el texto a mano.");
    const out = (j.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
    if (j.stop_reason === "max_tokens") throw new Error("la respuesta salió cortada (programa muy largo). Intenta por partes.");
    return out;
  }
  throw new Error("Claude no respondió después de varios intentos.");
}

// ------------------------------------------------------------------ archivos
const EXT_OK = ["jpg", "jpeg", "png", "pdf", "docx", "txt"];
async function agregarArchivos() {
  const files = await fsys.getFileForOpening({ allowMultiple: true, types: EXT_OK });
  if (!files || !files.length) return;
  for (const f of files) await leerArchivo(f);
  pintarArchivos();
}
async function leerArchivo(f) {
  const ext = f.name.split(".").pop().toLowerCase();
  if (EXT_OK.indexOf(ext) < 0) { estado("No sé leer " + f.name + ". Usa fotos JPG/PNG, PDF, Word o TXT.", "error"); return; }
  try {
    if (ext === "txt") {
      S.archivos.push({ nombre: f.name, tipo: "texto", texto: await f.read({ format: fmts.utf8 }) });
    } else if (ext === "docx") {
      if (!JSZipLib) throw new Error("no cargó el lector de Word");
      const zip = await JSZipLib.loadAsync(await f.read({ format: fmts.binary }));
      const xml = await zip.file("word/document.xml").async("string");
      const texto = xml.replace(/<w:tab\/>/g, "\t").replace(/<w:br\/>/g, "\n").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
      S.archivos.push({ nombre: f.name, tipo: "texto", texto });
    } else {
      let buf = await f.read({ format: fmts.binary });
      let mt = ext === "pdf" ? "application/pdf" : (ext === "png" ? "image/png" : "image/jpeg");
      // fotos de celular: la API acepta hasta 5 MB por imagen; InDesign la reduce
      if (mt !== "application/pdf" && buf.byteLength > 3500000) {
        estado("Reduciendo " + f.name + "...", "trabajando");
        buf = await reducirImagen(f.nativePath); mt = "image/jpeg";
      }
      S.archivos.push({ nombre: f.name, tipo: mt, data: b64(buf) });
    }
    estado("Agregué " + f.name + ".");
  } catch (e) { estado("No pude leer " + f.name + ": " + e.message, "error"); }
}
function pintarArchivos() {
  const c = $("archivos");
  c.innerHTML = S.archivos.map((a, i) => '<div class="arch"><span>' + esc(a.nombre) + '<span class="tipo">' +
    (a.tipo === "texto" ? "texto" : a.tipo === "application/pdf" ? "PDF" : "foto") + '</span></span><button data-i="' + i + '" title="Quitar">×</button></div>').join("");
  c.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { S.archivos.splice(Number(b.getAttribute("data-i")), 1); pintarArchivos(); }));
}
// arrastrar desde el Explorador de Windows (si esta version de InDesign lo permite)
async function soltarArchivos(e) {
  e.preventDefault(); $("soltar").classList.remove("encima");
  const lista = (e.dataTransfer && e.dataTransfer.files) || [];
  let n = 0;
  for (let i = 0; i < lista.length; i++) {
    const it = lista[i];
    try {
      const ruta = it.nativePath || it.path;
      const ent = it.read ? it : (ruta ? await fsys.getEntryWithUrl("file:" + ruta) : null);
      if (ent) { await leerArchivo(ent); n++; }
    } catch (err) {}
  }
  if (!n) { estado("No pude tomar esos archivos así. Da clic en el recuadro para buscarlos.", "error"); return; }
  pintarArchivos();
}

// ------------------------------------------------------------------ 1) leer
async function leer() {
  const content = [];
  for (const a of S.archivos) {
    if (a.tipo === "texto") content.push({ type: "text", text: "Archivo " + a.nombre + ":\n" + a.texto });
    else if (a.tipo === "application/pdf") content.push({ type: "document", source: { type: "base64", media_type: a.tipo, data: a.data } });
    else content.push({ type: "image", source: { type: "base64", media_type: a.tipo, data: a.data } });
  }
  const pegado = $("txtPegado").value.trim();
  if (pegado) content.push({ type: "text", text: "Texto/notas del disenador:\n" + pegado });
  if (!content.length) { estado("Agrega archivos o pega el texto.", "error"); return; }
  if (!revisarClave()) return;
  content.push({ type: "text", text: "Transcribe el programa completo al marcado y lista los avisos. Ano actual de referencia: " + new Date().getFullYear() + "." });
  estado("Leyendo con Claude... (tarda 1 o 2 minutos)", "trabajando");
  const r = jsonDe(await claude(SYS_LEER, content, 32000));
  $("marcado").value = r.marcado || ""; setCfg("marcado", $("marcado").value);
  S.avisos = (r.avisos || []).map(a => Object.assign({ origen: "Claude" }, a)).concat(revisarFechas($("marcado").value));
  pintarAvisos(); tab("t2"); marcarPasos();
  estado(S.avisos.length ? "Listo. Hay " + S.avisos.length + " aviso(s): revísalos antes de diseñar." : "Listo. Sin avisos; revisa el texto y pasa a diseñar.", "ok");
}
function pintarAvisos() {
  const c = $("avisos");
  if (!S.avisos.length) { c.innerHTML = '<div class="vacio">Sin avisos.</div>'; return; }
  const nombres = { fecha: "Fecha", ortografia: "Ortografía", inconsistencia: "No cuadra", ilegible: "Ilegible", duda: "Duda" };
  c.innerHTML = S.avisos.map(a => '<div class="aviso ' + (a.tipo === "fecha" ? "fecha" : "") + '"><div class="et">' + esc((nombres[a.tipo] || a.tipo || "Aviso") + " · " + a.origen) +
    "</div>" + esc(a.texto) + (a.sugerencia ? '<div class="sug">Sugerencia: ' + esc(a.sugerencia) + "</div>" : "") + "</div>").join("");
}

// ------------------------------------------------------------------ puente con ExtendScript
// JSON que ExtendScript (ES3) acepta: los separadores de linea U+2028/U+2029 rompen sus cadenas
const SEP_L = String.fromCharCode(0x2028), SEP_P = String.fromCharCode(0x2029);
const ESC_L = "\\" + "u2028", ESC_P = "\\" + "u2029";
function es3(o) { return JSON.stringify(o).split(SEP_L).join(ESC_L).split(SEP_P).join(ESC_P); }
// Corre ExtendScript en InDesign y devuelve el texto que deja el script.
// El motor tambien lo guarda en una etiqueta de la aplicacion, por si doScript no regresa nada.
function extend(code) {
  try { app.insertLabel("programasia_result", ""); } catch (e) {}
  let r = app.doScript(code, indesign.ScriptLanguage.JAVASCRIPT);
  r = (r === undefined || r === null) ? "" : String(r);
  if (!r) { try { r = String(app.extractLabel("programasia_result") || ""); } catch (e) {} }
  return r;
}
async function reducirImagen(ruta) {
  const tmp = await fsys.getTemporaryFolder();
  const f = await tmp.createFile("foto_reducida_programas_ia.jpg", { overwrite: true });
  const code = [
    'var r = "ok", ui = app.scriptPreferences.userInteractionLevel;',
    'app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;',
    'var d = app.documents.add(false);',
    'try {',
    '  d.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.MILLIMETERS; d.viewPreferences.verticalMeasurementUnits = MeasurementUnits.MILLIMETERS;',
    '  var pg = d.pages[0], fr = pg.rectangles.add({ geometricBounds: [0, 0, 100, 100] });',
    '  fr.place(File(' + es3(ruta) + ')); var g = fr.graphics[0], b = g.geometricBounds, w = b[3] - b[1], h = b[2] - b[0];',
    '  d.documentPreferences.pageWidth = w; d.documentPreferences.pageHeight = h;',
    '  fr.geometricBounds = [0, 0, h, w]; g.geometricBounds = [0, 0, h, w];',
    '  app.jpegExportPreferences.jpegExportRange = ExportRangeOrAllPages.EXPORT_ALL;',
    '  app.jpegExportPreferences.exportResolution = Math.max(36, Math.min(300, 2200 / (Math.max(w, h) / 25.4)));',
    '  app.jpegExportPreferences.jpegQuality = JPEGOptionsQuality.HIGH;',
    '  d.exportFile(ExportFormat.JPG, File(' + es3(f.nativePath) + '));',
    '} catch (e) { r = "ERROR|" + e.message; }',
    'd.close(SaveOptions.NO); app.scriptPreferences.userInteractionLevel = ui; r;'
  ].join("\n");
  const r = extend(code);
  if (r !== "ok") throw new Error("no pude reducir la foto (" + r + ")");
  return await f.read({ format: fmts.binary });
}

// ------------------------------------------------------------------ tamaños de papel
function listaFormatos() {
  return cfg("formatos", DEF_FORMATOS).split(/\r?\n/).map(l => l.split("|").map(s => s.trim())).filter(p => p.length >= 3 && parseFloat(p[1]) > 0)
    .map(p => ({ nombre: p[0], ancho: parseFloat(p[1]), alto: parseFloat(p[2]), sangrado: parseFloat(p[3] || "0") || 0 }));
}
function guardarFormatos(lista) {
  setCfg("formatos", lista.map(f => [f.nombre, f.ancho, f.alto, f.sangrado || 0].join(" | ")).join("\n"));
  llenarFormatos();
}
function pintarEditorFormatos() {
  const c = $("formatos"), lista = listaFormatos();
  c.innerHTML = '<div class="formato-cab"><span>Nombre</span><span>Ancho</span><span>Alto</span><span>Sangr.</span><span></span></div>' +
    lista.map((f, i) => '<div class="formato" data-i="' + i + '"><input class="f-nom" value="' + esc(f.nombre) + '">' +
      '<input class="f-num" value="' + f.ancho + '"><input class="f-num" value="' + f.alto + '"><input class="f-num" value="' + f.sangrado + '">' +
      '<button title="Quitar este tamaño">×</button></div>').join("");
  c.querySelectorAll(".formato").forEach(row => {
    const leerFila = () => {
      const v = row.querySelectorAll("input");
      return { nombre: v[0].value.trim() || "Sin nombre", ancho: parseFloat(v[1].value), alto: parseFloat(v[2].value), sangrado: parseFloat(v[3].value) || 0 };
    };
    row.querySelectorAll("input").forEach(inp => inp.addEventListener("change", () => {
      const l = listaFormatos(), f = leerFila(), i = Number(row.getAttribute("data-i"));
      if (!(f.ancho > 0) || !(f.alto > 0)) { estado("Ancho y alto van en milímetros, por ejemplo 330.3", "error"); return; }
      if (f.ancho > f.alto) { const t = f.ancho; f.ancho = f.alto; f.alto = t; estado("Lo puse en vertical (" + f.ancho + " x " + f.alto + ")."); }
      l[i] = f; guardarFormatos(l); pintarEditorFormatos();
    }));
    row.querySelector("button").addEventListener("click", () => {
      const l = listaFormatos();
      if (l.length <= 1) { estado("Deja al menos un tamaño.", "error"); return; }
      l.splice(Number(row.getAttribute("data-i")), 1); guardarFormatos(l); pintarEditorFormatos();
    });
  });
}
function llenarFormatos() {
  const sel = $("formato"), prev = cfg("formatoSel", "0");
  sel.innerHTML = "";
  listaFormatos().forEach((f, i) => {
    const o = document.createElement("option"); o.value = String(i);
    o.textContent = f.nombre + " · " + f.ancho + " × " + f.alto + " mm"; sel.appendChild(o);
  });
  sel.value = prev;
}
async function importarMedidas() {
  const f = await fsys.getFileForOpening({ types: ["txt"] });
  if (!f) return;
  const txt = await f.read({ format: fmts.utf8 });
  const lista = [];
  let nombre = null;
  txt.split(/\r?\n/).forEach(l => {
    if (/\.indd\s*$/i.test(l.trim())) { nombre = l.trim().replace(/\.indd$/i, "").replace(/PLANTILLA ENV[IÍ]OS/i, "").trim(); return; }
    const m = /area de papel:\s*([\d.]+)\s*x\s*([\d.]+)/i.exec(l);
    if (m && nombre) {
      const a = parseFloat(m[1]), b = parseFloat(m[2]), pag = /Pagina\s+(\d+)/i.exec(l);
      lista.push({ nombre: nombre + (pag && pag[1] !== "1" ? " p" + pag[1] : ""), ancho: Math.min(a, b), alto: Math.max(a, b), sangrado: 0 });
    }
  });
  if (!lista.length) { estado("No encontré medidas en ese archivo. Córrelo de nuevo con MedidasPlantillas.jsx.", "error"); return; }
  guardarFormatos(lista); pintarEditorFormatos();
  estado("Traje " + lista.length + " tamaños de tus plantillas. Revisa los nombres.", "ok");
}

// ------------------------------------------------------------------ 3) generar
async function rutaPlugin(sub, nombre) {
  const pf = await fsys.getPluginFolder();
  const d = sub ? await pf.getEntry(sub) : pf;
  return nombre ? (await d.getEntry(nombre)) : d;
}
function columnasUI() { const b = document.querySelector("#pColumnas button.on"); return b ? b.getAttribute("data-v") : ""; }
function ponerColumnas(v) { document.querySelectorAll("#pColumnas button").forEach(b => b.classList.toggle("on", b.getAttribute("data-v") === String(v || ""))); }
function paramsUI() {
  const p = Object.assign({}, S.params);
  const col = columnasUI(); if (col) p.columnas = parseInt(col, 10); else delete p.columnas;
  p.mostrar_objetivo = $("pObjetivo").checked;
  p.mostrar_mensaje = $("pMensaje").checked;
  p.mostrar_lema = $("pLema").checked;
  p.lineas_columnas = $("pLineas").checked;
  return p;
}
function mostrarResultado(texto, mal) {
  const r = $("resultado"); r.hidden = false; r.className = "resultado" + (mal ? " mal" : ""); r.textContent = texto;
}
async function generar() {
  const fms = listaFormatos(), fi = parseInt($("formato").value || "0", 10);
  if (!fms.length) { estado("No hay tamaños de papel. Agrégalos en Ajustes.", "error"); return false; }
  setCfg("formatoSel", String(fi));
  const marcado = $("marcado").value; setCfg("marcado", marcado);
  if (!marcado.trim()) { estado("No hay programa. Léelo en el paso 1 o pégalo en el 2.", "error"); return false; }
  const datos = parseMarcado(marcado);
  if (!datos.prog.length && !datos.enc.nombre) { estado("El marcado no tiene claves reconocibles (NOMBRE:, DIA:, EVENTO:...). Ve «¿Cómo se escribe?» en el paso 2.", "error"); return false; }
  try { await revisarFuentes(true); } catch (e) { estado("No pude revisar las fuentes (" + e.message + "). Genero de todos modos...", "trabajando"); }
  estado("Generando el diseño en InDesign...", "trabajando");
  const engine = await (await rutaPlugin(null, "engine.jsx")).read();
  const A = {};
  for (const [k, n] of [["esquina", "esquina.pdf"], ["banda_h", "banda_h.pdf"], ["banda_v", "banda_v.pdf"], ["div_izq", "divisor_izq.pdf"], ["div_der", "divisor_der.pdf"]])
    A[k] = (await rutaPlugin("assets", n)).nativePath;
  const DATA = {
    formato: fms[fi] || fms[0], enc: datos.enc, prog: datos.prog, params: paramsUI(), assets: A, cerrarId: S.docId,
    fuentes: { titulo: cfg("fTit", "Pinyon Script"), display: cfg("fDis", "Playfair Display"), texto: cfg("fTxt", "Lora") }
  };
  // con funcion para que un "$" del programa no se tome como patron de reemplazo
  const code = engine.replace("/*__DATA__*/", () => "var DATA = " + es3(DATA) + ";");
  const r = extend(code);
  if (r.indexOf("OK") !== 0) { mostrarResultado("No se pudo generar: " + (r || "InDesign no regresó respuesta."), true); estado("Error del generador.", "error"); return false; }
  const kv = {}; r.split("|").slice(1).forEach(p => { const i = p.indexOf("="); kv[p.slice(0, i)] = p.slice(i + 1); });
  S.docId = kv.id; setCfg("docId", kv.id);
  const avisos = kv.aviso ? kv.aviso.split(" // ") : [];
  mostrarResultado((kv.desborde === "1" ? "¡Ojo! No cupo todo el texto. Quita el objetivo o el mensaje, o pide letra más chica.\n" : "Diseño listo.\n") +
    "Texto del programa a " + kv.cuerpo + " pt." + (avisos.length ? "\n" + avisos.join("\n") : ""), kv.desborde === "1");
  estado("Diseño listo.", "ok");
  marcarPasos();
  return true;
}

// ------------------------------------------------------------------ 4) corregir
function docVivo() {
  if (!S.docId) return false;
  try { return app.documents.itemByID(Number(S.docId)).isValid; } catch (e) { return false; }
}
async function vistaJPG() {
  const tmp = await fsys.getTemporaryFolder();
  const f = await tmp.createFile("vista_programas_ia.jpg", { overwrite: true });
  const code = 'var d = app.documents.itemByID(' + Number(S.docId) + ');' +
    'app.jpegExportPreferences.exportResolution = 72; app.jpegExportPreferences.jpegQuality = JPEGOptionsQuality.MEDIUM;' +
    'app.jpegExportPreferences.jpegExportRange = ExportRangeOrAllPages.EXPORT_ALL;' +
    'd.exportFile(ExportFormat.JPG, File(' + es3(f.nativePath) + ')); "ok";';
  extend(code);
  return b64(await f.read({ format: fmts.binary }));
}
function pintarChat() {
  $("chat").innerHTML = S.chat.map(c => '<div class="msg ' + c.quien + '">' + esc(c.texto) + "</div>").join("");
}
async function corregir() {
  const instr = $("txtCorr").value.trim();
  if (!instr) { estado("Escribe qué quieres cambiar, o toca una sugerencia.", "error"); return; }
  if (!revisarClave()) return;
  S.chat.push({ quien: "yo", texto: instr }); pintarChat(); $("txtCorr").value = ""; crecer($("txtCorr"));
  estado("Pidiendo el cambio a Claude...", "trabajando");
  const content = [];
  if ($("cVista").checked && docVivo()) {
    try { content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: await vistaJPG() } }); } catch (e) {}
  }
  const previas = S.chat.slice(0, -1).slice(-8).map(c => (c.quien === "yo" ? "Diseñador: " : "Tú: ") + c.texto).join("\n");
  content.push({ type: "text", text: (previas ? "CORRECCIONES ANTERIORES (ya aplicadas):\n" + previas + "\n\n" : "") +
    "INSTRUCCION DEL DISENADOR:\n" + instr + "\n\nPARAMETROS ACTUALES:\n" + JSON.stringify(paramsUI()) + "\n\nMARCADO ACTUAL:\n" + $("marcado").value });
  const r = jsonDe(await claude(SYS_CORREGIR, content, 32000));
  let nota = r.explicacion || "Hecho.";
  if (r.marcado) {
    const antes = $("marcado").value.split(/\r?\n/).filter(l => l.trim()), despues = r.marcado.split(/\r?\n/).filter(l => l.trim());
    const cambiadas = despues.filter(l => antes.indexOf(l) < 0).length + Math.max(0, antes.length - despues.length);
    $("marcado").value = r.marcado; setCfg("marcado", r.marcado);
    nota += "\n(Cambió el texto: " + cambiadas + " línea(s). Revísalo en el paso 2.)";
    S.avisos = S.avisos.filter(a => a.origen !== "Fechas").concat(revisarFechas(r.marcado)); pintarAvisos();
  }
  if (r.params) {
    Object.assign(S.params, r.params);
    if (r.params.columnas) ponerColumnas(r.params.columnas);
    ["objetivo", "mensaje", "lema"].forEach(k => { if (r.params["mostrar_" + k] !== undefined) $("p" + k[0].toUpperCase() + k.slice(1)).checked = !!r.params["mostrar_" + k]; });
    if (r.params.lineas_columnas !== undefined) $("pLineas").checked = !!r.params.lineas_columnas;
    setCfg("params", JSON.stringify(S.params));
  }
  S.chat.push({ quien: "ia", texto: nota }); pintarChat();
  await generar();
}
function reiniciarParams() {
  S.params = {}; setCfg("params", "{}");
  ponerColumnas(""); ["pObjetivo", "pMensaje", "pLema", "pLineas"].forEach(id => $(id).checked = true);
  estado("Diseño de vuelta a lo normal. Da «Generar diseño».", "ok");
}

// ------------------------------------------------------------------ exportar PDF
// Preset propio: PDF/X-1a, sin marcas, con el sangrado del documento (si tiene).
async function exportarPDF() {
  if (!docVivo()) { estado("Primero genera el diseño.", "error"); return; }
  const f = await fsys.getFileForSaving("reverso.pdf", { types: ["pdf"] });
  if (!f) return;
  estado("Exportando PDF...", "trabajando");
  const code = [
    'var d = app.documents.itemByID(' + Number(S.docId) + ');',
    'var pr = app.pdfExportPresets.itemByName("Programas IA CTP");',
    'if (!pr.isValid) { try { pr = app.pdfExportPresets.add({ name: "Programas IA CTP" }); } catch (e) { pr = app.pdfExportPresets.itemByName("[PDF/X-1a:2001]"); } }',
    'var props = { standardsCompliance: PDFXStandards.PDFX1A2001_STANDARD, useDocumentBleedWithPDF: true, cropMarks: false, bleedMarks: false,',
    '  registrationMarks: false, colorBars: false, pageInformationMarks: false, includeSlugWithPDF: false, exportReaderSpreads: false, viewPDF: false };',
    'for (var p in props) { try { pr[p] = props[p]; } catch (e) {} }',
    'd.exportFile(ExportFormat.PDF_TYPE, File(' + es3(f.nativePath) + '), false, pr); "ok";'
  ].join("\n");
  const r = extend(code);
  if (r === "ok") estado("PDF guardado: " + f.nativePath, "ok"); else estado("Error al exportar: " + r, "error");
}

// ------------------------------------------------------------------ arranque y eventos
function cargarAjustes() {
  $("apiKey").value = cfg("apiKey", "");
  $("fTit").value = cfg("fTit", "Pinyon Script");
  $("fDis").value = cfg("fDis", "Playfair Display");
  $("fTxt").value = cfg("fTxt", "Lora");
  $("marcado").value = cfg("marcado", "");
  try { S.params = JSON.parse(cfg("params", "{}")); } catch (e) { S.params = {}; }
  S.docId = cfg("docId", "") || null;
  if (S.params.columnas) ponerColumnas(S.params.columnas);
  llenarFormatos(); pintarEditorFormatos(); pintarUso(); marcarPasos();
  const o = document.createElement("option"); o.value = cfg("modelo", MODELO_DEF); o.textContent = o.value; $("modelo").appendChild(o);
  infoModelo();
  if (revisarClave()) {
    $("estadoClave").textContent = "Clave guardada.";
    cargarModelos().catch(e => { $("estadoClave").textContent = e.message; });
  }
}

document.querySelectorAll(".paso").forEach(b => b.addEventListener("click", () => { tab(b.getAttribute("data-t")); marcarPasos(); }));
$("chipUso").addEventListener("click", () => tab("t5"));
$("soltar").addEventListener("click", accion(agregarArchivos, "Elige los archivos..."));
$("soltar").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") $("soltar").click(); });
$("soltar").addEventListener("dragover", e => { e.preventDefault(); $("soltar").classList.add("encima"); });
$("soltar").addEventListener("dragleave", () => $("soltar").classList.remove("encima"));
$("soltar").addEventListener("drop", e => soltarArchivos(e).catch(err => estado("Error: " + err.message, "error")));
$("lnkSaltar").addEventListener("click", e => { e.preventDefault(); tab("t2"); });
$("bLeer").addEventListener("click", accion(leer, "Leyendo con Claude..."));
$("bFechas").addEventListener("click", () => {
  S.avisos = S.avisos.filter(a => a.origen !== "Fechas").concat(revisarFechas($("marcado").value)); pintarAvisos();
  setCfg("marcado", $("marcado").value);
  const n = S.avisos.filter(a => a.origen === "Fechas").length;
  estado(n ? "Encontré " + n + " cosa(s) en las fechas." : "Las fechas cuadran con los días.", n ? "" : "ok");
});
$("bIrDiseno").addEventListener("click", () => { setCfg("marcado", $("marcado").value); tab("t3"); marcarPasos(); });
$("bAyuda").addEventListener("click", () => { const a = $("ayuda"); a.hidden = !a.hidden; a.textContent = FORMATO_MARCADO; });
document.querySelectorAll("#pColumnas button").forEach(b => b.addEventListener("click", () => ponerColumnas(b.getAttribute("data-v"))));
$("bGenerar").addEventListener("click", accion(generar, "Generando el diseño..."));
$("bPDF").addEventListener("click", accion(exportarPDF, "Exportando..."));
$("bReiniciar").addEventListener("click", reiniciarParams);
document.querySelectorAll("#sugerencias button").forEach(b => b.addEventListener("click", () => {
  const t = $("txtCorr"); t.value = (t.value.trim() ? t.value.trim() + ". " : "") + b.textContent; crecer(t); try { t.focus(); } catch (e) {}
}));
$("bCorregir").addEventListener("click", accion(corregir, "Pidiendo el cambio..."));
$("bConectar").addEventListener("click", accion(conectar, "Probando la clave..."));
$("bVerClave").addEventListener("click", () => { const k = $("apiKey"); const ver = k.type === "password"; k.type = ver ? "text" : "password"; $("bVerClave").textContent = ver ? "Ocultar" : "Ver"; });
$("modelo").addEventListener("change", () => { setCfg("modelo", $("modelo").value); infoModelo(); estado("Modelo guardado.", "ok"); });
$("bConsola").addEventListener("click", () => abrirWeb("https://console.anthropic.com/usage"));
document.querySelectorAll("[data-url]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); abrirWeb(a.getAttribute("data-url")); }));
$("bMedidas").addEventListener("click", accion(importarMedidas, "Elige MEDIDAS_PLANTILLAS.txt..."));
$("bAgregarFormato").addEventListener("click", () => { const l = listaFormatos(); l.push({ nombre: "Nuevo tamaño", ancho: 215.9, alto: 279.4, sangrado: 0 }); guardarFormatos(l); pintarEditorFormatos(); });
["fTit", "fDis", "fTxt"].forEach(id => $(id).addEventListener("change", () => { setCfg(id, $(id).value.trim()); estado("Fuente guardada.", "ok"); }));
$("bFuentes").addEventListener("click", accion(() => revisarFuentes(false), "Revisando fuentes..."));
["txtPegado", "marcado", "txtCorr"].forEach(id => $(id).addEventListener("input", () => crecer($(id))));
$("marcado").addEventListener("change", () => { setCfg("marcado", $("marcado").value); marcarPasos(); });

cargarAjustes();
