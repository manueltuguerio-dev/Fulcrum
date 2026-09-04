# LogiTime — Manual del sistema

Control de maniobras de almacén sobre Google Apps Script y Google Sheets.
Cronometra cada etapa, calcula el costo por unidad movida y deja rastro de
quién hizo qué.

---

## 1. Qué es y de qué está hecho

| Pieza | Rol |
|---|---|
| `Code.gs` | Toda la lógica del servidor. Lee y escribe en Sheets, sube a Drive. |
| `Index.html` | La aplicación completa: captura, cronómetros, tablas e indicadores. |
| `Dashboard.html` | Panel suelto opcional. El panel principal ya vive dentro de `Index`. |
| `Estilos.html` | Tema visual compartido por ambas páginas. |
| `appsscript.json` | Manifiesto. Define zona horaria y permisos de la web app. |

Los datos viven en una hoja de cálculo de Google. No hay base de datos externa
ni servidor propio: si tienes acceso a la hoja, tienes los datos.

---

## 2. Instalación

### Primera vez

1. Abre tu hoja de cálculo → **Extensiones › Apps Script**.
2. Pega `appsscript.json` en el manifiesto (⚙ **Configuración del proyecto** →
   marca *Mostrar archivo appsscript.json*).
3. Pega `Code.gs` reemplazando todo el contenido.
4. Crea tres archivos HTML llamados exactamente `Index`, `Dashboard` y `Estilos`,
   y pega el contenido de cada uno.
5. Ejecuta la función **`setup()`** una vez y autoriza los permisos.
6. **Implementar › Nueva implementación › Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquiera**

### Al actualizar

1. Pega los archivos que cambiaron.
2. Ejecuta `setup()` si te lo indican (crea hojas y columnas nuevas sin borrar datos).
3. **Implementar › Administrar implementaciones › ✏️ › Versión: Nueva versión**.

> **El paso 3 no es opcional.** Apps Script sirve la versión *desplegada*, no lo
> que está guardado en el editor. Si ves *«No existe la función del servidor…»*,
> es exactamente esto: el HTML es nuevo y el `Code.gs` desplegado es viejo.

### Cuenta inicial

`setup()` crea una cuenta MASTER:

- Correo: `mrodriguez@tlterminals.com`
- PIN: `1234`

**Cámbialo de inmediato** desde Admin › Usuarios, o crea tu propia cuenta MASTER
y desactiva esa. Los PIN se guardan en texto plano en la hoja `USUARIOS`.

---

## 3. Roles

| Rol | Puede |
|---|---|
| **OPERADOR** | Capturar maniobras, mover cronómetros, ver listado y catálogos operativos. |
| **MASTER** | Todo lo anterior más administración, soporte, edición, borrado y validación. |
| **DASHBOARD** | Solo indicadores. Entra directo al panel; no ve las pestañas de captura. |

Cada usuario tiene además un **departamento** y un **equipo**. El departamento
limita qué puede operar; MASTER nunca tiene límites.

---

## 4. Las reglas que rigen el sistema

### 4.1 Regla madre: un registro = una maniobra

**Nunca se combinan operaciones en un solo registro.** Si un furgón se descarga
a piso y luego se carga a cuatro plataformas, son **cinco registros**: uno de
descarga y cuatro de carga.

El sistema rechaza cualquier tipo de maniobra que combine operaciones
(«Descarga y acomodo», «Descarga / Carga»). Para no recapturar, usa
**⧉ Duplicar**: conserva cliente, unidad, equipo y hora de posicionamiento.

### 4.2 Tipos de maniobra (catálogo cerrado)

- Descarga furgón a piso
- Acomodo y estiba
- Carga plataforma desde piso
- Trasvase directo furgón a plataforma
- Descarga plataforma
- Otro → **obliga a describirla en Observaciones**

### 4.3 Semáforos por tipo

Un solo umbral para todo distorsiona el reporte: una descarga de 20 min es
excelente, un trasvase de 20 min podría no serlo.

