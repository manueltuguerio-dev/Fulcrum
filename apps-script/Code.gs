/**
 * TLTERMINALS · Comedor empresarial (proyecto Fulcrum)
 * Publica el documento de arquitectura como Web App de Google Apps Script.
 *
 * El contenido vive en el archivo HTML llamado Index, que se genera con
 * apps-script/build.py a partir de docs/artifact/fulcrum-comedor.html.
 *
 * ANTES DE PUBLICAR: selecciona la función "verificar" en la barra de arriba,
 * presiona Ejecutar y revisa el registro. Te dice si el archivo HTML está bien
 * puesto, sin necesidad de implementar nada.
 */

var PAGE_TITLE = 'TLTERMINALS · Comedor empresarial — Arquitectura';

var DESCRIPCION = 'Arquitectura, base de datos, API y flujos de la app de pedidos del comedor.';

/**
 * Nombres que se intentan, en orden. Apps Script distingue mayúsculas, y el
 * tropiezo más común es crear el archivo como "index" o como "Index.html"
 * (que queda "Index.html.html"). Aquí se aceptan todas esas variantes.
 */
var NOMBRES_POSIBLES = ['Index', 'index', 'INDEX', 'Index.html', 'Pagina', 'Página'];

/**
 * Punto de entrada del Web App. Google lo llama al abrir la URL /exec.
 * @param {Object} e Parámetros de la petición (no se usan).
 * @return {HtmlOutput} La página, o una de diagnóstico si falta el HTML.
 */
function doGet(e) {
  var pagina = construirPagina_();
  if (pagina) {
    return pagina;
  }
  return HtmlService.createHtmlOutput(paginaDeDiagnostico_()).setTitle(PAGE_TITLE);
}

/**
 * Ejecútala desde el editor para comprobar la instalación antes de publicar.
 * El resultado aparece en el registro de ejecución, abajo.
 * @return {boolean} true si el archivo HTML se encontró.
 */
function verificar() {
  var pagina = construirPagina_();
  if (pagina) {
    Logger.log('OK — el archivo HTML se encontró. Ya puedes implementar.');
    Logger.log('Siguiente paso: Implementar > Nueva implementación > Aplicación web.');
    return true;
  }
  Logger.log('FALTA EL ARCHIVO HTML.');
  Logger.log('Crea un archivo con el signo + junto a "Archivos", tipo HTML,');
  Logger.log('nómbralo exactamente Index (sin escribir .html) y pega ahí el');
  Logger.log('contenido de Index.html. Luego vuelve a ejecutar "verificar".');
  return false;
}

/**
 * Arma la salida HTML probando los nombres de archivo aceptados.
 * @return {HtmlOutput|null} La página, o null si ningún nombre existe.
 * @private
 */
function construirPagina_() {
  for (var i = 0; i < NOMBRES_POSIBLES.length; i++) {
    try {
      return HtmlService.createHtmlOutputFromFile(NOMBRES_POSIBLES[i])
        .setTitle(PAGE_TITLE)
        // HtmlService descarta los <meta> del archivo, así que el viewport se
        // declara aquí. Sin esto la página se ve diminuta en celular.
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .addMetaTag('description', DESCRIPCION)
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch (err) {
      // Ese nombre no existe; se prueba el siguiente.
    }
  }
  return null;
}

/**
 * Página que se muestra cuando falta el archivo HTML: explica qué hacer en vez
 * de dejar un error de Google sin contexto.
 * @return {string} HTML de diagnóstico.
 * @private
 */
function paginaDeDiagnostico_() {
  return [
    '<!DOCTYPE html>',
    '<html lang="es"><head><meta charset="utf-8">',
    '<style>',
    'body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.6;',
    'max-width:44rem;margin:0 auto;padding:2.5rem 1.5rem;color:#131C1A;background:#F1F5F3}',
    'h1{font-size:1.5rem;line-height:1.25;margin:0 0 .5rem}',
    'p{margin:0 0 1rem}',
    'ol{padding-left:1.25rem}li{margin-bottom:.6rem}',
    'code{background:#E6ECE9;padding:.1rem .35rem;border-radius:3px;',
    'font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9em}',
    '.n{border-left:3px solid #0E6F5C;background:#D8EBE5;padding:.85rem 1.1rem;border-radius:0 4px 4px 0}',
    '</style></head><body>',
    '<h1>Falta el archivo HTML de la página</h1>',
    '<p>El código del servidor está bien: Google lo ejecutó y llegó hasta aquí. ',
    'Lo que no encontró es el archivo con el contenido de la página.</p>',
    '<div class="n"><p>En el editor de Apps Script:</p><ol>',
    '<li>Clic en el <strong>+</strong> junto a <strong>Archivos</strong> y elige <strong>HTML</strong>.</li>',
    '<li>Nómbralo exactamente <code>Index</code> — con I mayúscula y ',
    '<strong>sin escribir</strong> <code>.html</code>, que Apps Script agrega solo.</li>',
    '<li>Borra el ejemplo que trae y pega todo el contenido de <code>Index.html</code>, ',
    'hasta la última línea <code>&lt;/html&gt;</code>.</li>',
    '<li>Guarda, y en el editor ejecuta la función <code>verificar</code> para confirmar.</li>',
    '<li>Publica de nuevo: <strong>Implementar → Administrar implementaciones → ✏️ → Versión nueva</strong>.</li>',
    '</ol></div>',
    '<p><strong>¿Ya creaste el archivo y aun así ves esto?</strong> Entonces esta liga ',
    'está sirviendo una versión publicada <em>antes</em> de que lo agregaras: las ',
    'implementaciones son fotos congeladas del código y no se actualizan solas. ',
    'Ve a <strong>Implementar → Administrar implementaciones → ✏️ → Versión nueva</strong>.</p>',
    '<p>Si tampoco es eso, revisa el nombre del archivo: <code>Index.html.html</code> ',
    'y <code>Índex</code> son errores comunes.</p>',
    '</body></html>'
  ].join('\n');
}
