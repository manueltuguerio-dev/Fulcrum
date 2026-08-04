/**
 * TLTERMINALS · Tarifarios de transportistas — capa de datos sobre Google Sheets.
 *
 * La hoja de cálculo se crea sola la primera vez y su id queda guardado en las
 * propiedades del script. Cada pestaña es una tabla; la primera fila son los
 * encabezados y funcionan como nombres de campo.
 */

var PROP_HOJA = 'ID_HOJA_CALCULO';
var PROP_CARPETA = 'ID_CARPETA_DRIVE';
var NOMBRE_CARPETA = 'Tarifarios TLTERMINALS';

var TABLAS = {
  Config: ['clave', 'valor'],
  Usuarios: ['id', 'email', 'nombre', 'rol', 'estado', 'token', 'creado'],
  Proveedores: ['id', 'nombre', 'rfc', 'contacto', 'telefono', 'correo', 'ciudad',
                'calificacion', 'estado', 'notas', 'creado', 'extras'],
  Rutas: ['id', 'origen', 'destino', 'km', 'notas', 'estado', 'creado'],
  Catalogos: ['id', 'tipo', 'clave', 'nombre', 'orden', 'estado'],
  Campos: ['id', 'ambito', 'clave', 'etiqueta', 'tipo', 'opciones', 'compara', 'orden',
           'estado'],
  Tarifas: ['id', 'proveedorId', 'rutaId', 'mercancia', 'equipo', 'moneda', 'tarifa',
            'combustiblePct', 'casetas', 'maniobras', 'otros', 'tiempoHoras',
            'capacidadTon', 'vigenciaDesde', 'vigenciaHasta', 'estado', 'notas',
            'actualizado', 'movimiento', 'extras'],
  Bitacora: ['momento', 'actor', 'accion', 'entidad', 'detalle']
};

// Las columnas nuevas se agregan siempre AL FINAL de su tabla. Los datos se leen
// por posición, así que meter una columna en medio recorrería todo lo capturado.


var CONFIG_INICIAL = {
  empresa: 'TLTERMINALS',
  monedaBase: 'MXN',
  tipoCambioUSD: '17.50',
  tipoCambioAuto: 'SI',
  tipoCambioFecha: '',
  tipoCambioOrigen: 'manual',
  pesoPrecio: '70',
  pesoTiempo: '30',
  diasAvisoVencimiento: '30'
};

/**
 * Catálogos que se cargan solos en la instalación. Se pueden editar después.
 * Son los tres ejes con los que se decide qué tarifas compiten entre sí: qué se
 * mueve, en qué se mueve y si el viaje es sencillo o de ida y vuelta.
 */
var CATALOGO_INICIAL = {
  equipo: [
    ['sencillo', 'Sencillo'],
    ['full', 'Full'],
    ['ftl53', "FTL 53'"],
    ['torton', 'Torton'],
    ['rabon', 'Rabón'],
    ['plataforma', 'Plataforma'],
    ['lowboy', 'Low boy'],
    ['refrigerado', 'Caja refrigerada']
  ],
  mercancia: [
    ['general', 'General'],
    ['peligrosa', 'Peligrosa'],
    ['generalsobrepeso', 'General / sobre peso'],
    ['refrigerada', 'Refrigerada'],
    ['granel', 'Granel'],
    ['sobredimensionada', 'Sobredimensionada'],
    ['altovalor', 'Alto valor']
  ],
  movimiento: [
    ['redondo', 'Redondo'],
    ['oneway', 'One way']
  ]
};

/**
 * Campos personalizados que vienen de fábrica, porque el tarifario del que
 * salió este sistema ya los traía. Se pueden borrar o agregar más.
 */
var CAMPOS_INICIALES = [
  { ambito: 'tarifa', clave: 'cuenta', etiqueta: 'Cuenta', tipo: 'texto',
    opciones: '', compara: 'NO', orden: 1 },
  { ambito: 'tarifa', clave: 'revisada', etiqueta: 'Revisión de tarifa', tipo: 'si_no',
    opciones: '', compara: 'NO', orden: 2 }
];

/**
 * Crea la hoja de cálculo y las pestañas si aún no existen. Es idempotente:
 * ejecutarla de nuevo no borra nada.
 * @return {string} Id de la hoja de cálculo.
 */
