// =====================================================================
//  PROGRAMAS IA - motor de diseno (ExtendScript para InDesign)
//  Lo ejecuta el panel con app.doScript; recibe DATA ya armado.
//  Devuelve un texto: "OK|id=..|cuerpo=..|desborde=0|aviso=.."
// =====================================================================
/*__DATA__*/
var RESULT = "ERROR|sin resultado";
var _SP = app.scriptPreferences, _UI = _SP.userInteractionLevel, _MU = _SP.measurementUnit, _RD = _SP.enableRedraw;
try {
    _SP.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;
    _SP.measurementUnit = AutoEnum.AUTO_VALUE;
    _SP.enableRedraw = false;
    // un solo paso de deshacer y mucho mas rapido
    app.doScript(motor, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, "Programas IA");
} catch (e) { RESULT = "ERROR|" + e.message + " (linea " + e.line + ")"; }
try { _SP.userInteractionLevel = _UI; _SP.measurementUnit = _MU; _SP.enableRedraw = _RD; } catch (e) {}
try { app.insertLabel("programasia_result", RESULT); } catch (e) {}

function motor() {
try {
    var D = DATA, P = D.params || {}, FN = D.fuentes || {};
    var F_TIT = FN.titulo || "Pinyon Script", F_DIS = FN.display || "Playfair Display", F_TXT = FN.texto || "Lora";
    var W = D.formato.ancho, H = D.formato.alto, BL = D.formato.sangrado || 0;
    // escala respecto al reverso de referencia (330 x 465 vertical); en horizontal manda el alto
    var k = Math.min(W / 330.298, H / 464.989);
    var HORIZ = W > H;
    // en horizontal el objetivo y el mensaje tienen mucho ancho: no se achican tanto como el encabezado
    var kI = HORIZ ? Math.min(W / 330.298, k * 1.35) : k;
    var MMPT = 2.834645669;
    var avisos = [];

    function num(v, d) { return (v === undefined || v === null || isNaN(v)) ? d : Number(v); }

    // ---------- cerrar el documento generado anterior ----------
    if (D.cerrarId) {
        try { var od = app.documents.itemByID(Number(D.cerrarId)); if (od.isValid) od.close(SaveOptions.NO); } catch (e) {}
    }

    // ---------- documento ----------
    var doc = app.documents.add(true);
    doc.documentPreferences.facingPages = false;
    doc.documentPreferences.pagesPerDocument = 1;
    doc.documentPreferences.pageWidth = W + "mm";
    doc.documentPreferences.pageHeight = H + "mm";
    doc.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.MILLIMETERS;
    doc.viewPreferences.verticalMeasurementUnits = MeasurementUnits.MILLIMETERS;
    doc.viewPreferences.rulerOrigin = RulerOrigin.PAGE_ORIGIN;
    doc.zeroPoint = [0, 0];
    var pg = doc.pages[0];
    pg.marginPreferences.properties = { top: 0, left: 0, bottom: 0, right: 0 };
    if (BL > 0) { try { doc.documentPreferences.documentBleedUniformSize = true; doc.documentPreferences.documentBleedTopOffset = BL + "mm"; } catch (e) {} }

    var K = doc.colors.add({ name: "K100", model: ColorModel.PROCESS, space: ColorSpace.CMYK, colorValue: [0, 0, 0, 100] });
    var NONE = doc.swatches.itemByName("None"), PAPER = doc.swatches.itemByName("Paper");

    var lyF = doc.layers[0]; lyF.name = "FONDO";
    var lyT = doc.layers.add({ name: "TEXTOS" });
    var lyA = doc.layers.add({ name: "ADORNOS" });
    try { lyA.move(LocationOptions.AFTER, lyT); } catch (e) {}
    try { app.pdfPlacePreferences.pdfCrop = PDFCrop.CROP_MEDIA; app.pdfPlacePreferences.pageNumber = 1; } catch (e) {}

    function coloca(ly, path, gb, escala) {
        var r = pg.rectangles.add(ly, undefined, undefined, { geometricBounds: gb, strokeWeight: 0, strokeColor: NONE, fillColor: NONE });
        try { r.place(File(path)); } catch (e) { avisos.push("No pude colocar " + path); return r; }
        try {
            if (escala) { r.graphics[0].absoluteHorizontalScale = escala; r.graphics[0].absoluteVerticalScale = escala; r.fit(FitOptions.CENTER_CONTENT); }
            else { r.fit(FitOptions.PROPORTIONALLY); r.fit(FitOptions.CENTER_CONTENT); }
        } catch (e) {}
        try { r.graphics[0].itemLink.unlink(); } catch (e) {}
        return r;
    }
    function rect(ly, gb, props) { var r = pg.rectangles.add(ly, undefined, undefined, { geometricBounds: gb }); for (var p in props) { try { r[p] = props[p]; } catch (e) {} } return r; }
    function linea(ly, x1, y1, x2, y2, wmm, tint) {
        var l = pg.graphicLines.add(ly, undefined, undefined, { strokeWeight: wmm * MMPT, strokeColor: K });
        if (tint) l.strokeTint = tint;
        l.paths[0].entirePath = [[x1, y1], [x2, y2]];
        return l;
    }
    function poli(ly, pts, fill) {
        var p = pg.polygons.add(ly, undefined, undefined, { fillColor: fill, strokeColor: NONE, strokeWeight: 0 });
        p.paths[0].entirePath = pts; return p;
    }
    function rombo(cx, cy, r) { return poli(lyA, [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]], K); }
    function grupo(items, nombre) { try { var g = pg.groups.add(items); g.name = nombre; return g; } catch (e) { return null; } }

    // =================== MARCO (capa FONDO, vector) ===================
    var A = D.assets;
    function marcoRect(ins, wmm) {
        rect(lyF, [ins, ins, H - ins, W - ins], { fillColor: NONE, strokeColor: K, strokeWeight: wmm * MMPT, strokeAlignment: StrokeAlignment.CENTER_ALIGNMENT });
    }
    marcoRect(9.7 * k, 1.4 * k); marcoRect(11.625 * k, 0.25 * k); marcoRect(17.975 * k, 0.35 * k);
    var b0 = 12.6 * k, b1 = 16.8 * k;
    coloca(lyF, A.banda_h, [b0, b0, b1, W - b0], k * 100);
    coloca(lyF, A.banda_h, [H - b1, b0, H - b0, W - b0], k * 100);
    coloca(lyF, A.banda_v, [b0, b0, H - b0, b1], k * 100);
    coloca(lyF, A.banda_v, [b0, W - b1, H - b0, W - b0], k * 100);
    var C = 41 * k, o = 6 * k;
    var mask = [[0, 0], [43, 0], [43, 12.9], [23.65, 17.2], [17.2, 23.65], [12.9, 43], [0, 43]];
    function esquina(fx, fy) {
        var pts = [];
        for (var i = 0; i < mask.length; i++) {
            var x = o - k + mask[i][0] * k, y = o - k + mask[i][1] * k;
            pts.push([fx ? W - x : x, fy ? H - y : y]);
        }
        poli(lyF, pts, PAPER);
        var gb = [fy ? H - o - C : o, fx ? W - o - C : o, fy ? H - o : o + C, fx ? W - o : o + C];
        var r = coloca(lyF, A.esquina, gb);
        try { if (fx) r.flipItem(Flip.HORIZONTAL, AnchorPoint.CENTER_ANCHOR); if (fy) r.flipItem(Flip.VERTICAL, AnchorPoint.CENTER_ANCHOR); } catch (e) {}
        r.name = "esquina";
    }
    esquina(false, false); esquina(true, false); esquina(false, true); esquina(true, true);

    // =================== ESTILOS ===================
    var cambios = [];
    function fuente(fam, sty) {
        var tries = [[fam, sty], [fam, sty.replace(" Italic", "")], [fam, "Regular"], [F_TXT, sty], ["Minion Pro", sty]];
        for (var i = 0; i < tries.length; i++) {
            try {
                var ff = app.fonts.itemByName(tries[i][0] + "\t" + tries[i][1]);
                if (ff.isValid && ff.status == FontStatus.INSTALLED) { if (i > 0) cambios.push(fam + " " + sty + " -> " + tries[i][0] + " " + tries[i][1]); return tries[i]; }
            } catch (e) {}
        }
        return [fam, sty];
    }
    function setP(o, p) {
        if (p.fontStyle) {
            var r = fuente(p.appliedFont || F_TXT, p.fontStyle); p.appliedFont = r[0]; p.fontStyle = r[1];
        }
        var orden = ["basedOn", "appliedFont", "fontStyle", "leftIndent", "firstLineIndent"];
        for (var i = 0; i < orden.length; i++) if (p[orden[i]] !== undefined) { try { o[orden[i]] = p[orden[i]]; } catch (e) {} }
        for (var q in p) {
            if (q == "basedOn" || q == "appliedFont" || q == "fontStyle" || q == "leftIndent" || q == "firstLineIndent" || q == "tabStops") continue;
            try { o[q] = p[q]; } catch (e) {}
        }
        if (p.tabStops) {
            try { o.tabStops.everyItem().remove(); } catch (e) {}
            for (var j = 0; j < p.tabStops.length; j++) { try { o.tabStops.add(p.tabStops[j]); } catch (e) {} }
        }
        if (p.firstLineIndent !== undefined) { try { o.leftIndent = p.leftIndent; o.firstLineIndent = p.firstLineIndent; } catch (e) {} }
    }
    function PS(name, p) { var s = doc.paragraphStyles.itemByName(name); if (!s.isValid) s = doc.paragraphStyles.add({ name: name }); setP(s, p); return s; }
    function CS(name, p) { var s = doc.characterStyles.itemByName(name); if (!s.isValid) s = doc.characterStyles.add({ name: name }); setP(s, p); return s; }
    function lang(s) {
        var names = ["Spanish", "Español: España", "Español", "Spanish: Castilian", "Español: Castellano"];
        for (var i = 0; i < names.length; i++) { try { var l = app.languagesWithVendors.itemByName(names[i]); if (l.isValid) { s.appliedLanguage = l; return; } } catch (e) {} }
    }
    function parse(t) {
        var out = "", r = [], i = 0, tags = ["**", "__", "~~"];
        while (i < t.length) {
            var m = null;
            for (var q = 0; q < 3; q++) if (t.substr(i, 2) == tags[q]) { m = tags[q]; break; }
            if (m) { var j = t.indexOf(m, i + 2); if (j < 0) j = t.length; var seg = t.substring(i + 2, j); r.push([out.length, out.length + seg.length, m]); out += seg; i = j + 2; }
            else { out += t.charAt(i); i++; }
        }
        return { s: out, r: r };
    }
    var csB = CS("negrita", { appliedFont: F_TXT, fontStyle: "Bold" });
    var csBI = CS("negrita cursiva", { appliedFont: F_TXT, fontStyle: "Bold Italic" });
    var csCity = CS("ciudad", { appliedFont: F_DIS, fontStyle: "Bold Italic" });
    // capitular en la letra de encabezados: la manuscrita tiene colas que se meten en el texto
    var csCap = CS("capitular", { appliedFont: F_DIS, fontStyle: "Regular" });
    var CMAP = { "**": csB, "__": csBI, "~~": csCity };

    var Cc = Justification.CENTER_ALIGN, LJ = Justification.LEFT_JUSTIFIED, LA = Justification.LEFT_ALIGN;
    var eT = num(P.escala_titulo, 1), eE = num(P.escala_encabezado, 1);
    var S = {
        pre: PS("enc_pre", { appliedFont: F_DIS, fontStyle: "Regular", pointSize: 15 * k * eE, tracking: 420, justification: Cc }),
        nombre: PS("enc_titulo", { appliedFont: F_TIT, fontStyle: "Regular", pointSize: 80 * k * eT, justification: Cc }),
        fechas: PS("enc_fecha", { appliedFont: F_DIS, fontStyle: "Bold Italic", pointSize: 15.5 * k * eE, tracking: 240, justification: Cc }),
        anios: PS("enc_anios", { appliedFont: F_TIT, fontStyle: "Regular", pointSize: 34 * k * eE, justification: Cc }),
        lema_lbl: PS("enc_lema_lbl", { appliedFont: F_DIS, fontStyle: "Regular", pointSize: 10.5 * k * eE, tracking: 380, justification: Cc }),
        lema: PS("enc_lema", { appliedFont: F_DIS, fontStyle: "Bold Italic", pointSize: 21 * k * eE, justification: Cc }),
        intro_tit: PS("intro_tit", { appliedFont: F_DIS, fontStyle: "Bold", pointSize: 11 * kI * eE, tracking: 300, justification: Cc, spaceAfter: 1.6 * kI }),
        intro_txt: PS("intro_txt", { appliedFont: F_TXT, fontStyle: "Italic", pointSize: 10.6 * kI * eE, leading: 14.2 * kI * eE, justification: LJ, hyphenation: true }),
        programa: PS("programa_tit", { appliedFont: F_DIS, fontStyle: "Regular", pointSize: 24 * k * eE, tracking: 550, justification: Cc }),
        pie: PS("pie", { appliedFont: F_DIS, fontStyle: "Regular", pointSize: 15 * k * eE, tracking: 450, justification: Cc })
    };
    S.intro_obj = PS("intro_obj", { basedOn: S.intro_txt, dropCapCharacters: 1, dropCapLines: 3, dropCapStyle: csCap });
    lang(S.intro_txt);

    // =================== ENCABEZADO (apilado) ===================
    var L = 24 * k, R = W - 24 * k, CW = R - L;
    function caja(texto, estilo, top, left, right, nombre) {
        var tf = pg.textFrames.add(lyT, undefined, undefined, { geometricBounds: [top, left, top + 80 * k, right] });
        try { tf.textFramePreferences.insetSpacing = [0, 0, 0, 0]; } catch (e) {}
        var p = parse(texto);
        tf.contents = p.s;
        tf.parentStory.texts[0].appliedParagraphStyle = estilo;
        for (var i = 0; i < p.r.length; i++) { try { tf.parentStory.characters.itemByRange(p.r[i][0], p.r[i][1] - 1).appliedCharacterStyle = CMAP[p.r[i][2]]; } catch (e) {} }
        if (estilo.tracking) { try { tf.parentStory.characters.lastItem().tracking = 0; } catch (e) {} }
        try { tf.textFramePreferences.autoSizingReferencePoint = AutoSizingReferenceEnum.TOP_CENTER_POINT; tf.textFramePreferences.autoSizingType = AutoSizingTypeEnum.HEIGHT_ONLY; } catch (e) {}
        try { tf.recompose(); } catch (e) {}
        if (nombre) tf.name = nombre;
        return tf;
    }
    function fondo(tf) { return tf.geometricBounds[2]; }
    function maxLineas(tf, n, minPt) {
        var guard = 0;
        while (guard++ < 40) {
            tf.recompose();
            if (tf.lines.length <= n && !tf.overflows) break;
            var ps = tf.parentStory.pointSize;
            if (ps <= minPt) break;
            tf.parentStory.pointSize = ps * 0.94;
        }
    }
    function extremos(tf) {
        try { tf.recompose(); var ch = tf.parentStory.characters; return [ch.firstItem().horizontalOffset, ch.lastItem().endHorizontalOffset]; } catch (e) { return null; }
    }
    var E = D.enc || {}, gS = num(P.separacion_encabezado, 1);
    var y = 24.4 * k;
    if (E.pre) { var tPre = caja(E.pre, S.pre, y, L - 8 * k, R + 8 * k, "pre"); maxLineas(tPre, 1, 8); y = fondo(tPre) + 2.5 * k * gS; }
    if (E.nombre) {
        var tNom = caja(E.nombre, S.nombre, y - 2 * k, L - 8 * k, R + 8 * k, "nombre"); maxLineas(tNom, 1, 24 * k);
        // la letra manuscrita baja mucho de la linea base: medir desde la base, no desde el marco
        var yN = fondo(tNom);
        try { yN = Math.max(yN, tNom.lines.lastItem().baseline + tNom.parentStory.pointSize * 0.36 / MMPT); } catch (e) {}
        y = yN + 1 * k * gS;
    }
    if (E.fechas) { var tFec = caja(E.fechas, S.fechas, y, L - 8 * k, R + 8 * k, "fechas"); maxLineas(tFec, 1, 8); y = fondo(tFec) + 1.5 * k * gS; }
    if (E.anios) {
        var tAn = caja(E.anios, S.anios, y, L + CW * 0.3, R - CW * 0.3, "aniversario"); maxLineas(tAn, 1, 14);
        var ex = extremos(tAn), b = tAn.geometricBounds, ym = b[0] + (b[2] - b[0]) * 0.55;
        if (ex) {
            grupo([linea(lyA, ex[0] - 53 * k, ym, ex[0] - 5 * k, ym, 0.3 * k), rombo(ex[0] - 5 * k, ym, 1.41 * k)], "linea aniversario izq");
            grupo([linea(lyA, ex[1] + 5 * k, ym, ex[1] + 53 * k, ym, 0.3 * k), rombo(ex[1] + 5 * k, ym, 1.41 * k)], "linea aniversario der");
        }
        y = fondo(tAn) + 2 * k * gS;
    }
    if (E.lema && P.mostrar_lema !== false) {
        var tLl = caja(E.lema_etiqueta || "LEMA DE LA FIESTA", S.lema_lbl, y, L, R, "lema etiqueta"); y = fondo(tLl) + 0.5 * k;
        var tLe = caja(E.lema, S.lema, y, L, R, "lema"); maxLineas(tLe, 2, 10); y = fondo(tLe) + 4 * k * gS;
    }
    var hayObj = E.objetivo && P.mostrar_objetivo !== false, hayMsg = E.mensaje && P.mostrar_mensaje !== false;
    if (hayObj || hayMsg) {
        var yA = y, yB = y, gap = 7 * k, pad = 5 * k;
        var xA0 = L, xA1 = hayMsg ? L + (CW - gap) * 0.4 : R, xB0 = hayObj ? xA1 + gap : L, xB1 = R;
        if (hayObj) {
            var t1 = caja("OBJETIVO", S.intro_tit, yA, xA0, xA1, "objetivo titulo");
            var t2 = caja(E.objetivo, S.intro_obj, fondo(t1) + 1.6 * k, xA0, xA1, "objetivo");
            yA = fondo(t2);
        }
        if (hayMsg) {
            var top = yB, t3 = caja("MENSAJE", S.intro_tit, top + 3.5 * k, xB0 + pad, xB1 - pad, "mensaje titulo");
            var t4 = caja(E.mensaje, S.intro_txt, fondo(t3) + 1.6 * k, xB0 + pad, xB1 - pad, "mensaje");
            var bot = fondo(t4) + 4 * k;
            var box = rect(lyA, [top, xB0, bot, xB1], { fillColor: K, fillTint: num(P.sombra_mensaje, 7), strokeWeight: 0, strokeColor: NONE });
            grupo([box, linea(lyA, xB0 + 3 * k, top + 1.35 * k, xB1 - 3 * k, top + 1.35 * k, 0.3 * k), linea(lyA, xB0 + 3 * k, bot - 1.35 * k, xB1 - 3 * k, bot - 1.35 * k, 0.3 * k)], "recuadro mensaje");
            yB = bot;
        }
        y = Math.max(yA, yB) + 4.5 * k * gS;
    }
    var tPr = caja(E.programa_titulo || "PROGRAMA", S.programa, y, L + CW * 0.25, R - CW * 0.25, "programa titulo");
    var exP = extremos(tPr), bP = tPr.geometricBounds, ymP = (bP[0] + bP[2]) / 2;
    if (exP) {
        var dw = 46.7 * k, dh = 7 * k;
        var d1 = coloca(lyA, A.div_izq, [ymP - dh / 2, exP[0] - 4 * k - dw, ymP + dh / 2, exP[0] - 4 * k]); d1.name = "adorno programa izq";
        var d2 = coloca(lyA, A.div_der, [ymP - dh / 2, exP[1] + 4 * k, ymP + dh / 2, exP[1] + 4 * k + dw]); d2.name = "adorno programa der";
    }
    y = fondo(tPr) + 3.5 * k;

    // pie
    if (E.pie) {
        var yo = H - 31.6 * k, cx = W / 2;
        grupo([linea(lyA, cx - 75 * k, yo, cx - 5 * k, yo, 0.3 * k), rombo(cx, yo, 1.41 * k), linea(lyA, cx + 5 * k, yo, cx + 75 * k, yo, 0.3 * k)], "adorno pie");
        var tPie = caja(E.pie, S.pie, H - 29.2 * k, L - 8 * k, R + 8 * k, "pie"); maxLineas(tPie, 1, 8);
    }

    // =================== PROGRAMA (columnas) ===================
    var cTop = y, cBot = H - 38.65 * k;
    if (cBot - cTop < 60) avisos.push("Queda poco espacio para el programa (" + Math.round(cBot - cTop) + " mm). Considera ocultar objetivo/mensaje.");
    var ncol = num(P.columnas, HORIZ ? (W >= 560 ? 5 : 4) : (W < 260 ? 2 : 3)), gut = 7 * k;
    var LS = 1.28, prog = {};
    function PP(name, f, p) { var s = PS(name, p); prog[name] = [s, f]; return s; }
    var sDia = num(P.espacio_dias, 2.6), sCin = num(P.espacio_cintilla, 4.2), tD = num(P.sombra_dias, 16), tC = num(P.sombra_cintillas, 20);
    var sBase = PP("prog_base", 1, { appliedFont: F_TXT, fontStyle: "Regular", justification: LJ, hyphenation: true, spaceAfter: 0.4 });
    lang(sBase);
    PP("texto", 1, { basedOn: sBase });
    PP("cintilla", 1, {
        basedOn: sBase, appliedFont: F_DIS, fontStyle: "Bold", tracking: 160, justification: Cc, hyphenation: false,
        spaceBefore: sCin, spaceAfter: 3.2, keepWithNext: 2,
        ruleAbove: true, ruleAboveLineWeight: "0.8pt", ruleAboveColor: K, ruleAboveOffset: 4.4, ruleAboveWidth: RuleWidth.COLUMN_WIDTH,
        ruleBelow: true, ruleBelowLineWeight: "0.8pt", ruleBelowColor: K, ruleBelowOffset: 2.2, ruleBelowWidth: RuleWidth.COLUMN_WIDTH,
        paragraphShadingOn: tC > 0, paragraphShadingColor: K, paragraphShadingTint: tC,
        paragraphShadingTopOffset: 1.1, paragraphShadingBottomOffset: 0.9, paragraphShadingLeftOffset: 1, paragraphShadingRightOffset: 1
    });
    PP("dia", 1.06, {
        basedOn: sBase, fontStyle: "Bold", tracking: 40, justification: LA, hyphenation: false, leftIndent: 1.8, capitalization: Capitalization.ALL_CAPS,
        spaceBefore: sDia, spaceAfter: 0.9, keepWithNext: 2,
        paragraphShadingOn: tD > 0, paragraphShadingColor: K, paragraphShadingTint: tD,
        paragraphShadingTopOffset: 0.6, paragraphShadingBottomOffset: 0.5, paragraphShadingLeftOffset: 0,
        paragraphBorderOn: true, paragraphBorderColor: K, paragraphBorderLeftLineWeight: "2.6pt",
        paragraphBorderTopLineWeight: 0, paragraphBorderRightLineWeight: 0, paragraphBorderBottomLineWeight: 0,
        paragraphBorderTopOffset: 0.6, paragraphBorderBottomOffset: 0.5
    });
    // la sangria de horas y la columna de ciudad se calculan en escala() segun el texto real
    var sEv = PP("evento", 1, { basedOn: sBase, keepAllLinesTogether: true });
    var sTema = PP("tema", 1, { basedOn: sBase, keepAllLinesTogether: true });
    PP("previo", 1, { basedOn: sBase, leftIndent: 4, firstLineIndent: -4, bulletsAndNumberingListType: ListType.BULLET_LIST, spaceAfter: 1 });
    PP("nov_tit", 0.98, { basedOn: sBase, appliedFont: F_DIS, fontStyle: "Bold", tracking: 50, justification: Cc, hyphenation: false, keepWithNext: 2, capitalization: Capitalization.ALL_CAPS });
    PP("nov_sub", 0.88, { basedOn: sBase, appliedFont: F_DIS, fontStyle: "Regular", tracking: 110, justification: Cc, hyphenation: false, spaceAfter: 2, keepWithNext: 2, capitalization: Capitalization.ALL_CAPS });
    PP("nov_dia", 1, { basedOn: sBase, justification: LA, leftIndent: 4, firstLineIndent: -4, spaceAfter: 0.6 });
    PP("nov_num", 1, { basedOn: sBase, leftIndent: 5, firstLineIndent: -5, spaceAfter: 1.2, keepAllLinesTogether: true });
    PP("oracion", 1, { basedOn: sBase, fontStyle: "Italic", justification: Cc, hyphenation: false, keepAllLinesTogether: true, spaceBefore: 4, spaceAfter: 4,
        leftIndent: 3, rightIndent: 3,
        paragraphBorderOn: true, paragraphBorderColor: K, paragraphBorderLeftLineWeight: "0.8pt", paragraphBorderTopLineWeight: "0.8pt",
        paragraphBorderRightLineWeight: "0.8pt", paragraphBorderBottomLineWeight: "0.8pt",
        paragraphBorderTopOffset: 2, paragraphBorderBottomOffset: 2, paragraphBorderLeftOffset: 1, paragraphBorderRightOffset: 1,
        paragraphShadingOn: true, paragraphShadingColor: K, paragraphShadingTint: 6, paragraphShadingTopOffset: 2, paragraphShadingBottomOffset: 2 });
    var sMayEnc = PP("may_enc", 0.85, { basedOn: sBase, appliedFont: F_DIS, fontStyle: "Bold", tracking: 200, justification: LA, hyphenation: false, keepWithNext: 2,
        ruleBelow: true, ruleBelowLineWeight: "1pt", ruleBelowColor: K, ruleBelowOffset: 1.4, ruleBelowWidth: RuleWidth.COLUMN_WIDTH, spaceAfter: 1.8 });
    var sMay = PP("may", 1, { basedOn: sBase, justification: LA, hyphenation: false, spaceAfter: 0, keepWithNext: 1 });
    PP("may_fin", 1, { basedOn: sMay, keepWithNext: 0, spaceAfter: 1.3,
        ruleBelow: true, ruleBelowLineWeight: "0.5pt", ruleBelowColor: K, ruleBelowTint: 45, ruleBelowOffset: 1.4, ruleBelowWidth: RuleWidth.COLUMN_WIDTH });

    // ancho real (mm, a 10 pt) de las horas y de las ciudades, para que nada rebase su tabulador
    var list = D.prog || [], horas = [], ciudades = [];
    for (var i = 0; i < list.length; i++) {
        var mh = /^\t\*\*(.*?)\*\*\t/.exec(list[i][1]); if (list[i][0] == "evento" && mh) horas.push(mh[1]);
        var mc = /^~~(.*?)~~/.exec(list[i][1]); if (mc) ciudades.push(mc[1]);
    }
    function anchoMax(lineas, cs) {
        if (!lineas.length) return 0;
        var tf = pg.textFrames.add(lyT, undefined, undefined, { geometricBounds: [0, 0, 300, W] }), mx = 0;
        try {
            tf.contents = lineas.join("\r");
            var st = tf.parentStory;
            st.texts[0].appliedParagraphStyle = sBase; st.texts[0].appliedCharacterStyle = cs; st.texts[0].pointSize = 10;
            tf.recompose();
            for (var i = 0; i < st.paragraphs.length; i++) {
                var ch = st.paragraphs[i].characters;
                mx = Math.max(mx, ch.lastItem().endHorizontalOffset - ch.firstItem().horizontalOffset);
            }
        } catch (e) {}
        tf.remove();
        return mx;
    }
    var wHora = anchoMax(horas, csB), wCiudad = anchoMax(ciudades, csCity);
    var colW = (CW - gut * (ncol - 1)) / ncol;
    var RT = TabStopAlignment.RIGHT_ALIGN, LT = TabStopAlignment.LEFT_ALIGN;
    var sangria = 0, tabMay = 0;
    function escala(sz) {
        for (var n in prog) { var s = prog[n][0], v = sz * prog[n][1]; try { s.pointSize = v; s.leading = v * LS; } catch (e) {} }
        var tabR = Math.max(wHora * sz / 10 + 0.4, 8);
        sangria = tabR + 0.13 * sz;
        setP(sEv, { leftIndent: sangria, firstLineIndent: -sangria, tabStops: [{ alignment: RT, position: tabR }, { alignment: LT, position: sangria }] });
        try { sTema.leftIndent = sangria; } catch (e) {}
        tabMay = wCiudad ? wCiudad * sz / 10 + 0.3 * sz : 29;
        tabMay = Math.min(Math.max(tabMay, num(P.ancho_ciudad, 0)), colW * 0.5);
        setP(sMay, { leftIndent: tabMay, firstLineIndent: -tabMay, tabStops: [{ alignment: LT, position: tabMay }] });
        setP(sMayEnc, { tabStops: [{ alignment: LT, position: tabMay }] });
    }
    var ptf = pg.textFrames.add(lyT, undefined, undefined, { geometricBounds: [cTop, L, cBot, R], name: "programa" });
    ptf.textFramePreferences.textColumnCount = ncol;
    ptf.textFramePreferences.textColumnGutter = gut;
    try { ptf.textFramePreferences.insetSpacing = [0, 0, 0, 0]; } catch (e) {}
    try { ptf.textFramePreferences.verticalBalanceColumns = (P.balancear_columnas !== false); } catch (e) {}
    var paras = [], rg = [], pos = 0;
    for (var i = 0; i < list.length; i++) {
        var pp = parse(list[i][1]); paras.push(pp.s);
        for (var j = 0; j < pp.r.length; j++) rg.push([pos + pp.r[j][0], pos + pp.r[j][1], pp.r[j][2]]);
        pos += pp.s.length + 1;
    }
    ptf.contents = paras.join("\r");
    var story = ptf.parentStory;
    escala(10);
    for (var i = 0; i < list.length; i++) { try { story.paragraphs[i].appliedParagraphStyle = prog[list[i][0]] ? prog[list[i][0]][0] : sBase; } catch (e) {} }
    for (var j = 0; j < rg.length; j++) { try { story.characters.itemByRange(rg[j][0], rg[j][1] - 1).appliedCharacterStyle = CMAP[rg[j][2]]; } catch (e) {} }
    try { story.paragraphs[0].spaceBefore = 1.5; } catch (e) {}

    // tamano mas grande que cabe (busqueda binaria)
    // el tope de letra crece con el papel: en un cuatro oficios cabe letra mas grande
    var lo = num(P.cuerpo_min, 6), hi = num(P.cuerpo_max, 14 * Math.max(1, k)), best = lo;
    for (var it = 0; it < 8; it++) {
        var mid = (lo + hi) / 2; escala(mid); doc.recompose();
        if (ptf.overflows) hi = mid; else { best = mid; lo = mid; }
    }
    escala(best); doc.recompose();
    if (ptf.overflows) avisos.push("El programa NO cabe completo ni a " + best.toFixed(1) + " pt.");

    if (P.lineas_columnas !== false && ncol > 1) {
        var cw = (CW - gut * (ncol - 1)) / ncol;
        for (var c = 1; c < ncol; c++) {
            var xx = L + c * cw + (c - 0.5) * gut;
            var gl = linea(lyA, xx, cTop, xx, cBot, 0.18, 35); gl.name = "linea entre columnas";
        }
    }
    lyF.locked = true;

    // ---------- fuentes ----------
    var faltan = [];
    try {
        var fonts = doc.fonts.everyItem().getElements();
        for (var i = 0; i < fonts.length; i++) { try { if (fonts[i].status != FontStatus.INSTALLED) faltan.push(fonts[i].name.replace("\t", " ")); } catch (e) {} }
    } catch (e) {}
    if (cambios.length) avisos.push("Fuentes sustituidas: " + cambios.join("; "));
    if (faltan.length) avisos.push("Faltan fuentes: " + faltan.join(", "));

    RESULT = "OK|id=" + doc.id + "|cuerpo=" + best.toFixed(1) + "|desborde=" + (ptf.overflows ? 1 : 0) + "|aviso=" + avisos.join(" // ");
} catch (err) { RESULT = "ERROR|" + err.message + " (linea " + err.line + ")"; }
}
RESULT;
