// Arma tools/salida/biblio_prueba.idjs: corre biblioteca.js dentro del UXP de InDesign
// contra una carpeta de Descargas y una biblioteca de prueba (no toca las reales).
const fs = require("fs"), path = require("path");
const JSZip = require("../ProgramasIA/lib/jszip.min.js");
const RAIZ = path.resolve(__dirname, ".."), SAL = path.join(__dirname, "salida");
const R = (s) => fs.readFileSync(path.join(RAIZ, "ProgramasIA", s), "utf8");
const D = path.join(SAL, "descargas_prueba"), DOC = path.join(SAL, "docs_prueba");
const LOGF = path.join(SAL, "biblio_prueba.txt").replace(/\\/g, "/");

(async () => {
  fs.rmSync(D, { recursive: true, force: true }); fs.rmSync(DOC, { recursive: true, force: true });
  fs.mkdirSync(D, { recursive: true }); fs.mkdirSync(DOC, { recursive: true });
  const svg = fs.readFileSync(path.join(SAL, "ai_prueba", "rosa_color.svg"));
  const z = new JSZip();
  z.file("License free.txt", "x"); z.file("roses-corner/vector.svg", svg); z.file("roses-corner/preview.jpg", "x");
  fs.writeFileSync(path.join(D, "vintage-roses-corner-ornament_123.zip"), await z.generateAsync({ type: "nodebuffer" }));
  fs.writeFileSync(path.join(D, "divider-line.svg"), svg);

  const cuerpo = [
    'const uxp = require("uxp"), fsys = uxp.storage.localFileSystem, fmts = uxp.storage.formats, indesign = require("indesign"), app = indesign.app;',
    "const CFG = { descargasDir: " + JSON.stringify(D) + " };",
    "function cfg(k, d) { return k in CFG ? CFG[k] : d; } function setCfg(k, v) { CFG[k] = v; }",
    "const LOG = []; function estado(t) { LOG.push(t); }",
    "const JSZipLib = (function () { var module = { exports: {} }, exports = module.exports;\n" + R("lib/jszip.min.js") + "\n; return module.exports; })();",
    R("estilos.js"),
    "function es3(o) { return JSON.stringify(o); }",
    "function extend(code) { const r = app.doScript(code, indesign.ScriptLanguage.JAVASCRIPT); return r == null ? '' : String(r); }",
    "function b64(buf) { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }",
    R("biblioteca.js"),
    "function rutaDocumentos() { return " + JSON.stringify(DOC) + "; }",
    "async function rutaConvertidor() { return " + JSON.stringify(path.join(RAIZ, "ProgramasIA", "convertir_adornos.ps1")) + "; }",
    "async function prueba() {",
    "  const out = [];",
    "  try {",
    "    const r = await buscarDescargas(10); out.push('encontrados: ' + r.archivos.map(a => a.nombre).join(', '));",
    "    const sel = r.archivos.map(a => ({ item: a, ranura: a.nombre.indexOf('corner') >= 0 ? 'esquina' : 'divisor', etiquetas: 'rosas prueba', estilo: 'guadalupana' }));",
    "    const ag = await agregarABiblioteca(sel); out.push('agregados: ' + ag.agregados + ' fallas: ' + JSON.stringify(ag.fallas));",
    "    const ind = await leerIndice(); out.push('indice: ' + JSON.stringify(ind.map(a => [a.ranura, a.etiquetas, a.aviso, a.pdf])));",
    "    const r2 = await buscarDescargas(10); out.push('segunda revision: ' + r2.archivos.length);",
    "    const mini = await miniaturaDataUrl(ind[0].png); out.push('miniatura: ' + mini.length + ' caracteres');",
    "  } catch (e) { out.push('ERROR ' + (e && e.message) + ' ' + (e && e.stack) + ' ' + String(e)); }",
    "  require('fs').writeFileSync(" + JSON.stringify(LOGF) + ", out.join('\\n') + '\\n--\\n' + LOG.join('\\n'));",
    "}",
    "return prueba();"
  ].join("\n");
  fs.writeFileSync(path.join(SAL, "biblio_prueba.idjs"), cuerpo);
  console.log("listo");
})();
