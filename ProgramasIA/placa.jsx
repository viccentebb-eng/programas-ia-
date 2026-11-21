// =====================================================================
//  PROGRAMAS IA - montar el reverso en la placa de CTP y exportar
//  Placa de linea: sin barras de color ni marcas; el diseno queda centrado
//  dentro de los margenes de la plantilla (girado si hace falta).
//  Recibe DATA = { docId, tmp, salida, placa: {ancho, alto, sup, inf, izq, der},
//                  sangrado, giro (0 | 90 | -90), dejarAbierta }
//  Devuelve "OK|aviso=..." o "ERROR|..."
// =====================================================================
/*__DATA__*/
var RESULT = "ERROR|sin resultado";
(function () {
    var SP = app.scriptPreferences, ui = SP.userInteractionLevel, mu = SP.measurementUnit;
    SP.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;
    SP.measurementUnit = AutoEnum.AUTO_VALUE;
    var pl = null;
    try {
        var D = DATA, P = D.placa;
        var d = app.documents.itemByID(Number(D.docId));
        if (!d.isValid) throw new Error("El diseño ya no está abierto. Genéralo otra vez.");
        // preset propio: PDF/X-1a sin marcas ni barras
        var pr = app.pdfExportPresets.itemByName("Programas IA CTP");
        if (!pr.isValid) { try { pr = app.pdfExportPresets.add({ name: "Programas IA CTP" }); } catch (e) { pr = app.pdfExportPresets.itemByName("[PDF/X-1a:2001]"); } }
        var props = { standardsCompliance: PDFXStandards.PDFX1A2001_STANDARD, useDocumentBleedWithPDF: true, cropMarks: false, bleedMarks: false,
            registrationMarks: false, colorBars: false, pageInformationMarks: false, includeSlugWithPDF: false, exportReaderSpreads: false, viewPDF: false };
        for (var k in props) { try { pr[k] = props[k]; } catch (e) {} }
        d.exportFile(ExportFormat.PDF_TYPE, File(D.tmp), false, pr);

        // documento del tamano de la placa, con los margenes de la plantilla
        pl = app.documents.add(true);
        pl.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.MILLIMETERS;
        pl.viewPreferences.verticalMeasurementUnits = MeasurementUnits.MILLIMETERS;
        pl.documentPreferences.facingPages = false;
        pl.documentPreferences.pagesPerDocument = 1;
        pl.documentPreferences.pageWidth = P.ancho + "mm";
        pl.documentPreferences.pageHeight = P.alto + "mm";
        pl.viewPreferences.rulerOrigin = RulerOrigin.PAGE_ORIGIN; pl.zeroPoint = [0, 0];
        var pg = pl.pages[0];
        pg.marginPreferences.properties = { top: P.sup, bottom: P.inf, left: P.izq, right: P.der, columnCount: 1 };
        var area = [P.sup, P.izq, P.alto - P.inf, P.ancho - P.der], aw = area[3] - area[1], ah = area[2] - area[0];
        // con sangrado se coloca con su rebase (sale del papel, como debe); sin sangrado, al corte
        try { app.pdfPlacePreferences.pdfCrop = D.sangrado > 0 ? PDFCrop.CROP_BLEED : PDFCrop.CROP_TRIM; app.pdfPlacePreferences.pageNumber = 1; } catch (e) {}
        var NONE = pl.swatches.itemByName("None");
        var r = pg.rectangles.add({ geometricBounds: [area[0], area[1], area[0] + 10, area[1] + 10], strokeWeight: 0, strokeColor: NONE, fillColor: NONE, name: "reverso" });
        r.place(File(D.tmp));
        var g = r.graphics[0];
        r.fit(FitOptions.FRAME_TO_CONTENT);
        // girar el marco completo desde su centro (girar solo la imagen la saca de la mesa de trabajo)
        if (D.giro) r.transform(CoordinateSpaces.PASTEBOARD_COORDINATES, AnchorPoint.CENTER_ANCHOR,
            app.transformationMatrices.add({ counterclockwiseRotationAngle: D.giro }));
        var b = r.geometricBounds, w = b[3] - b[1], h = b[2] - b[0];
        // mover por diferencia (tras girar, move() a un punto usa otra referencia)
        r.move(undefined, [area[1] + (aw - w) / 2 - b[1], area[0] + (ah - h) / 2 - b[0]]);
        var b2 = r.geometricBounds;
        if (Math.abs(b2[1] - (area[1] + (aw - w) / 2)) > 0.5 || Math.abs(b2[0] - (area[0] + (ah - h) / 2)) > 0.5)
            throw new Error("no pude centrar el reverso en la placa");
        try { g.itemLink.unlink(); } catch (e) {}
        var aviso = "";
        var wn = w - 2 * (D.sangrado || 0), hn = h - 2 * (D.sangrado || 0);
        if (Math.abs(wn - aw) > 1 || Math.abs(hn - ah) > 1)
            aviso = "El diseño mide " + Math.round(wn) + " x " + Math.round(hn) + " mm y el papel de la placa " + Math.round(aw) + " x " + Math.round(ah) + " mm; quedó centrado a tamaño real.";
        pl.exportFile(ExportFormat.PDF_TYPE, File(D.salida), false, pr);
        if (!D.dejarAbierta) { pl.close(SaveOptions.NO); pl = null; }
        RESULT = "OK|aviso=" + aviso;
    } catch (e) {
        RESULT = "ERROR|" + e.message + " (linea " + e.line + ")";
        try { if (pl && !DATA.dejarAbierta) pl.close(SaveOptions.NO); } catch (e2) {}
    }
    SP.userInteractionLevel = ui; SP.measurementUnit = mu;
})();
try { app.insertLabel("programasia_result", RESULT); } catch (e) {}
RESULT;
