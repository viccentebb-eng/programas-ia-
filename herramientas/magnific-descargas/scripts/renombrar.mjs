#!/usr/bin/env node
// Deja cada descarga con el nombre de la lista, en disco. Por omisión sólo SIMULA; con --aplicar mueve.
// Nunca sobrescribe ni borra: si el nombre destino ya existe, lo reporta como conflicto.
//
//   node renombrar.mjs --ultimo [--destino <carpeta>] [--aplicar]           usa el manifiesto del último lanzamiento
//   node renombrar.mjs <manifiesto.json | carpeta> [--destino <carpeta>] [--aplicar]
//   node renombrar.mjs --lista <lista.txt> --carpeta <carpeta> [--aplicar]  sin manifiesto: empareja por el nombre de Magnific
import { copyFileSync, constants, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { leerLista } from './lista.mjs';

const ULTIMO = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'magnific-descargas', 'ultimo-lote.json');
const VIDEO = /\.(mp4|mov|webm|m4v|avi)$/i;
const IGNORAR = /^(manifiesto|renombrado)-.*\.json$|\.(part|tmp|crdownload)$/i;
const falla = m => { console.error(`\nNo se pudo: ${m}\n`); process.exit(1); };
const mismaRuta = (a, b) => (process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b));

function paso(nombre, de, a, motivo = '') {
  if (!de || !existsSync(de)) return { nombre, de, a, estado: 'falta', motivo: motivo || 'no encontré el archivo' };
  if (mismaRuta(de, a)) return { nombre, de, a, estado: 'listo', motivo };
  if (existsSync(a)) return { nombre, de, a, estado: 'conflicto', motivo: 'ya existe un archivo con el nombre destino' };
  return { nombre, de, a, estado: 'mover', motivo };
}

/* ---------- con manifiesto ---------- */

function manifiestoMasNuevo(carpeta) {
  const lista = readdirSync(carpeta).filter(n => /^manifiesto-.*\.json$/i.test(n))
    .map(n => join(carpeta, n)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!lista.length) falla(`no hay manifiesto-*.json en ${carpeta}`);
  return lista[0];
}

function planDesdeManifiesto(ruta, destinoCli) {
  const m = JSON.parse(readFileSync(ruta, 'utf8'));
  if (m.formato !== 'magnific-descargas/1') falla(`${ruta} no es un manifiesto de magnific-descargas`);
  const base = dirname(ruta);
  const destino = resolve(destinoCli || m.destino || base);
  const pasos = [];
  const revisar = [];
  for (const e of m.elementos || []) {
    for (const x of e.extras || []) revisar.push(`${e.nombre}: descarga adicional ${x.archivo} (${x.estado}); no se toca`);
    if (!e.archivo) { revisar.push(`${e.nombre}: sin archivo (${e.estado}${e.detalle ? `: ${e.detalle}` : ''}) ${e.enlace}`); continue; }
    let de = e.archivo;
    if (!existsSync(de) && existsSync(join(base, basename(de)))) de = join(base, basename(de));
    const ext = extname(de) || (e.ext ? `.${e.ext}` : '');
    pasos.push(paso(e.nombre, de, join(destino, e.nombre + ext), e.renombrado === 'navegador' ? '' : 'quedó con el nombre de Magnific'));
  }
  for (const s of m.sinDueno || []) revisar.push(`descarga sin dueño: ${s.archivo} (${s.estado}); no se toca`);
  return { pasos, revisar, destino, bitacora: join(destino, `renombrado-${m.lote}.json`) };
}

/* ---------- sin manifiesto: por el nombre que pone Magnific ---------- */

const PALABRAS_VACIAS = new Set(['the', 'and', 'with', 'for', 'from', 'free', 'premium', 'photo', 'video', 'stock', 'view', 'close']);
const raiz = t => (t.length > 5 ? t.replace(/(ing|ed|es|s)$/, '') : t);
const palabras = s => new Set(String(s).toLowerCase().split(/[^a-z0-9]+/)
  .filter(t => t.length >= 3 && !/^\d+$/.test(t) && !/^\d+x\d+$/.test(t) && !PALABRAS_VACIAS.has(t)).map(raiz));
const slugDe = url => decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '').replace(/\.htm$/i, '').replace(/_\d+$/, '');
const compatible = (tipo, archivo) => (tipo === 'video' ? VIDEO.test(archivo) : !VIDEO.test(archivo));

