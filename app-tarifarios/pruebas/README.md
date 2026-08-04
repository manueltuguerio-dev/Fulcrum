# Pruebas de los tarifarios

No requieren Google: simulan el entorno de Apps Script.

## Lógica del servidor

```bash
node pruebas/prueba.js
```

`simulador.js` reemplaza SpreadsheetApp, PropertiesService, Session, ScriptApp,
DriveApp y HtmlService con equivalentes en memoria, y carga los `.gs` reales.
`prueba.js` corre 161 comprobaciones sobre un escenario completo: instalación,
alta de partners y rutas, catálogos de carga, unidad y movimiento, cálculo del
costo total con combustible y casetas, conversión de dólares con el tipo de
cambio del día, orden de la mejor a la peor opción, pesos de precio contra
tiempo, comparaciones sin tiempo capturado, vigencias, apartado de mejores
opciones, campos personalizados (incluido el que separa la comparación),
importación de CSV con acentos y separadores raros, actualización sin duplicar,
exportación, permisos por rol, edición, duplicado y bajas.

`tarifario-ejecutivo.csv` son 26 renglones reales de la hoja *Tarifario
Ejecutivo* de TLTERMINALS, con sus rarezas incluidas: notas con comas y
comillas, tarifas en dólares, un renglón sin unidad ni precio y dos renglones
con la misma combinación. La sección 16 de la prueba lo importa y comprueba que
el sistema lo entiende y reporta esas dos cosas en vez de tragárselas.

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
