# Proyecto: Programas IA — panel de InDesign para reversos de carteles religiosos

Eres el desarrollador de este proyecto. Lee todo antes de tocar código. Trabaja en español con el usuario.

## Contexto del negocio
- Taller de diseño en el sur de Jalisco que hace carteles de fiestas patronales católicas (vírgenes, santos, Sagrada Familia, etc.). El **reverso** lleva el programa de la fiesta.
- Lo hace **una sola persona**. Antes diseñaban en CorelDRAW; ahora el motor es **InDesign 21.0.2 (2026), Windows**.
- El cliente manda el programa como **fotos (a veces con letra a mano, tachones y notas), Word, PDF o texto**.
- Se imprime en **CTP a una tinta (negro)**. Las plantillas de CTP (`*.indd`, horizontales porque así se graban en láser) tienen el documento = tamaño de placa y **los márgenes = tamaño de papel**. El panel diseña **solo al tamaño del papel, en vertical**; el usuario monta ese PDF en su plantilla.
- Estilo de la casa (ver sus PDF de ejemplo): una tinta, marco con cenefa y esquinas barrocas grabadas, título en letra manuscrita, encabezados en mayúsculas espaciadas, cintillas grises con filetes para secciones, días con barra gris, horas alineadas, temas de reflexión en negrita cursiva, mayordomos en tabla Ciudad/Entrantes, pie con lugar y fecha.

## Qué existe (carpeta `ProgramasIA/`, plugin UXP manifest v5, host ID ≥ 18.5)
- `manifest.json` — panel "Programas IA"; permisos: red a `https://api.anthropic.com`, `localFileSystem: fullAccess`.
- `index.html` — 5 pestañas: 1 Programa, 2 Revisar, 3 Diseñar, 4 Corregir, Ajustes.
- `main.js` (UXP, JS moderno):
  - Lee archivos (jpg/png → imagen base64, pdf → documento, docx → texto con JSZip, txt).
  - `claude()` llama a `/v1/messages` (`x-api-key`, `anthropic-version: 2023-06-01`). Modelo configurable (por defecto `claude-sonnet-5-5`).
  - `SYS_LEER`: transcribe al **marcado** y devuelve `{"marcado","avisos"[]}`.
  - `revisarFechas()`: valida localmente día de la semana vs fecha (año del texto, mes de `FECHAS:` o del propio texto), "12:00 a.m." sospechoso y días de fiesta en otro mes.
  - `parseMarcado()`: marcado → `{enc, prog}` para el motor (lista `[estilo, texto]` con `**negrita**`, `__negrita cursiva__`, `~~ciudad~~`).
  - `generar()`: lee `engine.jsx`, inyecta `var DATA = {...}` en `/*__DATA__*/` y ejecuta `app.doScript(code, ScriptLanguage.JAVASCRIPT)` (ExtendScript). Devuelve `OK|id=..|cuerpo=..|desborde=0|aviso=..`.
  - `corregir()`: exporta JPG de la página, se lo manda a Claude con el marcado y los parámetros; `SYS_CORREGIR` devuelve `{"explicacion","marcado"?,"params"?}` y se regenera el documento (cierra el anterior sin guardar).
  - `exportarPDF()`, `importarMedidas()` (lee `MEDIDAS_PLANTILLAS.txt` y crea formatos verticales), ajustes en `localStorage` (clave, modelo, formatos `Nombre | ancho | alto | sangrado`, fuentes).
  - Clave: si falta o la API responde 401/403, abre Ajustes y la pide; avisa cuando la clave tiene ≥ 25 días. **Nunca** escribir una clave en el código ni en archivos del proyecto.
