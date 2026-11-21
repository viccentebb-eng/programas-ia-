// =====================================================================
//  PROGRAMAS IA - panel para InDesign (UXP)
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
  chat: []
};

// ------------------------------------------------------------------ ajustes
const DEF_FORMATOS = "Una carpeta oficio (Atemajac 2027) | 330.298 | 464.989 | 0";
function cfg(k, d) { try { const v = localStorage.getItem("pia_" + k); return v === null ? d : v; } catch (e) { return d; } }
function setCfg(k, v) { try { localStorage.setItem("pia_" + k, v); } catch (e) {} }

function cargarAjustes() {
  $("apiKey").value = cfg("apiKey", "");
  $("modelo").value = cfg("modelo", "claude-sonnet-5-5");
  $("formatos").value = cfg("formatos", DEF_FORMATOS);
  $("fTit").value = cfg("fTit", "Pinyon Script");
  $("fDis").value = cfg("fDis", "Playfair Display");
  $("fTxt").value = cfg("fTxt", "Lora");
  $("marcado").value = cfg("marcado", "");
  try { S.params = JSON.parse(cfg("params", "{}")); } catch (e) { S.params = {}; }
  S.docId = cfg("docId", "") || null;
  llenarFormatos();
  revisarClave();
}
function revisarClave() {
  const key = cfg("apiKey", ""), f = parseInt(cfg("apiKeyFecha", "0"), 10);
  if (!key) { pedirClave("Para empezar, pega tu clave de API de Claude y da Guardar."); return; }
  if (f) {
    const dias = Math.floor((Date.now() - f) / 86400000);
    if (dias >= 25) estado("Aviso: tu clave de API tiene " + dias + " días. Si caduca, el panel te pedirá la nueva.");
  }
}
function pedirClave(msg) {
  tab("t5");
  $("apiKey").value = "";
  try { $("apiKey").focus(); } catch (e) {}
  estado(msg);
}
function guardarAjustes() {
  const nueva = $("apiKey").value.trim();
  if (nueva && nueva !== cfg("apiKey", "")) setCfg("apiKeyFecha", String(Date.now()));
  setCfg("apiKey", nueva);
  setCfg("modelo", $("modelo").value.trim() || "claude-sonnet-5-5");
  setCfg("formatos", $("formatos").value);
  setCfg("fTit", $("fTit").value.trim()); setCfg("fDis", $("fDis").value.trim()); setCfg("fTxt", $("fTxt").value.trim());
  llenarFormatos();
  estado("Ajustes guardados.");
}
function listaFormatos() {
  return $("formatos").value.split(/\r?\n/).map(l => l.split("|").map(s => s.trim())).filter(p => p.length >= 3 && parseFloat(p[1]) > 0)
    .map(p => ({ nombre: p[0], ancho: parseFloat(p[1]), alto: parseFloat(p[2]), sangrado: parseFloat(p[3] || "0") || 0 }));
}
function llenarFormatos() {
  const sel = $("formato"), prev = cfg("formatoSel", "0");
  sel.innerHTML = "";
  listaFormatos().forEach((f, i) => {
    const o = document.createElement("option"); o.value = String(i);
    o.textContent = f.nombre + " (" + f.ancho + " x " + f.alto + ")"; sel.appendChild(o);
  });
  sel.value = prev;
}

// ------------------------------------------------------------------ utilidades
function estado(t) { $("estado").textContent = t; }
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
function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function jsonDe(texto) {
  const a = texto.indexOf("{"), b = texto.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("Claude no devolvio JSON.");
  return JSON.parse(texto.slice(a, b + 1));
}

// ------------------------------------------------------------------ Claude
// Modelos que aceptan el respaldo del servidor cuando el filtro de seguridad rechaza
// (a veces pasa con textos religiosos que mencionan sangre, muerte, etc.).
const CON_RESPALDO = /^claude-(sonnet-5-5|opus-5-5|opus-5|fable-5)/;
const espera = (ms) => new Promise(r => setTimeout(r, ms));

