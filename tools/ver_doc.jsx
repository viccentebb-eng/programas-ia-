// exporta el documento activo a JPG para revisarlo
var d = app.activeDocument;
var f = File(File($.fileName).parent.fsName + "/salida/vista.jpg");
app.jpegExportPreferences.exportResolution = 110;
app.jpegExportPreferences.jpegQuality = JPEGOptionsQuality.HIGH;
app.jpegExportPreferences.jpegExportRange = ExportRangeOrAllPages.EXPORT_ALL;
d.exportFile(ExportFormat.JPG, f);
var info = [d.name, d.documentPreferences.pageWidth + "x" + d.documentPreferences.pageHeight, "docs=" + app.documents.length];
try { var p = d.textFrames.itemByName("programa"); info.push("overflow=" + p.overflows, "pt=" + p.parentStory.paragraphs[3].pointSize); } catch (e) { info.push(e.message); }
info.join(" | ");
