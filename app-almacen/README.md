# Almacén TLTERMINALS — registro de tiempos de maniobra (WMS-Lite)

Aplicación web sobre **Google Apps Script** para cronometrar maniobras de patio
y almacén con trazabilidad completa: sub-etapas, cuadrillas, equipos por SKU,
SLA configurable, tablero de indicadores y reportes automáticos por correo. Los
datos viven en Google Sheets y las fotos en Drive.

Sigue la misma arquitectura que `app-comedor`: HTML servido por `HtmlService`,
JavaScript puro sin dependencias externas (nada de CDNs) y la hoja de cálculo
como base de datos. Todas las llamadas del navegador pasan por un único
enrutador (`ejecutar`) con lista blanca de funciones.

## Estructura

| Archivo | Qué hace |
|---|---|
| `Code.gs` | Punto de entrada (`doGet`), enrutador `ejecutar`, `verificar`. |
| `Db.gs` | Hoja de cálculo como base de datos, CRUD, utilidades, protección. |
| `Auth.gs` | Acceso por PIN / contraseña, sesiones con token y bitácora. |
| `Registro.gs` | Eventos de maniobra y cronómetro por sub-etapas (el corazón). |
| `Prueba.gs` | Módulo de prueba controlada (estudio de tiempos). |
| `Empleados.gs` | Padrón de personal (cuadrillas) y equipos (montacargas por SKU). |
| `Sla.gs` | Matriz de SLA configurable por cliente/material/etapa. |
| `Catalogos.gs` | Listas cerradas (dropdowns) y lectura de campos dinámicos. |
| `Reportes.gs` | Tablero (KPIs), exportación a Excel/PDF y reportes por correo. |
| `Master.gs` | Usuarios, roles, campos dinámicos, auditoría y ajustes. |
| `Fotos.gs` | Fotos de carga y daño, guardadas en Drive por folio. |
| `Index.html` · `Estilos.html` · `Cliente.html` | La SPA (tema oscuro, mobile-first). |
| `pruebas/` | Simulador de GAS + escenario de pruebas (`node prueba.js`). |

## Furgón → eventos (1:N) y folio dinámico

Un **furgón** es la unidad padre que genera varios **eventos** de maniobra
(p.ej. 1 descarga + 5 cargas a plataforma). El operador registra eventos, no
furgones enteros. Cada evento arma su folio único a partir de cuatro campos:

```
[ID_FURGON]-[AAMMDD]-[CÓDIGO_MANIOBRA]-[CONSECUTIVO]
ejemplo:  TBOX667792-260817-DESC-01
```

- El **ID de furgón** se valida con una expresión regular configurable
  (`furgonRegex`, por defecto 2–5 letras + 4–8 dígitos) y se normaliza a
  mayúsculas, para cruzar con sistemas administrativos.
- El **consecutivo** se calcula por furgón + fecha + tipo de maniobra.
- Al cerrar un evento, un botón **“＋ Agregar evento a este mismo furgón”**
  arrastra el furgón y la fecha para el siguiente.
- El **tipo de maniobra** es una lista cerrada; su código para el folio vive en
  la columna `extra` del catálogo.

## Campos condicionales

Cuando el tipo de maniobra es **“Carga plataforma desde piso”** el formulario
pide además placa/plataforma, transportista y peso cargado.

## Funciones

- **Sub-etapas cronometradas** — cada maniobra recorre Recepción en patio →
  Espera de andén → Maniobra → Cierre, con marca de tiempo por etapa y tiempos
  parciales + total consolidado. En cualquier etapa se puede registrar una
  **demora** (con causa obligatoria) que se descuenta del tiempo efectivo.
- **Cuadrillas** — padrón de empleados con puesto (Montacarguista, Ayudante de
  Patio, Inspector de Calidad, Supervisor) y selección múltiple por evento, con
  conteo automático de montacarguistas y ayudantes.
- **Equipos por SKU con operador y aditamento** — inventario de montacargas con
  SKU único; cada evento liga máquina + operador + aditamento (Cuchillas / Roll
  Clamp) para trazabilidad de activos.
- **Prueba controlada (estudio de tiempos)** — módulo aparte para cargas de
  celulosa: furgón (toneladas, atados, presentación), configuración de montaje
  A/B/C, marcas de tiempo por fase (posicionado → extracción → acomodo →
  liberado), espera del montacargas 1 por el 2 (config C) y métricas de espacio
  (m² y niveles de estiba). Calcula extracción, acomodo, total y toneladas/hora.
- **Clonación de maniobras** — duplica una maniobra (viva o del historial)
  prellenando cliente, unidad, material, presentación, equipo, SKUs y cuadrilla.
- **SLA configurable** — matriz por Cliente + Material + Etapa (comodines
  permitidos); la regla más específica gana. Verde ≤ objetivo, ámbar hasta el
  umbral, rojo por encima o con demora activa.