| Tipo de maniobra | Verde | Ámbar | Rojo |
|---|---|---|---|
| Descarga furgón a piso | ≤ 40 min | 41–60 | > 60 |
| Carga plataforma desde piso | ≤ 15 min | 16–25 | > 25 |
| Trasvase directo furgón a plataforma | ≤ 15 min | 16–30 | > 30 |
| Acomodo y estiba | ≤ 45 min | 46–90 | > 90 |
| Descarga plataforma | ≤ 45 min | 46–90 | > 90 |

> Los dos últimos usan el umbral genérico heredado. **Defínelos** en
> Admin › Semáforos cuando tengas datos suficientes.

### 4.4 Evidencia fotográfica

- Se exige **al cerrar el flujo completo**, en la última etapa. No etapa por etapa.
- **El mínimo lo define cada cliente** (Admin › Reglas por cliente). Sin regla
  propia, se aplica el general de `CONFIG` (5 por defecto).
- Cuentan las que ya subiste durante la maniobra con el botón 📷.
- Se guardan en Drive: `LogiTime — Evidencias / [unidad] / [folio]`.
- Se comprimen en el navegador a 1400 px y JPEG 0.72 antes de subir.

### 4.5 Detección de anomalías

Al cerrar, el sistema revisa si la velocidad es humanamente posible. Fuera de
rango, la fila se marca **REVISIÓN**, se pinta de rojo en la hoja y **queda
excluida de todos los promedios** hasta que un supervisor la valide.

| Indicador | Mínimo | Máximo |
|---|---|---|
| Minutos por atado | 0.3 | 25 |
| Minutos por tonelada | 0.5 | 90 |
| Duración total (min) | 3 | 600 |

También se marca si no hay ni toneladas ni atados: sin eso no se puede costear.

Configurable en la hoja `CONFIG`.

### 4.6 Validación con comentario obligatorio

Validar un registro anómalo es una decisión que alguien tendrá que defender.
**Exige un comentario** de al menos una frase, que se guarda con autor y fecha
y se acumula sin pisar el historial anterior.

En ese mismo momento el supervisor puede cargar **servicios adicionales**
(concepto, cantidad, precio) desde el catálogo del cliente.

### 4.7 Datos insuficientes

Si un tipo o cliente tiene menos de **5 registros** (configurable en
`N_MINIMO_DASHBOARD`), el dashboard **no publica el tiempo**: muestra
*«Datos insuficientes»*. Un promedio sobre un registro no se sostiene ante
un cliente.

### 4.8 Mediana y percentil 80

Los reportes muestran **mediana y P80** junto al promedio, siempre con la N
visible. El promedio se distorsiona con un solo registro atípico; la mediana no.

### 4.9 Visibilidad por departamento

- Cada **etapa** tiene un departamento responsable. Quien no es de esa área ve
  la maniobra pero **no puede operar su cronómetro**.
- Cada **campo** del formulario puede restringirse a ciertos departamentos.
  Sin marcar ninguno, lo ve todo el mundo.
- Las etapas ocultas **siguen contando** para el tiempo total.

### 4.10 Campos obligatorios

Todo campo marcado como obligatorio se muestra en **«Datos de la maniobra»**,
sin importar la sección donde esté configurado. Nunca queda escondido tras un
plegable bloqueando el guardado.

---

## 5. Operación diaria

### 5.1 Iniciar sesión

Correo y PIN. La sesión se recuerda en ese navegador. No usa tu cuenta de Google.

### 5.2 Capturar una maniobra

Pestaña **Nueva maniobra**. Arriba verás quién registra, la fecha del día y un
reloj corriendo — eso queda guardado con el registro.

Dos formas de guardar:

| Botón | Qué hace |
|---|---|
| **💾 Guardar sin iniciar** | Deja la maniobra lista en «Por iniciar». Oficina captura, almacén arranca después. |
| **▶ Guardar e iniciar cronómetro** | Guarda y arranca el reloj de inmediato. |

