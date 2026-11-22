// =====================================================================
//  PROGRAMAS IA - estilos por advocacion
//  Cada estilo = fuentes + ajustes del motor + adornos + busquedas sugeridas
//  para Magnific. Los adornos que el usuario elige de su biblioteca y las
//  fuentes que cambia se guardan aparte (cfg "estilos_usuario") y mandan.
//  Ranuras de adorno: esquina, divisor (izq; el derecho se refleja),
//  cenefa (banda_h + banda_v, solo el estilo de fabrica la trae).
// =====================================================================
const ADORNOS_FABRICA = { esquina: "assets/esquina.pdf", banda_h: "assets/banda_h.pdf", banda_v: "assets/banda_v.pdf", div_izq: "assets/divisor_izq.pdf", div_der: "assets/divisor_der.pdf" };

// Reglas de la casa para adornos (las usan las busquedas, Claude y el filtro de la biblioteca):
// barroco/ornamentado, grabado o de linea, a una tinta; nada de iconos, caricaturas, planos ni fotos.
const REGLAS_ADORNOS = "Adornos de la casa: BARROCOS y ORNAMENTADOS (acanto, volutas, filigrana, rosas o lirios grabados, estilo victoriano o grabado antiguo), " +
  "de linea o grabado con sombreado de rayas, SOLO NEGRO (K; grises como tramas de K estan bien), placa de linea a UNA tinta: nada de negro compuesto, CMY ni registro. Calidad como la esquina barroca de referencia. " +
  "PROHIBIDO: figuras geometricas simples, iconos, caricaturas, estilo plano (flat), clipart infantil, acuarela, degradados, fotos o 3D.";
// minimo de puntos de curva por ranura (la esquina de referencia tiene 3345; su divisor, 21)
const MIN_PUNTOS = { esquina: 400, divisor: 15, otro: 150 };

// el orden importa: se elige el primero cuyas claves aparecen en el NOMBRE (o PRE).
// Todas las busquedas piden barroco/ornamentado/grabado.
const ESTILOS = [
  { id: "guadalupana", nombre: "Guadalupana", claves: ["guadalupe", "guadalupana", "tepeyac"],
    fuentes: { titulo: "Great Vibes", display: "Cinzel", texto: "Lora" },
    params: { sombra_cintillas: 22, sombra_dias: 14 },
    magnific: [["esquina", "baroque roses corner ornament engraving vector"], ["esquina", "ornate rose filigree corner black and white vector"],
      ["divisor", "baroque rose flourish divider engraving vector"], ["otro", "ornate guadalupe rays halo engraving vector"],
      ["divisor", "victorian roses scroll divider line art vector"]] },
  { id: "sagrado_corazon", nombre: "Sagrado Corazón", claves: ["sagrado corazón", "sagrado corazon", "corazón de jesús", "corazon de jesus", "corazón de maría", "inmaculado corazón"],
    fuentes: { titulo: "Alex Brush", display: "Spectral", texto: "EB Garamond" },
    params: { sombra_cintillas: 18 },
    magnific: [["otro", "ornate sacred heart flames engraving vector"], ["esquina", "baroque acanthus corner ornament engraving vector"],
      ["divisor", "ornate crown of thorns flourish divider engraving"], ["esquina", "baroque lily filigree corner vector black"]] },
  { id: "sagrada_familia", nombre: "Sagrada Familia", claves: ["sagrada familia", "familia de nazaret"],
    fuentes: { titulo: "Parisienne", display: "Cinzel", texto: "Crimson Pro" },
    params: {},
    magnific: [["esquina", "baroque lily corner ornament engraving vector"], ["divisor", "ornate olive branch flourish divider engraving vector"],
      ["esquina", "victorian acanthus filigree corner black vector"], ["divisor", "baroque scroll divider engraving vector"]] },
  { id: "cristo", nombre: "Cristo / Señor de…", claves: ["señor de", "senor de", "cristo", "santo niño", "santo nino", "divino rostro", "santísimo", "santisimo", "preciosa sangre", "divina misericordia"],
    fuentes: { titulo: "Great Vibes", display: "Cinzel", texto: "Lora" },
    params: { sombra_cintillas: 24 },
    magnific: [["otro", "ornate cross with rays engraving vector"], ["esquina", "baroque gothic corner ornament engraving vector"],
      ["divisor", "ornate wheat and grapes flourish divider engraving"], ["divisor", "baroque crown of thorns scroll divider vector"]] },
  { id: "mariano", nombre: "Mariano (otras vírgenes)", claves: ["virgen", "nuestra señora", "nuestra senora", "inmaculada", "purísima", "purisima", "asunción", "asuncion", "rosario", "candelaria", "dolores", "maría", "maria auxiliadora", "refugio", "soledad", "talpa", "zapopan", "san juan de los lagos"],
    fuentes: { titulo: "Pinyon Script", display: "Playfair Display", texto: "Lora" },
    params: {},
    magnific: [["esquina", "baroque lily corner ornament engraving vector"], ["esquina", "ornate acanthus filigree corner black and white vector"],
      ["divisor", "baroque flourish divider engraving vector"], ["otro", "ornate marian monogram engraving vector"]] },
  { id: "santos", nombre: "Santos y santas", claves: ["san ", "santo ", "santa ", "señor san", "beato", "beata"],
    fuentes: { titulo: "Pinyon Script", display: "Cinzel", texto: "EB Garamond" },
    params: {},
    magnific: [["esquina", "baroque acanthus corner ornament engraving vector"], ["divisor", "ornate laurel flourish divider engraving vector"],
      ["esquina", "victorian filigree scroll corner black vector"], ["otro", "ornate palm branch engraving vector"]] },
  { id: "barroco", nombre: "Barroco grabado (de fábrica)", claves: [],
    fuentes: { titulo: "Pinyon Script", display: "Playfair Display", texto: "Lora" },
    params: {},
    magnific: [["esquina", "baroque acanthus corner ornament engraving vector"], ["divisor", "baroque flourish divider engraving vector"],
      ["esquina", "ornate filigree corner black and white vector"]] }
];

