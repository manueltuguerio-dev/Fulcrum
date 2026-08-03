/**
 * TLTERMINALS · Comedor empresarial — aplicación web.
 *
 * Punto de entrada. La lógica está repartida así:
 *   Db.gs        hoja de cálculo como base de datos
 *   Api.gs       lo que usa el empleado: menú, pedido, historial
 *   Admin.gs     empleados, platillos, menús, pedidos del día, ajustes
 *   Reportes.gs  producción del día y cobros para Nómina
 *   Jobs.gs      recordatorio antes del corte y cierre automático
 *
 * Para instalar, ejecuta desde el editor, en este orden:
 *   1. instalar()              crea la hoja de cálculo y te deja como admin
 *   2. instalarDisparadores()  programa recordatorio y cierre
 * y luego publica: Implementar > Nueva implementación > Aplicación web.
 */

var TITULO = 'Comedor TLTERMINALS';

function doGet(e) {
  var plantilla = HtmlService.createTemplateFromFile('Index');
  return plantilla.evaluate()
    .setTitle(TITULO)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Inserta el contenido de otro archivo HTML. Lo usa Index.html.
 * @param {string} nombre Nombre del archivo, sin extensión.
 * @return {string} Su contenido.
 */
function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

/**
 * Comprobación de instalación. Ejecútala desde el editor y lee el registro.
 * @return {boolean} true si todo está listo.
 */
function verificar() {
  var problemas = [];

  ['Index', 'Estilos', 'Cliente'].forEach(function (archivo) {
    try {
      HtmlService.createHtmlOutputFromFile(archivo);
    } catch (err) {
      problemas.push('Falta el archivo HTML "' + archivo + '": ' + err.message);
    }
  });

  var id = PropertiesService.getScriptProperties().getProperty(PROP_HOJA);
  if (!id) {
    problemas.push('No hay base de datos. Ejecuta instalar() primero.');
  } else {
    try {
      var libro = SpreadsheetApp.openById(id);
      Object.keys(TABLAS).forEach(function (t) {
        if (!libro.getSheetByName(t)) {
          problemas.push('Falta la pestaña "' + t + '". Ejecuta instalar() otra vez.');
        }
      });
      Logger.log('Base de datos: ' + libro.getUrl());
    } catch (err) {
      problemas.push('No pude abrir la hoja de cálculo: ' + err.message);
    }
  }

  var admins = leerTodo_('Empleados').filter(function (e) {
    return String(e.rol) === 'admin' && String(e.estado) === 'activo';
  });
  if (!admins.length) {
    problemas.push('No hay ningún administrador activo. Ejecuta instalar().');
  }

  var disparadores = ScriptApp.getProjectTriggers().filter(function (t) {
    var f = t.getHandlerFunction();
    return f === 'jobRecordatorio' || f === 'jobCierre';
  });
  if (disparadores.length !== 2) {
    Logger.log('AVISO: faltan disparadores. Ejecuta instalarDisparadores() '
      + '(sin ellos no hay recordatorios ni cierre automático).');
  }

  if (problemas.length) {
    Logger.log('NO ESTÁ LISTO:');
    problemas.forEach(function (p) { Logger.log('  - ' + p); });
    return false;
  }

  Logger.log('OK — todo listo.');
  Logger.log('Empleados: ' + leerTodo_('Empleados').length
    + ' | Platillos: ' + leerTodo_('Platillos').length
    + ' | Pedidos: ' + leerTodo_('Pedidos').length);
  var liga = ligaApp_();
  Logger.log(liga
    ? 'Liga de la aplicación: ' + liga
    : 'Falta publicar: Implementar > Nueva implementación > Aplicación web.');
  return true;
}

/**
 * Carga un catálogo mínimo para poder probar la aplicación de inmediato.
 * Solo agrega platillos si el catálogo está vacío.
 */
function cargarEjemplo() {
  if (leerTodo_('Platillos').length) {
    Logger.log('El catálogo ya tiene platillos: no toco nada.');
    return false;
  }
  var ejemplos = [
    ['Milanesa de res', 'Empanizada, con limón', 'principal', true, 65, false],
    ['Pollo en mole', 'Con ajonjolí', 'principal', true, 65, false],
    ['Chiles rellenos', 'De queso, en caldillo', 'principal', true, 60, false],
    ['Ensalada del día', 'Opción ligera', 'base', true, 45, true],
    ['Sándwich de pavo', 'Siempre disponible', 'base', false, 45, true],
    ['Arroz', '', 'complemento', false, 0, true],
    ['Frijoles', '', 'complemento', false, 0, true],
    ['Verduras al vapor', '', 'complemento', false, 0, true],
    ['Salsa verde', '', 'salsa', false, 0, true],
    ['Salsa roja', '', 'salsa', false, 0, true]
  ];
  ejemplos.forEach(function (e) {
    insertar_('Platillos', {
      id: nuevoId_(), nombre: e[0], descripcion: e[1], imagen: '', tipo: e[2],
      permiteComplementos: e[3] ? 'SI' : 'NO', precio: e[4],
      activo: 'SI', fijo: e[5] ? 'SI' : 'NO'
    });
  });
  Logger.log('Cargué ' + ejemplos.length + ' platillos de ejemplo.');
  return true;
}
