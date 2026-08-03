# Pruebas de los tarifarios

No requieren Google: simulan el entorno de Apps Script.

## Lógica del servidor

```bash
node pruebas/prueba.js
```

`simulador.js` reemplaza SpreadsheetApp, PropertiesService, Session, ScriptApp,
DriveApp y HtmlService con equivalentes en memoria, y carga los `.gs` reales.
`prueba.js` corre 101 comprobaciones sobre un escenario completo: instalación,
alta de proveedores y rutas, catálogos, cálculo del costo total con combustible
y casetas, conversión de dólares, orden de la mejor a la peor opción, pesos de
precio contra tiempo, vigencias, apartado de mejores opciones, importación de
CSV con acentos y separadores raros, actualización sin duplicar, exportación,
permisos por rol y bajas.

## Interfaz

```bash
python3 pruebas/armar_ui.py
```

Genera `ui.html`, la aplicación con un servidor simulado que devuelve datos de
ejemplo. Ábrela en el navegador para revisarla sin desplegar nada.

`ui-sonda.html` es la misma página pero recorre sola las ocho vistas y todos los
formularios, y reporta los errores de JavaScript que encuentre —incluidos los
que ocurren dentro de promesas—. Sirve para comprobar en un navegador sin
consola:

```bash
python3 pruebas/armar_ui.py
# abre pruebas/ui-sonda.html; debe decir SIN ERRORES
```

Los dos HTML se generan y no se versionan.
