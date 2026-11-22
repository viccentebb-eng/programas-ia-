// Baja de Google Fonts todas las familias de los juegos de letras (variantes.js) a una carpeta,
// para instalarlas con ProgramasIA/instalar_fuentes.ps1. Uso: node tools/bajar_juegos_letras.js <carpeta>
const fs = require("fs"), path = require("path");
const { JUEGOS_LETRAS } = require("../ProgramasIA/variantes.js");
const destino = process.argv[2];
const familias = [...new Set(JUEGOS_LETRAS.flatMap(j => [j.titulo, j.display, j.texto]))];
(async () => {
  for (const fam of familias) {
    const q = encodeURIComponent(fam).replace(/%20/g, "+");
    let css = "";
    for (const f of [q + ":ital,wght@0,400;0,700;1,400;1,700", q + ":ital@0;1", q + ":wght@400;700", q]) {
      const r = await fetch("https://fonts.googleapis.com/css2?family=" + f, { headers: { "user-agent": "ProgramasIA/1.0" } });
      if (r.ok) { css = await r.text(); break; }
    }
    if (!css) { console.log("NO ESTA: " + fam); continue; }
    const dir = path.join(destino, fam); fs.mkdirSync(dir, { recursive: true });
    const vistos = {}; let n = 0;
    for (const b of css.split("@font-face").slice(1)) {
      const url = (/url\((https:[^)]+\.ttf)\)/.exec(b) || [])[1]; if (!url || vistos[url]) continue; vistos[url] = 1;
      const peso = (/font-weight:\s*(\d+)/.exec(b) || [, "400"])[1], cur = /font-style:\s*italic/.test(b);
      const est = ((peso === "700" ? "Bold" : "Regular") + (cur ? "Italic" : "")).replace("RegularItalic", "Italic");
      fs.writeFileSync(path.join(dir, fam.replace(/\s+/g, "") + "-" + est + ".ttf"), Buffer.from(await (await fetch(url)).arrayBuffer())); n++;
    }
    console.log(fam + ": " + n);
  }
})();
