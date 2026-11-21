#!/usr/bin/env node
// =====================================================================
//  PROGRAMAS IA - conector MCP (sin dependencias)
//  Deja que Claude Desktop, Claude Code o Codex manejen el motor de
//  InDesign con la suscripcion del usuario, sin clave de API.
//  Protocolo: JSON-RPC 2.0 por stdin/stdout (una linea por mensaje).
//  Reusa los archivos del panel: engine.jsx, placa.jsx, marcado.js,
//  estilos.js, prompts.js y assets/.
// =====================================================================
const fs = require("fs"), path = require("path"), os = require("os"), vm = require("vm");
const { execFileSync } = require("child_process");

const BASE = process.env.PROGRAMAS_IA_DIR || path.resolve(__dirname, "..");
const PANEL = path.join(BASE, "ProgramasIA");
const DATOS = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "Programas IA");
const ESTADO = path.join(DATOS, "conector_estado.json");
const VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(PANEL, "manifest.json"), "utf8")).version; } catch (e) { return "?"; } })();

// ------------------------------------------------------------------ cargar piezas del panel
const leer = (n) => fs.readFileSync(path.join(PANEL, n), "utf8");
const { parseMarcado, revisarFechas } = require(path.join(PANEL, "marcado.js"));
const P = vm.runInNewContext(leer("prompts.js") + "\n;({ CASA, FORMATO_MARCADO, SYS_LEER, SYS_CORREGIR })", {});
const E = vm.runInNewContext(leer("estilos.js") + "\n;({ ESTILOS, estiloAutomatico, estiloPorId, REGLAS_ADORNOS, ADORNOS_FABRICA })",
  { cfg: (k, d) => d, setCfg: () => {} });
const DEF_FORMATOS = (() => {
  const m = /const DEF_FORMATOS = (\[[\s\S]*?\])\.join/.exec(leer("main.js"));
  return vm.runInNewContext(m[1]).map(l => l.split("|").map(s => s.trim())).map(p => ({
    nombre: p[0], ancho: +p[1], alto: +p[2], sangrado: +p[3] || 0,
    placa: p.length >= 10 ? { ancho: +p[4], alto: +p[5], sup: +p[6], inf: +p[7], izq: +p[8], der: +p[9] } : null
  }));
})();

