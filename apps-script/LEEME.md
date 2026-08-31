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
- Cada **cliente** guarda su **margen**, su **IVA** y sus **retenciones**.
- **Cotizaciones, órdenes de venta y facturas** llevan un editor de **impuestos y retenciones**: se **agregan** con
  *«+ Agregar impuesto o retención»*, se **editan** y se **eliminan** con la **×**. El campo Concepto
  sugiere los impuestos **ya dados de alta** (los de los clientes y los usados en otros documentos)
  y al elegir uno **completa su tasa**.
- Al escoger el cliente —por el selector *Impuestos de cliente* o escribiendo su nombre en el campo
  Cliente, que **sugiere los clientes dados de alta**— la factura toma **su IVA y sus retenciones**.
- Las retenciones se **restan del total** de la factura y de la orden de venta, y salen impresas
  en su PDF. Al convertir una cotización en orden de venta, la orden **hereda el IVA y las
  retenciones** de la cotización.
- En las **facturas de proveedor** el **IVA se captura como importe** (se respeta el del XML) y
  puede editarse a mano.

## Orden de venta: lectura de la OC del cliente

Al crear o editar una **orden de venta** hay un apartado **Orden de compra del cliente (PDF)**.
Cargas ahí el PDF que mandó el cliente y el sistema:

1. Extrae el **número de orden de compra** y lo escribe solo en el campo *OC del cliente*.
2. Lee el **subtotal** y el **total** del PDF y los compara con los de la orden de venta que estás
   capturando; cada renglón se marca en **verde** si coincide (tolerancia de 5 centavos) o en
   **rojo** con la **diferencia** exacta si no cuadra. Si un dato no viene en el PDF, lo indica.
3. Guarda el resultado en la orden de venta: en la lista aparece **OC validada** u
   **OC con diferencias**, y al reabrirla se vuelve a ver la validación.

El lector reconoce:

- **Número de OC**: *Orden de compra No.*, *O.C.*, *P.O.*, *Folio*, el recuadro
  **NUMERO/NUMBER** de las órdenes con código de barras y, cuando la orden trae el número
  **sin ninguna etiqueta**, el número largo (9 a 14 dígitos) del documento.
- **Subtotal**: *SUBTOTAL*, *SUB TOTAL*, **SUB. TOTAL**, *SUB-TOTAL*, *IMPORTE NETO* o *SUMA*.
- **Total**: *TOTAL*, *GRAN TOTAL*, *TOTAL A PAGAR* o *TOTAL NETO*; los renglones que empiezan
  por «SUB» se descartan para no confundir el subtotal con el gran total.

La comparación se hace contra el total de la orden de venta **ya neto de retenciones**.
Funciona con PDF de texto; si el PDF es una imagen escaneada no hay texto que leer y el número de
OC se captura a mano. La lectura usa **pdf.js**, que se descarga de un CDN: si tu red lo bloquea,
la app avisa y el campo se llena manualmente.

## Cotizar desde un XML de proveedor

En **Costos · facturas de proveedores** marca una o varias facturas y pulsa **Cotizar a cliente**.
El campo **Detalle** decide cómo se arman los conceptos:

1. **Una sola línea con el costo total** (predeterminado) — una línea cuyo costo es exactamente el
   subtotal de los XML seleccionados.
2. **Una línea por factura** — una línea por cada CFDI, con su subtotal.
3. **Desglosar los conceptos de cada factura** — una línea por concepto del XML.

En los tres casos **el costo de la cotización cuadra con el total del XML**. En el desglose, si la
suma de los conceptos no coincide con el subtotal del CFDI (por descuentos o redondeos del emisor),
la diferencia se ajusta en la última línea. Al terminar, el aviso confirma el costo y si cuadra.

## Redondeo y aplicación de pagos

Todos los importes de documento (subtotal, IVA, retenciones, total, pagado y saldo) se **redondean
a centavos**. Antes un saldo podía quedar con cuatro decimales (p. ej. `18171.1796`) y el navegador
rechazaba el monto al aplicar el pago con el aviso *«Ingresa un valor válido»*. Ahora:

