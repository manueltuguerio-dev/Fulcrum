# TLTERMINALS · Comedor — Instalación en Google Apps Script

Instructivo para publicar el documento de arquitectura como página web desde
Google Apps Script. No requiere instalar nada: se hace desde el navegador, con
una cuenta de Google.

Tiempo estimado: 10 minutos.

---

## Qué vas a publicar

El documento técnico completo del sistema de comedor —arquitectura, base de
datos, API y flujos— como una página web responsive con su propia liga, que se
ve igual en celular y en PC y tiene modo claro y oscuro.

> **Nota de alcance:** lo que se despliega aquí es **el documento**, no la
> aplicación de pedidos. La aplicación (menús, pedidos, hora corte, reportes) es
> lo que el documento describe cómo construir, y va sobre otra plataforma. Si la
> quieres funcionando sobre Google —Apps Script + Google Sheets como base de
> datos— eso es un proyecto aparte que hay que cotizar y planear.

---

## Requisitos

- Una cuenta de Google (personal o de Workspace de TLTERMINALS).
- El contenido de estos tres archivos, que vienen en el ZIP dentro de la carpeta
  `apps-script/`:
  - `Code.gs`
  - `Index.html`
  - `appsscript.json`

Ábrelos con cualquier editor de texto (Bloc de notas, TextEdit, VS Code). No los
abras con Word.

### Cómo no confundir los dos archivos

Es el error más común de esta instalación. Cada uno va en un tipo de archivo
distinto y **no son intercambiables**:

| Archivo del ZIP | Su primera línea | Dónde va |
|---|---|---|
| `Code.gs` | `/**` | En `Código.gs`, el archivo con ícono `<>`. Solo acepta JavaScript |
| `Index.html` | `<!DOCTYPE html>` | En un archivo **HTML** nuevo llamado `Index` |

Si al pegar ves el error `SyntaxError: Unexpected token '<', línea 1`, es que el
HTML se pegó en `Código.gs`. Bórralo de ahí y pon cada uno en su lugar.

> **Los demás archivos del ZIP no se suben a Apps Script.** `build.py` es una
> herramienta que corre en tu computadora, no en Google —Apps Script solo ejecuta
> JavaScript, así que pegarla ahí da error—, y las carpetas `docs/` y este
> instructivo son material de referencia. Ver *Anexo · Regenerar la página*.

---

## Paso 1 · Crear el proyecto

1. Entra a **<https://script.google.com>** con tu cuenta de Google.
2. Clic en **Nuevo proyecto**, arriba a la izquierda.
3. Arriba, donde dice *Proyecto sin título*, ponle nombre:
   `TLTERMINALS Comedor — Arquitectura`.

---

## Paso 2 · Pegar el código del servidor

1. En el panel izquierdo, bajo **Archivos**, verás `Código.gs` (o `Code.gs`).
   Haz clic en él.
2. Selecciona todo lo que tiene dentro y bórralo.
3. Abre `apps-script/Code.gs` del ZIP, copia **todo** su contenido y pégalo ahí.
   La primera línea debe quedar `/**`. Si empieza con `<`, pegaste el archivo
   equivocado: ese es el HTML y va en el paso 3.
4. Guarda con el ícono 💾 o `Ctrl+S` / `Cmd+S`.

---

## Paso 3 · Agregar la página

1. En **Archivos**, clic en el **+** y elige **HTML**.
2. Te pide un nombre. Escribe exactamente:

   ```
   Index
   ```

   Con **I** mayúscula y sin escribir `.html` — Apps Script se lo agrega solo.
   Si le pones otro nombre, la página no carga.
3. El archivo nuevo trae un ejemplo. Selecciónalo todo y bórralo.
4. Abre `apps-script/Index.html` del ZIP, copia **todo** su contenido (son unas
   1,300 líneas: asegúrate de llegar hasta el `</html>` final) y pégalo ahí.
5. Guarda.

---

## Paso 4 · Copiar el manifiesto *(opcional pero recomendado)*

Esto fija la zona horaria y quién puede ver la página.

1. Ícono ⚙️ **Configuración del proyecto**, en el panel izquierdo.
2. Activa la casilla **Mostrar el archivo de manifiesto "appsscript.json" en el
   editor**.
3. Regresa al editor (ícono `<>`). Ahora aparece `appsscript.json` en la lista.
4. Ábrelo, borra su contenido y pega el de `apps-script/appsscript.json`.
5. Guarda.

