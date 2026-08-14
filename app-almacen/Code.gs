/**
 * TLTERMINALS · Almacén y Patio — registro de tiempos de maniobra (WMS-Lite).
 *
 * Aplicación web sobre Google Apps Script. La lógica está repartida así:
 *   Db.gs         hoja de cálculo como base de datos y utilidades
 *   Auth.gs       acceso por PIN / contraseña, sesiones y bitácora
 *   Registro.gs   maniobras y cronómetro por sub-etapas (el corazón)
 *   Empleados.gs  padrón de personal (cuadrillas) y equipos (montacargas/SKU)
 *   Sla.gs        matriz de SLA configurable por cliente/material/etapa
 *   Catalogos.gs  listas desplegables y campos dinámicos (lectura)
 *   Reportes.gs   tablero (KPIs), exportación y reportes por correo
 *   Master.gs     usuarios, roles, campos dinámicos, auditoría, ajustes
 *   Fotos.gs      fotos de carga y daño en Drive
 *
 * Para instalar, ejecuta desde el editor, en este orden:
 *   1. instalar()              crea la hoja de cálculo y te deja como MASTER
 *   2. cargarEjemplo()         (opcional) llena catálogos para probar
 *   3. instalarDisparadores()  programa el envío automático de reportes
 * y luego publica: Implementar > Nueva implementación > Aplicación web.
 * Tu contraseña temporal de MASTER es "almacen"; cámbiala en Ajustes.
 */

var TITULO = 'Almacén TLTERMINALS';

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(TITULO)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Inserta el contenido de otro archivo HTML. Lo usa Index.html.
 * @param {string} nombre Nombre del archivo, sin extensión.
 */
function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

/**
 * Funciones que el navegador puede invocar. Todo lo que no esté aquí es
 * inalcanzable desde el cliente.
 */
var FUNCIONES_PUBLICAS = [
  // acceso
  'apiOperativos', 'apiEntrarPin', 'apiEntrarClave', 'apiSalir',
  // app
  'apiEstadoApp', 'apiVivas',
  // cronómetro y sub-etapas
  'apiIniciar', 'apiAvanzarEtapa', 'apiPausar', 'apiReanudar', 'apiFinalizar',
  // maniobras (admin)
  'apiEditarRegistro', 'apiEliminarRegistro', 'apiHistorial',
  // fotos
  'apiSubirFoto',
  // catálogos (admin)
  'apiCatalogosAdmin', 'apiGuardarCatalogo', 'apiCambiarCatalogo',
  // personal y equipos (admin)
  'apiEmpleados', 'apiGuardarEmpleado', 'apiCambiarEstadoEmpleado',
  'apiMontacargas', 'apiGuardarMontacargas', 'apiCambiarEstadoMontacargas',
  // matriz de SLA (admin)
  'apiSlaMatriz', 'apiGuardarSla', 'apiBorrarSla',
  // tablero y reportes
  'apiDashboard', 'apiGuardarWidgets', 'apiExportar',
  'apiReportes', 'apiGuardarReporte', 'apiBorrarReporte', 'apiEnviarReporteAhora',
  // master
  'apiUsuarios', 'apiGuardarUsuario', 'apiCambiarEstadoUsuario', 'apiResetPin',
  'apiCamposCustom', 'apiGuardarCampoCustom', 'apiCambiarCampoCustom',
  'apiAuditoria', 'apiGuardarConfig'
];

/**
 * Punto único por el que pasan todas las llamadas del navegador. Fija el token
 * de la sesión y luego ejecuta la función pedida.
 *
 * @param {string} token Token de sesión, o cadena vacía.
 * @param {string} nombre Función a ejecutar.
 * @param {Array} args Sus argumentos.
 * @return {*} Lo que devuelva la función.
 */
function ejecutar(token, nombre, args) {
  SESION_TOKEN = token ? String(token) : '';
  _reglasSlaCache = null; // memoria de SLA fresca en cada petición (ver Sla.gs)
  if (FUNCIONES_PUBLICAS.indexOf(String(nombre)) === -1) {
    throw new Error('Operación no permitida: ' + nombre);
  }
  var fn = globalThis[nombre];
  if (typeof fn !== 'function') {
    throw new Error('No existe la función ' + nombre + '.');
  }
  return fn.apply(null, args || []);
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

  var masters = leerTodo_('USUARIOS').filter(function (u) {
    return String(u.rol) === 'MASTER' && String(u.estado) === 'activo';
  });
  if (!masters.length) {
    problemas.push('No hay ningún MASTER activo. Ejecuta instalar().');
  }

  var hayReportes = leerTodo_('CONFIG_REPORTES').length > 0;
  var hayDisparador = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'jobReportes';
  });
  if (hayReportes && !hayDisparador) {
    Logger.log('AVISO: hay reportes programados pero falta el disparador. '
      + 'Ejecuta instalarDisparadores().');
  }

  if (problemas.length) {
    Logger.log('NO ESTÁ LISTO:');
    problemas.forEach(function (p) { Logger.log('  - ' + p); });
    return false;
  }

  Logger.log('OK — todo listo.');
  Logger.log('Usuarios: ' + leerTodo_('USUARIOS').length
    + ' | Empleados: ' + leerTodo_('EMPLEADOS').length
    + ' | Equipos: ' + leerTodo_('MONTACARGAS').length
    + ' | Catálogos: ' + leerTodo_('CATALOGOS').length
    + ' | Reglas SLA: ' + leerTodo_('CONFIG_SLA').length
    + ' | Maniobras: ' + leerTodo_('REGISTRO').length);
  return true;
}
