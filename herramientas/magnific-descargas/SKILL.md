---
name: magnific-descargas
description: Busca fotos, videos e ilustraciones en Magnific (antes Freepik) con el conector gratuito y los descarga con la sesión Premium del usuario en Firefox, una a la vez y con el nombre que usará el proyecto. Úsala cuando el usuario pida fotos, videos o recursos de Magnific o Freepik para un proyecto, o quiera descargar una lista de enlaces de Magnific.
---

# Descargas de Magnific con la sesión del usuario

Flujo: buscar gratis con el conector → el usuario aprueba → lista en el proyecto → Firefox con la extensión descarga todo solo → renombrar en disco lo que falte → entregar la carpeta.

`<skill>` = carpeta de esta skill (normalmente `~/.claude/skills/magnific-descargas`). Requiere Node 22.13 o más nuevo y Firefox.

## Reglas firmes

- **Nunca uses `stock_download`** (gasta créditos del usuario). Sólo si el usuario lo pide explícitamente en esta conversación, y antes dile que gasta créditos y espera su sí. Buscar (`stock_search`) y ver detalles (`stock_get`) es gratis.
- No valides enlaces con `curl` ni descargas directas: Magnific responde 403. La validación real es la extensión en Firefox.
- La extensión sólo pulsa «Download» de la sesión del usuario. Nunca pulsa «Get Premium», no compra, no inicia sesión por el usuario ni teclea contraseñas: si falta sesión, el usuario la inicia en la ventana.
- No cambies ajustes del Firefox del usuario ni instales nada global. `npx web-ext` está permitido (el lanzador lo usa fijo en `web-ext@10.8.0`).
- Nombres de destino: minúsculas, ASCII, con guiones, únicos (`sala-split-moderno`). Sin acentos ni espacios.

## Licencia (dila al usuario cuando aplique)

- Lo de Magnific se usa como **ambiente o ilustración**. Nunca se presenta como trabajo, instalación, equipo o personal propio del cliente (nada de «nuestros trabajos», portafolios, testimonios ni casos de éxito con fotos de stock).
- Si el proyecto pide fotografías reales, excluye lo generado con IA (`ai_generated: "excluded"` en `stock_search`).
- Los recursos `free` pueden pedir atribución; revisa la licencia en `stock_get` y avisa. Los `premium` quedan cubiertos por la suscripción de quien descarga, mientras esté vigente al descargar.
- No redistribuyas los archivos originales (por ejemplo, como descargables). Conserva la lista con enlaces como registro de procedencia.

## Paso 1. Buscar candidatas (gratis)

- `stock_search` con `query` (en inglés suele dar mejores resultados), `content_type` (`photo`, `video`, `vector`…), `orientation`, `license`, `ai_generated`, `people` según lo que pida el proyecto. Propón 2–3 opciones por hueco, no 50.
- `stock_get` (`id`, `type`: `photo` o `video`) da detalles: dimensiones, formatos, autor y **`url`, el enlace público del recurso** que va en la lista.
- Si sólo tienes `previewUrl` de una foto, el enlace se arma así (verificado):
  `img.magnific.com/<tipo>/<slug>_<a>-<b>.jpg` → `https://www.magnific.com/<tipo>/<slug>_<id>.htm`
  Los videos van sin `.htm`: `https://www.magnific.com/premium-video/<slug>_<id>`.
- Sólo enlaces de `magnific.com` (o `freepik.com`); la extensión rechaza otros.

## Paso 2. Mostrar y esperar aprobación

Muestra una tabla: nombre de destino, tipo (foto/video), licencia (free/premium), para qué se usará y el enlace. Pregunta si los apruebas tal cual o con cambios. **No sigas sin un sí explícito.** Si el usuario cambia nombres o quita recursos, ajusta y vuelve a mostrar sólo si hubo cambios grandes.

## Paso 3. Escribir la lista en el proyecto

