// =====================================================================
//  PROGRAMAS IA - marcado: parser y revisor de fechas (sin dependencias)
//  Lo usa el panel (index.html) y las herramientas de Node (tools/).
// =====================================================================
// ------------------------------------------------------------------ 2) revisar fechas (sin IA)
const DIAS = { domingo: 0, lunes: 1, martes: 2, "miércoles": 3, miercoles: 3, jueves: 4, viernes: 5, "sábado": 6, sabado: 6 };
const NOMDIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11 };
function revisarFechas(txt) {
  const av = [], ym = txt.match(/\b(20\d\d)\b/);
  if (!ym) return [{ origen: "Fechas", tipo: "fecha", texto: "No encontré el año en el programa; no pude revisar días contra fechas." }];
  const anio = parseInt(ym[1], 10);
  let mes = null;
  const fl = /FECHAS:(.*)/i.exec(txt);
  if (fl) { const mm = fl[1].toLowerCase().match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)/); if (mm) mes = MESES[mm[1]]; }
  const mesFiesta = mes;
  const re = /\b(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)\s+(\d{1,2})(?:\.?\s?[ºo°])?(?:\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre))?/gi;
  txt.split(/\r?\n/).forEach((linea, n) => {
    let m; re.lastIndex = 0;
    while ((m = re.exec(linea)) !== null) {
      const dia = DIAS[m[1].toLowerCase()], d = parseInt(m[2], 10);
      if (m[3]) mes = MESES[m[3].toLowerCase()];
      if (mes === null || d < 1 || d > 31) continue;
      const real = new Date(anio, mes, d).getDay();
      if (real !== dia) av.push({ origen: "Fechas", tipo: "fecha", texto: "Línea " + (n + 1) + ": dice " + m[0] + ", pero el " + d + " de " + Object.keys(MESES).find(k => MESES[k] === mes) + " de " + anio + " cae en " + NOMDIA[real] + "." });
    }
    if (/12:00\s*a\.?\s*m/i.test(linea)) av.push({ origen: "Fechas", tipo: "fecha", texto: "Línea " + (n + 1) + ": dice 12:00 a.m. (medianoche). ¿No será 12:00 p.m. (mediodía)?" });
    const mm = linea.toLowerCase().match(/de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/);
    if (mm && mesFiesta !== null && /^\s*DIA:/i.test(linea) && MESES[mm[1]] !== mesFiesta)
      av.push({ origen: "Fechas", tipo: "inconsistencia", texto: "Línea " + (n + 1) + ": un día de fiesta en " + mm[1] + ", pero el encabezado dice otro mes." });
  });
  return av;
}
// ------------------------------------------------------------------ marcado -> datos del motor
const CLAVES = ["PRE", "NOMBRE", "FECHAS", "ANIOS", "AÑOS", "LEMA", "LEMA_ETIQUETA", "OBJETIVO", "MENSAJE", "PIE", "PROGRAMA_TITULO",
  "CINTILLA", "DIA", "DÍA", "EVENTO", "TEMA", "TEXTO", "PREVIO", "SUBTITULO", "SUB2", "LISTA", "NUM", "ORACION", "ORACIÓN", "MAYORDOMOS",
  // aprendidas de los PDF del taller (nov-2026)
  "DECIMA", "DÉCIMA", "TABLA", "FIRMA", "CREDITO", "CRÉDITO", "AGRADECIMIENTO", "MAYORDOMIA", "MAYORDOMÍA", "SUBTITULO_ENC"];
