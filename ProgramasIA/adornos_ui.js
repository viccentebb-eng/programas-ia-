// =====================================================================
//  PROGRAMAS IA - pantalla de Estilos y adornos, y selector de estilo en Diseñar
// =====================================================================
const AD = { ideas: {}, descargas: [], filtro: "" };

function encActual() { try { return parseMarcado($("marcado").value).enc; } catch (e) { return {}; } }

// ---- Diseñar: selector de estilo con "Automático (…)"
function llenarSelectorEstilo() {
  const sel = $("estilo"), prev = cfg("estiloSel", "auto"), auto = estiloAutomatico(encActual());
  sel.innerHTML = "";
  const o = document.createElement("option"); o.value = "auto"; o.textContent = "Automático: " + auto.nombre; sel.appendChild(o);
  ESTILOS.forEach(e => { const x = document.createElement("option"); x.value = e.id; x.textContent = e.nombre; sel.appendChild(x); });
  sel.value = prev;
  notaEstilo();
}
function estiloElegidoId() { const v = $("estilo").value; return !v || v === "auto" ? estiloAutomatico(encActual()).id : v; }
function notaEstilo() {
  const e = estiloPorId(estiloElegidoId()), u = estilosUsuario()[e.id] || {}, f = Object.assign({}, e.fuentes, u.fuentes || {});
  const ad = u.adornos || {};
  $("notaEstilo").textContent = "Letras: " + f.titulo + " · " + f.display + " · " + f.texto + ". Adornos: " +
    (ad.esquina || ad.divisor ? "de tu biblioteca" : "de fábrica") + ". Se cambian en la pestaña Adornos.";
}

// ---- pestaña Adornos
function llenarEstiloAdornos(id) {
  const sel = $("eEstilo");
  if (!sel.options.length) ESTILOS.forEach(e => { const x = document.createElement("option"); x.value = e.id; x.textContent = e.nombre; sel.appendChild(x); });
  sel.value = id || estiloElegidoId();
  pintarEstiloAdornos();
}
async function pintarEstiloAdornos() {
  const e = estiloPorId($("eEstilo").value), u = estilosUsuario()[e.id] || {}, f = Object.assign({}, e.fuentes, u.fuentes || {});
  const enc = encActual();
  $("eNota").textContent = (e.claves.length ? "Se usa solo cuando el nombre dice: " + e.claves.slice(0, 5).join(", ") + (e.claves.length > 5 ? "…" : "") + "." : "Se usa cuando ningún otro estilo coincide.") +
    (enc.nombre ? " Tu programa actual (" + enc.nombre + ") lleva «" + estiloAutomatico(enc).nombre + "»." : "");
  $("fTit").value = f.titulo; $("fDis").value = f.display; $("fTxt").value = f.texto;
  const ind = await leerIndice(), nom = (ruta) => { const a = ind.find(x => x.pdf === ruta); return a ? (a.etiquetas || a.id) : "de tu biblioteca"; };
  const ad = u.adornos || {};
  $("rEsquina").textContent = ad.esquina ? nom(ad.esquina) : "De fábrica (barrocas grabadas)";
  $("rDivisor").textContent = ad.divisor ? nom(ad.divisor) : "De fábrica";
  document.querySelectorAll("[data-quitar]").forEach(b => { b.hidden = !ad[b.getAttribute("data-quitar")]; });
  pintarBusquedas();
  pintarGaleria(ind);
}
function cambiarUsuarioEstilo(fn) {
  const id = $("eEstilo").value, todos = estilosUsuario(), u = todos[id] = todos[id] || {};
  fn(u); guardarEstilosUsuario(todos); pintarEstiloAdornos(); notaEstilo();
}
function pintarBusquedas() {
  const e = estiloPorId($("eEstilo").value), lista = e.magnific.concat(AD.ideas[e.id] || []);
  $("busquedas").innerHTML = lista.map(([r, q, pq]) => '<div role="button" tabindex="0" data-q="' + esc(q) + '" title="' + esc(pq || "Abrir en Magnific") + '">' +
    esc(RANURAS[r] || "Otro") + ": " + esc(q) + "</div>").join("");
  $("busquedas").querySelectorAll("[data-q]").forEach(b => b.addEventListener("click", () => { abrirWeb(urlMagnific(b.getAttribute("data-q"))); estado("Abrí la búsqueda en tu navegador. Baja los vectores que te gusten y luego «Revisar mis Descargas».", "ok"); }));
}
async function pedirIdeas() {
  const enc = encActual();
  if (!enc.nombre) { estado("Primero lee o escribe el programa (necesito el NOMBRE de la fiesta).", "error"); return; }
  if (!revisarClave()) return;
  const e = estiloPorId($("eEstilo").value);
  estado("Pidiendo ideas de adornos para " + enc.nombre + "...", "trabajando");
  AD.ideas[e.id] = await ideasMagnific(enc, e);
  pintarBusquedas();
  estado("Listo: " + AD.ideas[e.id].length + " búsquedas nuevas. Toca una para abrirla.", "ok");
}

