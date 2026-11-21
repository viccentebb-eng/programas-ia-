// =====================================================================
//  PROGRAMAS IA - estilos por advocacion
//  Cada estilo = fuentes + ajustes del motor + adornos + busquedas sugeridas
//  para Magnific. Los adornos que el usuario elige de su biblioteca y las
//  fuentes que cambia se guardan aparte (cfg "estilos_usuario") y mandan.
//  Ranuras de adorno: esquina, divisor (izq; el derecho se refleja),
//  cenefa (banda_h + banda_v, solo el estilo de fabrica la trae).
// =====================================================================
const ADORNOS_FABRICA = { esquina: "assets/esquina.pdf", banda_h: "assets/banda_h.pdf", banda_v: "assets/banda_v.pdf", div_izq: "assets/divisor_izq.pdf", div_der: "assets/divisor_der.pdf" };

// el orden importa: se elige el primero cuyas claves aparecen en el NOMBRE (o PRE)
const ESTILOS = [
  { id: "guadalupana", nombre: "Guadalupana", claves: ["guadalupe", "guadalupana", "tepeyac"],
    fuentes: { titulo: "Great Vibes", display: "Cinzel", texto: "Lora" },
    params: { sombra_cintillas: 22, sombra_dias: 14 },
    magnific: [["esquina", "roses corner ornament engraving vector"], ["divisor", "rose flourish divider vector black"], ["esquina", "baroque floral corner line art"], ["otro", "virgin of guadalupe rays halo vector line art"], ["otro", "stars border ornament vector black"]] },
  { id: "sagrado_corazon", nombre: "Sagrado Corazón", claves: ["sagrado corazón", "sagrado corazon", "corazón de jesús", "corazon de jesus", "corazón de maría", "inmaculado corazón"],
    fuentes: { titulo: "Alex Brush", display: "Cormorant Garamond", texto: "EB Garamond" },
    params: { sombra_cintillas: 18 },
    magnific: [["otro", "sacred heart flames engraving vector"], ["divisor", "crown of thorns divider vector"], ["esquina", "lily corner ornament engraving vector"], ["divisor", "vintage flourish divider heart vector"]] },
  { id: "sagrada_familia", nombre: "Sagrada Familia", claves: ["sagrada familia", "familia de nazaret"],
    fuentes: { titulo: "Parisienne", display: "Cinzel", texto: "Crimson Pro" },
    params: {},
    magnific: [["esquina", "lily flower corner engraving vector"], ["divisor", "olive branch divider line art vector"], ["otro", "holy family silhouette line art vector"], ["esquina", "victorian floral corner vector black"]] },
  { id: "cristo", nombre: "Cristo / Señor de…", claves: ["señor de", "senor de", "cristo", "santo niño", "santo nino", "divino rostro", "santísimo", "santisimo", "preciosa sangre", "divina misericordia"],
    fuentes: { titulo: "Great Vibes", display: "Cinzel", texto: "Lora" },
    params: { sombra_cintillas: 24 },
    magnific: [["otro", "cross with rays engraving vector"], ["divisor", "crown of thorns line art divider"], ["esquina", "gothic corner ornament vector black"], ["divisor", "wheat and grapes eucharist divider vector"]] },
  { id: "mariano", nombre: "Mariano (otras vírgenes)", claves: ["virgen", "nuestra señora", "nuestra senora", "inmaculada", "purísima", "purisima", "asunción", "asuncion", "rosario", "candelaria", "dolores", "maría", "maria auxiliadora", "refugio", "soledad", "talpa", "zapopan", "san juan de los lagos"],
    fuentes: { titulo: "Pinyon Script", display: "Playfair Display", texto: "Lora" },
    params: {},
    magnific: [["esquina", "lily corner ornament engraving vector"], ["otro", "marian monogram vector line art"], ["divisor", "rosary divider ornament vector"], ["esquina", "baroque acanthus corner vector black"]] },
  { id: "santos", nombre: "Santos y santas", claves: ["san ", "santo ", "santa ", "señor san", "beato", "beata"],
    fuentes: { titulo: "Pinyon Script", display: "Cinzel", texto: "EB Garamond" },
    params: {},
    magnific: [["esquina", "baroque corner ornament engraving vector"], ["divisor", "laurel branch divider vector black"], ["otro", "palm branch martyr line art vector"], ["esquina", "acanthus scroll corner vector"]] },
  { id: "barroco", nombre: "Barroco grabado (de fábrica)", claves: [],
    fuentes: { titulo: "Pinyon Script", display: "Playfair Display", texto: "Lora" },
    params: {},
    magnific: [["esquina", "baroque corner ornament engraving vector"], ["divisor", "vintage flourish divider vector black"], ["otro", "engraved floral border vector"]] }
];

function estiloPorId(id) { return ESTILOS.find(e => e.id === id) || ESTILOS[ESTILOS.length - 1]; }
function sinAcentos(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
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
