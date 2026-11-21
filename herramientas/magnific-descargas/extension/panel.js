'use strict';
const $ = id => document.getElementById(id);
const ETIQUETA = { pendiente: 'Pendiente', descargando: 'Descargando…', listo: 'Listo', error: 'No se pudo' };
const RENOMBRADO = { navegador: 'con su nombre', pendiente: 'falta renombrar en disco' };

function render(state, error = '') {
  if (!state) return;
  const jobs = state.jobs || [];
  const cuenta = s => jobs.filter(j => j.status === s).length;
  $('resumen').textContent = state.lote
    ? `Lote ${state.lote} · carpeta Descargas/${state.carpeta} · ${cuenta('listo')} listos, ${cuenta('error')} con error, ${cuenta('pendiente')} pendientes`
      + (state.terminado ? ' · Terminado: ya puedes cerrar Firefox.' : '')
      + (state.manifiesto ? ` · Manifiesto: ${state.manifiesto}` : '')
    : 'No hay lista cargada.';
  $('aviso').textContent = error || state.error || state.pausa || '';
  const lista = $('estado');
  lista.textContent = '';
  for (const job of jobs) {
    const li = document.createElement('li');
    li.className = job.status;
    const nombre = document.createElement('b');
    nombre.textContent = job.nombre;
    const estado = document.createElement('span');
    estado.textContent = ` — ${ETIQUETA[job.status] || job.status}${job.renombrado ? ` (${RENOMBRADO[job.renombrado]})` : ''}`;
    const detalle = document.createElement('small');
    detalle.textContent = [job.detail, job.archivo].filter(Boolean).join(' · ');
    li.append(nombre, estado, detalle);
    lista.append(li);
  }
  $('iniciar').textContent = jobs.some(j => j.status === 'listo' || j.status === 'error') ? 'Reanudar' : 'Iniciar';
  $('iniciar').disabled = !!state.running || !jobs.length;
  $('detener').disabled = !state.running;
  $('manifiesto').disabled = !state.lote;
  $('cargar').disabled = !!state.running;
}

const pedir = async cmd => render(await browser.runtime.sendMessage(cmd));
$('iniciar').addEventListener('click', () => pedir({ cmd: 'iniciar' }));
$('detener').addEventListener('click', () => pedir({ cmd: 'detener' }));
$('manifiesto').addEventListener('click', () => pedir({ cmd: 'manifiesto' }));
$('cargar').addEventListener('click', () => pedir({ cmd: 'cargar', texto: $('lista').value, carpeta: $('carpeta').value }));
browser.storage.onChanged.addListener(changes => { if (changes.state) render(changes.state.newValue); });
void pedir({ cmd: 'estado' });