function instalar() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_HOJA);
  var libro;

  if (id) {
    try {
      libro = SpreadsheetApp.openById(id);
    } catch (err) {
      libro = null;
    }
  }
  if (!libro) {
    libro = SpreadsheetApp.create('TLTERMINALS · Tarifarios — Base de datos');
    props.setProperty(PROP_HOJA, libro.getId());
  }

  Object.keys(TABLAS).forEach(function (nombre) {
    var hoja = libro.getSheetByName(nombre);
    if (!hoja) {
      hoja = libro.insertSheet(nombre);
    }
    var encabezados = TABLAS[nombre];
    var actuales = hoja.getLastColumn() > 0
      ? hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0] : [];
    if (actuales.join('|') !== encabezados.join('|')) {
      hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
      hoja.getRange(1, 1, 1, encabezados.length).setFontWeight('bold');
      hoja.setFrozenRows(1);
    }
  });

  var vacia = libro.getSheetByName('Hoja 1') || libro.getSheetByName('Sheet1');
  if (vacia && libro.getSheets().length > 1) {
    libro.deleteSheet(vacia);
  }

  olvidarCache_();

  Object.keys(CONFIG_INICIAL).forEach(function (clave) {
    if (leerConfig(clave) === null) {
      escribirConfig(clave, CONFIG_INICIAL[clave]);
    }
  });

  Object.keys(CATALOGO_INICIAL).forEach(function (tipo) {
    CATALOGO_INICIAL[tipo].forEach(function (par, i) {
      if (!buscarCatalogo_(tipo, par[0])) {
        insertar_('Catalogos', {
          id: nuevoId_(), tipo: tipo, clave: par[0], nombre: par[1],
          orden: i + 1, estado: 'activo'
        });
      }
    });
  });

  CAMPOS_INICIALES.forEach(function (campo) {
    if (!buscarCampo_(campo.ambito, campo.clave)) {
      insertar_('Campos', {
        id: nuevoId_(), ambito: campo.ambito, clave: campo.clave,
        etiqueta: campo.etiqueta, tipo: campo.tipo, opciones: campo.opciones,
        compara: campo.compara, orden: campo.orden, estado: 'activo'
      });
    }
  });

  // El primero que instala queda como administrador.
  var correo = Session.getEffectiveUser().getEmail();
  if (correo && buscarUsuarioPorEmail_(correo) === null) {
    insertar_('Usuarios', {
      id: nuevoId_(),
      email: correo.toLowerCase(),
      nombre: correo.split('@')[0],
      rol: 'admin',
      estado: 'activo',
      token: nuevoToken_(),
      creado: ahora_()
    });
  }

  migrar_();
  acomodarEnDrive_(libro);

  Logger.log('Base de datos lista: ' + libro.getUrl());
  Logger.log('Carpeta en Drive: ' + carpeta_().getUrl());
  return libro.getId();
}

/**
 * Pone al día lo que ya estaba capturado cuando el sistema gana columnas.
 * Es idempotente: correrla de nuevo no hace nada.
 * @private
 */
function migrar_() {
  // El tipo de movimiento llegó después. Lo capturado antes era todo redondo,
  // que es como se venía trabajando.
  var pendientes = leerTodo_('Tarifas').filter(function (t) {
    return texto_(t.movimiento) === '';
  });
  if (!pendientes.length) {
    return;
  }
  var hoja = hoja_('Tarifas');
  var columna = TABLAS.Tarifas.indexOf('movimiento') + 1;
  pendientes.forEach(function (t) {
    hoja.getRange(t._fila, columna).setValue('redondo');
  });
  olvidarCache_('Tarifas');
  Logger.log('Marqué como "redondo" ' + pendientes.length + ' tarifas que no tenían movimiento.');
}

/**
 * Carpeta de Drive donde vive todo: la base de datos y los archivos que se
 * exportan. Se crea la primera vez.
 * @return {Folder}
 */
function carpeta_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_CARPETA);
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (err) {
      // se borró: se vuelve a crear abajo
    }
  }
  var nueva = DriveApp.createFolder(NOMBRE_CARPETA);
  props.setProperty(PROP_CARPETA, nueva.getId());
  return nueva;
}

/** Mueve la hoja de cálculo a la carpeta de tarifarios. @private */
function acomodarEnDrive_(libro) {
  try {
    DriveApp.getFileById(libro.getId()).moveTo(carpeta_());
  } catch (err) {
    Logger.log('No pude mover la hoja a la carpeta: ' + err.message);
  }
}

/** @return {Spreadsheet} El libro, instalándolo si hace falta. @private */
function libro_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_HOJA);
  if (!id) {
    id = instalar();
  }
  return SpreadsheetApp.openById(id);
}

/** @return {Sheet} La pestaña pedida. @private */
function hoja_(nombre) {
  var hoja = libro_().getSheetByName(nombre);
  if (!hoja) {
    instalar();
    hoja = libro_().getSheetByName(nombre);
  }
  return hoja;
}

/* --------------------------------- lectura -------------------------------- */

