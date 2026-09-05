/**
 * Puntos de entrada: el menu del libro, la aplicacion web y el preparador que
 * deja las hojas de trabajo listas la primera vez.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('MX Supply')
    .addItem('Abrir panel', 'abrirPanel')
    .addSeparator()
    .addItem('Preparar libro', 'prepararLibro')
    .addItem('Correr proceso', 'iniciarProceso')
    .addItem('Ver avance', 'mostrarAvance')
    .addSeparator()
    .addItem('Cancelar corrida', 'cancelarProceso')
    .addToUi();
}

/** Panel lateral dentro del propio libro. */
function abrirPanel() {
  var html = HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('MX Supply Assurance')
    .setWidth(420);
  SpreadsheetApp.getUi().showSidebar(html);
}

/** La misma interfaz publicada como aplicacion web. */
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('MX Supply Assurance')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Permite partir el HTML en varios archivos. */
function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

function mostrarAvance() {
  var e = estadoProceso();
  SpreadsheetApp.getUi().alert('MX Supply Assurance',
    e.descripcion + (e.error ? '\n\nError: ' + e.error : ''),
    SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Crea las hojas que necesita la aplicacion y las deja con valores de
 * arranque. Se puede volver a correr sin perder lo capturado: solo agrega lo
 * que falte.
 */
function prepararLibro() {
  var libro = libroTrabajo();
  var creadas = [];

  // --- Config --------------------------------------------------------------
  var config = libro.getSheetByName(HOJAS_TRABAJO.CONFIG);
  if (!config) {
    config = libro.insertSheet(HOJAS_TRABAJO.CONFIG, 0);
    creadas.push(HOJAS_TRABAJO.CONFIG);
    var hoy = new Date();
    var finMesSiguiente = new Date(hoy.getFullYear(), hoy.getMonth() + 2, 0);

    var filas = [
      ['Parametro', 'Valor', 'Que significa'],
      ['Carpeta de Drive con el libro MX', '',
        'Pega aqui la liga de la carpeta donde dejas cada mes el libro MX y el archivo Data.'],
      ['Nombre del archivo Data', 'data',
        'Texto que debe contener el nombre del archivo Data para distinguirlo del libro MX.'],
      ['Fecha de corrida', hoy,
        'Es el TODAY() que usa la columna L para decidir entre SHORTAGE y OK PER LT.'],
      ['Modo de ventana', 'rango',
        'rango = cualquier semana dentro de las fechas de abajo. semana = una sola columna.'],
      ['Desde', hoy, 'Inicio de la ventana cuando el modo es rango.'],
      ['Hasta', finMesSiguiente, 'Fin de la ventana cuando el modo es rango.'],
      ['Columna de semana', 'W',
        'Columna a evaluar cuando el modo es semana. W es la del paso literal del proceso.'],
      ['Estatus a conservar', 'SHORTAGE',
        'Valores de la columna L que pasan el filtro, separados por coma.'],
      ['DEFAULT_BUYER a sustituir', 'LZR22', 'Valor que trae el archivo Data.'],
      ['Se escribe como', 'Luis Rodriguez', 'Nombre que se escribe en Details.'],
      ['Leer Open_PO', 'SI',
        'NO acelera la corrida y deja en cero las filas Promise y Need, que no afectan el resultado.'],
      ['Escribir KB Supply', 'SI',
        'NO omite la hoja KB Supply y solo genera el consolidado. Es la corrida mas rapida.'],
    ];
    config.getRange(1, 1, filas.length, 3).setValues(filas);
    config.getRange(1, 1, 1, 3).setFontWeight('bold').setFontColor('#ffffff').setBackground(CFG.MARCA);
    config.getRange(4, 2).setNumberFormat('dd-mmm-yyyy');
    config.getRange(6, 2, 2, 1).setNumberFormat('dd-mmm-yyyy');
    config.setColumnWidth(1, 260);
    config.setColumnWidth(2, 220);
    config.setColumnWidth(3, 520);
    config.getRange(2, 3, filas.length - 1, 1).setWrap(true).setVerticalAlignment('top');
    config.setFrozenRows(1);
  }

  // --- Contactos -----------------------------------------------------------
  var contactos = libro.getSheetByName(HOJAS_TRABAJO.CONTACTOS);
  if (!contactos) {
    contactos = libro.insertSheet(HOJAS_TRABAJO.CONTACTOS);
    creadas.push(HOJAS_TRABAJO.CONTACTOS);
  }
  CONTACTOS.asegurarEncabezado(contactos);

  // --- Bitacora ------------------------------------------------------------
  var bit = libro.getSheetByName(HOJAS_TRABAJO.BITACORA);
  if (!bit) {
    bit = libro.insertSheet(HOJAS_TRABAJO.BITACORA);
    creadas.push(HOJAS_TRABAJO.BITACORA);
    bit.getRange(1, 1, 1, 4).setValues([['Cuando', 'Nivel', 'Quien', 'Que paso']])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground(CFG.MARCA);
    bit.setColumnWidth(1, 160);
    bit.setColumnWidth(2, 70);
    bit.setColumnWidth(3, 220);
    bit.setColumnWidth(4, 720);
    bit.setFrozenRows(1);
  }

  // La hoja que Google crea por omision estorba una vez que ya hay Config.
  var sobrante = libro.getSheetByName('Hoja 1') || libro.getSheetByName('Sheet1');
  if (sobrante && libro.getSheets().length > 1 && sobrante.getLastRow() === 0) {
    libro.deleteSheet(sobrante);
  }

  var mensaje = creadas.length
    ? 'Se crearon las hojas: ' + creadas.join(', ') + '. Llena "Carpeta de Drive con el libro MX" en la hoja Config.'
    : 'El libro ya estaba preparado. No se cambio nada.';
  bitacora(mensaje, 'info');
  return mensaje;
}
