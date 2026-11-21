// =====================================================================
//  PROGRAMAS IA - biblioteca de adornos y Magnific
//  - Sugiere busquedas de Magnific segun el estilo/santo y las abre en el
//    navegador del usuario (su sesion; no gasta creditos de la API).
//  - "Revisar mis Descargas": toma los vectores nuevos (zip, ai, eps, svg, pdf),
//    los pasa a una tinta con Illustrator (convertir_adornos.ps1) y los guarda
//    en Documentos\Programas IA\Biblioteca con su miniatura y etiquetas.
//  Usa del panel: cfg/setCfg, estado, extend, es3, esc, abrirWeb, claude, jsonDe,
//  fsys, fmts, JSZipLib, estilos.js.
// =====================================================================
const nodeFs = require("fs"), nodeOs = require("os");
const EXT_VECTOR = ["ai", "eps", "svg", "pdf"];
const RANURAS = { esquina: "Esquina", divisor: "Divisor", otro: "Otro" };

function dirEntry(ruta) { return fsys.getEntryWithUrl("file:" + ruta.replace(/\\/g, "/")); }
async function asegurarCarpeta(padre, nombre) {
  try { return await padre.getEntry(nombre); } catch (e) { return await padre.createFolder(nombre); }
}
function rutaDocumentos() { return nodeOs.homedir() + "\\Documents"; }
async function carpetaBiblioteca() {
  const docs = await dirEntry(rutaDocumentos());
  return await asegurarCarpeta(await asegurarCarpeta(docs, "Programas IA"), "Biblioteca");
}
// carpeta de descargas: la que eligio el usuario, la que anoto el instalador o la de Windows
function rutaDescargas() {
  const elegida = cfg("descargasDir", "");
  if (elegida) return elegida;
  try {
    const c = JSON.parse(nodeFs.readFileSync(nodeOs.homedir() + "/AppData/Local/Programas IA/config.json", { encoding: "utf-8" }));
    if (c.descargas) return c.descargas;
  } catch (e) {}
  return nodeOs.homedir() + "\\Downloads";
}

// ------------------------------------------------------------------ indice de la biblioteca
async function leerIndice() {
  try {
    const f = await (await carpetaBiblioteca()).getEntry("biblioteca.json");
    return JSON.parse(await f.read({ format: fmts.utf8 })) || [];
  } catch (e) { return []; }
}
async function guardarIndice(lista) {
  const f = await (await carpetaBiblioteca()).createFile("biblioteca.json", { overwrite: true });
  await f.write(JSON.stringify(lista, null, 1), { format: fmts.utf8 });
}
function slug(t) { return sinAcentos(t).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "adorno"; }

// ------------------------------------------------------------------ Magnific
function urlMagnific(q) { return "https://www.magnific.com/search?format=search&type=vector&query=" + encodeURIComponent(q); }
async function ideasMagnific(enc, estilo) {
  const sys = "Eres diseñador de un taller de impresión que hace reversos de carteles de fiestas patronales católicas a UNA TINTA (negro). " +
    "Propón búsquedas en INGLÉS para Magnific (banco de vectores) que den adornos grabados o de línea, en blanco y negro, apropiados para la advocación. " +
    REGLAS_ADORNOS + " Las busquedas deben incluir palabras como baroque, ornate, engraving, filigree, acanthus o victorian. Responde SOLO JSON: {\"busquedas\":[{\"ranura\":\"esquina|divisor|otro\",\"q\":\"...\",\"por_que\":\"...\"}]} con 5 a 7 búsquedas.";
  const txt = "Fiesta: " + [enc.pre, enc.nombre, enc.fechas].filter(Boolean).join(" · ") + "\nEstilo elegido: " + estilo.nombre;
  const r = jsonDe(await claude(sys, [{ type: "text", text: txt }], 2000));
  return (r.busquedas || []).filter(b => b && b.q).map(b => [RANURAS[b.ranura] ? b.ranura : "otro", b.q, b.por_que || ""]);
}

