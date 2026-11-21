// =====================================================================
//  Arma todo lo que se entrega a partir de ProgramasIA/ (no editar a mano
//  PRUEBA_MOTOR/prueba_motor.jsx ni los .ccx: se regeneran aqui).
//    node tools/build.js
//  - PRUEBA_MOTOR/prueba_motor.jsx  (motor + ejemplo de Atemajac, sin panel)
//  - tools/salida/prueba_com.jsx    (igual, sin alert, para probar por COM)
//  - dist/ProgramasIA.ccx           (el panel empaquetado)
//  - dist/paquete/                  (lo que lleva el instalador)
// =====================================================================
const fs = require("fs");
const path = require("path");
const JSZip = require("../ProgramasIA/lib/jszip.min.js");
const { parseMarcado } = require("../ProgramasIA/marcado.js");

const RAIZ = path.resolve(__dirname, "..");
const PANEL = path.join(RAIZ, "ProgramasIA");
const DIST = path.join(RAIZ, "dist");
const ASSETS = ["esquina.pdf", "banda_h.pdf", "banda_v.pdf", "divisor_izq.pdf", "divisor_der.pdf"];

// JSON que ExtendScript (ES3) puede leer: U+2028/U+2029 rompen las cadenas
function jsonES3(o) { return JSON.stringify(o).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029"); }

function copiar(de, a) { fs.mkdirSync(path.dirname(a), { recursive: true }); fs.copyFileSync(de, a); }
function copiarCarpeta(de, a) {
  for (const e of fs.readdirSync(de, { withFileTypes: true })) {
    const s = path.join(de, e.name), d = path.join(a, e.name);
    if (e.isDirectory()) copiarCarpeta(s, d); else copiar(s, d);
  }
}

function pruebaMotor(conAlert) {
  const engine = fs.readFileSync(path.join(PANEL, "engine.jsx"), "utf8");
  const marcado = fs.readFileSync(path.join(RAIZ, "EJEMPLO_MARCADO_ATEMAJAC.txt"), "utf8");
  const d = parseMarcado(marcado);
  const DATA = {
    formato: { nombre: "Oficio", ancho: 330.298, alto: 464.989, sangrado: 0 },
    enc: d.enc, prog: d.prog, params: {},
    fuentes: { titulo: "Pinyon Script", display: "Playfair Display", texto: "Lora" }
  };
  const assets = "{" + ASSETS.map(n => n.replace(".pdf", "").replace("divisor_", "div_") + ': _here + "/assets/' + n + '"').join(", ") + "}";
  const cab = "// PRUEBA DEL MOTOR (sin panel ni API): arma el reverso de Atemajac 2027\n" +
    "// Archivo generado por tools/build.js a partir de ProgramasIA/engine.jsx\n" +
    "#target indesign\n" +
    "var _here = File($.fileName).parent.fsName;\n" +
    "var DATA = " + jsonES3(DATA) + ";\n" +
    "DATA.assets = " + assets + ";\n";
  let code = cab + engine.replace("/*__DATA__*/", "");
  if (conAlert) code += '\nalert(RESULT.split("|").join("\\r"));\n';
  return code;
}

async function ccx(destino) {
  const zip = new JSZip();
  (function agrega(dir, pre) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) agrega(p, pre + e.name + "/");
      else zip.file(pre + e.name, fs.readFileSync(p));
    }
  })(PANEL, "");
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, buf);
}

(async () => {
  // 1) prueba del motor
  fs.writeFileSync(path.join(RAIZ, "PRUEBA_MOTOR", "prueba_motor.jsx"), pruebaMotor(true));
  for (const n of ASSETS) copiar(path.join(PANEL, "assets", n), path.join(RAIZ, "PRUEBA_MOTOR", "assets", n));
  const salida = path.join(__dirname, "salida");
  fs.mkdirSync(salida, { recursive: true });
  fs.writeFileSync(path.join(salida, "prueba_com.jsx"), pruebaMotor(false).replace(
    'var _here = File($.fileName).parent.fsName;',
    'var _here = ' + JSON.stringify(path.join(RAIZ, "PRUEBA_MOTOR")) + ';'));

  // 2) panel empaquetado
  const version = JSON.parse(fs.readFileSync(path.join(PANEL, "manifest.json"), "utf8")).version;
  fs.rmSync(DIST, { recursive: true, force: true });
  await ccx(path.join(DIST, "ProgramasIA.ccx"));

  // 3) paquete del instalador
  const P = path.join(DIST, "paquete");
  copiar(path.join(DIST, "ProgramasIA.ccx"), path.join(P, "ProgramasIA.ccx"));
  copiarCarpeta(PANEL, path.join(P, "ProgramasIA"));
  copiarCarpeta(path.join(RAIZ, "PRUEBA_MOTOR"), path.join(P, "scripts", "PRUEBA_MOTOR"));
  copiar(path.join(RAIZ, "MedidasPlantillas.jsx"), path.join(P, "scripts", "MedidasPlantillas.jsx"));
  copiarCarpeta(path.join(RAIZ, "fuentes"), path.join(P, "fuentes"));
  copiar(path.join(RAIZ, "EJEMPLO_MARCADO_ATEMAJAC.txt"), path.join(P, "EJEMPLO_MARCADO_ATEMAJAC.txt"));
  copiar(path.join(RAIZ, "LEEME.txt"), path.join(P, "LEEME.txt"));
  for (const n of ["instalar.ps1", "desinstalar.ps1"]) copiar(path.join(RAIZ, "instalador", n), path.join(P, n));
  fs.writeFileSync(path.join(P, "VERSION.txt"), version + "\r\n");
  console.log("Listo: versión " + version + " en " + DIST);
})().catch(e => { console.error(e); process.exit(1); });
