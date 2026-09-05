# MX Supply Assurance en Apps Script — documento de implementación

Este documento explica **qué se portó, qué no se pudo portar y por qué**, con
las mediciones que sustentan cada decisión. El instructivo paso a paso está en
[INSTALACION.md](INSTALACION.md).

---

## 1. Resumen de la decisión

Apps Script **no** puede reproducir la aplicación Node completa. Puede
reproducir la parte que importa —el cálculo, el consolidado y los correos— y no
puede reproducir la reconstrucción del `.xlsx` original con sus fórmulas vivas.

| Paso del proceso | Node | Apps Script | Nota |
|---|---|---|---|
| 1. Llenar `Details` desde Data | ✅ | ✅ | Idéntico |
| 2. Arrastrar el bloque de `KB Supply` | ✅ fórmulas vivas | ⚠️ valores calculados | Ver §3 |
| 3. Filtrar por estatus y color rojo | ✅ | ✅ | Ver §4 |
| 4. Consolidado por proveedor | ✅ `.xlsx` | ✅ hoja de Google | Mismas cifras |
| 5. Correo por proveedor | ✅ SMTP | ✅ Gmail | Más simple en Google |
| Regenerar el libro MX como `.xlsx` | ✅ | ❌ | Se queda en Node |

**Las dos conviven.** Apps Script se usa para la corrida mensual, el
consolidado, los correos y el acceso compartido. Cuando se necesita el `.xlsx`
idéntico al original —con formato condicional, tablas, consultas y fórmulas
intactas— se corre la aplicación Node.

---

## 2. Mediciones que sustentan el diseño

Tomadas del libro real (`MX_Supply_Assurance_Process_Sept.xlsx`, 26 MB):

| Hoja | Filas | Columnas | Celdas |
|---|---:|---:|---:|
| Open_PO | 36,632 | 59 | 2,161,288 |
| SupplyPlan | 97,420 | 16 | 1,558,720 |
| Open_PO (2) | 34,612 | 27 | 934,524 |
| On hand | 110,653 | 8 | 885,224 |
| GAPs files | 5,838 | 20 | 116,760 |
| KB Supply (tras arrastrar 597 partes) | 3,591 | 32 | 114,912 |
| Details | 4,507 | 10 | 45,070 |
| **Total** | | | **5,763,732** |

El límite de una hoja de cálculo de Google es de **10,000,000 de celdas**, así
que el libro convertido cabe con holgura. El problema no es el tamaño: es el
cálculo.

---

## 3. Por qué el paso 2 no lleva fórmulas

Arrastrar el bloque `A10:AF21` a 597 partes genera aproximadamente **24,000
fórmulas**, y no son fórmulas baratas:

- `VLOOKUP($A10, Details!$A:$U, …)` — 8 por bloque
- `SUMIFS(Current[Qty], Current[Site], …, Current[Part], …)` contra **110,653**
  renglones — 1 por bloque
- `IFNA(VLOOKUP($B10, SupplyPlan!$A:$V, …), 0)` contra **97,420** renglones —
  13 por bloque
- `SUMIFS(Open_PO[PO_QTY_DUE], …)` contra **36,632** renglones — 26 por bloque

Excel las tolera porque es una aplicación de escritorio que recalcula el libro
**una sola vez al abrirlo**, y la aplicación Node ni siquiera necesita
evaluarlas: escribe las fórmulas y su valor en caché, y deja que Excel decida
cuándo recalcular.

Google Sheets recalcula **en el servidor**, de forma incremental y sin control
del usuario. Con estos volúmenes la hoja tardaría minutos en cada
recálculo, y en la práctica marca límites de cálculo internos.

**Decisión.** El motor calcula todo en JavaScript y se escriben los **valores**.
Las cifras son las mismas —verificado, ver §7—; lo que se pierde es poder hacer
clic en una celda y ver su fórmula. El **rojo sí se conserva**: se aplica como
formato condicional de Sheets con el mismo relleno `#FFC7CE` del libro, sobre
los renglones de proyección.

---

## 4. Cómo se reproduce el filtro por color

En el libro de Excel el rojo de las columnas de semana viene del formato
condicional `celda < 0` sobre el rango `P13:AB15`. En la práctica **solo la fila
`Projection` sale roja**, porque las dos filas de órdenes de compra abiertas
nunca traen cantidades negativas. Filtrar la columna `W` por color, entonces,
deja visible exactamente un renglón por parte en riesgo.

