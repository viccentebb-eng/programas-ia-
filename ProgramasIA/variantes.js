// =====================================================================
//  PROGRAMAS IA - variantes de diseño: ningún reverso debe parecerse a otro
//  Sacadas de los 152 PDF del taller (nov-2026). Cada reverso combina:
//  marco, estilo de título, cintillas, días, "Programa" y un juego de letras.
//  Se elige una combinación que no esté en el historial y que cambie al
//  menos 3 piezas contra las últimas propuestas.
//  Lo usan el panel (main.js) y el conector (servidor.js).
// =====================================================================
const VARIANTES = {
  composicion: ["clasica", "lateral", "banda", "asimetrica"],
  marco: ["barroco", "filetes", "grueso", "esquinas", "doble_grueso", "abierto"],
  titulo: ["manuscrita", "romana", "mixta"],
  cintilla: ["gris", "negra", "recuadro", "filetes"],
  dia: ["barra", "negrita", "invertido", "subrayado"],
  programa: ["espaciado", "manuscrita", "banda"]
};
// (Cormorant Garamond no: choca con versiones viejas instaladas)
// juegos de letras que combinan (manuscrita del título / encabezados / texto). Todas gratis en Google Fonts.
const JUEGOS_LETRAS = [
  { titulo: "Pinyon Script", display: "Playfair Display", texto: "Lora" },
  { titulo: "Great Vibes", display: "Cinzel", texto: "Crimson Pro" },
  { titulo: "Parisienne", display: "Spectral", texto: "EB Garamond" },
  { titulo: "Alex Brush", display: "Libre Baskerville", texto: "Libre Baskerville" },
  { titulo: "Italianno", display: "Cinzel", texto: "Spectral" },
  { titulo: "Rouge Script", display: "Playfair Display", texto: "Merriweather" },
  { titulo: "Tangerine", display: "EB Garamond", texto: "Cardo" },
  { titulo: "Monsieur La Doulaise", display: "Cinzel", texto: "Lora" },
  { titulo: "Mrs Saint Delafield", display: "Libre Caslon Text", texto: "Libre Caslon Text" },
  { titulo: "Allura", display: "Spectral", texto: "Crimson Pro" },
  { titulo: "Great Vibes", display: "Playfair Display", texto: "Alegreya" },
  { titulo: "Parisienne", display: "Cinzel", texto: "EB Garamond" }
];
// pesos por advocación: lo que mejor les va (no excluye lo demás)
const PREFERENCIAS = {
  guadalupana: { marco: { barroco: 2, esquinas: 2 }, titulo: { mixta: 2, manuscrita: 2 } },
  cristo: { marco: { grueso: 2, doble_grueso: 2 }, titulo: { romana: 3 }, cintilla: { negra: 2 } },
  santos: { titulo: { romana: 2, mixta: 2 } },
  sagrado_corazon: { titulo: { manuscrita: 2, mixta: 1 } },
  sagrada_familia: { titulo: { manuscrita: 2 } },
  mariano: { titulo: { manuscrita: 2, mixta: 2 } }
};

function azar(semilla) { let s = (semilla >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function firmaVariante(v) { return [v.composicion, v.marco, v.titulo, v.cintilla, v.dia, v.programa, v.letras].join("/"); }
function diferencias(a, b) { return ["composicion", "composicion", "marco", "titulo", "cintilla", "dia", "programa", "letras"].filter(k => a[k] !== b[k]).length; }
const PESO_COMPOSICION = { clasica: 1, lateral: 2, banda: 2, asimetrica: 2 };
function elegirPeso(lista, pesos, r) {
  const ws = lista.map(x => (pesos && pesos[x]) || 1), tot = ws.reduce((a, b) => a + b, 0);
  let u = r() * tot; for (let i = 0; i < lista.length; i++) { u -= ws[i]; if (u <= 0) return lista[i]; }
  return lista[lista.length - 1];
}
// historial: [{marco, titulo, ...}] más recientes al final. Devuelve una variante nueva.
function elegirVariante(historial, idEstilo, semilla) {
  historial = historial || [];
  const r = azar(semilla || Date.now()), pref = PREFERENCIAS[idEstilo] || {};
  const usadas = {}; historial.forEach(h => { usadas[firmaVariante(h)] = true; });
  const recientes = historial.slice(-5);
  let mejor = null, mejorDif = -1;
  for (let intento = 0; intento < 200; intento++) {
    const v = {
      composicion: elegirPeso(VARIANTES.composicion, PESO_COMPOSICION, r), marco: elegirPeso(VARIANTES.marco, pref.marco, r), titulo: elegirPeso(VARIANTES.titulo, pref.titulo, r),
      cintilla: elegirPeso(VARIANTES.cintilla, pref.cintilla, r), dia: elegirPeso(VARIANTES.dia, pref.dia, r),
      programa: elegirPeso(VARIANTES.programa, pref.programa, r), letras: Math.floor(r() * JUEGOS_LETRAS.length)
    };
    if (usadas[firmaVariante(v)]) continue;
    const dif = recientes.length ? Math.min.apply(null, recientes.map(h => diferencias(v, h))) : 6;
    if (dif >= 3) return v;
    if (dif > mejorDif) { mejor = v; mejorDif = dif; }
  }
  return mejor;
}
// lo que el motor recibe (params) y las letras
function aplicarVariante(v) {
  return {
    params: { composicion: v.composicion || "clasica", marco: v.marco, titulo_estilo: v.titulo, cintilla_estilo: v.cintilla, dia_estilo: v.dia, programa_estilo: v.programa },
    fuentes: Object.assign({}, JUEGOS_LETRAS[v.letras % JUEGOS_LETRAS.length])
  };
}
function describirVariante(v) {
  const L = JUEGOS_LETRAS[v.letras % JUEGOS_LETRAS.length];
  return "Acomodo " + (v.composicion || "clasica") + ", marco " + v.marco.replace("_", " ") + ", título " + v.titulo + ", cintillas " + v.cintilla + ", días " + v.dia +
    ", «Programa» " + v.programa + "; letras " + L.titulo + " / " + L.display + " / " + L.texto + ".";
}

if (typeof module !== "undefined" && module.exports) module.exports = { VARIANTES, JUEGOS_LETRAS, elegirVariante, aplicarVariante, describirVariante, firmaVariante };
