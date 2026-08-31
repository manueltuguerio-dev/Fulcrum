/**
 * Fulcrum ERP · servidor (Google Apps Script)
 *
 * La base de datos vive en una hoja de cálculo:
 *   _DB     → estado completo en JSON (fuente de verdad, en trozos)
 *   _SNAPS  → cierres de mes guardados
 *   Además se escriben hojas legibles (Cotizaciones, Facturas, …) para consultar los datos.
 */

var DB_SHEET = '_DB';
var SNAP_SHEET = '_SNAPS';
var CHUNK = 40000;              // caracteres por celda (el límite real es 50 000)
var CARPETA_DRIVE = 'Fulcrum ERP';
var REMITENTE = 'ADMINISTRACION@COMERCIALIZADORAFULCRUM.COM.MX';
var NOMBRE_REMITENTE = 'Comercializadora Fulcrum';
var VERSION = 'v19-2026-08-31';   // debe coincidir con el que muestra la app

var COLECCIONES = ['integrantes', 'clientes', 'cotizaciones', 'ventas', 'ordenes', 'facturas',
                   'pagos', 'proveedores', 'gastos', 'proyectos'];

/* ------------------------------------------------------------------ */
/*  Web app                                                            */
/* ------------------------------------------------------------------ */

function doGet() {
  // Siempre se sirve la página. Si faltara algún archivo, el cargador lo dirá con el
  // error real del servidor; bloquear aquí ocultaba la causa y daba falsos negativos.
  // Sin plantillas: la página no lleva código incrustado, así que no hay nada que evaluar.
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Fulcrum ERP')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Permite insertar un archivo HTML dentro de otro. */
function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

/**
 * Entrega el código de la aplicación y el logotipo como TEXTO.
 *
 * La página que sirve Apps Script solo lleva estilos y estructura; el código
 * llega por aquí y el navegador lo inyecta como script. Así nunca se interpreta
 * como HTML, que era lo que rompía la carga.
 */
function getRecursos() {
  var js = leerArchivo_(['AppJs', 'AppJs.html', 'appjs', 'Appjs', 'APPJS', 'JavaScript']);
  if (js === null) {
    throw new Error('No se encontró el archivo AppJs. Créalo con «+ → HTML», nómbralo ' +
      'exactamente AppJs y pega dentro el contenido de AppJs.html.');
  }
  // El logotipo es opcional: si falta, la app funciona y muestra el nombre en texto.
  var logo = leerArchivo_(['LogoData', 'LogoData.html', 'logodata', 'Logo']);
  return JSON.stringify({
    js: js,
    logo: logo ? logo.replace(/^\s+|\s+$/g, '') : '',
    version: VERSION
  });
}

/** Lee el primer archivo que exista de la lista; devuelve null si no hay ninguno. */
function leerArchivo_(nombres) {
  var ultimoError = '';
  for (var i = 0; i < nombres.length; i++) {
    try {
      var c = HtmlService.createHtmlOutputFromFile(nombres[i]).getContent();
      if (c && c.length) return desenvolver_(c);
    } catch (e) { ultimoError = e && e.message ? e.message : String(e); }
  }
  if (ultimoError) Logger.log('Ultimo error al leer ' + nombres[0] + ': ' + ultimoError);
  return null;
}

/** Quita la envoltura <script> ... </script> y devuelve solo el contenido. */
function desenvolver_(texto) {
  var ini = texto.indexOf('>', texto.indexOf('<script'));
  var fin = texto.lastIndexOf('</script');
  if (texto.indexOf('<script') !== -1 && ini !== -1 && fin > ini) {
    return texto.substring(ini + 1, fin);
  }
  return texto;   // archivos sin envoltura (versiones anteriores) siguen funcionando
}

/** Ejecuta esta función desde el editor para revisar la instalación. */
function verificarInstalacion() {
  Logger.log('Version del servidor (Codigo.gs): ' + VERSION);

  var js = leerArchivo_(['AppJs', 'AppJs.html', 'appjs', 'Appjs', 'APPJS', 'JavaScript']);
  var logo = leerArchivo_(['LogoData', 'LogoData.html', 'logodata', 'Logo']);

  if (js === null) {
    Logger.log('AppJs: NO SE ENCUENTRA. Crea un archivo HTML llamado exactamente AppJs.');
  } else {
    Logger.log('AppJs: ' + (js.length / 1024).toFixed(1) + ' KB ' +
      (js.length >= 100000 ? 'OK' : '¡PARECE INCOMPLETO! (deberia rondar 124 KB)'));
    Logger.log('AppJs termina con la marca de cierre: ' +
      (js.indexOf('FULCRUM_JS_OK') !== -1 ? 'SI' : 'NO (el pegado quedo cortado)'));
  }
  Logger.log('LogoData: ' + (logo === null ? 'no encontrado (opcional; se usara el nombre en texto)'
    : (logo.length / 1024).toFixed(1) + ' KB'));

  var idx = leerArchivo_(['Index', 'Index.html']);
  Logger.log('Index: ' + (idx === null ? 'NO SE ENCUENTRA' : (idx.length / 1024).toFixed(1) + ' KB'));

  Logger.log('Recuerda: la URL que termina en /exec sirve la VERSION IMPLEMENTADA. ' +
             'Si acabas de cambiar los archivos, usa la URL de prueba (/dev) o crea una NUEVA VERSION ' +
             'en Implementar -> Gestionar implementaciones.');
  return js !== null && js.length >= 100000 ? 'OK' : 'Revisa el registro';
}

/* ------------------------------------------------------------------ */
/*  Hoja de cálculo                                                    */
/* ------------------------------------------------------------------ */

/** Devuelve la hoja de cálculo de datos; la crea la primera vez. */
function getDb_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* se recrea abajo */ }
  }
  var ss = null;
  try { ss = SpreadsheetApp.getActive(); } catch (e) { ss = null; }
  if (!ss) ss = SpreadsheetApp.create('Fulcrum ERP · Base de datos');
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function hoja_(ss, nombre) {
  var sh = ss.getSheetByName(nombre);
  if (!sh) sh = ss.insertSheet(nombre);
  return sh;
}

