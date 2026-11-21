// Illustrator: abre un vector (svg, eps, ai, pdf), lo pasa a escala de grises, quita el fondo
// blanco que traen muchos vectores, ajusta la mesa de trabajo al dibujo y lo guarda como PDF.
// Recibe ENTRADA y SALIDA (rutas) definidas antes de este codigo. Devuelve "OK|..." o "ERROR|...".
var RES = "ERROR|sin resultado";
(function () {
    var nivel = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    var doc = null;
    try {
        doc = app.open(File(ENTRADA));
        if (doc.documentColorSpace != DocumentColorSpace.CMYK) { try { doc.documentColorSpace = DocumentColorSpace.CMYK; } catch (e) {} }
        // fondo blanco: el rectangulo mas grande, blanco y hasta atras
        var quitados = 0;
        try {
            var pis = doc.pathItems, area = 0, ab = doc.artboards[0].artboardRect, abArea = Math.abs((ab[2] - ab[0]) * (ab[1] - ab[3]));
            for (var i = pis.length - 1; i >= 0; i--) {
                var p = pis[i];
                if (!p.filled || p.stroked) continue;
                var c = p.fillColor, blanco = false;
                if (c.typename == "RGBColor") blanco = c.red > 245 && c.green > 245 && c.blue > 245;
                else if (c.typename == "CMYKColor") blanco = c.cyan < 3 && c.magenta < 3 && c.yellow < 3 && c.black < 3;
                else if (c.typename == "GrayColor") blanco = c.gray < 3;
                var b = p.geometricBounds, a = Math.abs((b[2] - b[0]) * (b[1] - b[3]));
                if (blanco && a >= abArea * 0.9) { p.remove(); quitados++; }
            }
        } catch (e) {}
        // todo a escala de grises (Edicion > Editar colores > Convertir a escala de grises)
        app.executeMenuCommand("selectall");
        app.executeMenuCommand("Colors7");
        app.executeMenuCommand("deselectall");
        // mesa de trabajo al tamano del dibujo
        try { doc.artboards[0].artboardRect = doc.visibleBounds; } catch (e) {}
        // revisar que no quede color
        var conColor = 0, raster = doc.rasterItems.length;
        for (var j = 0; j < doc.pathItems.length; j++) {
            var q = doc.pathItems[j];
            if (q.filled && q.fillColor.typename != "GrayColor" && q.fillColor.typename != "NoColor") conColor++;
            if (q.stroked && q.strokeColor.typename != "GrayColor" && q.strokeColor.typename != "NoColor") conColor++;
        }
        var op = new PDFSaveOptions();
        op.compatibility = PDFCompatibility.ACROBAT7; op.preserveEditability = false;
        doc.saveAs(File(SALIDA), op);
        RES = "OK|trazos=" + doc.pathItems.length + "|con_color=" + conColor + "|raster=" + raster + "|fondo_quitado=" + quitados;
    } catch (e) { RES = "ERROR|" + e.message + " (linea " + e.line + ")"; }
    try { if (doc) doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {}
    app.userInteractionLevel = nivel;
})();
RES;
