/**
 * TLTERMINALS · Almacén y Patio — capa de datos sobre Google Sheets.
 *
 * Sistema de registro de tiempos de maniobra (WMS-Lite). La hoja de cálculo se
 * crea sola la primera vez y su id queda guardado en las propiedades del
 * script. Cada pestaña es una tabla; la primera fila son los encabezados y
 * funcionan como nombres de campo.
 *
 * Los encabezados que se muestran en Sheets se mantienen legibles pero los
 * usamos también como llaves en el código, igual que en el resto del proyecto.
 */

var PROP_HOJA = 'ID_HOJA_ALMACEN';
var PROP_CARPETA = 'ID_CARPETA_ALMACEN';
var NOMBRE_CARPETA = 'Almacén TLTERMINALS';

/**
 * Esquema de la base. El orden importa: es el orden real de las columnas.
 * REGISTRO conserva las columnas de negocio del acta de maniobra y agrega al
 * final unas columnas internas (estado del cronómetro, marcas de tiempo en
 * milisegundos y campos dinámicos) que la app necesita para no perder el conteo.
 */
var TABLAS = {
  Config: ['clave', 'valor'],

  USUARIOS: ['id', 'nombre', 'email', 'pinHash', 'passHash', 'salt',
             'rol', 'estado', 'creado'],

  CATALOGOS: ['id', 'tipo', 'valor', 'extra', 'orden', 'activo'],

  REGISTRO: [
    'id', 'folio', 'fecha', 'turno', 'cliente', 'flujo', 'etapa',
    'tipoEquipo', 'noUnidad', 'cantEquipos', 'material', 'presentacion',
    'cantPiezas', 'unidadMedida', 'tarimas', 'pesoTons',
    'montacarguistas', 'numMontac', 'ayudantes', 'numAyud',
    'tipoMontacargas', 'numMontacargas',
    'horaInicio', 'horaFin', 'tiempoTotalMin', 'demoraMin', 'causaDemora',
    'tiempoEfectivoMin', 'minPorPieza', 'observaciones',
    'danoLlegada', 'danoManiobra', 'detalleDano',
    'estado', 'inicioMs', 'finMs', 'pausaAbiertaMs', 'demoraAcumMs',
    'pausasJson', 'camposJson', 'operadorId', 'creado', 'actualizado'
  ],

  LOG_AUDITORIA: ['id', 'folio', 'usuario', 'accion', 'campo',
                  'valorAnterior', 'valorNuevo', 'fechaHora'],

  CAMPOS_CUSTOM: ['id', 'clave', 'etiqueta', 'tipo', 'opciones', 'orden', 'activo'],

  SESIONES: ['token', 'usuarioId', 'creado', 'expira']
};

var CONFIG_INICIAL = {
  empresa: 'TLTERMINALS',
  slaVerde: '45',   // <= verde
  slaAmbar: '90',   // <= ámbar; por encima, rojo
  horasSesion: '12'
};

/* -------------------------------- instalación ------------------------------ */

/**
 * Crea la hoja de cálculo y las pestañas si aún no existen. Es idempotente:
 * ejecutarla de nuevo no borra datos, solo completa lo que falte.
 * @return {string} Id de la hoja de cálculo.
 */
function instalar() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_HOJA);
  var libro = null;

  if (id) {
    try {
      libro = SpreadsheetApp.openById(id);
    } catch (err) {
      libro = null;
    }
  }
  if (!libro) {
    libro = SpreadsheetApp.create('TLTERMINALS · Almacén — Base de datos');
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

  // El primero que instala queda como MASTER, para poder entrar y crear al resto.
  var correo = Session.getEffectiveUser().getEmail();
  if (correo && buscarUsuarioPorEmail_(correo) === null) {
    var sal = nuevoToken_();
    insertar_('USUARIOS', {
      id: nuevoId_(),
      nombre: correo.split('@')[0],
      email: correo.toLowerCase(),
      pinHash: '',
      passHash: hashear_('almacen', sal), // contraseña temporal: "almacen"
      salt: sal,
      rol: 'MASTER',
      estado: 'activo',
      creado: ahora_()
    });
    Logger.log('Se creó al MASTER ' + correo + ' con contraseña temporal "almacen".');
  }

  acomodarEnDrive_(libro);

  Logger.log('Base de datos lista: ' + libro.getUrl());
  Logger.log('Carpeta en Drive: ' + carpeta_().getUrl());
  return libro.getId();
}

/* ----------------------------------- Drive --------------------------------- */

/**
 * Carpeta raíz en Drive: la base de datos, las fotos y los reportes viven aquí.
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

/** Subcarpeta 'Fotos' y, dentro, una por folio. @private */
function carpetaDeFolio_(folio) {
  var raiz = carpeta_();
  var fotos = raiz.getFoldersByName('Fotos');
  fotos = fotos.hasNext() ? fotos.next() : raiz.createFolder('Fotos');
  var limpio = String(folio || 'SIN_FOLIO').replace(/[^\w\-]+/g, '_');
  var deFolio = fotos.getFoldersByName(limpio);
  return deFolio.hasNext() ? deFolio.next() : fotos.createFolder(limpio);
}

/** Mueve la hoja de cálculo a la carpeta del almacén. @private */
function acomodarEnDrive_(libro) {
  try {
    DriveApp.getFileById(libro.getId()).moveTo(carpeta_());
  } catch (err) {
    Logger.log('No pude mover la hoja a la carpeta: ' + err.message);
  }
}

/* ------------------------------ acceso a tablas ---------------------------- */

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

/** Agrega un renglón. @private */
function insertar_(nombre, objeto) {
  var campos = TABLAS[nombre];
  var renglon = campos.map(function (campo) {
    return objeto[campo] === undefined ? '' : objeto[campo];
  });
  hoja_(nombre).appendRow(renglon);
  return objeto;
}

/** Actualiza un renglón ya leído (necesita _fila). @private */
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

function buscarUsuarioPorEmail_(email) {
  var buscado = String(email || '').toLowerCase().trim();
  if (!buscado) {
    return null;
  }
  return buscar_('USUARIOS', function (f) {
    return String(f.email).toLowerCase().trim() === buscado;
  });
}

/* ------------------------------- configuración ----------------------------- */

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

/* ----------------------------------- apoyo --------------------------------- */

function nuevoId_() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 10);
}

function nuevoToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

/**
 * Hash con sal para PIN y contraseñas. No es plano en la hoja, aunque un PIN de
 * 4 dígitos siempre es débil por naturaleza: la sal solo evita verlo a simple
 * vista y que se repita entre usuarios.
 * @private
 */
function hashear_(texto, sal) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(sal) + '·' + String(texto));
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
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

/** Normaliza lo que Sheets pudo haber convertido en Date. @private */
function textoFecha_(valor) {
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, zona_(), 'yyyy-MM-dd');
  }
  return String(valor || '').trim();
}

function textoHora_(valor) {
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, zona_(), 'HH:mm:ss');
  }
  return String(valor || '').trim();
}

function esSi_(valor) {
  var t = String(valor).toUpperCase().trim();
  return t === 'SI' || t === 'SÍ' || t === 'TRUE' || t === 'VERDADERO' || t === 'X';
}