// ------------------------------------------------------------------ InDesign por COM
// ExtendScript solo entiende ASCII seguro: todo lo demas va como \uXXXX
function es3(o) { return JSON.stringify(o).replace(/[\u007f-￿]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")); }
function indesign(codigo) {
  fs.mkdirSync(DATOS, { recursive: true });
  const archivo = path.join(os.tmpdir(), "programasia_conector_" + process.pid + ".jsx");
  fs.writeFileSync(archivo, "﻿" + codigo, "utf8");
  const ps = [
    "$ErrorActionPreference = 'Stop'",
    "[Console]::OutputEncoding = [Text.Encoding]::UTF8",
    "$id = $null; foreach ($p in 'InDesign.Application.2026','InDesign.Application') { try { $id = New-Object -ComObject $p; break } catch {} }",
    "if (-not $id) { 'ERROR|No pude abrir InDesign.'; exit }",
    "$code = 'var __r; try { __r = $.evalFile(File(\"" + archivo.replace(/\\/g, "/") + "\")); } catch (e) { __r = \"ERROR|\" + e + \" (linea \" + e.line + \")\"; } String(__r);'",
    "try { $id.DoScript($code, 1246973031) } catch { 'ERROR|' + $_.Exception.Message }"
  ].join("\n");
  try {
    return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8", timeout: 600000, windowsHide: true }).trim();
  } finally { try { fs.unlinkSync(archivo); } catch (e) {} }
}
function leerEstado() { try { return JSON.parse(fs.readFileSync(ESTADO, "utf8")); } catch (e) { return {}; } }
function guardarEstado(s) { fs.mkdirSync(DATOS, { recursive: true }); fs.writeFileSync(ESTADO, JSON.stringify(s, null, 1)); }
function kvDe(r) { const kv = {}; r.split("|").slice(1).forEach(p => { const i = p.indexOf("="); if (i > 0) kv[p.slice(0, i)] = p.slice(i + 1); }); return kv; }

function vistaJPG(docId, dpi) {
  const f = path.join(os.tmpdir(), "programasia_vista_" + process.pid + ".jpg").replace(/\\/g, "/");
  const r = indesign('var d = ' + (docId ? 'app.documents.itemByID(' + Number(docId) + ')' : 'app.activeDocument') + ';' +
    'if (!d.isValid) "ERROR|no hay documento"; else {' +
    'app.jpegExportPreferences.exportResolution = ' + (dpi || 72) + '; app.jpegExportPreferences.jpegQuality = JPEGOptionsQuality.HIGH;' +
    'app.jpegExportPreferences.jpegExportRange = ExportRangeOrAllPages.EXPORT_ALL;' +
    'd.exportFile(ExportFormat.JPG, File("' + f + '")); "ok"; }');
  if (r !== "ok") throw new Error("No pude ver la página: " + r);
  const b = fs.readFileSync(f).toString("base64"); try { fs.unlinkSync(f); } catch (e) {}
  return b;
}

// ------------------------------------------------------------------ guia para el modelo
const GUIA = `Eres el diseñador asistente del taller; manejas su motor de InDesign con estas herramientas.
${P.CASA}

Flujo de trabajo con estas herramientas:
1. Si te dan fotos, Word, PDF o texto del programa: transcríbelo al MARCADO (formato abajo) siguiendo las reglas de lectura. Muestra al usuario los avisos (fechas, ortografía, dudas). No inventes datos; todo cambio de texto se avisa.
2. Llama revisar_fechas con el marcado y comenta lo que salga.
3. Si no dijeron el tamaño, pregunta usando listar_formatos (ej. Doble oficio). El estilo se elige solo por el nombre; puedes forzarlo (listar_estilos).
4. Llama generar_reverso. Te regresa una imagen de la página: revísala con ojo de diseñador (texto encimado, horas desalineadas, espacio vacío, desbordes).
5. Si hay que corregir, cambia params o el marcado y vuelve a llamar generar_reverso (regenera el documento completo). Los retoques a mano se hacen al final en InDesign.
6. Para entregar: exportar con en_placa=true monta el reverso girado dentro de los márgenes de la placa de CTP (sin barras ni marcas). en_placa=false da solo el reverso al tamaño del papel.
Reglas de la casa: todo vector y a una tinta (K; grises de K sí, nada de compuestos ni registro). ${E.REGLAS_ADORNOS}
Parámetros de generar_reverso (pon solo los que cambian): escala_titulo, escala_encabezado, separacion_encabezado (1 = normal), columnas (2-5), cuerpo_min/cuerpo_max (pt del programa), espacio_dias, espacio_cintilla (mm), sombra_dias/sombra_cintillas/sombra_mensaje (0-40), lineas_columnas, balancear_columnas, mostrar_objetivo, mostrar_mensaje, mostrar_lema (true/false), ancho_ciudad (mm).

REGLAS DE LECTURA (de fotos a marcado):
${P.SYS_LEER.split("Responde SOLO con un JSON")[0].replace(/^[\s\S]*?Reglas:/, "Reglas:")}
${P.FORMATO_MARCADO}`;

// ------------------------------------------------------------------ herramientas
const HERRAMIENTAS = [
  { name: "instrucciones", description: "Guía completa: flujo de trabajo, reglas de lectura, formato del marcado y reglas de la casa. Léela antes de empezar.",
    inputSchema: { type: "object", properties: {} } },
  { name: "listar_formatos", description: "Tamaños de papel del taller (dentro de los márgenes de sus plantillas de CTP) con su placa.",
    inputSchema: { type: "object", properties: {} } },
  { name: "listar_estilos", description: "Estilos por advocación (Guadalupana, Sagrado Corazón, Mariano...). Se elige solo por el nombre de la fiesta.",
    inputSchema: { type: "object", properties: {} } },
  { name: "revisar_fechas", description: "Revisa sin IA que los días de la semana cuadren con las fechas y avisa horas raras (12:00 a.m.).",
    inputSchema: { type: "object", properties: { marcado: { type: "string" } }, required: ["marcado"] } },
  { name: "generar_reverso", description: "Arma el reverso en InDesign a partir del marcado (cierra el que generó antes) y regresa una imagen de la página para revisarla.",
    inputSchema: { type: "object", required: ["marcado"], properties: {
      marcado: { type: "string", description: "El programa completo en el formato de marcado." },
      formato: { type: "string", description: "Nombre del tamaño (ver listar_formatos). Por omisión el último usado o Doble oficio." },
      orientacion: { type: "string", enum: ["vertical", "horizontal"] },
      ancho: { type: "number", description: "mm, solo si hay que cambiar la medida para este trabajo" },
      alto: { type: "number" }, sangrado: { type: "number" },
      estilo: { type: "string", description: "id del estilo o 'auto' (por omisión)" },
      params: { type: "object", description: "Ajustes del motor (ver instrucciones)." } } } },
  { name: "ver_reverso", description: "Regresa una imagen de cómo va el reverso en InDesign (incluye retoques hechos a mano).",
    inputSchema: { type: "object", properties: { resolucion: { type: "number", description: "dpi, 50 a 150 (72 por omisión)" } } } },
  { name: "exportar", description: "Exporta el reverso a PDF. en_placa=true lo monta en la placa de CTP del formato (girado, dentro de márgenes, sin marcas, solo K).",
    inputSchema: { type: "object", properties: {
      en_placa: { type: "boolean" }, giro: { type: "string", enum: ["izquierda", "derecha"], description: "Hacia dónde va la parte de arriba del reverso en la placa." },
      ruta: { type: "string", description: "Ruta del PDF (por omisión Documentos\\Programas IA\\Exportados)." } } } }
];

function formatoPorNombre(n) {
  const t = String(n || "").toLowerCase();
  return DEF_FORMATOS.find(f => f.nombre.toLowerCase() === t) || DEF_FORMATOS.find(f => t && f.nombre.toLowerCase().indexOf(t) >= 0) || null;
}
const texto = (t) => ({ content: [{ type: "text", text: t }] });

async function llamar(nombre, a) {
  a = a || {};
  if (nombre === "instrucciones") return texto(GUIA);
  if (nombre === "listar_formatos") return texto(DEF_FORMATOS.map(f => "- " + f.nombre + ": papel " + f.ancho + " × " + f.alto + " mm" +
    (f.placa ? " (placa " + f.placa.ancho + " × " + f.placa.alto + ", márgenes " + [f.placa.sup, f.placa.inf, f.placa.izq, f.placa.der].join("/") + ")" : "")).join("\n"));
  if (nombre === "listar_estilos") return texto(E.ESTILOS.map(e => "- " + e.id + ": " + e.nombre + " (letras " + e.fuentes.titulo + " / " + e.fuentes.display + " / " + e.fuentes.texto + ")" +
    (e.claves.length ? "; se elige con: " + e.claves.slice(0, 6).join(", ") : "; el de fábrica")).join("\n"));
  if (nombre === "revisar_fechas") {
    const av = revisarFechas(a.marcado || "");
    return texto(av.length ? av.map(x => "- " + x.texto).join("\n") : "Las fechas cuadran con los días de la semana.");
  }
  if (nombre === "generar_reverso") {
    const st = leerEstado();
    const datos = parseMarcado(a.marcado || "");
    if (!datos.prog.length && !datos.enc.nombre) return texto("El marcado no trae claves reconocibles. Llama instrucciones para ver el formato.");
    const f = formatoPorNombre(a.formato || st.formato || "Doble oficio");
    if (!f) return texto("No conozco el formato «" + a.formato + "». Usa listar_formatos.");
    let w = a.ancho || f.ancho, h = a.alto || f.alto;
    if ((a.orientacion === "horizontal" && w < h) || (a.orientacion === "vertical" && w > h)) { const t = w; w = h; h = t; }
    const est = !a.estilo || a.estilo === "auto" ? E.estiloAutomatico(datos.enc) : E.estiloPorId(a.estilo);
    const adornos = {};
    for (const k in E.ADORNOS_FABRICA) adornos[k] = path.join(PANEL, E.ADORNOS_FABRICA[k]).replace(/\\/g, "/");
    const DATA = { formato: { nombre: f.nombre, ancho: w, alto: h, sangrado: a.sangrado != null ? a.sangrado : f.sangrado },
      enc: datos.enc, prog: datos.prog, params: Object.assign({}, est.params, a.params || {}), assets: adornos,
      fuentes: est.fuentes, cerrarId: st.docId || null };
    const r = indesign(leer("engine.jsx").replace("/*__DATA__*/", () => "var DATA = " + es3(DATA) + ";"));
    if (r.indexOf("OK") !== 0) return texto("No se pudo generar: " + r);
    const kv = kvDe(r);
    guardarEstado({ docId: kv.id, formato: f.nombre, ancho: w, alto: h, sangrado: DATA.formato.sangrado, estilo: est.id });
    try { fs.writeFileSync(path.join(DATOS, "ultimo_marcado.txt"), a.marcado, "utf8"); } catch (e) {}
    const res = "Reverso generado en InDesign (" + f.nombre + " " + w + "×" + h + " mm, estilo " + est.nombre + "). Texto del programa a " + kv.cuerpo + " pt." +
      (kv.desborde === "1" ? " ¡OJO! No cupo todo el texto." : "") + (kv.aviso ? "\nAvisos del motor: " + kv.aviso.split(" // ").join("; ") : "");
    let img = null; try { img = vistaJPG(kv.id, 72); } catch (e) {}
    return { content: [{ type: "text", text: res }].concat(img ? [{ type: "image", data: img, mimeType: "image/jpeg" }] : []) };
  }
  if (nombre === "ver_reverso") {
    const st = leerEstado(), dpi = Math.max(50, Math.min(150, a.resolucion || 72));
    return { content: [{ type: "image", data: vistaJPG(st.docId, dpi), mimeType: "image/jpeg" }] };
  }
  if (nombre === "exportar") {
    const st = leerEstado();
    if (!st.docId) return texto("Primero genera el reverso.");
    const f = formatoPorNombre(st.formato);
    const dir = path.join(os.homedir(), "Documents", "Programas IA", "Exportados"); fs.mkdirSync(dir, { recursive: true });
    const nombreBase = (f ? f.nombre : "reverso").toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const ruta = (a.ruta || path.join(dir, nombreBase + (a.en_placa ? "-placa" : "") + ".pdf")).replace(/\\/g, "/");
    if (a.en_placa) {
      if (!f || !f.placa) return texto("Ese formato no tiene placa registrada; exporta con en_placa=false.");
      const p = f.placa, areaH = (p.ancho - p.izq - p.der) > (p.alto - p.sup - p.inf), disH = st.ancho > st.alto;
      const DATA = { docId: st.docId, tmp: path.join(os.tmpdir(), "programasia_placa_tmp.pdf").replace(/\\/g, "/"), salida: ruta, placa: p,
        sangrado: st.sangrado || 0, giro: areaH === disH ? 0 : (a.giro === "derecha" ? -90 : 90), dejarAbierta: false };
      const r = indesign(leer("placa.jsx").replace("/*__DATA__*/", () => "var DATA = " + es3(DATA) + ";"));
      if (r.indexOf("OK") !== 0) return texto("No se pudo montar en la placa: " + r);
      const av = (r.split("aviso=")[1] || "").trim();
      return texto("Placa lista: " + ruta.replace(/\//g, "\\") + (av ? "\n" + av : ""));
    }
    const r = indesign('var d = app.documents.itemByID(' + Number(st.docId) + '); if (!d.isValid) "ERROR|el reverso ya no está abierto"; else {' +
      'var pr = app.pdfExportPresets.itemByName("Programas IA CTP"); if (!pr.isValid) pr = app.pdfExportPresets.itemByName("[PDF/X-1a:2001]");' +
      'd.exportFile(ExportFormat.PDF_TYPE, File(' + es3(ruta) + '), false, pr); "ok"; }');
    return texto(r === "ok" ? "PDF listo: " + ruta.replace(/\//g, "\\") : "No se pudo exportar: " + r);
  }
  throw new Error("Herramienta desconocida: " + nombre);
}

// ------------------------------------------------------------------ prompts (aparecen como comandos en Claude Desktop)
const PROMPTS = [
  { name: "armar_reverso", description: "Leer el programa que te paso y armar el reverso", arguments: [{ name: "formato", description: "Tamaño, ej. Doble oficio", required: false }] }
];

// ------------------------------------------------------------------ JSON-RPC por stdio
function enviar(o) { process.stdout.write(JSON.stringify(o) + "\n"); }
async function atender(m) {
  const { id, method, params } = m;
  try {
    if (method === "initialize") return enviar({ jsonrpc: "2.0", id, result: {
      protocolVersion: (params && params.protocolVersion) || "2025-06-18",
      capabilities: { tools: {}, prompts: {} },
      serverInfo: { name: "programas-ia", version: VERSION },
      instructions: GUIA } });
    if (method === "notifications/initialized" || (method && method.indexOf("notifications/") === 0)) return;
    if (method === "ping") return enviar({ jsonrpc: "2.0", id, result: {} });
    if (method === "tools/list") return enviar({ jsonrpc: "2.0", id, result: { tools: HERRAMIENTAS } });
    if (method === "tools/call") {
      try { return enviar({ jsonrpc: "2.0", id, result: await llamar(params.name, params.arguments) }); }
      catch (e) { return enviar({ jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: "Error: " + e.message }] } }); }
    }
    if (method === "prompts/list") return enviar({ jsonrpc: "2.0", id, result: { prompts: PROMPTS } });
    if (method === "prompts/get") return enviar({ jsonrpc: "2.0", id, result: { messages: [{ role: "user", content: { type: "text",
      text: GUIA + "\n\nAhora: lee el programa que te adjunto, dame el marcado y los avisos, revisa fechas y arma el reverso" +
        (params && params.arguments && params.arguments.formato ? " en " + params.arguments.formato : "") + ". Muéstrame la imagen y dime qué ves." } }] } });
    if (id !== undefined) enviar({ jsonrpc: "2.0", id, error: { code: -32601, message: "Método no soportado: " + method } });
  } catch (e) { if (id !== undefined) enviar({ jsonrpc: "2.0", id, error: { code: -32603, message: e.message } }); }
}
let buf = "", cola = Promise.resolve();
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => {
  buf += d; let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const linea = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!linea) continue;
    let m; try { m = JSON.parse(linea); } catch (e) { continue; }
    cola = cola.then(() => atender(m)); // una cosa a la vez: InDesign no es multitarea
  }
});
process.stdin.on("end", () => cola.then(() => process.exit(0)));
