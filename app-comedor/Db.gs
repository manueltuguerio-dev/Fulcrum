/**
 * TLTERMINALS · Comedor — capa de datos sobre Google Sheets.
 *
 * La hoja de cálculo se crea sola la primera vez y su id queda guardado en las
 * propiedades del script. Cada pestaña es una tabla; la primera fila son los
 * encabezados y funcionan como nombres de campo.
 */

var PROP_HOJA = 'ID_HOJA_CALCULO';
var PROP_CARPETA = 'ID_CARPETA_DRIVE';
var NOMBRE_CARPETA = 'Comedor TLTERMINALS';

var TABLAS = {
  Config: ['clave', 'valor'],
  Empleados: ['id', 'email', 'nombre', 'numeroNomina', 'area', 'rol', 'estado', 'token', 'creado'],
  Platillos: ['id', 'nombre', 'descripcion', 'imagen', 'tipo', 'permiteComplementos',
              'precio', 'activo', 'fijo'],
  Menus: ['fecha', 'estado', 'horaCorte', 'aviso', 'publicado', 'cerrado'],
  MenuItems: ['id', 'fecha', 'platilloId', 'orden', 'disponible', 'precioDia'],
  Pedidos: ['id', 'fecha', 'empleadoId', 'email', 'nombre', 'estado', 'principalId',
            'complementos', 'salsas', 'comentarios', 'importe', 'origen', 'condonado',
            'motivo', 'creado', 'actualizado'],
  Tarifas: ['id', 'empleadoId', 'platilloId', 'modo', 'valor', 'desde', 'hasta'],
  Bitacora: ['momento', 'actor', 'accion', 'entidad', 'detalle']
};

var CONFIG_INICIAL = {
  empresa: 'TLTERMINALS',
  horaCorte: '11:00',
  minutosRecordatorio: '60',
  maxComplementos: '2',
  avisoGeneral: ''
};

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
    libro = SpreadsheetApp.create('TLTERMINALS · Comedor — Base de datos');
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

  Object.keys(CONFIG_INICIAL).forEach(function (clave) {
    if (leerConfig(clave) === null) {
      escribirConfig(clave, CONFIG_INICIAL[clave]);
    }
  });

  // El primero que instala queda como administrador.
  var correo = Session.getEffectiveUser().getEmail();
  if (correo && buscarEmpleadoPorEmail_(correo) === null) {
    insertar_('Empleados', {
      id: nuevoId_(),
      email: correo.toLowerCase(),
      nombre: correo.split('@')[0],
      numeroNomina: '',
      area: '',
      rol: 'admin',
      estado: 'activo',
      token: nuevoToken_(),
      creado: ahora_()
    });
  }

  acomodarEnDrive_(libro);

  Logger.log('Base de datos lista: ' + libro.getUrl());
  Logger.log('Carpeta en Drive: ' + carpeta_().getUrl());
  return libro.getId();
}

/**
 * Carpeta de Drive donde vive todo: la base de datos, las fotos y los
 * reportes que se exportan. Se crea la primera vez.
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

/** Subcarpeta para las fotos de los platillos. @private */
function carpetaFotos_() {
  var raiz = carpeta_();
  var existentes = raiz.getFoldersByName('Fotos');
  return existentes.hasNext() ? existentes.next() : raiz.createFolder('Fotos');
}

/** Mueve la hoja de cálculo a la carpeta del comedor. @private */
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

/**
 * Lee una tabla completa como arreglo de objetos.
 * @param {string} nombre Pestaña.
 * @return {Array<Object>} Filas, cada una con _fila = número de renglón.
 * @private
 */
function leerTodo_(nombre) {
  var hoja = hoja_(nombre);
  var ultima = hoja.getLastRow();
  if (ultima < 2) {
    return [];
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
  return salida;
}

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
  return objeto;
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
  return fila;
}

/** Borra un renglón ya leído. @private */
function borrar_(nombre, fila) {
  hoja_(nombre).deleteRow(fila._fila);
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
  return buscar_(nombre, function (f) { return String(f.id) === String(id); });
}

function buscarEmpleadoPorEmail_(email) {
  var buscado = String(email || '').toLowerCase().trim();
  return buscar_('Empleados', function (f) {
    return String(f.email).toLowerCase().trim() === buscado;
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

function sumarDias_(fechaTexto, dias) {
  var partes = String(fechaTexto).split('-');
  var d = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
  d.setDate(d.getDate() + dias);
  return Utilities.formatDate(d, zona_(), 'yyyy-MM-dd');
}

/**
 * Convierte fecha 'yyyy-MM-dd' más hora 'HH:mm' en un objeto Date.
 * @private
 */
function momento_(fechaTexto, horaTexto) {
  var f = String(fechaTexto).split('-');
  var h = String(horaTexto || '00:00').split(':');
  return new Date(Number(f[0]), Number(f[1]) - 1, Number(f[2]),
                  Number(h[0]) || 0, Number(h[1]) || 0, 0);
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
  return t === 'SI' || t === 'SÍ' || t === 'TRUE' || t === 'VERDADERO' || t === 'X';
}

function listaDeTexto_(texto) {
  if (!texto) {
    return [];
  }
  return String(texto).split(',').map(function (t) { return t.trim(); })
    .filter(function (t) { return t !== ''; });
}