// ---- Descargas
function adivinarRanura(n) {
  n = n.toLowerCase();
  if (/corner|esquina|angle/.test(n)) return "esquina";
  if (/divider|separator|divisor|line|border|flourish/.test(n)) return "divisor";
  return "otro";
}
async function revisarDescargas() {
  $("dCarpeta").textContent = "Carpeta: " + rutaDescargas();
  estado("Revisando " + rutaDescargas() + "...", "trabajando");
  const r = await buscarDescargas(10);
  AD.descargas = r.archivos;
  const c = $("descargas"), est = estiloPorId($("eEstilo").value);
  if (!r.archivos.length) {
    c.innerHTML = '<div class="vacio">No hay vectores nuevos de los últimos 10 días (zip, ai, eps, svg o pdf).</div>';
    $("bAgregarBib").hidden = true; estado("No encontré descargas nuevas.", ""); return;
  }
  c.innerHTML = r.archivos.map((a, i) => '<div class="desc" data-i="' + i + '">' +
    '<label class="sw"><input type="checkbox" checked><span></span>' + esc(a.nombre) + '</label>' +
    '<div class="desc-fila"><select>' + Object.keys(RANURAS).map(k => '<option value="' + k + '"' + (k === adivinarRanura(a.nombre) ? " selected" : "") + ">" + RANURAS[k] + "</option>").join("") +
    '</select><input placeholder="Etiquetas (ej. rosas guadalupana)" value="' + esc(est.nombre.split(" ")[0].toLowerCase()) + '"></div></div>').join("");
  $("bAgregarBib").hidden = false;
  estado("Encontré " + r.archivos.length + " archivo(s). Palomea los que quieras y elige para qué son.", "ok");
}
async function agregarSeleccion() {
  const sel = [];
  $("descargas").querySelectorAll(".desc").forEach(d => {
    if (!d.querySelector("input[type=checkbox]").checked) return;
    const a = AD.descargas[Number(d.getAttribute("data-i"))];
    sel.push({ item: a, ranura: d.querySelector("select").value, etiquetas: d.querySelector(".desc-fila input").value.trim(), estilo: $("eEstilo").value });
  });
  if (!sel.length) { estado("Palomea al menos un archivo.", "error"); return; }
  const r = await agregarABiblioteca(sel);
  $("descargas").innerHTML = ""; $("bAgregarBib").hidden = true;
  await pintarEstiloAdornos();
  estado((r.agregados ? "Agregué " + r.agregados + " adorno(s) a tu biblioteca, ya a una tinta." : "No se agregó nada.") +
    (r.fallas.length ? "\nNo se pudo: " + r.fallas.join("; ") : ""), r.fallas.length && !r.agregados ? "error" : "ok");
}