async function claude(system, content, maxTokens) {
  const key = cfg("apiKey", "");
  if (!key) { pedirClave("Falta la clave de API: pégala aquí y da Guardar."); throw new Error("Falta la clave de API."); }
  const model = cfg("modelo", "claude-sonnet-5-5");
  let respaldo = CON_RESPALDO.test(model);
  for (let intento = 0; intento < 4; intento++) {
    const headers = { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
    const body = { model, max_tokens: maxTokens || 32000, system, messages: [{ role: "user", content }] };
    if (respaldo) { headers["anthropic-beta"] = "server-side-fallback-2026-07-01"; body.fallbacks = "default"; }
    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(body) });
    } catch (e) {
      if (intento < 2) { estado("Sin conexión con Claude, reintentando..."); await espera(4000); continue; }
      throw new Error("No hay conexión con api.anthropic.com. Revisa el internet.");
    }
    const txt = await res.text();
    if (res.status === 401 || res.status === 403) {
      pedirClave("La clave de API ya no sirve (venció o la revocaron). Pega la nueva y da Guardar.");
      throw new Error("Clave de API vencida o inválida.");
    }
    if (res.status === 400 && respaldo && /fallback/i.test(txt)) { respaldo = false; continue; }
    if ((res.status === 429 || res.status >= 500) && intento < 3) {
      estado("Claude está ocupado, reintentando en unos segundos...");
      await espera(5000 * (intento + 1)); continue;
    }
    if (res.status === 400 && /credit balance/i.test(txt)) throw new Error("Tu cuenta de Claude se quedó sin saldo. Recárgala en console.anthropic.com.");
    if (!res.ok) throw new Error("API " + res.status + ": " + txt.slice(0, 400));
    const j = JSON.parse(txt);
    if (j.stop_reason === "refusal") throw new Error("Claude no quiso procesar este contenido. Intenta con otro modelo en Ajustes o pega el texto a mano.");
    const out = (j.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
    if (j.stop_reason === "max_tokens") throw new Error("La respuesta salió cortada (programa muy largo). Intenta por partes.");
    return out;
  }
  throw new Error("Claude no respondió después de varios intentos.");
}

const FORMATO_MARCADO = `FORMATO DEL MARCADO (una clave por linea, "CLAVE: valor"; las lineas que empiezan con # son comentarios)
# encabezado
PRE: frase antes del nombre (ej. Solemnes Fiestas en Honor a la)
NOMBRE: nombre de la imagen, santo o virgen (ej. Virgen de la Defensa)
FECHAS: fechas de la fiesta con ano (ej. Del 5 al 9 de diciembre del 2027)
ANIOS: aniversario, si lo hay (ej. 385 años)
LEMA: “lema con comillas tipograficas”
OBJETIVO: texto del objetivo
MENSAJE: texto del mensaje
PIE: lugar y fecha (ej. Atemajac de Brizuela, Jal. · Diciembre 2027)
# programa, en el orden del documento
CINTILLA: titulo de seccion en MAYUSCULAS (ej. DÍAS PREVIOS A LA FIESTA, DÍAS DE FIESTA, NOVENARIO DE VISITAS)
DIA: encabezado de dia en MAYUSCULAS (ej. DOMINGO 5)
EVENTO: hora | descripcion        (hora como 7:00 p.m.)
TEMA: “texto del tema de reflexion”
TEXTO: parrafo suelto
PREVIO: **Fecha o etiqueta:** descripcion        (con vineta)
SUBTITULO: subtitulo centrado
SUB2: segunda linea del subtitulo
LISTA: **Etiqueta:** texto        (lista con sangria, ej. dias del novenario)
NUM: texto de un punto numerado (se numera solo)
ORACION: Titulo | texto de la oracion        (va en recuadro)
MAYORDOMOS:
Ciudad: Nombre 1; Nombre 2; Nombre 3
Otra ciudad: Nombre
Solo usa **texto** para negritas. Claves opcionales que no existan, no las pongas.`;

