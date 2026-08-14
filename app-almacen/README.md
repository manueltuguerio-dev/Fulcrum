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
| `Db.gs` | Hoja de cálculo como base de datos, CRUD y utilidades. |
| `Auth.gs` | Acceso por PIN / contraseña, sesiones con token y bitácora. |
| `Registro.gs` | Maniobras y cronómetro por sub-etapas (el corazón). |
| `Empleados.gs` | Padrón de personal (cuadrillas) y equipos (montacargas por SKU). |
| `Sla.gs` | Matriz de SLA configurable por cliente/material/etapa. |
| `Catalogos.gs` | Listas desplegables y lectura de campos dinámicos. |
| `Reportes.gs` | Tablero (KPIs), exportación a Excel/PDF y reportes por correo. |
| `Master.gs` | Usuarios, roles, campos dinámicos, auditoría y ajustes. |
| `Fotos.gs` | Fotos de carga y daño, guardadas en Drive por folio. |
| `Index.html` · `Estilos.html` · `Cliente.html` | La SPA (tema oscuro, mobile-first). |

## Funciones

- **Sub-etapas cronometradas** — cada maniobra recorre Recepción en patio →
  Espera de andén → Maniobra → Cierre, con marca de tiempo por etapa y tiempos
  parciales + total consolidado. En cualquier etapa se puede registrar una
  **demora** (con causa obligatoria) que se descuenta del tiempo efectivo.
- **Cuadrillas** — padrón de empleados con puesto (Montacarguista, Ayudante de
  Patio, Inspector de Calidad, Supervisor) y selección múltiple por maniobra,
  con conteo automático de montacarguistas y ayudantes.
- **Equipos por SKU** — inventario de montacargas con SKU único; cada maniobra
  liga los equipos usados (operador + máquina + turno) para trazabilidad.
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
5. **`verificar()`** y revisa el registro (Ver > Registros).
6. Publica: **Implementar > Nueva implementación > Aplicación web**, ejecutar
   como *tú mismo*, acceso *cualquiera*.
7. Entra, cambia tu contraseña en **Ajustes** y da de alta empleados, equipos y
   usuarios operativos (con PIN).

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
  de la hoja; se guardan como JSON dentro de cada maniobra.
- Esta versión avanzada cambia el esquema de `REGISTRO` respecto de la primera;
  si ya habías instalado una versión previa sin datos, vuelve a ejecutar
  `instalar()` para reescribir los encabezados.
