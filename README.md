# Programas IA

Panel de InDesign que arma los **reversos de carteles de fiestas patronales** (el programa de la fiesta) con ayuda de Claude: lee fotos, Word o PDF del programa, revisa fechas y ortografía, diseña en InDesign con el estilo de la casa y lo exporta montado en la placa de CTP, a una tinta.

## Instalar en otra computadora

### Lo que necesita esa computadora

| Programa | ¿Obligatorio? | Para qué |
|---|---|---|
| Windows 10 u 11 | Sí | |
| InDesign 2023 o más nuevo (con Creative Cloud) | Sí | El panel y el motor de diseño |
| Illustrator | No | Pasar a una tinta los adornos que bajes de Magnific |
| [Node.js](https://nodejs.org) | No | Usar Claude Desktop o Codex sin clave de API |
| Claude Desktop o Codex | No | Lo mismo |

Si vas a usar Claude Desktop o Codex, instálalos (y Node.js) **antes** del paso 2; si los instalas después, vuelve a correr el instalador.

### Pasos

1. **Baja el instalador:** en este repo entra a la carpeta [`instalable/`](instalable/), abre `Instalar Programas IA.exe` y da **Download** (botón con flechita, arriba a la derecha del archivo).
2. **Cierra InDesign** y dale **doble clic** al `.exe`. No pide permisos de administrador.
   Si Windows dice *"Windows protegió su PC"*: **Más información → Ejecutar de todas formas** (sale porque el instalador no está firmado).
3. Al terminar, abre InDesign: **Ventana → Complementos (Plug-ins) → Programas IA**.
   Si no aparece: menú Inicio → Programas IA → *Carpeta de Programas IA* → doble clic a `ProgramasIA.ccx`.
4. En la pestaña **Ajustes** del panel pega tu clave de API de Claude (empieza con `sk-ant-api03-`, se crea en [console.anthropic.com](https://console.anthropic.com/settings/keys)) y da **Conectar**.
   ¿Sin clave? Usa Claude Desktop o Codex (ver abajo).

### Qué hace el instalador

- Instala las fuentes (Lora, Playfair Display, Pinyon Script; si falta alguna la baja de Google Fonts).
- Pone la prueba del motor y *MedidasPlantillas* en el panel Scripts de InDesign (carpeta *Programas IA*).
- Instala el panel en InDesign.
- Enciende el **puente de internet** (por si el firewall no deja salir a InDesign) y lo deja arrancando con Windows.
- Registra el conector `programas-ia` en Claude Desktop y Codex, si están instalados (deja copia `.bak` de su configuración).
- Deja accesos en menú Inicio → Programas IA, incluido *Desinstalar*.

### Lo que no se pasa solo

Cada computadora guarda lo suyo:

- La **clave de API** y lo que ajustes en el panel (fuentes o adornos por estilo, tamaños que agregues).
- Tu **biblioteca de adornos**: para llevártela, copia `Documentos\Programas IA\Biblioteca` a la misma ruta en la otra computadora.

## Usar Claude sin clave de API (Claude Desktop o Codex)

Después de instalar, **reinicia Claude Desktop una vez**. En un chat nuevo adjunta las fotos o el Word del programa y escribe, por ejemplo: *"arma el reverso en doble oficio"*. Claude lee, te avisa de fechas y ortografía, genera en InDesign, ve la página, corrige y al final: *"expórtalo en la placa"*. En el panel, paso 2, *Traer el programa que armó Claude* pasa ese texto al panel.

## Cómo se usa el panel

Ver [`LEEME.txt`](LEEME.txt): los 4 pasos (Programa, Revisar, Diseñar, Corregir), adornos, placa de CTP y qué hacer si algo falla.

## Para quien programe

- `ProgramasIA/` — el panel UXP (`main.js`, `estilos.js`, `biblioteca.js`, `capturas.js`…) y el motor ExtendScript (`engine.jsx`, `placa.jsx`).
- `conector/` — servidor MCP sin dependencias (`servidor.js`) y su registro en Claude Desktop/Codex (`registrar.js`).
- `instalador/` — `instalar.ps1` y `desinstalar.ps1`.
- `plantillas/` — plantillas de CTP del taller (placa = documento; papel = área dentro de márgenes).
- `tools/build.js` — genera `dist/Instalar Programas IA <versión>.exe`, el `.ccx` y la prueba del motor. Después de compilar, copia el `.exe` a `instalable/Instalar Programas IA.exe`.
- La ficha técnica completa (decisiones, pruebas y trampas encontradas) está en [`PROMPT_CLAUDE_CODE.md`](PROMPT_CLAUDE_CODE.md).