const SYS_LEER = `Eres el asistente de un taller de diseno e impresion en Jalisco, Mexico, que hace los carteles (reversos con el programa) de fiestas patronales catolicas: virgenes, santos, Sagrada Familia, etc.
Recibiras fotos (a veces con letra a mano, tachones y notas), Word, PDF o texto con el programa de la fiesta.
Tu trabajo: transcribir TODO el contenido al marcado de abajo, fiel al original, y listar avisos.
Reglas:
- No inventes ni resumas. Conserva el orden.
- Corrige solo acentos y erratas evidentes (ej. "Llega de la Virgen" -> "Llegada de la Virgen", "al Virgen" -> "a la Virgen"); cada correccion no trivial va en avisos tipo "ortografia".
- Si hay tachones, usa el texto nuevo y avisalo. Si hay notas a mano, incorporalas y avisalo.
- Revisa fechas: dia de la semana contra fecha y ano, meses que no cuadran con el encabezado, horas raras (ej. 12:00 a.m. para algo de mediodia). Avisalo, no lo cambies a menos que sea obvio.
- Nombres propios (mayordomos, comunidades): no los cambies salvo acentos muy obvios, y avisalo.
- Horas con formato 7:00 a.m. / 7:00 p.m. Dias en MAYUSCULAS.
- Si algo es ilegible, pon [ILEGIBLE] y avisalo.
Responde SOLO con un JSON valido, sin texto alrededor:
{"marcado": "...todo el marcado...", "avisos": [{"tipo": "fecha|ortografia|inconsistencia|ilegible|duda", "texto": "que encontraste", "sugerencia": "que propones"}]}

${FORMATO_MARCADO}`;

const SYS_CORREGIR = `Eres el asistente de diseno de un taller que hace reversos de carteles religiosos en InDesign con un generador automatico.
El generador arma el diseno a partir de (1) un MARCADO con el texto y (2) PARAMETROS. Tu no mueves objetos: cambias el marcado y/o los parametros y el documento se vuelve a generar.
Parametros disponibles (pon solo los que cambian):
- escala_titulo (1 = normal; 1.15 = 15% mas grande), escala_encabezado (todo el encabezado), separacion_encabezado (1 = normal)
- columnas (2, 3 o 4), cuerpo_min y cuerpo_max (pt del texto del programa; el generador usa el mayor que quepa)
- espacio_dias (mm antes de cada dia, normal 2.6), espacio_cintilla (mm antes de cada cintilla, normal 4.2)
- sombra_dias, sombra_cintillas, sombra_mensaje (porcentaje de gris 0-40; 0 = sin sombra)
- lineas_columnas, balancear_columnas, mostrar_objetivo, mostrar_mensaje, mostrar_lema (true/false)
- ancho_ciudad (mm de la columna de ciudad en mayordomos, normal 29)
Si te piden cambiar o corregir texto, devuelve el marcado COMPLETO ya corregido. Si no cambia el texto, no mandes marcado.
Si algo no se puede hacer con esto, dilo en la explicacion y sugiere como hacerlo a mano en InDesign.
Responde SOLO con JSON: {"explicacion": "que hiciste, en una o dos frases", "marcado": "... (opcional)", "params": {... (opcional)}}

${FORMATO_MARCADO}`;