Antes de guardar, revisa la línea `"access"` y déjala como necesites:

| Valor | Quién puede ver la página |
|---|---|
| `"ANYONE_ANONYMOUS"` | Cualquiera con la liga, sin necesidad de cuenta de Google *(es el valor que viene)* |
| `"ANYONE"` | Cualquiera con la liga, pero con sesión de Google iniciada |
| `"DOMAIN"` | Solo cuentas del dominio de TLTERMINALS *(requiere Workspace)* |
| `"MYSELF"` | Solo tú |

---

## Paso 4.5 · Comprobar antes de publicar

Esto tarda diez segundos y te ahorra publicar algo roto.

1. En la barra de arriba del editor, en el menú desplegable de funciones, elige
   **`verificar`**.
2. Clic en **▷ Ejecutar**. La primera vez pide autorización: acéptala igual que
   en el paso 5.
3. Abajo se abre el **Registro de ejecución**. Debe decir:

   ```
   OK — el archivo HTML se encontró. Ya puedes implementar.
   ```

Si en vez de eso dice `FALTA EL ARCHIVO HTML`, el archivo del paso 3 no quedó
bien: revisa que se llame `Index` y vuelve a ejecutar `verificar`.

---

## Paso 5 · Publicar

1. Botón azul **Implementar**, arriba a la derecha → **Nueva implementación**.
2. Clic en el engrane ⚙️ junto a *Seleccionar tipo* → **Aplicación web**.
3. Llena:
   - **Descripción:** `v1`
   - **Ejecutar como:** *Yo (tu correo)*
   - **Quién tiene acceso:** lo que hayas decidido en el paso 4
4. Clic en **Implementar**.

### La primera vez pide autorización

Google muestra una advertencia porque el script es tuyo y no está verificado por
ellos. Es normal:

1. **Autorizar acceso** → elige tu cuenta.
2. Aparece *"Google no ha verificado esta aplicación"*. Clic en **Configuración
   avanzada**.
3. Clic en **Ir a TLTERMINALS Comedor (no seguro)**.
4. Clic en **Permitir**.

Al terminar, Google muestra la **URL de la aplicación web**, que termina en
`/exec`. **Cópiala: esa es la liga que vas a compartir.**

---

## Paso 6 · Verificar

Abre la liga `/exec` en el celular y en la computadora, y confirma:

- [ ] El texto se ve completo, sin necesidad de deslizar la pantalla a los lados.
- [ ] El botón **Modo oscuro** de arriba a la derecha cambia el tema, y el cambio
      se conserva al recargar.
- [ ] En pantalla grande aparece el índice a la izquierda, y sus enlaces te llevan
      a cada sección.
- [ ] Las tablas anchas (base de datos, endpoints) se deslizan hacia los lados
      **dentro de su propio recuadro**.
- [ ] Los cuatro diagramas se ven armados, con sus recuadros y flechas.

---

## Actualizar la página después

Editar el código **no** cambia lo que ven los demás hasta que publiques una
versión nueva:

1. Pega los cambios y guarda.
2. **Implementar** → **Administrar implementaciones**.
3. Ícono de lápiz ✏️ en la implementación existente.
4. En *Versión*, elige **Versión nueva** → **Implementar**.

La URL `/exec` **no cambia**. Nunca crees una implementación nueva para un
cambio, o acabarás con varias ligas distintas circulando.

> Mientras pruebas, la opción **Implementar → Probar implementaciones** te da una
> URL que termina en `/dev`: refleja los cambios al instante, pero solo funciona
> para ti. Sirve para revisar antes de publicar; no la compartas.

---

## Solución de problemas