- `engine.jsx` (ExtendScript ES3, paramétrico, `k = ancho / 330.298`):
  - Capas: FONDO (bloqueada: marco vectorial nativo = 3 rectángulos + cenefa de florecitas con `assets/banda_h|v.pdf` + 4 esquinas `assets/esquina.pdf` volteadas con máscara blanca), ADORNOS (movibles y agrupados: líneas con rombo del aniversario, divisores de "PROGRAMA" `assets/divisor_*.pdf`, recuadro gris del mensaje, adorno del pie, líneas entre columnas), TEXTOS.
  - Encabezado apilado con marcos de autoajuste de alto: PRE, NOMBRE (se reduce hasta caber en 1 línea), FECHAS, ANIOS, LEMA, OBJETIVO (capitular) + MENSAJE (recuadro), "PROGRAMA", PIE. Los adornos se colocan midiendo `horizontalOffset`/`endHorizontalOffset` del texto real.
  - Programa: un marco de N columnas (`columnas` o auto: 2 si ancho < 260 mm, si no 3), columnas balanceadas, estilos de párrafo `cintilla` (sombreado + filetes), `dia` (sombreado + borde izq.), `evento` (sangría francesa 17.7 mm, tab derecho 16.5 / izq. 17.7), `tema`, `texto`, `previo` (viñeta), `nov_tit`, `nov_sub`, `nov_dia`, `nov_num`, `oracion` (recuadro), `may_enc`, `may`, `may_fin`.
  - Búsqueda binaria del cuerpo de texto más grande que cabe entre `cuerpo_min` y `cuerpo_max`.
  - `setP()` aplica propiedades en orden: basedOn → fuente → leftIndent → firstLineIndent, luego el resto, y los tabuladores uno por uno. Este orden corrigió el bug de horas desalineadas.
  - Fuentes con respaldo: si la variante no está instalada (`FontStatus.INSTALLED`) usa la más cercana y lo reporta.
  - Parámetros: `escala_titulo, escala_encabezado, separacion_encabezado, columnas, cuerpo_min, cuerpo_max, espacio_dias, espacio_cintilla, sombra_dias, sombra_cintillas, sombra_mensaje, lineas_columnas, balancear_columnas, mostrar_objetivo, mostrar_mensaje, mostrar_lema, ancho_ciudad`.
- `PRUEBA_MOTOR/prueba_motor.jsx` — corre el motor con los datos de Atemajac 2027 sin panel ni API (usar para depurar el motor).
- `MedidasPlantillas.jsx` — abre todas las plantillas `.indd` de una carpeta y escribe `MEDIDAS_PLANTILLAS.txt` (placa, márgenes, área de papel, guías).
- `EJEMPLO_MARCADO_ATEMAJAC.txt` — marcado completo de referencia (87 párrafos).
- Fuentes (OFL): Lora, Playfair Display, Pinyon Script.

## Formato del marcado
```
PRE: / NOMBRE: / FECHAS: / ANIOS: / LEMA: / OBJETIVO: / MENSAJE: / PIE:
CINTILLA: TÍTULO DE SECCIÓN
DIA: DOMINGO 5
EVENTO: 7:00 p.m. | descripción
TEMA: “texto”
TEXTO: párrafo
PREVIO: **Etiqueta:** texto
SUBTITULO: / SUB2:
LISTA: **Etiqueta:** texto
NUM: texto (se numera solo)
ORACION: Título | texto
MAYORDOMOS:
Ciudad: Nombre 1; Nombre 2
```

