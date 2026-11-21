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
    "Nada de fotos ni ilustraciones a color. Responde SOLO JSON: {\"busquedas\":[{\"ranura\":\"esquina|divisor|otro\",\"q\":\"...\",\"por_que\":\"...\"}]} con 5 a 7 búsquedas.";
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
  datos.forEach((d, i) => {
    const r = res.find(x => x.entrada === trabajo[i].entrada) || res[i] || {};
    if (String(r.resultado || "").indexOf("OK") !== 0) { fallas.push(d.el.item.nombre + ": " + (r.resultado || "sin respuesta")); return; }
    const kv = {}; String(r.resultado).split("|").slice(1).forEach(p => { const j = p.indexOf("="); kv[p.slice(0, j)] = p.slice(j + 1); });
    indice.unshift({ id: d.base, pdf: trabajo[i].salida, png: trabajo[i].miniatura, ranura: d.el.ranura, etiquetas: d.el.etiquetas || "",
      estilo: d.el.estilo || "", origen: d.el.item.entry.nativePath, fecha: new Date().toISOString().slice(0, 10),
      aviso: kv.raster && kv.raster !== "0" ? "trae imagen (no vector)" : (kv.con_color && kv.con_color !== "0" ? "quedó algo de color" : "") });
    agregados++;
  });
  await guardarIndice(indice);
  return { agregados, fallas };
}
async function rutaConvertidor() { return (await (await fsys.getPluginFolder()).getEntry("convertir_adornos.ps1")).nativePath; }
async function miniaturaDataUrl(ruta) {
  try { const b = await nodeFs.readFile(ruta); return "data:image/png;base64," + b64(b); } catch (e) { return ""; }
}