- El saldo propuesto siempre trae **dos decimales** y se acepta sin error.
- Los campos de importe admiten cualquier número de decimales al capturar (útil con los CFDI) y el
  sistema redondea al guardar.
- Al aplicar un pago, una diferencia de hasta **2 centavos** contra el saldo se ajusta sola, de modo
  que la factura queda **saldada** y pasa a estatus **Pagada**.
- En **Registrar pago** las facturas salen ordenadas por **número de factura, de mayor a menor**.

## Catálogos

El módulo **Catálogos** (barra lateral) administra los valores que alimentan los formularios. En
cada uno se puede **agregar, editar y eliminar**:

| Catálogo | Para qué sirve |
|---|---|
| **Unidades de medida** | Clave, nombre y decimales sugeridos (solo informativos). **La cantidad se captura tal cual: nunca se redondea ni se limita por la unidad** |
| **Líneas analíticas** | Centros de costo sugeridos en las líneas |
| **Impuestos y retenciones** | Conceptos y tasas; al elegir uno en un documento se completa su tasa |
| **Métodos de pago** | Opciones del registro de pagos |
| **Motivos de rechazo** | Se sugieren al rechazar una cotización |
| **Plantillas de correo** | Asunto y mensaje con variables para el envío de cotizaciones |
| **Conceptos / productos** | Descripción, unidad, analítica y costo sugerido; aparecen como sugerencia en las líneas |

## Contactos por empresa

En la ficha del **cliente** se dan de alta sus **contactos** (nombre, puesto y correo). Al enviar
una cotización aparecen como casillas para elegir a quién se le manda. El campo antiguo de
*Correos para enviar documentos* se sigue respetando.

## Cotizaciones: margen, entrega, rechazo y envío

- **Margen del cliente**: al elegir el cliente se aplica su margen fijo a todas las líneas y a las
  que se agreguen después (junto con su IVA y sus retenciones).
- **Tiempo de entrega**: campo propio de la cotización; sale impreso en el PDF y se inserta en el
  correo mediante la variable `{{entrega}}`.
- **Rechazar**: marca la cotización como **rechazada** guardando **motivo** (del catálogo) y
  **comentario**; el motivo se ve en la lista y se puede **Reactivar** cuando haga falta.
- **Selección múltiple**: marca varias cotizaciones y usa la barra superior para **cambiar el
  estatus en bloque**, **rechazarlas** con un mismo motivo o **enviarlas por correo**.
- **Envío**: elige la **plantilla**, ajusta **asunto y mensaje** —con vista previa de las variables
  ya resueltas— y manda. Las variables disponibles son `{{cliente}} {{contacto}} {{folio}}
  {{total}} {{vigencia}} {{entrega}} {{fecha}} {{empresa}}`.
  El **envío masivo manda un correo por cotización**, cada uno a los contactos de su cliente.
- **El adjunto es la cotización tal como está en el sistema**: el PDF se genera con el mismo
  formato y los mismos datos del registro (el que produce el botón *PDF*) y se adjunta con el
  folio como nombre de archivo. **El envío no modifica ningún dato** de la cotización: solo
  registra que salió, pasándola a estatus **enviada** con la fecha. Si hay que cambiar el tiempo
  de entrega, el importe o cualquier dato, se edita la cotización antes de enviarla.

## Filtros de orden en las listas de los formularios

Las listas con casillas que aparecen dentro de los formularios llevan una barra **Ordenar por** con
un desplegable y un botón que alterna **↑ Menor a mayor / ↓ Mayor a menor**:

| Lista | Se puede ordenar por |
|---|---|
| **Registrar pago** · Facturas a pagar | Número de factura *(predeterminado, de mayor a menor)*, saldo, cliente, vencimiento |
| **Proyecto** · Cotizaciones, Órdenes de venta, Órdenes de compra, Facturas | Número/folio *(predeterminado, de mayor a menor)*, fecha, importe, nombre |

Los folios se ordenan de forma natural (`FAC-9` antes que `FAC-10`) y al reordenar **no se pierde**
lo que ya estaba marcado ni los importes capturados. Los **clientes sugeridos** en cotizaciones,
facturas y órdenes de venta salen en **orden alfabético**.

Las tablas de cada módulo se siguen ordenando pulsando el encabezado de la columna.

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