function estiloPorId(id) { return ESTILOS.find(e => e.id === id) || ESTILOS[ESTILOS.length - 1]; }
const ACENTOS = new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");
function sinAcentos(t) { return String(t || "").toLowerCase().normalize("NFD").replace(ACENTOS, ""); }
// elige el estilo segun el nombre de la fiesta; sin coincidencia, el de fabrica
function estiloAutomatico(enc) {
  const t = " " + sinAcentos((enc && (enc.pre || "")) + " " + (enc && (enc.nombre || ""))) + " ";
  for (const e of ESTILOS) for (const c of e.claves) if (t.indexOf(sinAcentos(c)) >= 0) return e;
  return estiloPorId("barroco");
}

// lo que el usuario cambio de cada estilo: { id: { fuentes: {...}, adornos: { esquina: ruta, divisor: ruta } } }
function estilosUsuario() { try { return JSON.parse(cfg("estilos_usuario", "{}")) || {}; } catch (e) { return {}; } }
function guardarEstilosUsuario(u) { setCfg("estilos_usuario", JSON.stringify(u)); }

// estilo listo para el motor: fuentes, params y rutas de adornos (absolutas)
async function resolverEstilo(id) {
  const e = estiloPorId(id), u = estilosUsuario()[id] || {};
  const fuentes = Object.assign({}, e.fuentes, u.fuentes || {});
  const pf = await fsys.getPluginFolder();
  const fabrica = {};
  for (const k in ADORNOS_FABRICA) fabrica[k] = (await pf.getEntry(ADORNOS_FABRICA[k])).nativePath;
  const ad = u.adornos || {};
  const adornos = {
    // la cenefa grabada solo combina con las esquinas de fabrica: si eligen otra esquina, se quita
    esquina: ad.esquina || fabrica.esquina,
    banda_h: ad.esquina ? null : fabrica.banda_h,
    banda_v: ad.esquina ? null : fabrica.banda_v,
    div_izq: ad.divisor || fabrica.div_izq,
    div_der: ad.divisor ? null : fabrica.div_der
  };
  if (ad.esquina_mm) adornos.esquina_mm = ad.esquina_mm;
  return { estilo: e, fuentes, params: Object.assign({}, e.params), adornos };
}
