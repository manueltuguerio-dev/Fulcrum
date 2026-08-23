/**
 * NutriApp · Fulcrum
 * Backend de la aplicación web de seguimiento nutricional en Google Apps Script.
 *
 * Este archivo concentra la configuración, el arranque de la base de datos en
 * Google Sheets y los ayudantes de lectura y escritura que usan los demás
 * archivos (Auth.gs, Api.gs, KatchMcArdle.gs, MetaWhatsApp.gs, Menus.gs).
 *
 * PRIMER USO: selecciona la función "setupDatabase" en la barra de arriba,
 * presiona Ejecutar y autoriza los permisos. Crea la hoja de cálculo, las
 * pestañas, el catálogo de alimentos y el usuario nutriólogo inicial.
 */

/** Nombre de la hoja de cálculo que se crea la primera vez. */
var NOMBRE_BASE_DATOS = 'NutriApp · Base de datos';

/** Nombre de la carpeta de Drive donde se guardan las fotos de los pacientes. */
var NOMBRE_CARPETA_DRIVE = 'NutriApp · Evidencias';

/** Clave en PropertiesService donde queda guardado el ID de la hoja. */
var PROP_SPREADSHEET_ID = 'NUTRIAPP_SPREADSHEET_ID';

/** Clave en PropertiesService donde queda guardado el ID de la carpeta. */
var PROP_CARPETA_ID = 'NUTRIAPP_CARPETA_ID';

/** Meta calórica base de la guía mientras no exista historial suficiente. */
var META_CALORICA_BASE = 1700;

/** Gramos de proteína por kilogramo de peso corporal total. */
var PROTEINA_G_POR_KG = 1.0;

/** Meta diaria de fibra en gramos. */
var META_FIBRA_G = 30;

/** Método del plato de la guía: reparto porcentual de la energía diaria. */
var METODO_DEL_PLATO = { carbohidratos: 60, proteinas: 20, grasas: 20 };

/** Horas que dura un token de sesión antes de expirar. */
var HORAS_SESION = 12;

/** Horas que dura un token de recuperación de contraseña. */
var HORAS_RECUPERACION = 2;

/**
 * Definición de cada pestaña con sus encabezados. setupDatabase() la recorre
 * y crea lo que falte sin tocar lo que ya exista.
 */
var ESQUEMA = {
  Usuarios: ['ID', 'Email', 'PasswordHash', 'Rol', 'Nombre', 'FechaRegistro', 'Activo'],
  Metricas_Paciente: [
    'ID_Paciente', 'Fecha', 'Peso_kg', 'MasaMuscular_kg', 'PorcentajeGrasa',
    'Agua_Porcentaje', 'Trigliceridos', 'Colesterol', 'Glucosa',
    'FotoPesa_DriveUrl', 'FotoEstudios_DriveUrl', 'GrasaVisceral', 'Notas'
  ],
  Alimentos_100g: [
    'ID', 'Categoria', 'Alimento', 'Proteina_g', 'Grasa_g',
    'Carbohidratos_g', 'Fibra_g', 'Calorias_100g'
  ],
  Registro_Diario: [
    'ID', 'ID_Paciente', 'Fecha', 'TiempoComida', 'AlimentosJSON',
    'CaloriasTotales', 'ProteinasTotales', 'GrasasTotales',
    'CarbohidratosTotales', 'FibraTotal'
  ],
  Actividad_Fisica: [
    'ID', 'ID_Paciente', 'Fecha', 'TipoActividad', 'DuracionMinutos', 'CaloriasQuemadasEst'
  ],
  Chat_Soporte: ['ID', 'ID_Paciente', 'Mensaje', 'EnviadoPor', 'Fecha', 'Estado'],
  Config_Paciente: [
    'ID_Paciente', 'CaloriasObjetivo', 'ProteinaObjetivo_g', 'FactorActividad',
    'Estatura_cm', 'FechaNacimiento', 'Sexo', 'AjusteManual', 'FechaActualizacion', 'ActualizadoPor'
  ],
  Sesiones: ['Token', 'ID_Usuario', 'Rol', 'Tipo', 'Expira'],
  Evidencia_Cientifica: ['ID', 'Tema', 'Titulo', 'Resumen', 'NivelEvidencia', 'Enlace']
};

/* ===================================================================
   PUNTO DE ENTRADA DEL WEB APP
   =================================================================== */