Un `.txt` en el proyecto (donde el usuario diga o donde el proyecto guarde sus insumos; por ejemplo `docs/medios/magnific-<tema>.txt`). Formato, una por renglón, `#` comenta:

```
# Fotos de ambiente para <proyecto>. Sólo ilustración: no se presentan como trabajos del cliente.
sala-split-moderno | https://www.magnific.com/premium-photo/..._405999102.htm
limpieza-unidad    | https://www.magnific.com/premium-video/..._5090231
```

No hagas commit salvo que el usuario lo pida.

## Paso 4. Lanzar Firefox con la extensión

Corre en segundo plano (`run_in_background`), porque el proceso dura hasta que se cierra esa ventana de Firefox:

```
node "<skill>/scripts/lanzar.mjs" --lista "<ruta de la lista>" --carpeta <subcarpeta> [--destino "<carpeta final en el proyecto>"]
```

- `--carpeta`: subcarpeta dentro de la carpeta de Descargas de Firefox (por omisión, el nombre de la lista). La imprime completa.
- `--destino`: opcional; al renombrar, los archivos se mueven ahí (por ejemplo `public/medios/ambiente`).
- Perfil por omisión `sesion`: un perfil propio de la herramienta en `%LOCALAPPDATA%\magnific-descargas\perfil-firefox`, al que copia **sólo** las cookies de magnific.com y freepik.com del perfil del usuario (su perfil sólo se lee). Corre como otra instancia, aparte del Firefox de siempre.
- Si responde «Firefox está abierto con tu perfil…»: dile al usuario que cierre Firefox por completo y vuelve a correr; o usa `--manual` (imprime cómo cargarla en su Firefox abierto desde `about:debugging#/runtime/this-firefox` → «Cargar complemento temporal…» → `extension/manifest.json`); o `--sin-sesion` (inicia sesión una vez en la ventana de descargas y queda guardada).
- `--perfil copia` usa una copia temporal completa del perfil: evítalo si el perfil es grande (puede pesar GB).
- `--sin-lanzar` revisa la lista y el perfil e imprime el comando sin abrir nada.

Qué pasa en la ventana: se abre el panel «Descargas de Magnific» y la cola arranca sola a los 5 s, una página a la vez, con pausas de 4–7 s. Si una página pide sesión o Premium, la cola se pausa: el usuario inicia sesión en la pestaña que quedó abierta y pulsa «Reanudar». Si un recurso falla, su pestaña queda abierta con el motivo en el panel. Al final el panel dice «Terminado» y guarda `manifiesto-<lote>.json` en la carpeta de descargas.

Dile al usuario que te avise (o que cierre esa ventana de Firefox) cuando el panel diga «Terminado».

## Paso 5. Renombrar y entregar

```
node "<skill>/scripts/renombrar.mjs" --ultimo            # simula: muestra qué movería
node "<skill>/scripts/renombrar.mjs" --ultimo --aplicar  # mueve/renombra
```

- Lee el manifiesto del último lanzamiento. Los archivos que el navegador no pudo renombrar (descargas `blob:`/`data:`, enlaces de un solo uso, descargas tardías) se renombran aquí. Con `--destino` (o el del lanzador) mueve todo a esa carpeta.
- Nunca sobrescribe ni borra: los choques salen como `[conflicto]`; las descargas adicionales y las «sin dueño» salen en «Revisar a mano». Al aplicar deja `renombrado-<lote>.json` para deshacer.
- Sin manifiesto (por ejemplo, una corrida vieja): `renombrar.mjs --lista <lista.txt> --carpeta <carpeta>` empareja por las palabras del enlace en el nombre de Magnific o por eliminación. Siempre simula primero y muestra el resultado al usuario antes de `--aplicar`.

Entrega: la carpeta final, la lista de archivos con su nombre, y los que fallaron con su motivo y enlace (para descargarlos a mano). Recuerda las reglas de licencia si el uso lo amerita.