/** Lee un texto largo guardado en trozos. */
function leerBlob_(nombre) {
  var sh = getDb_().getSheetByName(nombre);
  if (!sh) return '';
  var n = sh.getLastRow();
  if (n < 1) return '';
  var filas = sh.getRange(1, 1, n, 1).getValues();
  var out = [];
  for (var i = 0; i < filas.length; i++) out.push(String(filas[i][0] || ''));
  return out.join('');
}

/** Guarda un texto largo partido en trozos (formato texto para no alterar nada). */
function escribirBlob_(nombre, texto) {
  var sh = hoja_(getDb_(), nombre);
  sh.clear();
  texto = texto || '';
  var trozos = [];
  for (var i = 0; i < texto.length; i += CHUNK) trozos.push([texto.substring(i, i + CHUNK)]);
  if (!trozos.length) trozos.push(['']);
  var rango = sh.getRange(1, 1, trozos.length, 1);
  rango.setNumberFormat('@');   // evita que Sheets reinterprete fechas o números
  rango.setValues(trozos);
  sh.hideSheet();
}

/* ------------------------------------------------------------------ */
/*  API que consume la interfaz                                        */
/* ------------------------------------------------------------------ */

/** Devuelve {state, snaps} en JSON. */
function getState() {
  var estado = leerBlob_(DB_SHEET);
  var cierres = leerBlob_(SNAP_SHEET);
  return JSON.stringify({
    state: estado ? JSON.parse(estado) : null,
    snaps: cierres ? JSON.parse(cierres) : []
  });
}

/** Guarda el estado completo y regenera las hojas legibles. */
function saveState(json) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    escribirBlob_(DB_SHEET, json);
    try { espejo_(JSON.parse(json)); } catch (e) { /* el espejo es opcional */ }
    return true;
  } finally {
    lock.releaseLock();
  }
}

/** Guarda los cierres de mes. */
function saveSnaps(json) {
  escribirBlob_(SNAP_SHEET, json);
  return true;
}

/**
 * Escribe hojas legibles (una por colección) para poder consultar los datos
 * en la hoja de cálculo. Son de solo lectura: la app siempre usa _DB.
 */