/**
 * Google llama esta función al abrir la URL /exec.
 * @return {HtmlOutput} La aplicación de una sola página.
 */
function doGet() {
  var plantilla = HtmlService.createTemplateFromFile('Index');
  return plantilla
    .evaluate()
    .setTitle('NutriApp · Seguimiento nutricional')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Permite incrustar un archivo HTML dentro de otro desde la plantilla.
 * @param {string} nombre Nombre del archivo sin extensión.
 * @return {string} Su contenido ya evaluado.
 */
function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

/* ===================================================================
   ARRANQUE DE LA BASE DE DATOS
   =================================================================== */

/**
 * Crea la hoja de cálculo, todas las pestañas, el catálogo de alimentos, la
 * biblioteca de evidencia y el usuario nutriólogo inicial. Es idempotente:
 * ejecutarla dos veces no duplica nada.
 * @return {Object} Resumen de lo que se creó, visible en el registro.
 */
function setupDatabase() {
  var ss = obtenerHojaCalculo_();
  var creadas = [];

  Object.keys(ESQUEMA).forEach(function (nombre) {
    var hoja = ss.getSheetByName(nombre);
    if (!hoja) {
      hoja = ss.insertSheet(nombre);
      creadas.push(nombre);
    }
    escribirEncabezados_(hoja, ESQUEMA[nombre]);
  });

  var predeterminada = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1') || ss.getSheetByName('Hoja1');
  if (predeterminada && ss.getSheets().length > 1) {
    ss.deleteSheet(predeterminada);
  }

  var alimentos = sembrarAlimentos_();
  var evidencia = sembrarEvidencia_();
  var nutriologo = crearNutriologoInicial_();
  obtenerCarpetaDrive_();

  var resumen = {
    hojaCalculoUrl: ss.getUrl(),
    pestanasCreadas: creadas,
    alimentosCargados: alimentos,
    evidenciaCargada: evidencia,
    nutriologo: nutriologo
  };

  Logger.log('Base de datos lista.');
  Logger.log('Hoja de cálculo: ' + resumen.hojaCalculoUrl);
  Logger.log('Pestañas creadas: ' + (creadas.length ? creadas.join(', ') : 'ninguna, ya existían'));
  Logger.log('Alimentos cargados: ' + alimentos);
  Logger.log('Fichas de evidencia cargadas: ' + evidencia);
  if (nutriologo.passwordTemporal) {
    Logger.log('');
    Logger.log('USUARIO NUTRIOLOGO CREADO');
    Logger.log('  Correo: ' + nutriologo.email);
    Logger.log('  Contraseña temporal: ' + nutriologo.passwordTemporal);
    Logger.log('  Cámbiala desde la app después de entrar.');
  } else {
    Logger.log('El usuario nutriólogo ya existía: ' + nutriologo.email);
  }
  return resumen;
}

/**
 * Devuelve la hoja de cálculo de la base de datos y la crea la primera vez.
 * @return {Spreadsheet} La hoja de cálculo.
 */
function obtenerHojaCalculo_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_SPREADSHEET_ID);

  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      Logger.log('El ID guardado ya no abre (' + err.message + '), se crea una hoja nueva.');
    }
  }

  var ss = SpreadsheetApp.create(NOMBRE_BASE_DATOS);
  props.setProperty(PROP_SPREADSHEET_ID, ss.getId());
  return ss;
}

/**
 * Devuelve la carpeta de Drive para las evidencias y la crea la primera vez.
 * @return {Folder} La carpeta.
 */
function obtenerCarpetaDrive_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_CARPETA_ID);

  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (err) {
      Logger.log('La carpeta guardada ya no abre, se crea una nueva.');
    }
  }

  var carpeta = DriveApp.createFolder(NOMBRE_CARPETA_DRIVE);
  props.setProperty(PROP_CARPETA_ID, carpeta.getId());
  return carpeta;
}

/**
 * Escribe la fila de encabezados y le da formato, sin borrar los datos.
 * @param {Sheet} hoja La pestaña.
 * @param {Array<string>} encabezados Los nombres de columna.
 */
function escribirEncabezados_(hoja, encabezados) {
  var rango = hoja.getRange(1, 1, 1, encabezados.length);
  rango.setValues([encabezados]);
  rango.setFontWeight('bold').setBackground('#1f6f4f').setFontColor('#ffffff');
  hoja.setFrozenRows(1);
}