En Sheets no existe «filtrar por color de formato condicional» desde Apps
Script. Se reproduce el mismo resultado con una columna auxiliar:

- Se agrega la columna **`AG` — «En riesgo»**, que lleva `SI` únicamente en el
  renglón `Projection` de las partes que pasan los dos filtros.
- El filtro de la hoja se pone sobre esa columna.

El resultado visible es idéntico al de Excel: un renglón por parte en riesgo,
con proveedor, comprador, fecha y estatus arrastrados. La columna auxiliar está
rotulada y documentada; no pretende ser parte del libro original.

---

## 5. Arquitectura

### 5.1 Flujo de datos

```
Carpeta de Drive
  ├── MX Supply Assurance Process.xlsx   (26 MB, se deja tal cual)
  └── data.xlsx                          (el export de partes)
        │
        │  Drive.Files.copy con conversión  ─ los originales no se tocan
        ▼
  Copias temporales como Hojas de cálculo
        │
        │  lectura por tramos, filtrando por las 597 partes
        ▼
  Motor (Motor.gs)  ─ las mismas fórmulas de KB Supply, en JavaScript
        │
        ▼
  Libro de trabajo: Details · KB Supply · Consolidado · Resumen · Detalle
        │
        ▼
  Gmail: un correo por proveedor, con su detalle adjunto
```

Las copias temporales se borran al terminar, incluso si la corrida falla.

### 5.2 La criba de lectura

Es la pieza que hace viable el proceso en Apps Script. En vez de construir el
mapa completo de cada fuente, **cada tramo descarta lo que no corresponde a las
597 partes del archivo Data**:

| Fuente | Renglones leídos | Entradas conservadas |
|---|---:|---:|
| On hand | 110,653 | ≤ 597 |
| SupplyPlan | 97,420 | ≤ 597 |
| Open_PO | 36,631 | ≤ 597 × 13 × 2 |
| GAPs files | 5,838 | ≤ 597 |

Sin esta criba el estado intermedio pesaría varios MB y no se podría guardar
entre ejecuciones. Con ella cabe en un JSON pequeño, y de ahí sale la
posibilidad de reanudar.

### 5.3 La máquina de estados

Apps Script corta **toda ejecución a los 6 minutos**. Una corrida completa sobre
estos volúmenes no cabe en una sola. El proceso avanza por fases:

```
CONVERTIR → DATA → ONHAND → GAPS → PLAN → OPENPO → CALCULAR
          → DETAILS → KB → CONSOLIDAR → LIMPIAR → FIN
```

Cada fase consulta un reloj con presupuesto de **4 minutos**. Si se le acaba el
tiempo, guarda dónde iba y programa un disparador que la retoma un minuto
después. Desde la pantalla se ve como una sola corrida larga, con su barra de
avance.

El estado vive en un **archivo JSON en Drive**, no en `PropertiesService`,
porque los acumuladores rebasan el límite de 9 KB por propiedad.

Un `LockService` impide que dos ejecuciones avancen el mismo estado a la vez.

### 5.4 Archivos

```
appsscript.json     manifiesto y permisos
Config.gs           constantes y lectura de la hoja Config
Fechas.gs           seriales de Excel ↔ fechas
Motor.gs            las fórmulas de KB Supply, en JavaScript   ← el corazón
Fuentes.gs          lectura por tramos con la criba de §5.2
Proceso.gs          la máquina de estados
Escritura.gs        Details y KB Supply
Reporte.gs          consolidado, resumen y detalle
Contactos.gs        catálogo de correos por proveedor
Correo.gs           armado y envío por Gmail
Api.gs              funciones que llama la pantalla
Code.gs             menú, aplicación web, preparación del libro
Index/Estilos/Cliente.html   la interfaz
pruebas/paridad.js  compara este motor contra el de Node
```

### 5.5 Qué se copió tal cual de la aplicación Node

`Motor.gs` es un port casi literal de `app-supply/lib/engine.js`. Es JavaScript
puro, sin dependencias de Node ni de Google, así que la lógica de negocio no se
reescribió: se movió. Eso es deliberado, porque es la parte donde un error
silencioso costaría caro.

Lo que sí se reescribió por completo es la entrada y la salida:

