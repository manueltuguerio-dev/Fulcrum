# Pruebas del almacén

Como el código corre dentro de Google Apps Script, no se puede ejecutar tal cual
en una máquina normal. `simulador.js` recrea lo mínimo del entorno de GAS
(`SpreadsheetApp`, `DriveApp`, `PropertiesService`, `Utilities`, `MailApp`,
`ScriptApp`, `UrlFetchApp`, `HtmlService`) con hojas y archivos en memoria, y
carga los archivos `.gs` reales. Incluye un **reloj controlable**
(`sim.fijarReloj` / `sim.avanzar`) para medir los cronómetros de forma
determinista.

`prueba.js` corre un escenario completo de punta a punta: instalación, catálogos,
acceso por PIN y contraseña (RBAC), validación de furgón y folio dinámico,
cronómetro por sub-etapas con demora, consecutivo por furgón, campos
condicionales de plataforma, cuadrillas con operador/aditamento por SKU, matriz
de SLA, edición y borrado con bitácora, módulo de prueba controlada (estudio de
tiempos), tablero, exportación, reportes por correo, despachador y permisos.

## Correr

```bash
cd app-almacen/pruebas
node prueba.js      # o: npm test
```

Sale con código 0 si todo pasa. No toca nada de Google: es 100 % local.

> No sustituye una prueba real desplegada en Apps Script, pero atrapa errores de
> programación y de reglas de negocio antes de subir.