/* ===================================================================
   AYUDANTES DE LECTURA Y ESCRITURA
   =================================================================== */

/**
 * Devuelve una pestaña por nombre, creándola con su esquema si hiciera falta.
 * @param {string} nombre Nombre de la pestaña.
 * @return {Sheet} La pestaña.
 */
function hoja_(nombre) {
  var ss = obtenerHojaCalculo_();
  var hoja = ss.getSheetByName(nombre);
  if (!hoja) {
    hoja = ss.insertSheet(nombre);
    escribirEncabezados_(hoja, ESQUEMA[nombre] || []);
  }
  return hoja;
}

/**
 * Lee una pestaña completa y la devuelve como arreglo de objetos.
 * @param {string} nombre Nombre de la pestaña.
 * @return {Array<Object>} Una entrada por fila, con las columnas como llaves.
 */
function leerTabla_(nombre) {
  var hoja = hoja_(nombre);
  var ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) {
    return [];
  }
  var ancho = Math.max(hoja.getLastColumn(), 1);
  var datos = hoja.getRange(1, 1, ultimaFila, ancho).getValues();
  var encabezados = datos.shift();

  return datos.map(function (fila, indice) {
    var objeto = { _fila: indice + 2 };
    encabezados.forEach(function (llave, columna) {
      if (llave) {
        objeto[llave] = fila[columna];
      }
    });
    return objeto;
  });
}

/**
 * Agrega una fila respetando el orden de los encabezados del esquema.
 * @param {string} nombre Nombre de la pestaña.
 * @param {Object} registro Objeto con las llaves de las columnas.
 * @return {Object} El mismo registro.
 */
function agregarFila_(nombre, registro) {
  var hoja = hoja_(nombre);
  var encabezados = ESQUEMA[nombre];
  var fila = encabezados.map(function (llave) {
    return registro[llave] === undefined || registro[llave] === null ? '' : registro[llave];
  });
  hoja.appendRow(fila);
  return registro;
}

/**
 * Actualiza celdas puntuales de una fila ya existente.
 * @param {string} nombre Nombre de la pestaña.
 * @param {number} fila Número de fila en la hoja, base 1.
 * @param {Object} cambios Objeto con las columnas a modificar.
 */
function actualizarFila_(nombre, fila, cambios) {
  var hoja = hoja_(nombre);
  var encabezados = ESQUEMA[nombre];
  Object.keys(cambios).forEach(function (llave) {
    var columna = encabezados.indexOf(llave);
    if (columna >= 0) {
      hoja.getRange(fila, columna + 1).setValue(cambios[llave]);
    }
  });
}

/**
 * Genera un identificador corto y único para las filas nuevas.
 * @param {string} prefijo Dos o tres letras que identifican la tabla.
 * @return {string} Por ejemplo "REG-LX8K2M-417".
 */
function nuevoId_(prefijo) {
  var tiempo = Date.now().toString(36).toUpperCase();
  var azar = Math.floor(Math.random() * 1000);
  return prefijo + '-' + tiempo + '-' + azar;
}

/**
 * Convierte una fecha a texto "aaaa-mm-dd" en la zona horaria del proyecto.
 * @param {Date|string} fecha La fecha a convertir.
 * @return {string} La fecha en formato ISO corto.
 */
function aFechaISO_(fecha) {
  var d = fecha instanceof Date ? fecha : new Date(fecha);
  if (isNaN(d.getTime())) {
    return String(fecha);
  }
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/**
 * Convierte a número tolerando comas decimales, espacios y texto vacío.
 * @param {*} valor El valor recibido del formulario.
 * @return {number} El número, o 0 si no se pudo interpretar.
 */
function aNumero_(valor) {
  if (typeof valor === 'number') {
    return isNaN(valor) ? 0 : valor;
  }
  if (valor === null || valor === undefined || valor === '') {
    return 0;
  }
  var limpio = String(valor).replace(/[^0-9.,-]/g, '').replace(',', '.');
  var numero = parseFloat(limpio);
  return isNaN(numero) ? 0 : numero;
}

/**
 * Redondea a los decimales indicados y devuelve un número, no texto.
 * @param {number} valor El número.
 * @param {number} decimales Cuántos decimales conservar.
 * @return {number} El número redondeado.
 */
function redondear_(valor, decimales) {
  var factor = Math.pow(10, decimales || 0);
  return Math.round(valor * factor) / factor;
}
