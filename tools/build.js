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
  // borrar lo de antes; si Windows tiene algo abierto (por ejemplo el .exe), se sobrescribe
  for (const e of fs.existsSync(DIST) ? fs.readdirSync(DIST) : []) { try { fs.rmSync(path.join(DIST, e), { recursive: true, force: true }); } catch (err) { console.warn("no pude borrar " + e + ": " + err.code); } }
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
  copiarCarpeta(path.join(RAIZ, "conector"), path.join(P, "conector"));
  ps1(path.join(RAIZ, "instalador", "desinstalar.ps1"), path.join(P, "desinstalar.ps1"));
  ps1(path.join(PANEL, "instalar_fuentes.ps1"), path.join(P, "ProgramasIA", "instalar_fuentes.ps1"));
  fs.writeFileSync(path.join(P, "VERSION.txt"), version + "\r\n");

  // 4) instalador .exe (IExpress viene con Windows): instalar.ps1 + paquete.zip
  const SRC = path.join(DIST, "exe");
  fs.mkdirSync(SRC, { recursive: true });
  ps1(path.join(RAIZ, "instalador", "instalar.ps1"), path.join(SRC, "instalar.ps1"));
  const zip = new JSZip();
  (function agrega(dir, pre) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) agrega(p, pre + e.name + "/"); else zip.file(pre + e.name, fs.readFileSync(p));
    }
  })(P, "");
  fs.writeFileSync(path.join(SRC, "paquete.zip"), await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  const exe = path.join(DIST, "Instalar Programas IA " + version + ".exe");
  if (process.platform === "win32" && !process.argv.includes("--sin-exe")) {
    const sed = [
      "[Version]", "Class=IEXPRESS", "SEDVersion=3",
      "[Options]", "PackagePurpose=InstallApp", "ShowInstallProgramWindow=0", "HideExtractAnimation=1", "UseLongFileName=1",
      "InsideCompressed=0", "CAB_FixedSize=0", "CAB_ResvCodeSigning=0", "RebootMode=N",
      "InstallPrompt=%InstallPrompt%", "DisplayLicense=%DisplayLicense%", "FinishMessage=%FinishMessage%", "TargetName=%TargetName%",
      "FriendlyName=%FriendlyName%", "AppLaunched=%AppLaunched%", "PostInstallCmd=%PostInstallCmd%",
      "AdminQuietInstCmd=%AdminQuietInstCmd%", "UserQuietInstCmd=%UserQuietInstCmd%", "SourceFiles=SourceFiles",
      "[Strings]", "InstallPrompt=", "DisplayLicense=", "FinishMessage=", "TargetName=" + exe, "FriendlyName=Programas IA",
      "AppLaunched=cmd /c powershell.exe -NoProfile -ExecutionPolicy Bypass -File instalar.ps1", "PostInstallCmd=<None>",
      "AdminQuietInstCmd=", "UserQuietInstCmd=", 'FILE0="instalar.ps1"', 'FILE1="paquete.zip"',
      "[SourceFiles]", "SourceFiles0=" + SRC + "\\", "[SourceFiles0]", "%FILE0%=", "%FILE1%="
    ].join("\r\n") + "\r\n";
    const sedPath = path.join(SRC, "instalador.sed");
    fs.writeFileSync(sedPath, sed);
    require("child_process").execFileSync("iexpress.exe", ["/N", "/Q", sedPath], { stdio: "inherit" });
    if (!fs.existsSync(exe)) throw new Error("IExpress no generó el .exe");
  }
  console.log("Listo: versión " + version + " en " + DIST);
})().catch(e => { console.error(e); process.exit(1); });

// PowerShell 5.1 lee los .ps1 sin BOM como ANSI y rompe los acentos: se guardan en UTF-8 con BOM y CRLF
function ps1(de, a) {
  let t = fs.readFileSync(de, "utf8").replace(/^﻿/, "").replace(/\r?\n/g, "\r\n");
  fs.mkdirSync(path.dirname(a), { recursive: true });
  fs.writeFileSync(a, "﻿" + t, "utf8");
}