| Qué ves | Por qué | Cómo se arregla |
|---|---|---|
| `SyntaxError: Unexpected token '<', línea 1, archivo Código.gs` | En `Código.gs` se pegó el contenido del HTML. Ese archivo solo acepta JavaScript, y el `<` de `<!DOCTYPE html>` lo rompe | Borra todo el contenido de `Código.gs` y pega el de `Code.gs`, que empieza con `/**`. El HTML va en el archivo `Index` del paso 3 |
| `Script function not found: doGet` | El código del servidor no está en el proyecto: se pegó dentro del archivo HTML, o quedó sin guardar | Abre `Código.gs` —el archivo con ícono `<>`, no el HTML— y confirma que ahí está `function doGet(e)`. Guarda con `Ctrl+S` y **publica versión nueva** |
| `No HTML file named Index was found` | El archivo HTML tiene otro nombre | Ya no debería ocurrir: el código acepta `Index`, `index` e `Index.html`. Si aun así sale, clic derecho sobre el archivo → *Cambiar nombre* → `Index` |
| La página dice **"Falta el archivo HTML de la página"** | El código funcionó, pero no hay ningún archivo HTML | Es la página de diagnóstico: trae los pasos a seguir. Haz el paso 3 y publica versión nueva |
| `No se encontró el archivo. Es posible que se haya movido o eliminado` al abrir la liga | Casi siempre es tener **varias cuentas de Google** abiertas en el mismo navegador: la liga se abre con la cuenta equivocada | Ábrela en una ventana de incógnito. Si ahí funciona, era eso: deja una sola sesión, o usa la liga con `/u/0/` |
| `Se requiere autorización` | Quedó a medias la autorización del paso 5 | Ejecuta `verificar` desde el editor y completa el permiso |
| Página en blanco | El `Index.html` se pegó incompleto | Vuelve a pegarlo entero, hasta el `</html>` final |
| Se ve diminuta en el celular | Falta el meta viewport | Ya viene en `Code.gs`; revisa que lo hayas pegado completo |
| `Malformed HTML content` | El `Index.html` se pegó incompleto, o es una versión vieja del archivo | Usa el `Index.html` de este paquete y pégalo entero. La versión actual no lleva comentarios HTML ni scripts externos, que era lo que provocaba este error |
| Los cambios no se ven | Se publicó, pero no una versión nueva | *Administrar implementaciones* → ✏️ → **Versión nueva** |
| La liga del editor no abre la página | Se copió la URL del editor (`/edit`) en lugar de la de la implementación | La liga buena termina en **`/exec`** y sale al implementar, o en *Administrar implementaciones* |
| *"Google no ha verificado esta aplicación"* | El script es tuyo y no pasó por revisión de Google | *Configuración avanzada* → *Ir a … (no seguro)* → *Permitir* |
| A otra persona le pide iniciar sesión | El acceso está en `ANYONE` o `DOMAIN` | Cambia `"access"` en `appsscript.json` y publica versión nueva |
| El texto se corta a la derecha | Un `Ctrl+V` incompleto del `Index.html` | Vuelve a pegarlo completo, hasta el `</html>` final |

---

## Anexo · Instalación por línea de comandos

Si prefieres no copiar y pegar, con [`clasp`](https://github.com/google/clasp):

```bash
npm install -g @google/clasp
clasp login
clasp create --type webapp --title "TLTERMINALS Comedor — Arquitectura" --rootDir apps-script
clasp push
clasp deploy --description "v1"
```

Si `clasp create` genera su propio `appsscript.json`, reemplázalo por el de la
carpeta `apps-script/` antes de `clasp push`.

---

## Anexo · Regenerar la página desde el documento fuente

**Esto es opcional y no forma parte de la instalación.** El `Index.html` del ZIP
ya viene generado y listo para subir.

`build.py` es un programa en Python que corre **en tu computadora**, nunca dentro
de Apps Script. Solo lo necesitas si algún día editas el texto del documento
—que vive en `docs/artifact/fulcrum-comedor.html`— y quieres reconstruir la
página. En ese caso, con Python 3 instalado y una terminal abierta en la carpeta
del proyecto:

```bash
python3 apps-script/build.py
```

Eso reescribe `apps-script/Index.html` agregándole el esqueleto HTML, el
interruptor de tema y el cargador de diagramas. Después copias el contenido nuevo
al archivo `Index` de Apps Script y publicas una versión nueva (ver *Actualizar
la página después*).

Si no piensas editar el documento, puedes borrar `build.py`: nada de lo
publicado depende de él. Y si prefieres no usar Python, editar `Index.html`
directamente también funciona — solo ten en cuenta que una regeneración futura
lo sobrescribiría.

---

## Contenido del paquete

Solo los tres marcados con ⬆️ se suben a Apps Script.

```
INSTALACION.md                      este instructivo
apps-script/
  Code.gs                       ⬆️  el doGet() que sirve la página
  Index.html                    ⬆️  la página completa (ya generada)
  appsscript.json               ⬆️  manifiesto del Web App
  build.py                          herramienta local en Python, opcional
  README.md                         referencia técnica del paquete
docs/
  arquitectura.md                   el documento en Markdown
  artifact/fulcrum-comedor.html     el documento fuente
```