- **Tablero** — KPIs de volumen, cumplimiento de SLA, demoras por causa,
  productividad por operador (min/pieza) y uso de maquinaria por SKU.
- **CRUD completo** — editar cualquier campo de una maniobra; borrado suave
  (se oculta) o definitivo (solo MASTER); todo queda en la bitácora.
- **Exportación y correo** — descarga a Excel (`.xlsx`) o PDF, y reportes
  automáticos por correo (diario/semanal/mensual) con un disparador por tiempo.
  El envío usa **`MailApp` de GAS**, con la cuenta que publicó la app: no hace
  falta ningún conector externo.

## Roles

- **OPERATIVO** — PIN de 4 dígitos. Patio: sub-etapas, demoras, cuadrilla,
  equipos, clonar, fotos.
- **ADMINISTRADOR** — correo + contraseña. Todo lo anterior más historial,
  edición/borrado de maniobras, catálogos, personal, equipos, matriz de SLA,
  tablero y descargas.
- **MASTER** — además: usuarios y roles, campos dinámicos, reportes por correo,
  borrado definitivo y bitácora de auditoría.

## Instalación

1. Crea un proyecto en [script.google.com](https://script.google.com) y sube
   estos archivos (con [clasp](https://github.com/google/clasp) o pegándolos a
   mano; los `.html` se crean como archivos HTML con ese mismo nombre).
2. Ejecuta **`instalar()`** — crea la hoja, la carpeta en Drive y te deja como
   **MASTER** con la contraseña temporal `almacen`.
3. (Opcional) **`cargarEjemplo()`** llena los catálogos para probar.
4. **`instalarDisparadores()`** programa el disparador horario de reportes.
5. (Opcional) **`protegerHojas()`** bloquea las pestañas para que nadie edite la
   hoja a mano; toda corrección pasa por el CRUD del Admin.
6. **`verificar()`** y revisa el registro (Ver > Registros).
7. Publica: **Implementar > Nueva implementación > Aplicación web**, ejecutar
   como *tú mismo*, acceso *cualquiera*.
8. Entra, cambia tu contraseña en **Ajustes** y da de alta empleados, equipos y
   usuarios operativos (con PIN).

## Pruebas

La lógica se prueba en local con un simulador de Apps Script (no toca Google):

```bash
cd app-almacen/pruebas && node prueba.js
```

Corre un escenario completo de punta a punta (74 comprobaciones). Ver
`pruebas/README.md`.

## Integridad de datos y protección de la hoja

- **Listas cerradas:** tipos de maniobra, causas de demora, aditamentos,
  transportistas y demás catálogos son estrictamente dropdowns; no hay texto
  libre para elementos de catálogo.
- **Los usuarios nunca abren la hoja.** Toda corrección se hace desde el CRUD del
  Admin, que además deja constancia en `LOG_AUDITORIA` (quién, qué campo, valor
  anterior y nuevo). `protegerHojas()` refuerza esto bloqueando la edición
  manual.
- **Sobre `ARRAYFORMULA`:** el spec sugería que las columnas calculadas se
  resolvieran con `ARRAYFORMULA` en la fila 1 y que el script solo escribiera
  datos crudos. Aquí se tomó una decisión distinta a propósito: el script
  **calcula y escribe** los tiempos, y las correcciones reescriben el renglón.
  El motivo es que el modelo `ARRAYFORMULA` + solo-anexar choca de frente con el
  CRUD de edición total que el propio sistema exige (editar cualquier campo de un
  evento ya registrado): una fórmula que se derrama sobre datos escritos por el
  script se rompería. Se conserva la *intención* del requisito —hoja protegida,
  listas cerradas y correcciones auditadas por la app— sin ese conflicto. Migrar
  a puro `ARRAYFORMULA` + bitácora de ajustes sería un refactor aparte del modelo
  de datos.

## Notas técnicas

- **El cronómetro es autoritativo en el servidor:** las marcas de tiempo se
  guardan en milisegundos en la hoja, así que recargar o cerrar el navegador no
  pierde el conteo. El cliente solo dibuja el tiempo y corrige el desfase de
  reloj contra la hora del servidor.
- **PIN y contraseñas** se guardan con hash SHA-256 y sal por usuario.
- **Exportación** a `.xlsx`/PDF: se arma una hoja temporal, se exporta con el
  endpoint de Google (vía `UrlFetchApp` + token del script) y se borra al
  terminar.
- **Campos dinámicos:** el MASTER agrega columnas al acta sin tocar las fórmulas
  de la hoja; se guardan como JSON dentro de cada evento.
- Esta versión amplía el esquema de `REGISTRO` (furgón, tipo de maniobra,
  consecutivo, campos de plataforma) y agrega la pestaña `PRUEBAS`. Si ya habías
  instalado una versión previa **sin datos**, vuelve a ejecutar `instalar()` para
  reescribir los encabezados.