const SALTO = String.fromCharCode(10); // en InDesign "\n" es salto de linea forzado ("\r" es parrafo nuevo)
function limpia(t) { return String(t || "").replace(/[\r\n]+/g, " ").trim(); }
function parseMarcado(txt) {
  const enc = {}, prog = [];
  let num = 0, enMay = false, grupos = [], ultimo = null;
  const cerrarMay = () => {
    if (!grupos.length) return;
    prog.push(["may_enc", "CIUDAD\tENTRANTES"]);
    grupos.forEach(([ciudad, nombres]) => nombres.forEach((n, i) =>
      prog.push([i === nombres.length - 1 ? "may_fin" : "may", (i === 0 ? "~~" + ciudad + "~~" : "") + "\t" + n])));
    grupos = [];
  };
  txt.split(/\r?\n/).forEach(raw => {
    const linea = raw.trim();
    if (!linea || linea.startsWith("#")) return;
    const m = /^([A-ZÁÉÍÓÚÑ_0-9]+)\s*:\s*(.*)$/.exec(linea);
    const clave = m ? m[1].toUpperCase() : null;
    if (enMay && (!clave || CLAVES.indexOf(clave) < 0)) {
      const c = /^(.+?):\s*(.*)$/.exec(linea);
      if (c) grupos.push([c[1].trim(), c[2].split(";").map(s => s.trim()).filter(Boolean)]);
      else if (grupos.length) grupos[grupos.length - 1][1].push(...linea.split(";").map(s => s.trim()).filter(Boolean));
      return;
    }
    if (!clave || CLAVES.indexOf(clave) < 0) { // continua la linea anterior
      if (ultimo) ultimo[1] += " " + linea;
      return;
    }
    if (enMay) { cerrarMay(); enMay = false; }
    const v = limpia(m[2]);
    if (clave !== "NUM") num = 0;
    switch (clave) {
      case "PRE": enc.pre = v; break;
      case "NOMBRE": enc.nombre = v; break;
      case "FECHAS": enc.fechas = v; break;
      case "ANIOS": case "AÑOS": enc.anios = v; break;
      case "LEMA": enc.lema = v; break;
      case "LEMA_ETIQUETA": enc.lema_etiqueta = v; break;
      case "OBJETIVO": enc.objetivo = v; break;
      case "MENSAJE": enc.mensaje = v; break;
      case "PIE": enc.pie = v; break;
      case "PROGRAMA_TITULO": enc.programa_titulo = v; break;
      case "CINTILLA": ultimo = ["cintilla", v.toUpperCase()]; prog.push(ultimo); break;
      case "DIA": case "DÍA": {
        // DIA: VIERNES 04 | “María nos llama…”  -> el tema va en la misma linea, sin mayusculas forzadas
        const p = v.split("|");
        ultimo = ["dia", p.length > 1 ? p[0].trim() + ". %%" + p.slice(1).join("|").trim() + "%%" : v]; prog.push(ultimo); break;
      }
      case "TABLA": {
        const p = v.split("|");
        ultimo = ["tabla", p.length > 1 ? "**" + p[0].trim() + "**\t" + p.slice(1).join("|").trim() : v]; prog.push(ultimo); break;
      }
      case "DECIMA": case "DÉCIMA": {
        // DECIMA: Título | verso / verso / ... | firma
        const p = v.split("|").map(s => s.trim());
        const versos = (p.length > 1 ? p[1] : p[0]).split("/").map(s => s.trim()).filter(Boolean).join(SALTO);
        ultimo = ["decima", (p.length > 1 && p[0] ? "**" + p[0] + "**" + SALTO : "") + versos + (p[2] ? SALTO + "~~" + p[2] + "~~" : "")];
        prog.push(ultimo); break;
      }
      case "FIRMA": ultimo = ["firma", v.split("/").map(s => s.trim()).join(SALTO)]; prog.push(ultimo); break;
      case "CREDITO": case "CRÉDITO": {
        // CREDITO: SACERDOTES DE LA PARROQUIA | Sr. Cura ... / Pbro. ...   (van al pie, lado a lado)
        const p = v.split("|");
        (enc.creditos = enc.creditos || []).push([p[0].trim(), (p.slice(1).join("|") || "").split("/").map(s => s.trim()).filter(Boolean)]);
        ultimo = null; break;
      }
      case "AGRADECIMIENTO": enc.agradecimiento = v; ultimo = null; break;
      case "MAYORDOMIA": case "MAYORDOMÍA": enc.mayordomia = v; ultimo = null; break;
      case "SUBTITULO_ENC": enc.subtitulo = v; break;
      case "EVENTO": {
        const p = v.split("|");
        ultimo = p.length > 1 ? ["evento", "\t**" + p[0].trim() + "**\t" + p.slice(1).join("|").trim()] : ["evento", "\t\t" + v];
        prog.push(ultimo); break;
      }
      case "TEMA": {
        let t = v.replace(/^tema de reflexi[oó]n\s*:\s*/i, "");
        ultimo = ["tema", "Tema de reflexión: __" + t + "__"]; prog.push(ultimo); break;
      }
      case "TEXTO": ultimo = ["texto", v]; prog.push(ultimo); break;
      case "PREVIO": ultimo = ["previo", v]; prog.push(ultimo); break;
      case "SUBTITULO": ultimo = ["nov_tit", v]; prog.push(ultimo); break;
      case "SUB2": ultimo = ["nov_sub", v]; prog.push(ultimo); break;
      case "LISTA": ultimo = ["nov_dia", v]; prog.push(ultimo); break;
      case "NUM": num++; ultimo = ["nov_num", "**" + num + ".**\t" + v]; prog.push(ultimo); break;
      case "ORACION": case "ORACIÓN": {
        const p = v.split("|");
        // ORACION: Título | texto | firma (la firma es opcional; ej. Papa Francisco)
        ultimo = ["oracion", p.length > 1 ? "**" + p[0].trim() + "**" + SALTO + p[1].trim() + (p[2] ? SALTO + "~~" + p.slice(2).join("|").trim() + "~~" : "") : v];
        prog.push(ultimo); break;
      }
      case "MAYORDOMOS": enMay = true; ultimo = null; break;
    }
  });
  if (enMay) cerrarMay();
  return { enc, prog };
}

if (typeof module !== "undefined" && module.exports) module.exports = { parseMarcado, revisarFechas };