| Node | Apps Script | Motivo |
|---|---|---|
| `workbook.js`, `xlsx-read.js`, `sheet-xml.js`, `formula.js`, `shared-strings.js` | `Fuentes.gs` | Cirugía sobre el XML del `.xlsx` → lectura de rangos de Sheets |
| `write-details.js`, `write-kb.js`, `finalize.js` | `Escritura.gs` | Clonado de fórmulas → escritura de valores |
| `report.js` (ExcelJS) | `Reporte.gs` | Generar `.xlsx` → escribir hojas de Google |
| `mailer.js` (nodemailer + SMTP) | `Correo.gs` | SMTP → GmailApp |
| `server.js` (Express) | `Code.gs` + `Api.gs` | HTTP → `google.script.run` |

---

## 6. Límites y cuotas que hay que tener presentes

| Límite | Cuenta gratuita | Google Workspace |
|---|---|---|
| Duración de una ejecución | 6 min | 6 min |
| Tiempo total de ejecución al día | 90 min | 6 h |
| Disparadores por script | 20 | 20 |
| Correos al día (`MailApp`) | 100 | 1,500 |
| Destinatarios por correo | 50 | 50 |
| Celdas por hoja de cálculo | 10,000,000 | 10,000,000 |
| Tamaño de un archivo convertible a Sheets | 100 MB | 100 MB |

Con 13 proveedores la cuota de correo no es problema ni en cuenta gratuita. El
límite que sí se siente es el de **6 minutos**, y por eso existe la máquina de
estados.

La aplicación consulta `MailApp.getRemainingDailyQuota()` antes de cada lote y
se niega a empezar si no alcanza, en vez de mandar la mitad y fallar.

---

## 7. Verificación

`pruebas/paridad.js` carga los `.gs` en Node con las APIs de Google simuladas,
les da exactamente los mismos datos que recibe la aplicación Node y compara
registro por registro.

```
cd apps-script-supply
NODE_PATH=../app-supply/node_modules \
  node pruebas/paridad.js <MX.xlsx> <data.xlsx> 2026-09-01
```

Resultado con los archivos reales:

```
Sintaxis: 11 de 11 archivos .gs compilan
Partes: Node 597, Apps Script 597
Registros identicos: 597 de 597
Filtro L=SHORTAGE + rojo en W: Node 162, Apps Script 162
Filtro por rango 2026-09-01 a 2026-10-31: Node 174, Apps Script 174
Paridad correcta: el motor de Apps Script calcula lo mismo que el de Node.
```

La comparación cubre, por cada una de las 597 partes: `concat`, `part`,
`supplier`, `buyer`, `acuityOH`, `supplierOH`, `totalInv`, `coldLT`, estatus,
fecha de faltante, las 13 semanas de proyección, arribos, demanda y las dos
filas de órdenes de compra, y las 3 cubetas mensuales. Tolerancia: `1e-9`.

**Lo que esta prueba no cubre.** Es una prueba de aritmética, no de integración
con Google. No verifica la conversión desde Drive, la escritura en Sheets, el
formato condicional, los disparadores ni el envío por Gmail: eso solo se puede
comprobar corriéndolo en una cuenta real. La primera corrida hay que hacerla
vigilando la hoja `Bitacora`.

---

## 8. Diferencias de comportamiento que conviene conocer

1. **`KB Supply` lleva valores, no fórmulas.** Si alguien edita `Details` a mano,
   la hoja **no** se actualiza sola: hay que volver a correr el proceso. En
   Excel sí se actualizaría.

2. **Columna auxiliar `AG`.** No existe en el libro original.

3. **La hoja `Open_PO (2)` no se lee.** Tampoco la lee la aplicación Node: el
   libro solo usa la tabla `Open_PO`.

4. **El consolidado es una hoja de Google, no un `.xlsx`.** Se puede descargar
   como Excel desde *Archivo → Descargar*, pero no se genera como archivo.

5. **El adjunto del correo se arma con una hoja temporal** que se exporta a
   `.xlsx` y se borra. Si la exportación falla, el adjunto sale como CSV y el
   envío continúa, en vez de detenerse.

6. **Los correos salen de la cuenta que autorizó el script**, no de un buzón
   configurable. Para que salgan de un buzón compartido hay que instalar el
   script con esa cuenta.

---

## 9. Cuándo usar cada aplicación

**Usa Apps Script cuando:**
- La corrida mensual la hacen varias personas o desde varios equipos.
- Quieres que quede programada sin que nadie prenda una computadora.
- Lo que necesitas es el consolidado y los correos.

**Usa la aplicación Node cuando:**
- Necesitas el `.xlsx` del libro MX con sus fórmulas y formato intactos.
- Vas a entregar el libro a alguien que espera abrirlo en Excel y auditar celdas.
- No quieres que los datos de inventario y demanda pasen por Drive.
