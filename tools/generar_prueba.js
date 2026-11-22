// Arma un .jsx de prueba (motor + datos) a partir de un marcado, para correrlo por COM.
//   node tools/generar_prueba.js <marcado.txt> <salida.jsx> [ancho] [alto] [titulo display texto]
const fs = require("fs"), path = require("path");
const { parseMarcado } = require("../ProgramasIA/marcado.js");
const [, , ent, sal, ancho, alto, ft, fd, fx, semilla] = process.argv;
const V = require("../ProgramasIA/variantes.js");
const PANEL = path.join(__dirname, "..", "ProgramasIA").replace(/\\/g, "/");
// ExtendScript: todo lo que no es ASCII va como \uXXXX
const es3 = (o) => JSON.stringify(o).replace(/[^\x00-\x7e]/g, c => "\\" + "u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
const d = parseMarcado(fs.readFileSync(ent, "utf8"));
const A = {};
for (const [k, n] of [["esquina", "esquina"], ["banda_h", "banda_h"], ["banda_v", "banda_v"], ["div_izq", "divisor_izq"], ["div_der", "divisor_der"]]) A[k] = PANEL + "/assets/" + n + ".pdf";
const DATA = {
  formato: { nombre: "prueba", ancho: +(ancho || 330), alto: +(alto || 465), sangrado: 0 }, enc: d.enc, prog: d.prog, params: {}, assets: A,
  fuentes: { titulo: ft || "Pinyon Script", display: fd || "Playfair Display", texto: fx || "Lora" },
  impreso: "Impreso en: Imprenta Gutiérrez\nCd. Guzmán, Jal., Tel. (341) 412.0105 / 412.5508 · contacto@imprentagutierrez.com"
};
if (semilla) { const h = JSON.parse(fs.existsSync(sal + ".hist") ? fs.readFileSync(sal + ".hist", "utf8") : "[]"); const v = V.elegirVariante(h, "guadalupana", +semilla); const ap = V.aplicarVariante(v); DATA.params = ap.params; DATA.fuentes = ap.fuentes; if (process.env.COMP) DATA.params.composicion = process.env.COMP; console.log(V.describirVariante(v)); }
fs.writeFileSync(sal, fs.readFileSync(path.join(PANEL, "engine.jsx"), "utf8").replace("/*__DATA__*/", () => "var DATA = " + es3(DATA) + ";"));
console.log("ok " + d.prog.length + " parrafos");
