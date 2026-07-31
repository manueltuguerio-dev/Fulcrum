/**
 * Fulcrum · Comedor empresarial
 * Publica el documento de arquitectura como Web App de Google Apps Script.
 *
 * El contenido vive en Index.html, que se genera con apps-script/build.py a
 * partir de docs/artifact/fulcrum-comedor.html. No edites Index.html a mano:
 * edita el documento fuente y vuelve a generarlo.
 */

var PAGE_TITLE = 'Fulcrum · Comedor empresarial — Arquitectura';

/**
 * Punto de entrada del Web App.
 * @param {Object} e Parámetros de la petición (no se usan).
 * @return {HtmlOutput} La página lista para servir.
 */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(PAGE_TITLE)
    // HtmlService descarta los <meta> del archivo, así que el viewport se
    // declara aquí. Sin esto la página se ve diminuta en celular.
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .addMetaTag('description', 'Arquitectura, base de datos, API y flujos de la app de pedidos del comedor.')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
