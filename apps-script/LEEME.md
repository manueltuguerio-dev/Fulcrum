# Fulcrum ERP · versión Google Apps Script

Aplicación web con la misma funcionalidad del artefacto, pero corriendo en tu cuenta de Google:
los datos se guardan en una **hoja de cálculo** y los PDF se pueden **descargar, guardar en Drive
o enviar por correo** con el documento adjunto.

## Archivos del proyecto

| Archivo | Nombre exacto en Apps Script | Qué es |
|---|---|---|
| `Codigo.gs` | `Codigo` (archivo de script) | Servidor: `doGet`, Sheets, PDF a Drive y correo |
| `Index.html` | `Index` (archivo HTML) | Interfaz: estilos y estructura |
| `JavaScript.html` | `JavaScript` (archivo HTML) | Toda la lógica del ERP (~124 KB) |
| `Logo.html` | `Logo` (archivo HTML) | Solo el logotipo en base64 (~58 KB) |
| `appsscript.json` | manifiesto | Zona horaria, permisos y configuración de la web app |

> Los nombres deben coincidir **exactamente** (sin la extensión `.html`): `Index`, `JavaScript`, `Logo`.

## Instalación (10 minutos)

1. Entra a **https://script.google.com** → **Nuevo proyecto**.
2. Ponle nombre: `Fulcrum ERP`.
3. Crea los archivos y pega el contenido de cada uno:
   - El archivo `Código.gs` que viene por defecto → reemplaza todo con `Codigo.gs`.
   - **+ → HTML** → nómbralo `Index` → pega `Index.html`.
   - **+ → HTML** → nómbralo `JavaScript` → pega `JavaScript.html`.
   - **+ → HTML** → nómbralo `Logo` → pega `Logo.html`.

   > **Importante al pegar:** son archivos grandes. Abre cada uno, selecciona **todo** el
   > contenido del editor (Ctrl/Cmd + A) y pega encima. Verifica que el archivo `JavaScript`
   > termine con `window.FULCRUM_JS_OK=true;` seguido de `</script>` — si no, el pegado quedó
   > incompleto y la app aparecerá en blanco.
4. Muestra el manifiesto: engrane **Configuración del proyecto** → activa
   *«Mostrar el archivo de manifiesto appsscript.json»*. Abre `appsscript.json` y pega su contenido.
5. **Implementar → Nueva implementación → tipo: Aplicación web**
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: **Solo yo** (o *Cualquier usuario de tu organización* si lo usará tu equipo)
   - **Implementar** → autoriza los permisos (Sheets, Drive y Gmail).
6. Abre la URL que te da. En el primer arranque se crea sola la hoja
   **«Fulcrum ERP · Base de datos»** en tu Drive.
7. Pulsa **«Datos de ejemplo»** en la barra lateral para cargar información de prueba,
   o **«Vaciar todo»** para empezar en limpio.

## Cómo se guardan los datos

- Todo el estado se guarda en la hoja oculta `_DB` en formato JSON (fuente de verdad),
  y los cierres de mes en `_SNAPS`.
- Además, cada vez que guardas se regeneran hojas **legibles**: `Clientes`, `Cotizaciones`,
  `Ventas`, `Ordenes`, `Facturas`, `Pagos`, `Proveedores`, `Gastos`, `Proyectos`.
  Sirven para consultar y hacer tablas dinámicas.
  ⚠️ Son un **espejo de solo lectura**: si editas ahí, la app las sobrescribe. Captura siempre
  desde la aplicación.
- El indicador de la barra lateral muestra *Guardando… / Guardado* en cada cambio.

## Documentos y correo

En cualquier cotización, factura, orden de compra u orden de venta pulsa **PDF**:

- **Descargar PDF** — guarda el archivo en tu equipo.
- **Guardar en Drive** — lo deja en la carpeta `Fulcrum ERP` de tu Drive y abre el archivo.
- **Enviar por correo** — el destinatario se llena solo con los **correos del cliente** (ficha del
  cliente); ajusta asunto y mensaje y lo manda **con el PDF adjunto**.
- **Imagen (PNG)** — versión en imagen del documento.

Los reportes de cada módulo también generan PDF.

## Remitente de los correos

Los correos salen como **ADMINISTRACION@COMERCIALIZADORAFULCRUM.COM.MX** (constante `REMITENTE`
en `Codigo.gs`). Google **no permite** poner un remitente arbitrario: esa dirección debe estar
dada de alta en la cuenta que ejecuta la app.

1. Entra a Gmail con la cuenta que implementó la app.
2. **Configuración → Ver toda la configuración → Cuentas e importación → «Enviar como» → Añadir
   otra dirección** y da de alta `ADMINISTRACION@COMERCIALIZADORAFULCRUM.COM.MX` (pide un código
   de verificación al buzón).
3. En el editor de Apps Script ejecuta la función **`aliasDisponibles`** y mira el registro:
   te dirá si ya quedó.

Si la dirección **no** está dada de alta, el correo se envía igual desde la cuenta que ejecuta la
app, pero con el **nombre visible «Comercializadora Fulcrum»** y el **«responder a»** apuntando a
esa dirección. Si la cuenta que implementa la app ya *es* esa dirección, no hay que hacer nada.

## Impuestos

- **Impuestos e IVA** (barra lateral) fija el **IVA por defecto** de los documentos nuevos.
- Cada **cotización, factura, orden de compra y orden de venta** tiene su propio campo **IVA (%)**,
  que puede diferir del global (útil para tasa 8 % de frontera o 0 %).
- Cada **cliente** guarda su **margen** y su **IVA**, que se aplican al cotizarle.
- En las **facturas de proveedor** el **IVA se captura como importe** (se respeta el del XML) y
  puede editarse a mano.
- Las **retenciones** (ISR, IVA u otras) se capturan libremente por cliente y por cotización.

## Si la pantalla aparece en blanco

Es casi siempre un **pegado incompleto** del archivo `JavaScript` (un `<script>` cortado se
"traga" el resto de la página).

1. En el editor de Apps Script ejecuta la función **`verificarInstalacion`** y abre el
   **Registro de ejecución**: te dice el tamaño de cada archivo y cuál está incompleto.
2. Vuelve a pegar el archivo señalado, completo.
3. Recarga la página de la app.

La propia aplicación también avisa: si el código no termina de cargar en 4 segundos, muestra un
mensaje rojo explicando la causa en lugar de quedarse en blanco. Y `doGet` revisa los archivos
antes de servir la página.

## Notas

- El generador de PDF (jsPDF) se carga desde un CDN. Si tu red lo bloquea, la app funciona igual;
  solo los botones de PDF quedarían sin efecto.
- Cuota de correo de Gmail: 100 destinatarios/día en cuentas gratuitas, 1 500 en Workspace.
- Para empezar de cero: en el editor de Apps Script ejecuta la función `borrarTodo`.
- Para abrir la hoja de datos: ejecuta la función `urlDeLaBase` y mira el registro.