Secciones del formulario:

- **Datos de la maniobra** — turno, tipo, flujo, cliente, unidad, equipo, andén, personal
- **Detalle de carga y costeo** — toneladas netas, atados, piezas sueltas
- **Ocupación del spot** — hora de posicionamiento y de liberación del furgón
- **Daños y observaciones** — incluye la casilla de prueba controlada

> Sin toneladas ni atados la maniobra **no se puede costear**. La tarjeta te lo
> advierte en ámbar.

### 5.3 Maniobras en curso

Cada tarjeta muestra **todas las etapas** del flujo:

- Completadas en verde con su tiempo final
- La activa en ámbar, corriendo segundo a segundo
- Pendientes en gris

El cronómetro corre **en tu navegador**, no depende de refrescos del servidor.
Bajo cada etapa aparece **quién la movió y a qué hora**.

Acciones:

| Botón | Efecto |
|---|---|
| **⏸ Pausar** | Detiene el reloj sin perder lo transcurrido. La pausa se descuenta como demora. |
| **No aplica** | Salta la etapa y avanza a la siguiente. |
| **Finalizar etapa ›** | Abre el modal de cierre. |
| **📷 Fotos** | Sube evidencias en cualquier momento, sin tocar el cronómetro. |
| **✎ Editar / ⛔ Cerrar / 🗑** | Solo MASTER. |

Debajo del tiempo total verás la **productividad en vivo**: min/ton, min/atado,
min/pieza, min/tarima y min-montacargas/ton, recalculándose contra el reloj.

### 5.4 Cerrar una etapa

En el modal:

1. **Minutos de paro** — si hubo tiempo detenido.
2. **Causa del paro** — se vuelve obligatoria en cuanto el paro es mayor que cero.
3. **Hora de liberación del furgón** — opcional; alimenta la ocupación del spot.
4. **Evidencia fotográfica** — solo aparece en la última etapa, con el mínimo del cliente.

Al cerrar la última etapa, la maniobra se consolida y calcula sus métricas.

### 5.5 Listado

Historial completo con búsqueda instantánea, filtros combinables, orden por
columna y **selección de líneas** (checkbox, y rango con Shift + clic).

Con líneas seleccionadas aparecen las acciones en lote: exportar CSV y, para
MASTER, validar, comentar, recalcular métricas, forzar cierre o eliminar.

---

## 6. Administración (solo MASTER)

| Panel | Para qué |
|---|---|
| **Campos del formulario** | Qué se pide, qué es obligatorio, qué departamentos lo ven. |
| **Catálogos** | Clientes, flujos, tipos de equipo, aditamentos, andenes, causas de paro. |
| **Flujos y etapas** | La secuencia que sigue el cronómetro, con responsable y minutos estimados. |
| **Departamentos** | Quién opera qué. |
| **Reglas por cliente** | Mínimo de fotos que exige cada cliente para cerrar. |
| **Equipos** | Cuadrillas que se asignan a personal y montacargas. |
| **Adicionales** | Catálogo de servicios extra por cliente, con unidad y precio. |
| **Historial** | Quién hizo qué, cuándo y sobre qué registro. |
| **Semáforos** | Umbrales verde/ámbar/rojo por tipo de maniobra. |
| **Usuarios** | Altas, roles, departamento, equipo y reset de PIN. |
| **Tiempos estimados** | Minutaje de referencia por etapa. |

### 6.1 Flujos por cliente

Un flujo puede tener una **secuencia genérica** y **variantes por cliente**.

1. Abre el flujo desde su chip.
2. En **«Aplica a»** elige el cliente.
3. Se copian las etapas actuales como punto de partida.
4. Ajusta y **Guardar secuencia**.

La prioridad al iniciar una maniobra es:
**secuencia del cliente → genérica del flujo → la de fábrica.**