/**
 * Copia en memoria de las tablas ya leídas. Comparar tarifas obliga a recorrer
 * las mismas tablas muchas veces en una sola llamada, y leer Sheets es lo caro.
 * En Apps Script las variables globales viven solo lo que dura la ejecución,
 * así que esto no se comparte entre usuarios ni se queda viejo.
 * @private
 */
var CACHE_TABLAS = {};

function olvidarCache_(nombre) {
  if (nombre) {
    delete CACHE_TABLAS[nombre];
  } else {
    CACHE_TABLAS = {};
  }
}

/**
 * Lee una tabla completa como arreglo de objetos.
 * @param {string} nombre Pestaña.
 * @return {Array<Object>} Filas, cada una con _fila = número de renglón.
 * @private
 */
function leerTodo_(nombre) {
  if (CACHE_TABLAS[nombre]) {
    return CACHE_TABLAS[nombre];
  }
  var hoja = hoja_(nombre);
  var ultima = hoja.getLastRow();
  if (ultima < 2) {
    CACHE_TABLAS[nombre] = [];
    return CACHE_TABLAS[nombre];
  }
  var campos = TABLAS[nombre];
  var datos = hoja.getRange(2, 1, ultima - 1, campos.length).getValues();
  var salida = [];
  for (var i = 0; i < datos.length; i++) {
    var fila = {};
    var vacia = true;
    for (var j = 0; j < campos.length; j++) {
      var valor = datos[i][j];
      fila[campos[j]] = valor === null ? '' : valor;
      if (valor !== '' && valor !== null) {
        vacia = false;
      }
    }
    if (!vacia) {
      fila._fila = i + 2;
      salida.push(fila);
    }
  }
  CACHE_TABLAS[nombre] = salida;
  return salida;
}

/* -------------------------------- escritura ------------------------------- */

/**
 * Agrega un renglón.
 * @private
 */
function insertar_(nombre, objeto) {
  var campos = TABLAS[nombre];
  var renglon = campos.map(function (campo) {
    return objeto[campo] === undefined ? '' : objeto[campo];
  });
  hoja_(nombre).appendRow(renglon);
  olvidarCache_(nombre);
  return objeto;
}

/**
 * Agrega varios renglones de un jalón. Importar un tarifario completo renglón
 * por renglón se pasa del tiempo máximo de ejecución.
 * @private
 */
function insertarVarios_(nombre, objetos) {
  if (!objetos.length) {
    return 0;
  }
  var campos = TABLAS[nombre];
  var renglones = objetos.map(function (objeto) {
    return campos.map(function (campo) {
      return objeto[campo] === undefined ? '' : objeto[campo];
    });
  });
  var hoja = hoja_(nombre);
  hoja.getRange(hoja.getLastRow() + 1, 1, renglones.length, campos.length)
    .setValues(renglones);
  olvidarCache_(nombre);
  return renglones.length;
}

/**
 * Actualiza un renglón ya leído (necesita _fila).
 * @private
 */
function actualizar_(nombre, fila, cambios) {
  var campos = TABLAS[nombre];
  Object.keys(cambios).forEach(function (campo) {
    fila[campo] = cambios[campo];
  });
  var renglon = campos.map(function (campo) {
    return fila[campo] === undefined ? '' : fila[campo];
  });
  hoja_(nombre).getRange(fila._fila, 1, 1, campos.length).setValues([renglon]);
  olvidarCache_(nombre);
  return fila;
}

/** Borra un renglón ya leído. @private */
function borrar_(nombre, fila) {
  hoja_(nombre).deleteRow(fila._fila);
  olvidarCache_(nombre);
}

/** Busca el primer renglón que cumpla la condición. @private */
function buscar_(nombre, condicion) {
  var filas = leerTodo_(nombre);
  for (var i = 0; i < filas.length; i++) {
    if (condicion(filas[i])) {
      return filas[i];
    }
  }
  return null;
}

function buscarPorId_(nombre, id) {
  var buscado = String(id || '').trim();
  if (!buscado) {
    return null;
  }
  return buscar_(nombre, function (f) { return String(f.id).trim() === buscado; });
}

function buscarUsuarioPorEmail_(email) {
  var buscado = String(email || '').toLowerCase().trim();
  if (!buscado) {
    return null;
  }
  return buscar_('Usuarios', function (f) {
    return String(f.email).toLowerCase().trim() === buscado;
  });
}

function buscarCampo_(ambito, clave) {
  var a = String(ambito);
  var c = normalizar_(clave);
  if (!c) {
    return null;
  }
  return buscar_('Campos', function (f) {
    return String(f.ambito) === a && normalizar_(f.clave) === c;
  });
}

function buscarCatalogo_(tipo, clave) {
  var t = String(tipo);
  var c = normalizar_(clave);
  if (!c) {
    return null;
  }
  return buscar_('Catalogos', function (f) {
    return String(f.tipo) === t && normalizar_(f.clave) === c;
  });
}

