# Descargas de Magnific

Descarga una lista de enlaces de Magnific (antes Freepik) **con tu propia sesión Premium en Firefox**, como si dieras clic en «Download», una a la vez y con pausas. No usa la API ni gasta créditos. Nunca pulsa «Get Premium» ni compra nada.

## Contenido

- `SKILL.md`: instrucciones para Claude (buscar, aprobar, descargar, renombrar).
- `extension/`: extensión de Firefox. Si encuentra `extension/lista.json` (la escribe el lanzador), arranca sola.
- `scripts/lanzar.mjs`: valida la lista, la copia a la extensión y abre Firefox con `npx web-ext@10.8.0 run`.
- `scripts/renombrar.mjs`: deja en disco los nombres de la lista según el manifiesto (simula por omisión; `--aplicar` mueve).
- `scripts/lista.mjs`: lectura de listas `nombre | enlace`.

## Uso rápido

```
node scripts/lanzar.mjs --lista mi-lista.txt --carpeta proyecto-fotos
# … en Firefox: el panel corre solo; al decir «Terminado», cierra esa ventana …
node scripts/renombrar.mjs --ultimo
node scripts/renombrar.mjs --ultimo --aplicar
```

Formato de la lista: `nombre | enlace`, una por renglón; `#` para comentarios.

## Sesión de Firefox

- Por omisión usa un perfil propio (`%LOCALAPPDATA%\magnific-descargas\perfil-firefox`) y le copia sólo las cookies de magnific.com y freepik.com de tu perfil. Para copiarlas, tu Firefox debe estar cerrado; después puede seguir abierto.
- `--manual`: cárgala tú en tu Firefox abierto: `about:debugging#/runtime/this-firefox` → «Cargar complemento temporal…» → `extension/manifest.json`.
- `--sin-sesion`: inicia sesión una vez en la ventana de descargas; queda guardada.

## Licencia de uso

Lo de Magnific se usa como ambiente o ilustración; no se presenta como trabajo propio del cliente.
