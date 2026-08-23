# Pruebas de NutriApp

El backend se ejecuta en Node dentro de un simulador de los servicios de Google,
así que se puede probar sin desplegar nada ni tocar una hoja de cálculo real.

## Correr las pruebas

```bash
node apps-script/nutriapp/pruebas/prueba.js
```

Cubre el arranque de la base, la autenticación, el ajuste mensual del déficit,
el registro de alimentos, los platillos, la subida a Drive, la actividad física,
el chat con la alerta de WhatsApp y los permisos del panel del nutriólogo.
Devuelve código 1 si algo falla, de modo que sirve tal cual en un ganchito de
integración continua.

## Ver la interfaz sin desplegar

```bash
node apps-script/nutriapp/pruebas/vista_previa.js /tmp/vista.html
```

Genera un solo archivo HTML con los estilos y los scripts ya incrustados y con
`google.script.run` sustituido por un doble que responde con datos que produjo
el backend real dentro del simulador: un paciente con seis meses de mediciones,
comidas registradas, actividad y una conversación con el nutriólogo. Ábrelo en
el navegador y entra con las credenciales que imprime el comando.

Necesita conexión para las bibliotecas por CDN. Sin ella la vista previa carga
igual, pero sin estilos ni gráficas.

## Qué simula y qué no

`simulador.js` reproduce lo que el código realmente usa de cada servicio:
rangos rectangulares, `appendRow` y `deleteRow` de Sheets; el hash SHA-256 y el
formato de fechas de `Utilities`; las propiedades del script; y dobles de
Gmail, Drive y `UrlFetchApp` que registran lo que se les pidió para poder
afirmar sobre ello.

Lo que **no** cubre: cuotas y tiempos de ejecución de Apps Script, la
concurrencia real de una hoja compartida, el saneado de HTML de `HtmlService` y
el comportamiento del OCR sobre imágenes de verdad. Eso solo se comprueba
desplegando.
