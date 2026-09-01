# MX Supply Assurance

Aplicación web local que ejecuta el proceso de aseguramiento de suministro de
MX: llena la hoja `Details`, arrastra el bloque de `KB Supply`, aplica los
filtros de faltante, entrega un consolidado por proveedor en Excel y manda un
correo a cada proveedor con sus partes en riesgo.

Corre en la computadora de quien la usa. Los archivos no salen del equipo: lo
único que sale a la red son los correos que se manden a propósito.

---

## Qué hace, paso por paso

| Paso | Qué hace | Dónde está |
|---|---|---|
| 1 | Copia las 9 columnas del archivo Data (`A:I` desde la fila 2) a `Details!B:J` desde la fila 9, y numera el ID en `Details!A`. Sustituye `DEFAULT_BUYER` (`LZR22` → `Luis Rodriguez`). | `lib/write-details.js` |
| 2 | Replica el bloque `A10:AF21` de `KB Supply` una vez por número de parte, hasta la fila que anuncia `G6`. | `lib/write-kb.js` |
| 3 | Filtra `L9` por estatus y las columnas de semana por el color rojo (proyección negativa). | `lib/write-kb.js` |
| 4 | Consolida por proveedor (columna F) y número de parte único (columna D) en un `.xlsx`. | `lib/report.js` |
| 5 | Arma y envía un correo por proveedor con su listado y su Excel adjunto. | `lib/mailer.js` |

El cálculo no usa Excel: `lib/engine.js` reproduce en JavaScript, celda por
celda, las fórmulas del bloque de `KB Supply`. Cada campo lleva anotada en un
comentario la fórmula que replica.

### Correspondencia de columnas

El archivo Data trae los nueve campos en `A:I`. En `Details` esos mismos nueve
encabezados viven en `B8:J8`, porque la columna `A` es el consecutivo **ID** que
`KB Supply` usa para su `VLOOKUP`. Por eso `Data!A` → `Details!B`, y así hasta
`Data!I` → `Details!J`.

### Cómo se decide que una parte está en riesgo

```
Total inv    = Acuity OH (On hand por sitio) + Supplier OH (GAPs files por parte)
Projection   = Total inv + Arrivals − Supply Plan, acumulado semana a semana
Shortage date= primera semana con Projection < 0, evaluando de P a AA
Estatus (L)  = OK             si nunca se pone negativa
               SHORTAGE       si (Shortage date − Cold LT) ya pasó
               OK PER LT      si todavía alcanza el tiempo de entrega
```

El **rojo** de las columnas de semana es el formato condicional `celda < 0` con
relleno `#FFC7CE`, que en la práctica solo aparece en la fila `Projection`.
Filtrar por ese color deja un renglón visible por parte en riesgo.

---

## Instalación