function planDesdeLista(rutaLista, carpeta) {
  const { elementos, errores } = leerLista(rutaLista);
  if (errores.length) falla(`la lista tiene errores:\n  - ${errores.join('\n  - ')}`);
  const archivos = readdirSync(carpeta, { withFileTypes: true }).filter(f => f.isFile() && !IGNORAR.test(f.name)).map(f => f.name);
  const sinExt = n => n.replace(/\.[^.]+$/, '').toLowerCase();
  const pasos = [];
  const tomados = new Set();
  const faltan = [];
  for (const e of elementos) {
    const ya = archivos.find(n => sinExt(n) === e.nombre.toLowerCase());
    if (ya) { tomados.add(ya); pasos.push(paso(e.nombre, join(carpeta, ya), join(carpeta, ya))); } else faltan.push(e);
  }
  // 1) Por palabras del enlace en el nombre del archivo: sólo si hay un mejor candidato claro.
  const candidatos = faltan.map(e => {
    const clave = palabras(slugDe(e.enlace));
    const puntos = archivos.filter(n => !tomados.has(n) && compatible(e.tipo, n))
      .map(n => ({ n, p: [...palabras(sinExt(n))].filter(t => clave.has(t)).length })).sort((a, b) => b.p - a.p);
    return { e, puntos };
  }).sort((a, b) => (b.puntos[0]?.p || 0) - (a.puntos[0]?.p || 0));
  const asignados = new Map();
  for (const { e, puntos } of candidatos) {
    const libres = puntos.filter(x => !tomados.has(x.n));
    if (libres[0] && libres[0].p >= 2 && libres[0].p > (libres[1]?.p || 0)) {
      tomados.add(libres[0].n);
      asignados.set(e.nombre, { n: libres[0].n, motivo: `coinciden ${libres[0].p} palabras del enlace` });
    }
  }
  // 2) Por eliminación: queda exactamente un archivo sin asignar y un recurso faltante del mismo tipo.
  for (const tipo of ['video', 'foto']) {
    const restantes = faltan.filter(e => e.tipo === tipo && !asignados.has(e.nombre));
    const libres = archivos.filter(n => !tomados.has(n) && compatible(tipo, n));
    if (restantes.length === 1 && libres.length === 1) {
      tomados.add(libres[0]);
      asignados.set(restantes[0].nombre, { n: libres[0], motivo: 'por eliminación (único archivo y único faltante de su tipo)' });
    }
  }
  const revisar = [];
  for (const e of faltan) {
    const a = asignados.get(e.nombre);
    if (a) pasos.push(paso(e.nombre, join(carpeta, a.n), join(carpeta, e.nombre + extname(a.n).toLowerCase()), a.motivo));
    else revisar.push(`${e.nombre}: no encontré su archivo en la carpeta ${e.enlace}`);
  }
  for (const n of archivos.filter(n => !tomados.has(n))) revisar.push(`archivo sin asignar: ${n}; no se toca`);
  return { pasos, revisar, destino: carpeta, bitacora: join(carpeta, `renombrado-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}.json`) };
}

/* ---------- aplicar ---------- */

function mover(de, a) {
  mkdirSync(dirname(a), { recursive: true });
  if (existsSync(a)) throw new Error('el destino ya existe');
  try { renameSync(de, a); } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    copyFileSync(de, a, constants.COPYFILE_EXCL); // otra unidad: copia, verifica y quita el original
    if (statSync(a).size !== statSync(de).size) throw new Error('la copia quedó incompleta');
    unlinkSync(de);
  }
}

function main() {
  const { values: o, positionals } = parseArgs({ allowPositionals: true, options: {
    ultimo: { type: 'boolean' }, destino: { type: 'string' }, aplicar: { type: 'boolean' }, lista: { type: 'string' },
    carpeta: { type: 'string' }, ayuda: { type: 'boolean', short: 'h' }
  } });
  let plan;
  if (o.lista) {
    if (!o.carpeta) falla('con --lista también indica --carpeta <carpeta donde quedaron las descargas>');
    plan = planDesdeLista(resolve(o.lista), resolve(o.carpeta));
  } else if (o.ultimo || positionals[0]) {
    let ruta;
    if (o.ultimo) {
      if (!existsSync(ULTIMO)) falla(`no hay registro del último lanzamiento (${ULTIMO})`);
      const u = JSON.parse(readFileSync(ULTIMO, 'utf8'));
      ruta = existsSync(u.manifiesto) ? u.manifiesto : existsSync(u.carpeta) ? manifiestoMasNuevo(u.carpeta) : null;
      if (!ruta) falla(`no encontré el manifiesto ${u.manifiesto}. Si Firefox sigue abierto, pulsa «Guardar manifiesto» en el panel.
Sin manifiesto: node renombrar.mjs --lista "${u.lista}" --carpeta "${u.carpeta}"`);
    } else {
      ruta = resolve(positionals[0]);
      if (!existsSync(ruta)) falla(`no existe ${ruta}`);
      if (statSync(ruta).isDirectory()) ruta = manifiestoMasNuevo(ruta);
    }
    console.log(`Manifiesto: ${ruta}`);
    plan = planDesdeManifiesto(ruta, o.destino);
  } else {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n'));
    process.exit(o.ayuda ? 0 : 1);
  }

  const { pasos, revisar, destino, bitacora } = plan;
  console.log(`Carpeta final: ${destino}\n${o.aplicar ? 'Aplicando:' : 'Simulación (no se movió nada; para aplicar agrega --aplicar):'}`);
  const hechos = [];
  for (const p of pasos) {
    let estado = p.estado;
    if (o.aplicar && p.estado === 'mover') {
      try { mover(p.de, p.a); estado = 'movido'; hechos.push({ de: p.de, a: p.a }); } catch (error) { estado = 'error'; p.motivo = error.message; }
    }
    p.resultado = estado;
    const desde = p.estado === 'listo' ? '' : `${basename(p.de || '?')} -> `;
    console.log(`  [${estado}] ${desde}${basename(p.a)}${p.motivo ? `  (${p.motivo})` : ''}`);
  }
  if (revisar.length) console.log(`\nRevisar a mano:\n  - ${revisar.join('\n  - ')}`);
  if (hechos.length) {
    writeFileSync(bitacora, `${JSON.stringify({ fecha: new Date().toISOString(), movidos: hechos }, null, 2)}\n`);
    console.log(`\nBitácora para deshacer: ${bitacora}`);
  }
  const cuenta = e => pasos.filter(p => p.resultado === e).length;
  console.log(`\nResumen: ${cuenta('listo')} ya estaban, ${o.aplicar ? `${cuenta('movido')} movidos, ${cuenta('error')} con error` : `${cuenta('mover')} por mover`}, ${cuenta('conflicto')} conflictos, ${cuenta('falta')} faltan, ${revisar.length} por revisar.`);
}

main();
