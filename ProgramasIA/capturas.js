// =====================================================================
//  PROGRAMAS IA - capturas para Corregir
//  Pegar con Ctrl+V (Win+Shift+S y luego Ctrl+V), botón "Pegar captura"
//  o "Agregar imagen". Se mandan a Claude junto con la instrucción.
//  UXP no lee imágenes del portapapeles: lo hace portapapeles.ps1.
// =====================================================================
const CAPTURAS = []; // { tipo: "image/png", data: base64 }
const MAX_CAPTURAS = 4;

function pintarCapturas() {
  const c = $("capturas");
  c.innerHTML = CAPTURAS.map((x, i) => '<div class="cap"><img src="data:' + x.tipo + ";base64," + x.data + '" alt=""><div role="button" tabindex="0" data-i="' + i + '" title="Quitar">×</div></div>').join("");
  c.querySelectorAll("[role=button]").forEach(b => b.addEventListener("click", () => { CAPTURAS.splice(Number(b.getAttribute("data-i")), 1); pintarCapturas(); }));
  c.hidden = !CAPTURAS.length;
}
function agregarCaptura(tipo, data) {
  if (CAPTURAS.length >= MAX_CAPTURAS) { estado("Máximo " + MAX_CAPTURAS + " capturas por corrección.", "error"); return false; }
  CAPTURAS.push({ tipo, data }); pintarCapturas();
  estado("Captura agregada. Escribe qué quieres que cambie y da «Aplicar cambio».", "ok");
  try { $("txtCorr").focus(); } catch (e) {}
  return true;
}
// lee la imagen del portapapeles con PowerShell (lanzado desde ExtendScript, como las fuentes)
let pegando = false;
async function pegarCaptura(silencioso) {
  if (pegando) return; pegando = true;
  try {
    const tmp = await fsys.getTemporaryFolder();
    const png = await tmp.createFile("captura_programas_ia.png", { overwrite: true });
    await png.write(" ", { format: fmts.utf8 });
    const listo = await tmp.createFile("captura_listo.txt", { overwrite: true });
    await listo.write(" ", { format: fmts.utf8 }); // UXP no escribe archivos vacios
    const ps1 = (await (await fsys.getPluginFolder()).getEntry("portapapeles.ps1")).nativePath;
    const cmd = await tmp.createFile("captura.cmd", { overwrite: true });
    await cmd.write("@echo off\r\npowershell -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + ps1 +
      "\" -Salida \"" + png.nativePath + "\" -Listo \"" + listo.nativePath + "\"\r\n", { format: fmts.utf8 });
    if (extend('File(' + es3(cmd.nativePath) + ').execute() ? "ok" : "no";') !== "ok") throw new Error("Windows no dejó leer el portapapeles");
    let r = "";
    for (let i = 0; i < 40 && !r; i++) { await new Promise(x => setTimeout(x, 250)); r = String(await listo.read({ format: fmts.utf8 })).trim(); }
    if (r === "ok") agregarCaptura("image/png", b64(await png.read({ format: fmts.binary })));
    else if (!silencioso) estado(r.indexOf("error") === 0 ? "No pude leer el portapapeles: " + r.slice(6) : "No hay imagen copiada. Toma la captura con Win+Shift+S y vuelve a pegar.", "error");
  } catch (e) { if (!silencioso) estado("No pude pegar la captura: " + e.message, "error"); }
  finally { pegando = false; }
}
async function adjuntarImagenes() {
  const files = await fsys.getFileForOpening({ allowMultiple: true, types: ["png", "jpg", "jpeg"] });
  for (const f of files || []) {
    let buf = await f.read({ format: fmts.binary }), tipo = /\.png$/i.test(f.name) ? "image/png" : "image/jpeg";
    if (buf.byteLength > 3500000) { buf = await reducirImagen(f.nativePath); tipo = "image/jpeg"; }
    if (!agregarCaptura(tipo, b64(buf))) break;
  }
}

$("bPegarCaptura").addEventListener("click", () => pegarCaptura(false));
$("bAdjuntarCaptura").addEventListener("click", () => adjuntarImagenes().catch(e => estado("Error: " + e.message, "error")));
// Ctrl+V en la pestaña Corregir: si lo copiado es imagen, se agrega como captura (el texto se pega normal)
document.addEventListener("keydown", e => {
  if (!(e.ctrlKey && (e.key === "v" || e.key === "V"))) return;
  if (!$("t4").classList.contains("on")) return;
  pegarCaptura(true);
});
// arrastrar imágenes al chat
$("t4").addEventListener("dragover", e => e.preventDefault());
$("t4").addEventListener("drop", async e => {
  e.preventDefault();
  const l = (e.dataTransfer && e.dataTransfer.files) || [];
  for (let i = 0; i < l.length; i++) {
    try {
      const it = l[i], ruta = it.nativePath || it.path;
      const ent = it.read ? it : (ruta ? await fsys.getEntryWithUrl("file:" + ruta) : null);
      if (ent && /\.(png|jpe?g)$/i.test(ent.name)) agregarCaptura(/\.png$/i.test(ent.name) ? "image/png" : "image/jpeg", b64(await ent.read({ format: fmts.binary })));
    } catch (er) {}
  }
});
pintarCapturas();