Se necesita [Node.js 18 o superior](https://nodejs.org). Para comprobar la
versión instalada:

```
node --version
```

Después, en la carpeta `app-supply`:

```
npm install
npm start
```

Abre <http://127.0.0.1:4173> en el navegador. Para detener la aplicación,
`Ctrl+C` en la ventana donde quedó corriendo.

Si el puerto 4173 está ocupado:

```
PORT=8080 npm start
```

---

## Uso

1. **Proceso.** Carga el libro MX y el archivo Data. Elige la ventana de riesgo
   y presiona *Procesar*.
2. **Resultado.** Revisa qué se hizo y descarga el libro MX ya llenado y el
   consolidado por proveedor.
3. **Contactos.** Carga el catálogo de correos. Ni el libro MX ni el archivo
   Data traen direcciones, así que este paso es obligatorio para poder enviar.
4. **Correo.** Configura el servidor, revisa la vista previa y envía.

### Ventana de riesgo

Dos formas de definir en qué semanas cuenta el rojo:

- **Rango de fechas** (por omisión: de hoy al fin del mes siguiente). Una semana
  entra si su tramo de siete días toca el rango, de modo que la semana en curso
  siempre cuenta aunque haya empezado el mes pasado.
- **Una sola columna de semana**, que es el paso literal de filtrar el color en
  una columna concreta.

### Catálogo de contactos

Excel o CSV con una columna de proveedor y otra de correo. Si los encabezados
dicen «proveedor» y «correo» se detectan solos; si no, se toma la columna A y la
B. Se aceptan varios correos por proveedor separados por coma o punto y coma.

```
Proveedor,Correo
ENDRIES INTERNATIONAL INC,compras@endries.com; ventas@endries.com
HEILIND ELECTRONICS INC,mexico@heilind.com
```

El nombre debe coincidir con el de la columna `SUPPLIER`, ignorando mayúsculas y
espacios sobrantes. Los proveedores sin correo aparecen marcados en rojo y la
aplicación **no** los envía; tampoco acepta un valor que no tenga forma de
correo.

### Correo

Outlook / Microsoft 365 usa `smtp.office365.com` puerto `587`. Si el envío se
rechaza con un error de autenticación, casi siempre es que TI tiene
deshabilitado SMTP AUTH para el buzón; se puede pedir que lo habiliten o usar
una contraseña de aplicación.

Si no se quiere enviar desde aquí, el botón *Descargar borradores .eml* entrega
un ZIP con un borrador por proveedor, ya con su Excel adjunto, listo para abrir
en Outlook y presionar Enviar.

---

## Desde la línea de comandos

Para correr el proceso sin abrir el navegador o dejarlo programado:

```
node cli.js --mx "MX Supply Assurance Process.xlsx" --data "data.xlsx"
```

| Opción | Qué hace |
|---|---|
| `--out <carpeta>` | Dónde dejar los archivos. Por omisión `./salida`. |
| `--hoy <AAAA-MM-DD>` | Valor de `TODAY()` para la columna L. |
| `--modo week\|rango` | `week` = una sola columna de semana. |
| `--columna <letra>` | Columna de semana cuando `--modo week`. Por omisión `W`. |
| `--desde` / `--hasta` | Rango de fechas cuando `--modo rango`. |
| `--estatus <lista>` | Estatus separados por coma. Por omisión `SHORTAGE`. |
| `--sin-libro` | Solo analiza y consolida; no reescribe el libro MX. |
| `--sin-openpo` | Omite leer `Open_PO`. Más rápido; deja esas dos filas en cero. |

---

## Verificación

La aplicación no reescribe el libro con una librería genérica: edita
quirúrgicamente el XML de las dos hojas que toca y copia el resto del paquete
sin abrirlo, de modo que tablas, consultas, formato condicional, dibujos y
estilos quedan intactos.

Para comprobar que lo que quedó escrito es lo que se calculó:

```
node cli.js --mx <libro> --data <data> --dump-analisis analisis.json
node test/verify.js salida/MX_Supply_Assurance_Process_*.xlsx analisis.json
```

Son 22 comprobaciones: encabezados de `Details`, que ningún `DEFAULT_BUYER` haya
quedado como `LZR22`, que cada bloque ocupe seis filas con los nombres correctos
en la columna O, que los valores en caché coincidan con el análisis, que la
proyección cuadre con `N + arribos − plan`, que ninguna fórmula haya quedado
como referencia compartida vacía o con `#REF!`, que las fórmulas de bloques
distantes sean la plantilla trasladada, que el formato condicional cubra todos
los bloques, y que el paquete conserve sus nueve hojas y sus tablas.

---

## Archivos

```
server.js              servidor web local
cli.js                 misma corrida desde la terminal
lib/
  workbook.js          acceso al .xlsx como paquete OPC
  xlsx-read.js         lector de hojas grandes (110 mil filas sin agotar memoria)
  sheet-xml.js         reescritura de filas conservando estilos
  formula.js           traslado de referencias al clonar fórmulas
  engine.js            las fórmulas de KB Supply, en JavaScript
  write-details.js     paso 1
  write-kb.js          pasos 2 y 3
  finalize.js          nombres definidos, calcChain y recálculo al abrir
  process.js           orquestador
  report.js            paso 4, el consolidado
  contacts.js          catálogo de correos
  mailer.js            armado y envío de correos
public/                interfaz
test/verify.js         verificación del libro generado
datos/                 contactos.json y smtp.json (no se versiona)
```

---

## Notas sobre los datos

- El archivo Data termina con un renglón de nota al pie (`Applied filters: ...`)
  que ocupa solo la columna A. No se cuenta como parte; la aplicación lo reporta
  como aviso para que quede constancia de que se ignoró a propósito.
- Si ninguna parte del archivo Data aparece en la hoja `GAPs files`, `Supplier
  OH` y la fila `Arrivals` quedan en cero para todas. Es lo que calcularía Excel
  con esos mismos datos, pero conviene saberlo: la proyección estaría restando
  el plan de suministro al inventario propio sin acreditar ningún arribo del
  proveedor. La aplicación lo avisa en pantalla y lo escribe en la hoja
  `Parametros` del consolidado.
- El libro se guarda con `fullCalcOnLoad`, así que Excel recalcula todo al
  abrirlo. Los valores en caché ya vienen correctos, de modo que el archivo se
  lee bien incluso desde herramientas que no evalúan fórmulas.