// ------------------------------------------------------------------ archivos
async function agregarArchivos() {
  const files = await fsys.getFileForOpening({ allowMultiple: true, types: ["jpg", "jpeg", "png", "pdf", "docx", "txt"] });
  if (!files || !files.length) return;
  for (const f of files) {
    const ext = f.name.split(".").pop().toLowerCase();
    try {
      if (ext === "txt") {
        S.archivos.push({ nombre: f.name, tipo: "texto", texto: await f.read({ format: fmts.utf8 }) });
      } else if (ext === "docx") {
        if (!JSZipLib) throw new Error("No cargo el lector de Word.");
        const buf = await f.read({ format: fmts.binary });
        const zip = await JSZipLib.loadAsync(buf);
        const xml = await zip.file("word/document.xml").async("string");
        const texto = xml.replace(/<w:tab\/>/g, "\t").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
        S.archivos.push({ nombre: f.name, tipo: "texto", texto });
      } else {
        let buf = await f.read({ format: fmts.binary });
        let mt = ext === "pdf" ? "application/pdf" : (ext === "png" ? "image/png" : "image/jpeg");
        // fotos de celular: la API acepta hasta 5 MB por imagen; InDesign la reduce
        if (mt !== "application/pdf" && buf.byteLength > 3500000) {
          estado("Reduciendo " + f.name + "...");
          buf = await reducirImagen(f.nativePath); mt = "image/jpeg";
        }
        S.archivos.push({ nombre: f.name, tipo: mt, data: b64(buf) });
      }
    } catch (e) { estado("No pude leer " + f.name + ": " + e.message); }
  }
  pintarArchivos();
}
function pintarArchivos() {
  $("archivos").innerHTML = S.archivos.map(a => "<div>&#8226; " + esc(a.nombre) + "</div>").join("") || "";
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
  if (!content.length) { estado("Agrega archivos o pega el texto."); return; }
  content.push({ type: "text", text: "Transcribe el programa completo al marcado y lista los avisos. Ano actual de referencia: " + new Date().getFullYear() + "." });
  estado("Leyendo con Claude... (puede tardar 1-2 minutos)");
  try {
    const r = jsonDe(await claude(SYS_LEER, content, 32000));
    $("marcado").value = r.marcado || ""; setCfg("marcado", $("marcado").value);
    S.avisos = (r.avisos || []).map(a => Object.assign({ origen: "Claude" }, a));
    S.avisos = S.avisos.concat(revisarFechas($("marcado").value));
    pintarAvisos(); tab("t2");
    estado("Listo. Revisa los avisos y el texto antes de diseñar.");
  } catch (e) { estado("Error: " + e.message); }
}

function pintarAvisos() {
  const c = $("avisos");
  if (!S.avisos.length) { c.innerHTML = '<div class="nota">Sin avisos.</div>'; return; }
  c.innerHTML = S.avisos.map(a => '<div class="aviso ' + (a.tipo === "fecha" ? "fecha" : "") + '"><small>' + esc(a.origen + " · " + (a.tipo || "")) + "</small><br>" + esc(a.texto) + (a.sugerencia ? "<br><small>Sugerencia: " + esc(a.sugerencia) + "</small>" : "") + "</div>").join("");
}

// ------------------------------------------------------------------ puente con ExtendScript
// JSON que ExtendScript (ES3) acepta: U+2028/U+2029 rompen sus cadenas
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

