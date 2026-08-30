# Herramientas de desarrollo

No forman parte de la aplicación: son los scripts con los que se aplicaron y se verificaron los
últimos cambios. Se guardan aquí para poder repetir o auditar el trabajo.

| Archivo | Qué hace |
|---|---|
| `patch_impuestos.py` | Aplica a `artefacto-erp.html` y `AppJs.html` los impuestos/retenciones en facturas, la sugerencia de clientes y el redondeo a centavos |
| `patch_ret_catalogo.py` | Añade el catálogo de impuestos ya dados de alta y el autollenado de la tasa |
| `t_impuestos.js` | Prueba en navegador: impuestos del cliente, alta/baja de retenciones y aplicación de pagos sin error de redondeo |
| `t_lineas.js` | Prueba en navegador: unidad, analítica y costo por línea, y su impresión en el PDF |
| `t_gas.js` | Simula el entorno de Apps Script (`Index.html` + `getRecursos`) y repite las pruebas sobre el bundle |

Los parches ya están aplicados; volver a ejecutarlos falla a propósito (verifican que el texto
original exista una sola vez).

Para correr las pruebas se necesita Playwright y Chromium:

```bash
PWROOT=$(npm root -g) node t_lineas.js
PWROOT=$(npm root -g) node t_impuestos.js
PWROOT=$(npm root -g) node t_gas.js
```

Los scripts esperan `erp.html` (copia de `artefacto-erp.html`) y la carpeta `appsscript/` junto a
ellos.
