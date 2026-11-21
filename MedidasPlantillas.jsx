// Lee todas las plantillas .indd de una carpeta y guarda sus medidas
// (tamano del documento = CTP, margenes = papel) en MEDIDAS_PLANTILLAS.txt
#target indesign
(function () {
    var carpeta = Folder.selectDialog("Selecciona la carpeta con las plantillas .indd");
    if (!carpeta) return;
    var archivos = carpeta.getFiles("*.indd");
    var out = [];
    app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;
    for (var i = 0; i < archivos.length; i++) {
        var f = archivos[i], doc = null;
        try {
            doc = app.open(f, false);
            doc.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.MILLIMETERS;
            doc.viewPreferences.verticalMeasurementUnits = MeasurementUnits.MILLIMETERS;
            var dp = doc.documentPreferences;
            var lin = [decodeURI(f.name),
                "  Documento (CTP): " + dp.pageWidth + " x " + dp.pageHeight + " mm, paginas: " + doc.pages.length,
                "  Sangrado: sup " + dp.documentBleedTopOffset + " / inf " + dp.documentBleedBottomOffset + " / izq " + dp.documentBleedInsideOrLeftOffset + " / der " + dp.documentBleedOutsideOrRightOffset];
            for (var p = 0; p < doc.pages.length; p++) {
                var pg = doc.pages[p], m = pg.marginPreferences, b = pg.bounds;
                var w = (b[3] - b[1]) - m.left - m.right, h = (b[2] - b[0]) - m.top - m.bottom;
                lin.push("  Pagina " + (p + 1) + " margenes: sup " + m.top + " / inf " + m.bottom + " / izq " + m.left + " / der " + m.right +
                         "  ->  area de papel: " + Math.round(w * 1000) / 1000 + " x " + Math.round(h * 1000) / 1000 + " mm");
                // guias (por si el papel esta marcado con guias)
                var gx = [], gy = [];
                for (var g = 0; g < pg.guides.length; g++) {
                    var gu = pg.guides[g];
                    if (gu.orientation == HorizontalOrVertical.VERTICAL) gx.push(Math.round(gu.location * 1000) / 1000); else gy.push(Math.round(gu.location * 1000) / 1000);
                }
                if (gx.length || gy.length) lin.push("  Guias verticales: " + gx.join(", ") + "   horizontales: " + gy.join(", "));
            }
            out.push(lin.join("\r\n"));
        } catch (e) { out.push(decodeURI(f.name) + "  ERROR: " + e); }
        try { if (doc) doc.close(SaveOptions.NO); } catch (e) {}
    }
    app.scriptPreferences.userInteractionLevel = UserInteractionLevels.INTERACT_WITH_ALL;
    var txt = File(carpeta + "/MEDIDAS_PLANTILLAS.txt");
    txt.encoding = "UTF-8"; txt.open("w"); txt.write(out.join("\r\n\r\n")); txt.close();
    alert("Listo: " + archivos.length + " plantillas.\rSe guardo MEDIDAS_PLANTILLAS.txt en la misma carpeta.");
})();
