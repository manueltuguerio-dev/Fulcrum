# Fulcrum ERP · versión Google Apps Script

Aplicación web con la misma funcionalidad del artefacto, pero corriendo en tu cuenta de Google:
los datos se guardan en una **hoja de cálculo** y los PDF se pueden **descargar, guardar en Drive
o enviar por correo** con el documento adjunto.

## Archivos del proyecto

| Archivo | Nombre exacto en Apps Script | Qué es |
|---|---|---|
| `Codigo.gs` | `Codigo` (script) | Servidor: `doGet`, Sheets, PDF a Drive y correo |
| `Index.html` | `Index` (HTML) | Página: estilos, estructura y el cargador (26 KB) |
| `AppJs.html` | `AppJs` (HTML) | Código de la aplicación en **JavaScript puro** (124 KB) |
| `LogoData.html` | `LogoData` (HTML) | Logotipo en base64, **solo texto** (59 KB) |
| `appsscript.json` | manifiesto | Zona horaria, permisos y configuración de la web app |

> Los nombres deben coincidir **exactamente** (sin `.html`): `Index`, `AppJs`, `LogoData`.

**Cómo funciona:** la página que sirve Apps Script solo lleva estilos y estructura. El código de la
aplicación y el logotipo se piden al servidor (`getRecursos`) y se inyectan en el navegador como
datos. Así el código nunca pasa por el analizador de HTML, que era lo que impedía que arrancara.

## Instalación (10 minutos)

1. Entra a **https://script.google.com** → **Nuevo proyecto**.
2. Ponle nombre: `Fulcrum ERP`.
3. Crea los archivos y pega el contenido de cada uno:
   - El archivo `Código.gs` que viene por defecto → reemplaza todo con `Codigo.gs`.
   - **+ → HTML** → nómbralo `Index` → pega `Index.html`.
   - **+ → HTML** → nómbralo `AppJs` → pega `AppJs.html`.
   - **+ → HTML** → nómbralo `LogoData` → pega `LogoData.html`.

   > Al pegar, selecciona **todo** el contenido del editor (Ctrl/Cmd + A) y pega encima.
   > `AppJs` debe terminar con `window.FULCRUM_JS_OK=true;`
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

## Líneas de los documentos

Cotizaciones, órdenes de venta, órdenes de compra y facturas comparten el mismo editor de líneas.
Cada línea lleva:

| Campo | Notas |
|---|---|
| **Descripción** | Sugiere productos ya capturados (autocompleta costo, margen, unidad y analítica) |
| **Unidad** | Lista sugerida: PZ, SERV, LOT, KG, TON, MTR, M2, M3, LT, HR, DIA, CAJA, JGO, ROLLO. Se puede escribir cualquier otra |
| **Analítica** | Centro de costo libre; sugiere los valores ya usados en cualquier documento |
| **Cantidad** | |
| **Costo U.** | Costo unitario de la línea |
| **Margen % / Precio U.** | Margen en cotizaciones; precio unitario en ventas y facturas |

Se pueden **agregar** líneas con *«+ Agregar línea»*, **editar** cualquier campo y **eliminar** con la
**×** de la fila. Debajo del captura, si hay más de una analítica, aparece el **resumen «Por analítica»**
con el importe de cada centro de costo. La **unidad** se imprime en la columna *UNI.* del PDF.

## Impuestos

- **Impuestos e IVA** (barra lateral) fija el **IVA por defecto** de los documentos nuevos.
- Cada **cotización, factura, orden de compra y orden de venta** tiene su propio campo **IVA (%)**,
  que puede diferir del global (útil para tasa 8 % de frontera o 0 %).
- Cada **cliente** guarda su **margen** y su **IVA**, que se aplican al cotizarle.
- En las **facturas de proveedor** el **IVA se captura como importe** (se respeta el del XML) y
  puede editarse a mano.
- Las **retenciones** (ISR, IVA u otras) se capturan libremente por cliente y por cotización.

## Si algo falla

1. La app muestra abajo a la izquierda la **versión del código**. Si no coincide con la de
   `Codigo.gs`, estás viendo una **implementación anterior**: usa la URL de prueba (`/dev`) o
   crea una **nueva versión** en *Implementar → Gestionar implementaciones*.
2. Ejecuta **`verificarInstalacion`** en el editor y mira el *Registro de ejecución*: indica el
   tamaño de cada archivo y si alguno quedó incompleto.
3. Si el código no arranca, la app muestra un recuadro rojo con el motivo en lugar de quedarse
   en blanco.

## Notas

- El generador de PDF (jsPDF) se carga desde un CDN. Si tu red lo bloquea, la app funciona igual;
  solo los botones de PDF quedarían sin efecto.
- Cuota de correo de Gmail: 100 destinatarios/día en cuentas gratuitas, 1 500 en Workspace.
- Para empezar de cero: en el editor de Apps Script ejecuta la función `borrarTodo`.
- Para abrir la hoja de datos: ejecuta la función `urlDeLaBase` y mira el registro.