/* ------------------------------ configuración ------------------------------ */

function leerConfig(clave) {
  var fila = buscar_('Config', function (f) { return f.clave === clave; });
  return fila ? String(fila.valor) : null;
}

function escribirConfig(clave, valor) {
  var fila = buscar_('Config', function (f) { return f.clave === clave; });
  if (fila) {
    actualizar_('Config', fila, { valor: valor });
  } else {
    insertar_('Config', { clave: clave, valor: valor });
  }
}

function configCompleta_() {
  var salida = {};
  leerTodo_('Config').forEach(function (f) { salida[f.clave] = String(f.valor); });
  return salida;
}

/* --------------------------------- apoyo ---------------------------------- */

function nuevoId_() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 10);
}

/**
 * Token de acceso personal. Es lo que identifica a quien entra con un correo
 * externo, así que se hace largo a propósito.
 * @private
 */
function nuevoToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function zona_() {
  return Session.getScriptTimeZone() || 'America/Mexico_City';
}

function ahora_() {
  return Utilities.formatDate(new Date(), zona_(), 'yyyy-MM-dd HH:mm:ss');
}

function hoyTexto_() {
  return Utilities.formatDate(new Date(), zona_(), 'yyyy-MM-dd');
}

/**
 * Normaliza texto para comparar: sin acentos, sin mayúsculas y sin nada que no
 * sea letra o número. Es lo que permite que "Cd. Juárez" y "cd juarez" se
 * reconozcan como el mismo lugar al importar.
 * @private
 */
function normalizar_(texto) {
  return String(texto === null || texto === undefined ? '' : texto)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Limpia espacios y convierte a texto lo que Sheets pudo traer como número. */
function texto_(valor) {
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, zona_(), 'yyyy-MM-dd');
  }
  return String(valor === null || valor === undefined ? '' : valor).trim();
}

/**
 * Convierte a número lo que venga: "$1,234.50", "1 234,50", "18%" o ya un
 * número. Devuelve el valor de reserva cuando no hay nada aprovechable.
 * @private
 */
function numero_(valor, reserva) {
  var falla = reserva === undefined ? 0 : reserva;
  if (typeof valor === 'number') {
    return isNaN(valor) ? falla : valor;
  }
  var t = String(valor === null || valor === undefined ? '' : valor)
    .replace(/[^0-9,.\-]/g, '').trim();
  if (t === '' || t === '-') {
    return falla;
  }
  var coma = t.lastIndexOf(',');
  var punto = t.lastIndexOf('.');
  if (coma > -1 && punto > -1) {
    // El separador decimal es el que aparece más a la derecha.
    t = coma > punto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (coma > -1) {
    // Una sola coma con dos decimales o menos es decimal; si no, son miles.
    t = /,\d{1,2}$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, '');
  }
  var n = parseFloat(t);
  return isNaN(n) ? falla : n;
}

/**
 * Convierte a fecha 'yyyy-MM-dd' lo que venga: un Date de Sheets, texto ISO o
 * el formato mexicano dd/mm/yyyy.
 * @return {string} La fecha, o '' si no se entendió.
 * @private
 */
function fecha_(valor) {
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, zona_(), 'yyyy-MM-dd');
  }
  var t = String(valor === null || valor === undefined ? '' : valor).trim();
  if (!t) {
    return '';
  }
  var iso = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    return iso[1] + '-' + relleno_(iso[2]) + '-' + relleno_(iso[3]);
  }
  var mx = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (mx) {
    var anio = mx[3].length === 2 ? '20' + mx[3] : mx[3];
    return anio + '-' + relleno_(mx[2]) + '-' + relleno_(mx[1]);
  }
  return '';
}

function relleno_(n) {
  return String(n).length < 2 ? '0' + String(n) : String(n);
}

function bitacora_(accion, entidad, detalle) {
  var actor = '';
  try {
    actor = Session.getActiveUser().getEmail();
  } catch (err) {
    actor = 'sistema';
  }
  insertar_('Bitacora', {
    momento: ahora_(),
    actor: actor || 'sistema',
    accion: accion,
    entidad: entidad,
    detalle: typeof detalle === 'string' ? detalle : JSON.stringify(detalle)
  });
}

function esSi_(valor) {
  var t = String(valor).toUpperCase().trim();
  return t === 'SI' || t === 'SÍ' || t === 'TRUE' || t === 'VERDADERO' || t === 'X'
    || t === 'ACTIVO' || t === '1';
}

function redondear_(n, decimales) {
  var f = Math.pow(10, decimales === undefined ? 2 : decimales);
  return Math.round((Number(n) || 0) * f) / f;
}
