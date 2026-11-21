// Lectura de listas «nombre | enlace» compartida por lanzar.mjs y renombrar.mjs.
import { readFileSync } from 'node:fs';

export const limpiarNombre = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\w.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 120);
export const limpiarCarpeta = s => String(s || '').split(/[\\/]+/).map(limpiarNombre).filter(p => p && p !== '..').join('/');
export const tipoDe = url => (/-video\/|\/video\//i.test(url) ? 'video' : 'foto');
export const enlaceValido = url => /^https:\/\/([a-z0-9-]+\.)*(magnific|freepik)\.com\//i.test(url);

/** Lee un .txt («nombre | enlace» por renglón, # comenta) o un .json (arreglo de { nombre, enlace }).
    Devuelve { elementos, errores }. */
export function leerLista(ruta) {
  const texto = readFileSync(ruta, 'utf8').replace(/^﻿/, '');
  let crudos;
  if (/\.json$/i.test(ruta)) {
    const datos = JSON.parse(texto);
    crudos = (Array.isArray(datos) ? datos : datos.elementos || []).map(e => ({ nombre: e.nombre, enlace: e.enlace || e.url, linea: 0 }));
  } else {
    crudos = [];
    texto.split(/\r?\n/).forEach((linea, i) => {
      const l = linea.trim();
      if (!l || l.startsWith('#')) return;
      const partes = l.split('|').map(s => s.trim());
      crudos.push(partes.length > 1 ? { nombre: partes[0], enlace: partes[1], linea: i + 1 } : { nombre: '', enlace: partes[0], linea: i + 1 });
    });
  }
  const errores = [];
  const vistos = new Set();
  const elementos = [];
  for (const c of crudos) {
    const donde = c.linea ? `renglón ${c.linea}` : `«${c.nombre || c.enlace}»`;
    const enlace = String(c.enlace || '').trim();
    const nombre = limpiarNombre(c.nombre);
    if (!enlaceValido(enlace)) { errores.push(`${donde}: el enlace no es de magnific.com (${enlace || 'vacío'})`); continue; }
    if (!nombre) { errores.push(`${donde}: falta el nombre de destino (formato: nombre | enlace)`); continue; }
    if (vistos.has(nombre.toLowerCase())) { errores.push(`${donde}: el nombre «${nombre}» está repetido`); continue; }
    vistos.add(nombre.toLowerCase());
    elementos.push({ nombre, enlace, tipo: tipoDe(enlace) });
  }
  return { elementos, errores };
}
