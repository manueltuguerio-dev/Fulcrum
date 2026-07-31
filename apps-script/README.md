# Publicar el documento como Web App de Google Apps Script

Esta carpeta contiene el documento de arquitectura empaquetado para servirse
desde Apps Script con `HtmlService`.

| Archivo | Qué es |
|---|---|
| `Code.gs` | El `doGet()` que sirve la página |
| `Index.html` | La página completa, **generada** — no la edites a mano |
| `appsscript.json` | Manifiesto con la configuración del Web App |
| `build.py` | Genera `Index.html` desde `docs/artifact/fulcrum-comedor.html` |

## Desplegar sin instalar nada

1. Entra a <https://script.google.com> y crea un proyecto nuevo.
2. Borra el contenido de `Código.gs` y pega el de `Code.gs`.
3. Botón **+** junto a *Archivos* → **HTML**. Nómbralo exactamente `Index`
   (Apps Script le pone `.html` solo). Borra su contenido y pega el de
   `Index.html`.
4. Opcional, para que el manifiesto quede igual: ⚙️ **Configuración del
   proyecto** → activa *Mostrar el archivo de manifiesto "appsscript.json"* y
   pega el contenido de `appsscript.json`.
5. **Implementar** → **Nueva implementación** → tipo **Aplicación web**.
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: ver la nota de abajo
6. Autoriza cuando lo pida y copia la URL `.../exec`. Esa es la liga a compartir.

Cada cambio posterior necesita **Implementar → Administrar implementaciones →
editar → Nueva versión**. La URL `/exec` no cambia.

## Desplegar con clasp

```bash
npm install -g @google/clasp
clasp login
clasp create --type webapp --title "Fulcrum Comedor — Arquitectura" --rootDir apps-script
clasp push
clasp deploy --description "v1"
```

`clasp` toma los tres archivos tal como están. Si `clasp create` genera su propio
`appsscript.json`, sobrescríbelo con el de esta carpeta antes de `clasp push`.

## Quién puede ver la página

`appsscript.json` viene con `"access": "ANYONE_ANONYMOUS"`: cualquiera con la liga
entra sin iniciar sesión, que es lo que hace que el enlace sirva en un grupo de
WhatsApp. Si prefieres restringirlo, cambia ese valor antes de desplegar:

| Valor | Quién entra |
|---|---|
| `ANYONE_ANONYMOUS` | Cualquiera con la liga, sin cuenta de Google |
| `ANYONE` | Cualquiera con la liga, pero con sesión de Google iniciada |
| `DOMAIN` | Solo cuentas del dominio de Workspace |
| `MYSELF` | Solo tú |

## Regenerar la página

El documento fuente es `docs/artifact/fulcrum-comedor.html`. Edítalo ahí y
después:

```bash
python3 apps-script/build.py
```

El script envuelve el contenido con el esqueleto HTML, el reset, el interruptor
de tema y el cargador de diagramas. Editar `Index.html` directamente funciona
hasta la próxima regeneración, que lo sobrescribe.

## Diferencias con la versión publicada como artifact

El visor de artifacts de claude.ai aporta cosas que Apps Script no, y esta
versión las resuelve por su cuenta:

- **Interruptor de tema propio**, arriba a la derecha, con la preferencia
  guardada en `localStorage`. La página sigue respetando el modo del sistema
  mientras no se toque el botón.
- **Mermaid desde CDN** (`cdn.jsdelivr.net`) en lugar del renderizado nativo. Si
  el CDN no carga —red bloqueada o sin respuesta en 8 segundos— cada diagrama
  muestra su propio código Mermaid, que sigue siendo legible.
- **Meta viewport desde `Code.gs`**, porque `HtmlService` descarta los `<meta>`
  del archivo HTML.
- **Sin `<base target="_top">`**, a propósito: rompería los enlaces del índice
  lateral dentro del iframe. El desplazamiento se maneja con JavaScript.

Verificado en Chromium a 520 px y 1280 px de ancho, en modo claro y oscuro: la
página no genera desplazamiento horizontal, y las tablas anchas se desplazan
dentro de su propio contenedor.
