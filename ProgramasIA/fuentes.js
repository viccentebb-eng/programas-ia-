// =====================================================================
//  PROGRAMAS IA - fuentes: revisa cuales faltan, las baja de Google Fonts
//  (gratuitas) y las instala para el usuario, sin permisos de administrador.
//  Usa del panel: extend(), es3(), estado(), fsys, fmts.
// =====================================================================

// Familias que InDesign no tiene instaladas (de la lista dada).
function fuentesFaltantes(familias) {
  const code = [
    'var pedidas = ' + es3(familias) + ', hay = {}, faltan = [];',
    'var fams = app.fonts.everyItem().fontFamily, st = app.fonts.everyItem().status;',
    'for (var i = 0; i < fams.length; i++) if (st[i] == FontStatus.INSTALLED) hay[String(fams[i]).toLowerCase()] = true;',
    'for (var j = 0; j < pedidas.length; j++) if (!hay[String(pedidas[j]).toLowerCase()]) faltan.push(pedidas[j]);',
    'faltan.join("|");'
  ].join("\n");
  const r = extend(code);
  return r ? r.split("|").filter(Boolean) : [];
}

// Baja una familia de Google Fonts (regular, negrita y cursivas si existen) a carpeta/Familia/.
// Sin agente de navegador, Google entrega .ttf, que es lo que Windows instala.
async function bajarFamilia(familia, carpeta) {
  const q = encodeURIComponent(familia).replace(/%20/g, "+");
  const intentos = [q + ":ital,wght@0,400;0,700;1,400;1,700", q + ":ital@0;1", q];
  let css = "";
  for (const fam of intentos) {
    const r = await red("https://fonts.googleapis.com/css2?family=" + fam + "&display=swap", { headers: { "user-agent": "ProgramasIA/1.0" } });
    if (r.ok) { css = await r.text(); break; }
  }
  if (!css) throw new Error("\"" + familia + "\" no está en Google Fonts. Instálala a mano o actívala en Adobe Fonts.");
  const caras = [], vistos = {};
  css.split("@font-face").slice(1).forEach(b => {
    const url = (/url\((https:[^)]+\.(ttf|otf))\)/.exec(b) || [])[1];
    if (!url || vistos[url]) return;
    vistos[url] = true;
    const peso = (/font-weight:\s*(\d+)/.exec(b) || [, "400"])[1], cursiva = /font-style:\s*italic/.test(b);
    const estilo = (peso === "700" ? "Bold" : "Regular") + (cursiva ? "Italic" : "");
    caras.push({ url, archivo: familia.replace(/[^A-Za-z0-9]+/g, "") + "-" + estilo.replace("RegularItalic", "Italic") + "." + /\.(ttf|otf)$/.exec(url)[1] });
  });
  if (!caras.length) throw new Error("Google Fonts no dio archivos instalables para \"" + familia + "\".");
  const dir = await carpeta.createFolder(familia.replace(/[\\/:*?"<>|]/g, ""), { overwrite: true }).catch(() => carpeta.getEntry(familia));
  for (const c of caras) {
    const r = await red(c.url);
    if (!r.ok) throw new Error("No pude bajar " + c.archivo + " (" + r.status + ")");
    const f = await dir.createFile(c.archivo, { overwrite: true });
    await f.write(await r.arrayBuffer(), { format: fmts.binary });
  }
  return caras.length;
}

// Corre instalar_fuentes.ps1 (va dentro del panel) sobre la carpeta y espera a que termine.
async function instalarCarpetaFuentes(carpeta) {
  const pf = await fsys.getPluginFolder();
  const ps1 = (await pf.getEntry("instalar_fuentes.ps1")).nativePath;
  const listo = await carpeta.createFile("listo.txt", { overwrite: true });
  await listo.write("", { format: fmts.utf8 });
  const cmd = await carpeta.createFile("instalar_fuentes.cmd", { overwrite: true });
  await cmd.write("@echo off\r\nchcp 65001 >nul\r\npowershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + ps1 +
    "\" -Carpeta \"" + carpeta.nativePath + "\" -Listo \"" + listo.nativePath + "\"\r\n", { format: fmts.utf8 });
  // ExtendScript puede abrir el .cmd con Windows; UXP solo no puede correr programas
  const r = extend('File(' + es3(cmd.nativePath) + ').execute() ? "ok" : "no";');
  if (r !== "ok") throw new Error("Windows no dejó correr el instalador de fuentes.");
  for (let i = 0; i < 90; i++) {
    await new Promise(res => setTimeout(res, 1000));
    const t = String(await listo.read({ format: fmts.utf8 })).trim();
    if (t) return t;
  }
  throw new Error("El instalador de fuentes tardó demasiado.");
}

// Boton de Ajustes y aviso al generar: revisa las tres fuentes y baja las que falten.
async function revisarFuentes(silencioso) {
  const pedidas = [cfg("fTit", "Pinyon Script"), cfg("fDis", "Playfair Display"), cfg("fTxt", "Lora")].filter(Boolean);
  const faltan = fuentesFaltantes(pedidas);
  if (!faltan.length) { if (!silencioso) estado("Todas las fuentes están instaladas: " + pedidas.join(", ") + "."); return true; }
  estado("Faltan fuentes: " + faltan.join(", ") + ". Bajándolas de Google Fonts...");
  const base = await fsys.getDataFolder();
  const carpeta = await base.createFolder("fuentes_" + Date.now());
  const problemas = [];
  for (const fam of faltan) {
    try { const n = await bajarFamilia(fam, carpeta); estado("Bajé " + fam + " (" + n + " archivos). Instalando..."); }
    catch (e) { problemas.push(e.message); }
  }
  if (problemas.length === faltan.length) { estado(problemas.join("\n")); return false; }
  const r = await instalarCarpetaFuentes(carpeta);
  const siguen = fuentesFaltantes(pedidas);
  estado((siguen.length ? "Fuentes instaladas en Windows (" + r.split("|")[0] + "). Cierra y vuelve a abrir InDesign para que aparezcan: " + siguen.join(", ") + "."
    : "Listo, fuentes instaladas: " + faltan.join(", ") + ".") + (problemas.length ? "\n" + problemas.join("\n") : ""));
  return !siguen.length;
}