function espejo_(state) {
  var ss = getDb_();
  COLECCIONES.forEach(function (nombre) {
    var datos = state && state[nombre];
    if (!Array.isArray(datos)) return;
    var titulo = nombre.charAt(0).toUpperCase() + nombre.slice(1);
    var sh = hoja_(ss, titulo);
    sh.clear();
    if (!datos.length) return;

    var columnas = [];
    datos.forEach(function (fila) {
      Object.keys(fila).forEach(function (k) {
        if (columnas.indexOf(k) === -1) columnas.push(k);
      });
    });

    var filas = [columnas];
    datos.forEach(function (r) {
      filas.push(columnas.map(function (c) {
        var v = r[c];
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return JSON.stringify(v);
        return v;
      }));
    });

    var rango = sh.getRange(1, 1, filas.length, columnas.length);
    rango.setNumberFormat('@');
    rango.setValues(filas);
    sh.getRange(1, 1, 1, columnas.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
}

/* ------------------------------------------------------------------ */
/*  PDF: Drive y correo                                                */
/* ------------------------------------------------------------------ */

function pdfBlob_(nombreArchivo, base64) {
  var bytes = Utilities.base64Decode(base64);
  return Utilities.newBlob(bytes, 'application/pdf', nombreArchivo);
}

function carpeta_() {
  var it = DriveApp.getFoldersByName(CARPETA_DRIVE);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CARPETA_DRIVE);
}

/** Guarda el PDF en Drive y devuelve su URL. */
function savePdfToDrive(nombreArchivo, base64) {
  var archivo = carpeta_().createFile(pdfBlob_(nombreArchivo, base64));
  return archivo.getUrl();
}

/**
 * Envía el PDF adjunto por correo.
 *
 * El remitente es REMITENTE si esa dirección está dada de alta en Gmail
 * (Configuración → Cuentas → «Enviar como»). Si no lo está, Google no permite
 * falsificar el remitente: se envía desde la cuenta que ejecuta la app, pero el
 * nombre visible y el «responder a» apuntan a REMITENTE.
 */
function emailPdf(para, asunto, mensaje, nombreArchivo, base64) {
  if (!para) throw new Error('Falta el destinatario');

  var opciones = {
    attachments: [pdfBlob_(nombreArchivo, base64)],
    name: NOMBRE_REMITENTE,
    replyTo: REMITENTE
  };

  var alias = GmailApp.getAliases();
  if (alias.indexOf(REMITENTE) !== -1) {
    opciones.from = REMITENTE;                       // alias verificado: sí se puede
  } else if (Session.getActiveUser().getEmail() !== REMITENTE) {
    Logger.log('Aviso: ' + REMITENTE + ' no está dado de alta como alias; ' +
               'se envía desde la cuenta actual con «responder a» a esa dirección.');
  }

  GmailApp.sendEmail(para, asunto || nombreArchivo, mensaje || '', opciones);
  return true;
}

/** Muestra los alias disponibles (útil para verificar el remitente). */
function aliasDisponibles() {
  var a = GmailApp.getAliases();
  Logger.log('Cuenta: ' + Session.getActiveUser().getEmail());
  Logger.log('Alias: ' + (a.length ? a.join(', ') : '(ninguno)'));
  Logger.log(a.indexOf(REMITENTE) !== -1
    ? 'OK: los correos saldrán desde ' + REMITENTE
    : 'Falta dar de alta ' + REMITENTE + ' en Gmail → Configuración → Cuentas → «Enviar como».');
  return a;
}

/* ------------------------------------------------------------------ */
/*  Utilidades                                                         */
/* ------------------------------------------------------------------ */

/** Abre la hoja de cálculo de datos (útil desde el editor de Apps Script). */
function urlDeLaBase() {
  var url = getDb_().getUrl();
  Logger.log(url);
  return url;
}

/** Borra todo el contenido guardado. Ejecutar a mano si se quiere empezar de cero. */
function borrarTodo() {
  escribirBlob_(DB_SHEET, '');
  escribirBlob_(SNAP_SHEET, '');
  return true;
}
