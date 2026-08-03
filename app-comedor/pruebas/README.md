# Pruebas de la aplicación del comedor

No requieren Google: simulan el entorno de Apps Script.

## Lógica del servidor

```bash
node pruebas/prueba.js
```

`simulador.js` reemplaza SpreadsheetApp, PropertiesService, Session, MailApp,
ScriptApp y HtmlService con equivalentes en memoria, y carga los `.gs` reales.
`prueba.js` corre 61 comprobaciones sobre un escenario completo: instalación,
alta de empleados, menú, hora corte, reglas del pedido, tarifas, cancelación,
pedido expreso, entrega masiva, condonación, baja y reactivación, permisos,
cierre automático, WhatsApp y exportación.

## Interfaz

```bash
python3 pruebas/armar_ui.py
```

Genera `ui.html`, la aplicación con un servidor simulado que devuelve datos de
ejemplo. Ábrela en el navegador para revisarla sin desplegar nada.

`ui-sonda.html` es la misma página pero recorre sola las ocho vistas y el
formulario de pedido, y reporta los errores de JavaScript que encuentre.