// ------------------------------------------------------------------ Descargas -> biblioteca
// archivos de vector (o zip con vectores) nuevos en Descargas que no esten ya en la biblioteca
async function buscarDescargas(dias) {
  const ruta = rutaDescargas(), desde = Date.now() - (dias || 7) * 86400000;
  const indice = await leerIndice(), ya = {};
  indice.forEach(a => { if (a.origen) ya[a.origen.toLowerCase()] = true; });
  rechazados().forEach(r => { ya[r.toLowerCase()] = true; });
  const dir = await dirEntry(ruta), out = [];
  for (const e of await dir.getEntries()) {
    if (!e.isFile) continue;
    const ext = e.name.split(".").pop().toLowerCase();
    if (ext !== "zip" && EXT_VECTOR.indexOf(ext) < 0) continue;
    let m = 0; try { m = (await e.getMetadata()).dateModified.getTime(); } catch (er) {}
    if (m && m < desde) continue;
    if (ya[e.nativePath.toLowerCase()]) continue;
    out.push({ entry: e, nombre: e.name, ext, fecha: m });
  }
  out.sort((a, b) => b.fecha - a.fecha);
  return { ruta, archivos: out.slice(0, 40) };
}
// de un zip de Magnific saca el mejor vector: ai > eps > svg > pdf
async function sacarVector(item, tmp) {
  if (item.ext !== "zip") return item.entry;
  const zip = await JSZipLib.loadAsync(await item.entry.read({ format: fmts.binary }));
  const nombres = Object.keys(zip.files).filter(n => !zip.files[n].dir && !/__MACOSX|\/\./.test(n));
  for (const ext of EXT_VECTOR) {
    const n = nombres.find(x => x.toLowerCase().endsWith("." + ext));
    if (n) {
      const f = await tmp.createFile(slug(item.nombre) + "." + ext, { overwrite: true });
      await f.write(await zip.file(n).async("arraybuffer"), { format: fmts.binary });
      return f;
    }
  }
  return null;
}
// convierte con Illustrator; elementos: [{ item, ranura, etiquetas }]
async function agregarABiblioteca(elementos) {
  const bib = await carpetaBiblioteca(), tmp = await fsys.getTemporaryFolder();
  const trabajo = [], datos = [], fallas = [];
  for (const el of elementos) {
    estado("Preparando " + el.item.nombre + "...", "trabajando");
    let vec = null;
    try { vec = await sacarVector(el.item, tmp); } catch (e) {}
    if (!vec) { fallas.push(el.item.nombre + ": no trae vector (ai, eps, svg o pdf)"); continue; }
    const base = slug(el.etiquetas || el.item.nombre) + "-" + Date.now().toString(36);
    const pdf = await bib.createFile(base + ".pdf", { overwrite: true });
    const png = await bib.createFile(base + ".png", { overwrite: true });
    trabajo.push({ entrada: vec.nativePath, salida: pdf.nativePath, miniatura: png.nativePath });
    datos.push({ el, base });
  }
  if (!trabajo.length) return { agregados: 0, fallas };
  const tj = await tmp.createFile("adornos_trabajo.json", { overwrite: true });
  await tj.write(JSON.stringify(trabajo), { format: fmts.utf8 });
  const listo = await tmp.createFile("adornos_listo.json", { overwrite: true });
  await listo.write(" ", { format: fmts.utf8 }); // UXP no escribe archivos vacios
  const ps1 = await rutaConvertidor();
  const cmd = await tmp.createFile("convertir_adornos.cmd", { overwrite: true });
  await cmd.write("@echo off\r\nchcp 65001 >nul\r\npowershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + ps1 +
    "\" -Trabajo \"" + tj.nativePath + "\" -Listo \"" + listo.nativePath + "\"\r\n", { format: fmts.utf8 });
  estado("Pasando " + trabajo.length + " adorno(s) a una tinta con Illustrator... (la primera vez tarda en abrir)", "trabajando");
  if (extend('File(' + es3(cmd.nativePath) + ').execute() ? "ok" : "no";') !== "ok") throw new Error("Windows no dejó abrir Illustrator.");
  let res = null;
  for (let i = 0; i < 600 && !res; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const t = String(await listo.read({ format: fmts.utf8 })).replace(/^﻿/, "").trim();
    if (t) res = JSON.parse(t);
  }
  if (!res) throw new Error("Illustrator tardó demasiado.");
  if (!Array.isArray(res)) res = [res];
  const indice = await leerIndice();
  let agregados = 0;
  for (let i = 0; i < datos.length; i++) {
    const d = datos[i], r = res.find(x => x.entrada === trabajo[i].entrada) || res[i] || {};
    const fuera = async (motivo) => {
      fallas.push(d.el.item.nombre + ": " + motivo);
      recordarRechazo(d.el.item.entry.nativePath);
      for (const n of [d.base + ".pdf", d.base + ".png"]) { try { await (await bib.getEntry(n)).delete(); } catch (e) {} }
    };
    if (String(r.resultado || "").indexOf("OK") !== 0) { await fuera(r.resultado || "Illustrator no respondió"); continue; }
    const kv = {}; String(r.resultado).split("|").slice(1).forEach(p => { const j = p.indexOf("="); kv[p.slice(0, j)] = Number(p.slice(j + 1)); });
    const motivo = reglasAdorno(kv, d.el.ranura);
    if (motivo) { await fuera(motivo); continue; }
    if (d.el.revisarConClaude !== false) {
      let juicio = null;
      try { juicio = await juzgarAdorno(trabajo[i].miniatura, d.el.ranura); } catch (e) { juicio = { apto: true, motivo: "sin revisión de Claude (" + e.message + ")" }; }
      if (juicio && !juicio.apto) { await fuera("Claude lo rechazó: " + (juicio.motivo || "no es del estilo de la casa")); continue; }
    }
    indice.unshift({ id: d.base, pdf: trabajo[i].salida, png: trabajo[i].miniatura, ranura: d.el.ranura, etiquetas: d.el.etiquetas || "",
      estilo: d.el.estilo || "", origen: d.el.item.entry.nativePath, fecha: new Date().toISOString().slice(0, 10), puntos: kv.puntos || 0 });
    agregados++;
  }
  await guardarIndice(indice);
  return { agregados, fallas };
}

