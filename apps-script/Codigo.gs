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
var VERSION = 'v8-2026-08-08';   // debe coincidir con el que muestra la app

var COLECCIONES = ['clientes', 'cotizaciones', 'ventas', 'ordenes', 'facturas',
                   'pagos', 'proveedores', 'gastos', 'proyectos'];

/* ------------------------------------------------------------------ */
/*  Web app                                                            */
/* ------------------------------------------------------------------ */

/* Tamaños mínimos esperados: sirven para detectar un pegado incompleto. */
var MINIMOS = { 'Index': 20000, 'AppJs': 100000, 'LogoData': 40000 };

function doGet() {
  var problema = revisarArchivos_();
  if (problema) return HtmlService.createHtmlOutput(paginaError_(problema)).setTitle('Fulcrum ERP');

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
  return JSON.stringify({
    js: HtmlService.createHtmlOutputFromFile('AppJs').getContent(),
    logo: HtmlService.createHtmlOutputFromFile('LogoData').getContent().replace(/\s+$/, ''),
    version: VERSION
  });
}

/** Devuelve un texto con el problema encontrado, o '' si todo está bien. */
function revisarArchivos_() {
  var fallos = [];
  for (var nombre in MINIMOS) {
    var contenido = '';
    try {
      contenido = HtmlService.createHtmlOutputFromFile(nombre).getContent();
    } catch (e) {
      fallos.push('Falta el archivo <b>' + nombre + '</b> (créalo con «+ → HTML» y ese nombre exacto).');
      continue;
    }
    if (contenido.length < MINIMOS[nombre]) {
      fallos.push('El archivo <b>' + nombre + '</b> está incompleto: tiene ' +
        Math.round(contenido.length / 1024) + ' KB y debería tener al menos ' +
        Math.round(MINIMOS[nombre] / 1024) + ' KB. Vuelve a pegar su contenido completo.');
    }
  }
  var js = '';
  try { js = HtmlService.createHtmlOutputFromFile('AppJs').getContent(); } catch (e) {}
  if (js && js.indexOf('FULCRUM_JS_OK') === -1) {
    fallos.push('El archivo <b>AppJs</b> quedó cortado al final (falta la marca de cierre). ' +
      'Vuelve a copiarlo completo.');
  }
  return fallos.join('<br><br>');
}

function paginaError_(detalle) {
  return '<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:640px;margin:48px auto;' +
    'padding:24px;border:1px solid #cf3346;border-radius:14px;background:#fff5f6;color:#7c1420">' +
    '<h2 style="margin:0 0 12px">La instalación está incompleta</h2>' +
    '<div style="font-size:14px;line-height:1.6">' + detalle + '</div>' +
    '<p style="font-size:13px;color:#555;margin-top:18px">Después de corregirlo, vuelve a cargar esta página. ' +
    'No hace falta implementar de nuevo si solo cambiaste el contenido de los archivos ' +
    '(salvo que uses una implementación fijada a una versión).</p></div>';
}

/** Ejecuta esta función desde el editor para ver si los archivos están completos. */
function verificarInstalacion() {
  Logger.log('Version del servidor (Codigo.gs): ' + VERSION);
  for (var nombre in MINIMOS) {
    var kb = 0, existe = true;
    try { kb = HtmlService.createHtmlOutputFromFile(nombre).getContent().length / 1024; }
    catch (e) { existe = false; }
    Logger.log(nombre + ': ' + (existe ? kb.toFixed(1) + ' KB (mínimo ' +
      (MINIMOS[nombre] / 1024).toFixed(0) + ' KB) ' + (kb * 1024 >= MINIMOS[nombre] ? 'OK' : '¡INCOMPLETO!')
      : 'NO EXISTE'));
  }
  var p = revisarArchivos_();
  Logger.log(p ? 'Resultado: hay problemas.' : 'Resultado: todo correcto.');
  Logger.log('Recuerda: la URL que termina en /exec sirve la VERSION IMPLEMENTADA. ' +
             'Si acabas de cambiar los archivos, usa la URL de prueba (/dev) o crea una NUEVA VERSION ' +
             'en Implementar -> Gestionar implementaciones.');
  return p || 'OK';
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
