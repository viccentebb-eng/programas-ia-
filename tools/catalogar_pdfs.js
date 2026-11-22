// Cataloga los PDF modelo del taller (solo lee): medida, paginas, texto vivo o en curvas,
// miniatura de la pagina 1 y el texto extraido. Uso:
//   node tools/catalogar_pdfs.js "<carpeta de PDFs>" "<carpeta de salida>"
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const [, , ORIGEN, SALIDA] = process.argv;
const GS = "gswin64c";
fs.mkdirSync(path.join(SALIDA, "mini"), { recursive: true });
fs.mkdirSync(path.join(SALIDA, "texto"), { recursive: true });
const corto = (n) => n.replace(/\.pdf$/i, "").replace(/[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]+/g, "_").slice(0, 80);
const gs = (args) => execFileSync(GS, ["-q", "-dSAFER", "-dBATCH", "-dNOPAUSE", ...args], { encoding: "latin1", timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
const pdfs = fs.readdirSync(ORIGEN).filter(f => /\.pdf$/i.test(f)).sort();
const cat = [];
let i = 0;
for (const f of pdfs) {
  i++;
  const ruta = path.join(ORIGEN, f), c = corto(f), item = { archivo: f, id: c, mb: +(fs.statSync(ruta).size / 1048576).toFixed(1) };
  try {
    // paginas y medida (MediaBox de la 1) con el interprete de PDF de Ghostscript
    const info = gs(["-dNODISPLAY", "-dNOSAFER", "--permit-file-read=" + ruta, "-c",
      "(" + ruta.replace(/\\/g, "/") + ") (r) file runpdfbegin pdfpagecount = 1 pdfgetpage /MediaBox pget pop == quit"]).trim().split(/\s+/);
    item.paginas = parseInt(info[0], 10);
    const mb = info.slice(1).join(" ").replace(/[\[\]]/g, "").trim().split(/\s+/).map(Number);
    item.ancho_mm = Math.round((mb[2] - mb[0]) / 2.83465); item.alto_mm = Math.round((mb[3] - mb[1]) / 2.83465);
  } catch (e) { item.error_info = String(e.message).slice(0, 120); }
  try {
    const txt = gs(["-sDEVICE=txtwrite", "-dFirstPage=1", "-dLastPage=3", "-o", "-", ruta]);
    fs.writeFileSync(path.join(SALIDA, "texto", c + ".txt"), txt, "latin1");
    item.caracteres = txt.replace(/\s+/g, "").length; // pocos = texto en curvas
  } catch (e) { item.caracteres = -1; }
  try {
    gs(["-sDEVICE=png16m", "-r14", "-dFirstPage=1", "-dLastPage=1", "-dTextAlphaBits=4", "-dGraphicsAlphaBits=4", "-o", path.join(SALIDA, "mini", c + ".png"), ruta]);
  } catch (e) { item.error_mini = String(e.message).slice(0, 120); }
  cat.push(item);
  fs.writeFileSync(path.join(SALIDA, "catalogo.json"), JSON.stringify(cat, null, 1));
  console.log(i + "/" + pdfs.length + " " + f + " -> " + (item.ancho_mm || "?") + "x" + (item.alto_mm || "?") + " mm, " + (item.paginas || "?") + " p, " + item.caracteres + " car.");
}
console.log("LISTO");