## Estado (21-nov-2026, versión 1.1.0)
- Motor probado en InDesign 2026 real por COM (`tools/correr_jsx.ps1 tools/salida/prueba_com.jsx`): arma Atemajac completo en ~6 s (antes 2.5 min) con `UndoModes.ENTIRE_SCRIPT` + `enableRedraw=false`. OJO: `FAST_ENTIRE_SCRIPT` rompe la creación del documento.
- Corregido en InDesign: fecha encimada bajo el título manuscrito (se mide desde la línea base), horas de dos cifras rebasando el tabulador y ciudades largas en mayordomos (tabuladores medidos con el texto real en `escala()`), capitular con cola (ahora en la letra de encabezados).
- Confirmado desde UXP (script .idjs por COM): `app.doScript(code, ScriptLanguage.JAVASCRIPT)` regresa el texto; `app.insertLabel/extractLabel("programasia_result")` como respaldo. Un U+2028 literal en el código rompe ExtendScript: todo JSON va por `es3()`.
- Panel rediseñado (estilos.css): pasos con palomita, un botón principal por paso, barra de estado, conexión de clave con lista real de modelos (`/v1/models`), uso y costo (sesión/mes/total), editor de tamaños, sugerencias en Corregir, arrastrar archivos (no confirmado en UXP; el clic sí).
- Fuentes: `fuentes.js` revisa en InDesign, baja de Google Fonts (TTF) e instala por usuario con `instalar_fuentes.ps1` lanzado por `File.execute()`; InDesign las ve sin reiniciar (probado).
- Instalador: `node tools/build.js` genera `dist/Instalar Programas IA <ver>.exe` (IExpress). Probado aquí: copia, fuentes, scripts, accesos y entrada de desinstalar. UPIA da `-198` en esta máquina (desde el entorno de Claude): el instalador cae a plan B (copia a `%APPDATA%\Adobe\UXP\Plugins\External` + `PluginsInfo\v1\ID.json`). Falta confirmar que InDesign carga el panel tras reiniciar.
- Antes de esto, no se había probado dentro de InDesign real. Lo verificado fuera de InDesign: sintaxis de todos los archivos, el parser (los 87 párrafos de Atemajac) y el revisor de fechas.
- Un script anterior equivalente (no paramétrico) ya corrió bien en la máquina del usuario: el texto quedó a ~10 pt, y se corrigieron el desalineado de horas, la cenefa pixeleada (ahora todo es vector) y los adornos encimados en "PROGRAMA".
- Pendiente de confirmar en InDesign: `doScript` desde UXP y su valor de retorno, `U+2028` como salto de línea forzado en ORACION, sombreado y bordes de párrafo, `flipItem` de esquinas, exportación JPG/PDF por `itemByID`, instalación del `.ccx` sin firmar (alternativa: UXP Developer Tools).

## Siguientes pasos (en orden)
1. Probar `PRUEBA_MOTOR` en la máquina del usuario y corregir el motor según sus capturas.
2. Probar el panel completo: leer → revisar → generar → corregir → exportar.
3. Cargar los formatos reales con `MEDIDAS_PLANTILLAS.txt` (falta que el usuario lo corra) y confirmar si llevan sangrado.
4. Versión 2:
   - **Estilos por advocación**: Guadalupana (rosas, estrellas), Sagrado Corazón, Sagrada Familia, santos. Cada estilo es un conjunto de assets + fuentes + parámetros.
   - **Biblioteca de adornos** en una carpeta local con etiquetas.
   - **Lista de links de Magnific por cartel**: una página con miniaturas, botón "abrir todos" y "copiar lista". Un vigilante de la carpeta Descargas descomprime, etiqueta y mueve a la biblioteca.
   - **Recuadros especiales**: círculo con oración, foto tramada.
   - **Usar su repositorio de PDF anteriores** como ejemplos de estilo (por imagen) y una guía de estilo escrita.

## Reglas que no se negocian
- **Magnific/Freepik:** su política prohíbe bots y automatización en el sitio. NO hacer scripts que descarguen o den clic en "Descargar". Solo dos vías: el usuario descarga a mano desde una lista de links, o la API/MCP oficial (cuesta créditos).
- Todo vector y a una tinta (K100 / escala de grises). Sin imágenes rasterizadas en marcos ni adornos.
- No inventar datos del programa. Los cambios de texto se avisan al usuario.
- Las correcciones por chat regeneran el documento; los retoques manuales se hacen al final.
- No guardar claves de API en el código. El usuario pega la suya en Ajustes.