// ------------------------------------------------------------------ 3) generar
async function rutaPlugin(sub, nombre) {
  const pf = await fsys.getPluginFolder();
  const d = sub ? await pf.getEntry(sub) : pf;
  return nombre ? (await d.getEntry(nombre)) : d;
}
function paramsUI() {
  const p = Object.assign({}, S.params);
  const col = $("pColumnas").value; if (col) p.columnas = parseInt(col, 10);
  if (!$("pObjetivo").checked) p.mostrar_objetivo = false;
  if (!$("pMensaje").checked) p.mostrar_mensaje = false;
  if (!$("pLema").checked) p.mostrar_lema = false;
  if (!$("pLineas").checked) p.lineas_columnas = false;
  return p;
}
async function generar() {
  const fms = listaFormatos(), fi = parseInt($("formato").value || "0", 10);
  if (!fms.length) { estado("No hay formatos. Agrégalos en Ajustes."); return false; }
  setCfg("formatoSel", String(fi));
  const marcado = $("marcado").value; setCfg("marcado", marcado);
  if (!marcado.trim()) { estado("No hay programa. Primero léelo en la pestaña 1 o pégalo en la 2."); return false; }
  const datos = parseMarcado(marcado);
  if (!datos.prog.length && !datos.enc.nombre) { estado("El marcado no tiene claves reconocibles (NOMBRE:, DIA:, EVENTO:...). Da \"Ver formato\" en la pestaña 2."); return false; }
  estado("Generando diseño...");
  try {
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
    if (r.indexOf("OK") !== 0) { estado("Error del generador: " + (r || "InDesign no regresó respuesta.")); return false; }
    const kv = {}; r.split("|").slice(1).forEach(p => { const i = p.indexOf("="); kv[p.slice(0, i)] = p.slice(i + 1); });
    S.docId = kv.id; setCfg("docId", kv.id);
    estado("Diseño listo. Texto del programa a " + kv.cuerpo + " pt." + (kv.desborde === "1" ? "\n¡OJO! No cupo todo el texto." : "") + (kv.aviso ? "\n" + kv.aviso.split(" // ").join("\n") : ""));
    return true;
  } catch (e) { estado("Error: " + e.message); return false; }
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
  if (!instr) return;
  S.chat.push({ quien: "yo", texto: instr }); pintarChat(); $("txtCorr").value = "";
  estado("Pidiendo la corrección a Claude...");
  try {
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
      nota += "\n(Cambió el texto: " + cambiadas + " línea(s). Revísalo en la pestaña 2.)";
      S.avisos = S.avisos.filter(a => a.origen !== "Fechas").concat(revisarFechas(r.marcado)); pintarAvisos();
    }
    if (r.params) {
      Object.assign(S.params, r.params);
      if (r.params.columnas) $("pColumnas").value = String(r.params.columnas);
      ["objetivo", "mensaje", "lema"].forEach(k => { if (r.params["mostrar_" + k] !== undefined) $("p" + k[0].toUpperCase() + k.slice(1)).checked = !!r.params["mostrar_" + k]; });
      if (r.params.lineas_columnas !== undefined) $("pLineas").checked = !!r.params.lineas_columnas;
      setCfg("params", JSON.stringify(S.params));
    }
    S.chat.push({ quien: "ia", texto: nota }); pintarChat();
    await generar();
  } catch (e) { estado("Error: " + e.message); }
}
function reiniciarParams() {
  S.params = {}; setCfg("params", "{}");
  $("pColumnas").value = ""; ["pObjetivo", "pMensaje", "pLema", "pLineas"].forEach(id => $(id).checked = true);
  estado("Parámetros de diseño de vuelta a lo normal. Da \"Generar diseño\".");
}

// ------------------------------------------------------------------ exportar PDF
// Preset propio: PDF/X-1a, sin marcas, con el sangrado del documento (si tiene).
async function exportarPDF() {
  if (!docVivo()) { estado("Primero genera el diseño."); return; }
  const f = await fsys.getFileForSaving("reverso.pdf", { types: ["pdf"] });
  if (!f) return;
  const code = [
    'var d = app.documents.itemByID(' + Number(S.docId) + ');',
    'var pr = app.pdfExportPresets.itemByName("Programas IA CTP");',
    'if (!pr.isValid) { try { pr = app.pdfExportPresets.add({ name: "Programas IA CTP" }); } catch (e) { pr = app.pdfExportPresets.itemByName("[PDF/X-1a:2001]"); } }',
    'var props = { standardsCompliance: PDFXStandards.PDFX1A2001_STANDARD, useDocumentBleedWithPDF: true, cropMarks: false, bleedMarks: false,',
    '  registrationMarks: false, colorBars: false, pageInformationMarks: false, includeSlugWithPDF: false, exportReaderSpreads: false, viewPDF: false };',
    'for (var p in props) { try { pr[p] = props[p]; } catch (e) {} }',
    'd.exportFile(ExportFormat.PDF_TYPE, File(' + es3(f.nativePath) + '), false, pr); "ok";'
  ].join("\n");
  try { const r = extend(code); estado(r === "ok" ? "PDF guardado: " + f.nativePath : "Error al exportar: " + r); }
  catch (e) { estado("Error al exportar: " + e.message); }
}