// ---- galeria
async function pintarGaleria(ind) {
  ind = ind || await leerIndice();
  const lista = ind.filter(a => !AD.filtro || a.ranura === AD.filtro), g = $("galeria");
  if (!lista.length) { g.innerHTML = '<div class="vacio">' + (ind.length ? "No hay adornos de este tipo." : "Todavía no hay adornos. Baja algunos de Magnific y dale «Revisar mis Descargas».") + "</div>"; return; }
  g.innerHTML = lista.slice(0, 60).map(a => '<div class="thumb" data-id="' + esc(a.id) + '"><img alt=""><div class="thumb-n">' + esc(a.etiquetas || a.id) + "</div>" +
    (a.aviso ? '<div class="thumb-av">' + esc(a.aviso) + "</div>" : "") +
    '<div class="thumb-b"><div role="button" tabindex="0" data-usar="esquina">Esquina</div><div role="button" tabindex="0" data-usar="divisor">Divisor</div></div></div>').join("");
  for (const a of lista.slice(0, 60)) {
    const t = g.querySelector('[data-id="' + a.id + '"]');
    miniaturaDataUrl(a.png).then(u => { if (u) t.querySelector("img").src = u; });
    t.querySelectorAll("[data-usar]").forEach(b => b.addEventListener("click", () => {
      const r = b.getAttribute("data-usar");
      cambiarUsuarioEstilo(u => { u.adornos = u.adornos || {}; u.adornos[r] = a.pdf; });
      estado("Listo: «" + (a.etiquetas || a.id) + "» es ahora " + (r === "esquina" ? "la esquina" : "el divisor") + " de " + estiloPorId($("eEstilo").value).nombre + ".", "ok");
    }));
  }
}

// ---- eventos
$("estilo").addEventListener("change", () => { setCfg("estiloSel", $("estilo").value); notaEstilo(); });
$("eEstilo").addEventListener("change", pintarEstiloAdornos);
document.querySelectorAll(".paso").forEach(b => b.addEventListener("click", () => {
  const t = b.getAttribute("data-t");
  if (t === "t3") llenarSelectorEstilo();
  if (t === "t6") { llenarEstiloAdornos(); $("dCarpeta").textContent = "Carpeta: " + rutaDescargas(); }
}));
[["fTit", "titulo"], ["fDis", "display"], ["fTxt", "texto"]].forEach(([id, k]) => $(id).addEventListener("change", () => {
  const v = $(id).value.trim(); if (!v) return;
  cambiarUsuarioEstilo(u => { u.fuentes = u.fuentes || {}; u.fuentes[k] = v; });
  estado("Fuente guardada para " + estiloPorId($("eEstilo").value).nombre + ".", "ok");
}));
$("bFuentes").addEventListener("click", accion(() => revisarFuentes(false, [$("fTit").value, $("fDis").value, $("fTxt").value]), "Revisando fuentes..."));
document.querySelectorAll("[data-quitar]").forEach(b => b.addEventListener("click", () => cambiarUsuarioEstilo(u => { if (u.adornos) delete u.adornos[b.getAttribute("data-quitar")]; })));
$("bIdeas").addEventListener("click", accion(pedirIdeas, "Pidiendo ideas..."));
$("bRevisarDesc").addEventListener("click", accion(revisarDescargas, "Revisando Descargas..."));
$("bAgregarBib").addEventListener("click", accion(agregarSeleccion, "Pasando a una tinta..."));
$("bCarpetaDesc").addEventListener("click", accion(async () => {
  const f = await fsys.getFolder(); if (!f) return;
  setCfg("descargasDir", f.nativePath); $("dCarpeta").textContent = "Carpeta: " + f.nativePath; estado("Listo, busco descargas en " + f.nativePath + ".", "ok");
}, "Elige la carpeta..."));
document.querySelectorAll("#bFiltro [role=button]").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll("#bFiltro [role=button]").forEach(x => x.classList.toggle("on", x === b));
  AD.filtro = b.getAttribute("data-v"); pintarGaleria();
}));
llenarSelectorEstilo();