// Reglas duras (gratis, sin Claude). Devuelve el motivo de rechazo o "".
// Solo vectores; a una tinta; con trabajo de ornamento (puntos de curva); forma adecuada a la ranura.
function reglasAdorno(kv, ranura) {
  if (kv.raster > 0) return "trae imagen de pixeles; solo se aceptan vectores";
  if (kv.con_color > 0) return "no quedó a una tinta";
  const min = MIN_PUNTOS[ranura] || MIN_PUNTOS.otro;
  if (!(kv.puntos >= min)) return "es demasiado simple (" + (kv.puntos || 0) + " puntos de curva; un adorno barroco de " + (RANURAS[ranura] || "este tipo").toLowerCase() + " pide al menos " + min + ")";
  const prop = kv.ancho && kv.alto ? kv.ancho / kv.alto : 1;
  if (ranura === "divisor" && prop < 3) return "no es alargado: un divisor debe ser al menos 3 veces más ancho que alto";
  if (ranura === "esquina" && (prop < 0.5 || prop > 2)) return "no tiene forma de esquina (casi cuadrada)";
  return "";
}
// Revision visual: Claude compara contra el adorno de referencia de la casa
async function juzgarAdorno(rutaPng, ranura) {
  if (!cfg("apiKey", "")) return { apto: true };
  const pf = await fsys.getPluginFolder();
  const ref = await (await pf.getEntry("assets/" + (ranura === "divisor" ? "ref_divisor.png" : "ref_esquina.png"))).read({ format: fmts.binary });
  const cand = await nodeFs.readFile(rutaPng);
  const sys = "Revisas adornos para un taller que imprime reversos de carteles religiosos a una tinta. " + REGLAS_ADORNOS +
    " Responde SOLO JSON: {\"apto\": true|false, \"calificacion\": 1-10, \"motivo\": \"frase corta en español\"}. Apto solo si calificacion >= 6.";
  const r = jsonDe(await claude(sys, [
    { type: "text", text: "REFERENCIA de la casa:" }, { type: "image", source: { type: "base64", media_type: "image/png", data: b64(ref) } },
    { type: "text", text: "CANDIDATO para usar como " + (RANURAS[ranura] || "adorno").toLowerCase() + ":" }, { type: "image", source: { type: "base64", media_type: "image/png", data: b64(cand) } }
  ], 1500));
  return { apto: !!r.apto && (r.calificacion || 0) >= 6, motivo: r.motivo || "" };
}
// lo rechazado no vuelve a salir en "Revisar mis Descargas"
function rechazados() { try { return JSON.parse(cfg("rechazados", "[]")) || []; } catch (e) { return []; } }
function recordarRechazo(ruta) { const l = rechazados(); if (l.indexOf(ruta) < 0) l.push(ruta); setCfg("rechazados", JSON.stringify(l.slice(-300))); }
async function rutaConvertidor() { return (await (await fsys.getPluginFolder()).getEntry("convertir_adornos.ps1")).nativePath; }
async function miniaturaDataUrl(ruta) {
  try { const b = await nodeFs.readFile(ruta); return "data:image/png;base64," + b64(b); } catch (e) { return ""; }
}