> Escribir en «+ Nuevo flujo» el nombre de uno que ya existe **lo abre con sus
> etapas**, no lo vacía.

---

## 7. Indicadores

Pestaña **Indicadores 📊** (MASTER y DASHBOARD). Filtra por período, cliente,
registros anómalos y prueba controlada.

**Ocho marcadores:** maniobras cerradas, en curso, mediana, percentil 80,
toneladas movidas, ton/hora, min-montacargas, ocupación del spot.

**Cinco medidores:** dentro de estándar, calidad del dato, tiempo en paro,
uso de montacargas, maniobras con daño.

**Gráficas:** dona del semáforo, barras por tipo, área de tendencia, carga por
día de la semana, mapa de calor día × hora, rankings de clientes,
montacarguistas y andenes, y resumen de adicionales facturados.

**Por tipo y cliente** — la vista principal. Cada tarjeta trae mediana, P80,
promedio, min/ton, min/atado, min/pieza, min/tarima, min-mont/ton, ocupación y
paro. Incluye una **franja de distribución** donde cada punto es una maniobra
sobre las bandas verde/ámbar/rojo de ese tipo.

**Prueba controlada** — compara el mismo tipo de maniobra con 1 contra 2
montacargas. La columna a mirar es **min-mont/ton**: si baja poco al duplicar
equipo, el segundo montacargas no se paga solo.

**En revisión** — registros excluidos por anomalía, para validarlos o corregirlos.

---

## 8. Métricas calculadas

Nadie las captura a mano. Se calculan al cerrar la maniobra.

```
tiempo efectivo   = tiempo total − minutos de paro

min por atado     = tiempo efectivo / atados
min por tonelada  = tiempo efectivo / toneladas netas
min por pieza     = tiempo efectivo / piezas sueltas
min por tarima    = tiempo efectivo / tarimas

min de montacargas          = tiempo total × núm. de montacargas
min de montacargas por ton  = min de montacargas / toneladas netas   ← costo

ocupación del spot = hora de liberación − hora de posicionamiento
```

El número de montacargas sale de la lista de unidades asignadas; si está vacía,
del campo numérico.

---

## 9. Hojas de datos

| Hoja | Contiene |
|---|---|
| `MANIOBRAS` | Un renglón por maniobra, con sus métricas y banderas. |
| `ETAPAS` | Un renglón por etapa, con tiempos, pausas y quién la movió. |
| `CATALOGOS` | Listas desplegables, una columna por catálogo. |
| `FLUJOS_ETAPAS` | Secuencias por flujo y por cliente. |
| `CLIENTES_CFG` | Mínimo de fotos y notas por cliente. |
| `DEPARTAMENTOS` · `EQUIPOS` | Estructura organizacional. |
| `MONTACARGAS` | Inventario de equipo con su estado. |
| `EMPLEADOS` · `USUARIOS` | Personal y cuentas de acceso. |
| `CAMPOS` | Configuración del formulario. |
| `SEMAFOROS` · `TIEMPOS_EST` | Umbrales y referencias de tiempo. |
| `ADICIONALES` · `ADICIONALES_MAN` | Catálogo y captura de servicios extra. |
| `INCIDENCIAS` | Bitácora de daños y eventos. |
| `HISTORIAL` | Quién hizo qué, cuándo y sobre qué. |
| `CONFIG` | Parámetros del sistema. |

Las columnas nuevas **siempre se agregan al final**, para que `setup()` pueda
migrar sin tocar datos existentes.

---

## 10. Parámetros de CONFIG