// ------------------------------------------------------------------ importar medidas
async function importarMedidas() {
  const f = await fsys.getFileForOpening({ types: ["txt"] });
  if (!f) return;
  const txt = await f.read({ format: fmts.utf8 });
  const lineas = [];
  let nombre = null;
  txt.split(/\r?\n/).forEach(l => {
    if (/\.indd\s*$/i.test(l.trim())) { nombre = l.trim().replace(/\.indd$/i, "").replace(/PLANTILLA ENV[IÍ]OS/i, "").trim(); return; }
    const m = /area de papel:\s*([\d.]+)\s*x\s*([\d.]+)/i.exec(l);
    if (m && nombre) {
      let a = parseFloat(m[1]), b = parseFloat(m[2]);
      const w = Math.min(a, b), h = Math.max(a, b);   // el diseno va vertical
      const pag = /Pagina\s+(\d+)/i.exec(l);
      lineas.push(nombre + (pag && pag[1] !== "1" ? " p" + pag[1] : "") + " | " + w + " | " + h + " | 0");
    }
  });
  if (!lineas.length) { estado("No encontré medidas en ese archivo."); return; }
  $("formatos").value = lineas.join("\n");
  guardarAjustes();
  estado("Importé " + lineas.length + " formatos. Revisa nombres y sangrado en Ajustes.");
}

// ------------------------------------------------------------------ interfaz
function tab(id) {
  document.querySelectorAll(".tab").forEach(t => { if (t.id === id) t.classList.add("on"); else t.classList.remove("on"); });
  document.querySelectorAll(".tabs button").forEach(b => { if (b.getAttribute("data-t") === id) b.classList.add("on"); else b.classList.remove("on"); });
}
document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => tab(b.getAttribute("data-t"))));
$("bArchivos").addEventListener("click", () => agregarArchivos().catch(e => estado("Error: " + e.message)));
$("bLimpiar").addEventListener("click", () => { S.archivos = []; pintarArchivos(); });
$("bLeer").addEventListener("click", leer);
$("bFechas").addEventListener("click", () => {
  S.avisos = S.avisos.filter(a => a.origen !== "Fechas").concat(revisarFechas($("marcado").value)); pintarAvisos();
  setCfg("marcado", $("marcado").value); estado("Fechas revisadas.");
});
$("bAyuda").addEventListener("click", () => { const a = $("ayuda"); a.style.display = a.style.display === "none" ? "block" : "none"; a.textContent = FORMATO_MARCADO; });
$("bGenerar").addEventListener("click", async () => {
  try { if (!(await revisarFuentes(true))) return; } catch (e) { estado("No pude revisar las fuentes: " + e.message + ". Genero de todos modos..."); }
  generar();
});
$("bPDF").addEventListener("click", exportarPDF);
$("bCorregir").addEventListener("click", corregir);
$("bMedidas").addEventListener("click", () => importarMedidas().catch(e => estado("Error: " + e.message)));
$("bGuardar").addEventListener("click", guardarAjustes);
$("bFuentes").addEventListener("click", () => { guardarAjustes(); revisarFuentes(false).catch(e => estado("Error con las fuentes: " + e.message)); });
$("bReiniciar").addEventListener("click", reiniciarParams);
$("marcado").addEventListener("change", () => setCfg("marcado", $("marcado").value));

cargarAjustes();