| Clave | Default | Qué hace |
|---|---|---|
| `MIN_FOTOS_INICIO` | 5 | Mínimo general de fotos para cerrar. |
| `N_MINIMO_DASHBOARD` | 5 | Registros mínimos para publicar un tiempo. |
| `UMBRAL_VERDE_MIN` / `UMBRAL_AMBAR_MIN` | 45 / 90 | Semáforo genérico. |
| `ANOMALIA_MIN_POR_ATADO_MIN` / `_MAX` | 0.3 / 25 | Rango válido de min/atado. |
| `ANOMALIA_MIN_POR_TON_MIN` / `_MAX` | 0.5 / 90 | Rango válido de min/tonelada. |
| `ANOMALIA_DURACION_MIN_MIN` / `_MAX` | 3 / 600 | Duración total razonable. |
| `CORREOS_REPORTE` | — | Destinatarios del reporte automático. |
| `REPORTE_DIARIO_HORA` | 6 | Hora del envío diario. |
| `TURNO_*_INICIO` / `_FIN` | — | Rangos horarios para detectar el turno. |

---

## 11. Soporte

Pestaña **Soporte 🩺** (solo MASTER).

**Diagnóstico** revisa cada hoja, detecta esquemas desfasados, etapas sin hora
de inicio, maniobras atoradas, registros sin tipo y datos sin costear. Incluye
el desfase entre tu reloj y el del servidor, y la bitácora de las últimas 60
llamadas al servidor.

**Herramientas de reparación:**

| Herramienta | Cuándo usarla |
|---|---|
| 🔧 Reparar cronómetros | Una etapa activa se quedó sin hora de inicio. |
| 🧮 Recalcular métricas | Cambiaste un semáforo o corregiste toneladas del histórico. |
| 🚩 Resaltar filas en revisión | Ver en la hoja cuáles están marcadas. |
| 📅 Formato dd/MM/yyyy | Horas que se ven como «Sat Dec 30 1899». |
| Limpiar pausas huérfanas | Marcas de pausa que quedaron sin dueño. |
| Sincronizar montacargas | El inventario no refleja lo que está en uso. |
| Migrar hojas (setup) | Después de instalar una actualización. |

---

## 12. Problemas comunes

| Síntoma | Causa y solución |
|---|---|
| *No existe la función del servidor «…»* | El `Code.gs` desplegado está atrasado. Pégalo y **crea implementación nueva**. |
| *No tienes permiso para acceder al documento* | El manifiesto quedó en `USER_ACCESSING`. Cambia **Ejecutar como: Yo**. |
| *The data has N but the range has M* | Esquema desfasado. Ejecuta `setup()`. |
| Horas como «Sat Dec 30 1899» | La columna quedó con formato de hora. Soporte → **📅 Formato dd/MM/yyyy**. |
| El cronómetro no arranca | Soporte → **🔧 Reparar cronómetros**. |
| Un tiempo no aparece en el dashboard | Está marcado REVISIÓN, o su tipo tiene menos de 5 registros. |
| El flujo abre vacío | Usaste «+ Nuevo flujo» con un nombre existente. Ábrelo desde su chip. |
| No aparecen clientes en las etapas | No hay clientes en el catálogo. Admin › Catálogos › CLIENTES. |

---

## 13. Uso en teléfono

La app está pensada para operarse con una mano en piso de almacén.

- Selección múltiple con **chips de un toque**, no con `Ctrl` + clic.
- Las tablas se convierten en **tarjetas** legibles.
- Botones de 44 px mínimo; campos a 16 px para que iOS no haga zoom.
- Pestañas en una tira deslizable fija arriba.
- Modales como hoja inferior.

Desde **Compartir → Agregar a pantalla de inicio** abre sin barra de navegador,
con ícono propio.

---

## 14. Anotaciones automáticas

Estas quedan registradas sin que nadie las escriba:

- **Registrado por** — el usuario de la sesión que creó la maniobra.
- **Timestamp** — fecha y hora de captura.
- **Por etapa** — quién la creó, pausó, reanudó, finalizó o marcó como no aplica, y cuándo.
- **Historial** — toda acción sobre catálogos, flujos, usuarios, validaciones y adicionales.
- **Validado por** — autor y fecha de cada validación, con su comentario.

La fecha se propone con la del día **en hora local** y queda editable.
