/**
 * LogiTime v4 · Registro de maniobras de almacén con flujo por etapas
 * Google Apps Script + Google Sheets + Web App (HTML Service)
 *
 * Hojas: MANIOBRAS · ETAPAS · CATALOGOS · TIEMPOS_EST · EMPLEADOS
 *        MONTACARGAS · CAMPOS · INCIDENCIAS · CONFIG · USUARIOS
 *
 * INSTALACIÓN:
 * 1. Google Sheets → Extensiones › Apps Script.
 * 2. Pega este archivo como Code.gs + crea los 3 HTML (Index, Dashboard, Estilos).
 * 3. Ejecuta setup() una vez y autoriza permisos.
 * 4. Implementar › Nueva implementación › Aplicación web · access = ANYONE.
 *
 * NOTA DE MIGRACIÓN: setup() es idempotente. Al ejecutarlo sobre una hoja
 * existente añade las columnas y hojas nuevas sin borrar datos previos.
 */

/* ════════════════════════════════════════════════════════════
   NOMBRES DE HOJAS
════════════════════════════════════════════════════════════ */
var HOJA      = 'MANIOBRAS';
var HOJA_CAT  = 'CATALOGOS';
var HOJA_EMP  = 'EMPLEADOS';
var HOJA_INC  = 'INCIDENCIAS';
var HOJA_ETA  = 'ETAPAS';
var HOJA_CFG  = 'CONFIG';
var HOJA_TEMS = 'TIEMPOS_EST';
var HOJA_USR  = 'USUARIOS';
var HOJA_MON  = 'MONTACARGAS';
var HOJA_CAM  = 'CAMPOS';
var HOJA_SEM  = 'SEMAFOROS';
var HOJA_DEP  = 'DEPARTAMENTOS';
var HOJA_FLU  = 'FLUJOS_ETAPAS';

/* ════════════════════════════════════════════════════════════
   CATÁLOGOS Y ETAPAS POR DEFECTO
════════════════════════════════════════════════════════════ */
var DEFAULT_CONFIG = {
  TURNO_MATUTINO_INICIO:   '06:00', TURNO_MATUTINO_FIN:      '14:00',
  TURNO_VESPERTINO_INICIO: '14:00', TURNO_VESPERTINO_FIN:    '22:00',
  TURNO_NOCTURNO_INICIO:   '22:00', TURNO_NOCTURNO_FIN:      '06:00',
  CORREOS_REPORTE: '', UMBRAL_VERDE_MIN: '45', UMBRAL_AMBAR_MIN: '90',
  REPORTE_DIARIO_HORA: '6', REPORTE_SEMANAL_DIA: 'LUNES',

  // Mínimo de registros para que el dashboard muestre un tiempo
  N_MINIMO_DASHBOARD: '5',
  // Rangos humanamente posibles: fuera de esto la fila se marca REVISIÓN
  ANOMALIA_MIN_POR_ATADO_MIN: '0.3', ANOMALIA_MIN_POR_ATADO_MAX: '25',
  ANOMALIA_MIN_POR_TON_MIN:   '0.5', ANOMALIA_MIN_POR_TON_MAX:   '90',
  ANOMALIA_DURACION_MIN_MIN:  '3',   ANOMALIA_DURACION_MIN_MAX:  '600'
};

/**
 * Regla madre: un registro = una maniobra.
 * Este catálogo es cerrado: nunca debe contener combinaciones
 * del estilo "Descarga y acomodo" o "Descarga y carga".
 */
var TIPOS_MANIOBRA_DEFAULT = [
  'Descarga furgón a piso',
  'Acomodo y estiba',
  'Carga plataforma desde piso',
  'Trasvase directo furgón a plataforma',
  'Descarga plataforma',
  'Otro'
];

var CATALOGOS_DEFAULT = {
  TURNOS:            ['Día', 'Madrugada'],
  FLUJOS:            ['ENTRADA', 'SALIDA', 'TRANSBORDO', 'INTERNO'],
  CLIENTES:          ['Cliente demo'],
  TIPOS_EQUIPO:      ['Caja seca', 'Caja refrigerada', 'Plataforma', 'Contenedor 20', 'Contenedor 40'],
  TIPOS_MONTACARGAS: ['Contrabalanceado', 'Patín eléctrico', 'Doble tarima', 'Manual'],
  MATERIALES:        ['Materia prima', 'Producto terminado', 'Empaque'],
  PRESENTACIONES:    ['Tarima', 'Caja', 'Saco', 'Granel', 'Rollo'],
  UNIDADES_MEDIDA:   ['Tarima', 'Caja', 'Saco', 'Pieza', 'Tonelada'],
  CAUSAS_DEMORA:     ['Esperando camión', 'Falla de equipo', 'Falta de espacio',
                      'Documentación', 'Comida', 'Cambio de turno', 'Otro'],
  TIPOS_MANIOBRA:    TIPOS_MANIOBRA_DEFAULT,
  ADITAMENTOS:       ['Clamp de cartón', 'Cuchillas', 'Roll clamp', 'Doble pallet']
};

/** Combinaciones prohibidas: se rechazan al guardar y se detectan en el diagnóstico */
var TIPOS_MANIOBRA_PROHIBIDOS = /(\s+y\s+|\s*\/\s*|\s*\+\s*|&)/i;

/**
 * Semáforos por tipo de maniobra: [tipo, verde hasta (min), amarillo hasta (min)].
 * Los tres primeros vienen de las bases operativas del 15/08/2026.
 * Los marcados como heredados usan el umbral genérico hasta que se definan.
 */
var SEMAFOROS_DEFAULT = [
  ['Descarga furgón a piso',                40, 60],
  ['Carga plataforma desde piso',           15, 25],
  ['Trasvase directo furgón a plataforma',  15, 30],
  ['Acomodo y estiba',                      45, 90],   // heredado — pendiente de definir
  ['Descarga plataforma',                   45, 90],   // heredado — pendiente de definir
  ['Otro',                                  45, 90]
];

var ETAPAS_FLUJO = {
  ENTRADA:    ['Llegada', 'Ingreso a andén', 'Descarga', 'Documentación', 'Salida'],
  SALIDA:     ['Llegada', 'Ingreso a andén', 'Carga',    'Documentación', 'Salida'],
  TRANSBORDO: ['Llegada', 'Descarga',        'Carga',    'Documentación', 'Salida'],
  INTERNO:    ['Carga',   'Descarga',        'Documentación']
};

var DEFAULT_TIEMPOS = [
  ['Llegada', 10], ['Ingreso a andén', 15], ['Descarga', 30],
  ['Carga', 30], ['Documentación', 15], ['Salida', 10]
];

/**
 * Registro maestro de campos del formulario de maniobra.
 * El MASTER decide desde la app cuáles son obligatorios y cuáles visibles.
 * [clave, etiqueta, sección, obligatorio, visible, orden]
 */
var CAMPOS_DEFAULT = [
  ['fecha',              'Fecha',                    'esenciales', false, true,  10],
  ['turno',              'Turno',                    'esenciales', true,  true,  20],
  ['tipo_maniobra',      'Tipo de maniobra',         'esenciales', true,  true,  25],
  ['flujo',              'Flujo',                    'esenciales', true,  true,  30],
  ['cliente',            'Cliente',                  'esenciales', true,  true,  40],
  ['no_unidad',          'No. de unidad / furgón',   'esenciales', true,  true,  50],
  ['tipo_equipo',        'Tipo de equipo',           'esenciales', true,  true,  60],
  ['montacarguistas',    'Montacarguistas',          'esenciales', true,  true,  70],
  ['montacargas',        'Montacargas asignados',    'esenciales', false, true,  80],
  ['ayudantes',          'Ayudantes',                'esenciales', false, true,  90],
  ['aditamento',         'Aditamento',               'esenciales', false, true,  95],

  ['toneladas_netas',    'Toneladas netas',          'carga',      false, true, 105],
  ['atados',             'Atados',                   'carga',      false, true, 106],
  ['piezas_sueltas',     'Piezas sueltas',           'carga',      false, true, 107],
  ['material',           'Material',                 'carga',      false, true, 110],
  ['presentacion',       'Presentación',             'carga',      false, true, 120],
  ['cant_piezas',        'Cantidad (obsoleto)',      'carga',      false, false,130],
  ['unidad_medida',      'Unidad de medida',         'carga',      false, true, 140],
  ['tarimas',            'Tarimas',                  'carga',      false, true, 150],
  ['peso_tons',          'Peso bruto (toneladas)',   'carga',      false, false,160],
  ['cant_equipos',       'Cant. de equipos',         'carga',      false, true, 170],
  ['tipo_montacargas',   'Tipo de montacargas',      'carga',      false, true, 180],
  ['num_montacargas',    'Núm. de montacargas',      'carga',      true,  true, 190],

  ['hora_posicionamiento','Hora de posicionamiento del furgón', 'tiempos', false, true, 205],
  ['hora_liberacion',    'Hora de liberación del furgón',       'tiempos', false, true, 206],

  ['dano_origen',        '¿Daño de origen?',         'danos',      false, true, 210],
  ['dano_origen_desc',   'Desc. daño de origen',     'danos',      false, true, 220],
  ['observaciones',      'Observaciones',            'danos',      false, true, 230],
  ['prueba_controlada',  'Prueba controlada',        'danos',      false, true, 240],
  ['etiqueta_prueba',    'Etiqueta de la prueba',    'danos',      false, true, 250]
];

/** Campo cuyo valor "Otro" obliga a capturar observaciones */
var CAMPO_OBLIGA_OBS = 'tipo_maniobra';

var ESTADOS_MONTACARGAS = ['disponible', 'en_uso', 'mantenimiento', 'baja'];

/* ════════════════════════════════════════════════════════════
   ESQUEMAS DE COLUMNAS
   IMPORTANTE: las columnas nuevas SIEMPRE se agregan al final
   para que la migración automática no rompa hojas existentes.
════════════════════════════════════════════════════════════ */
// MANIOBRAS (40 cols)
var COLUMNAS = [
  'ID', 'Folio', 'Fecha', 'Turno', 'Flujo', 'Etapa', 'Cliente', 'No. unidad', 'Tipo equipo',
  'Cant. equipos', 'Material', 'Presentación', 'Cant. piezas', 'Unidad de medida', 'Tarimas', 'Peso (ton)',
  'Tipo montacargas', 'Núm. montacargas', 'Montacarguistas', 'Ayudantes',
  'Estado', 'Iniciado en', 'Finalizado en', 'Pausa acum (seg)', 'Hora inicio', 'Hora fin',
  'Tiempo total (min)', 'Demora (min)', 'Causa demora', 'Tiempo efectivo (min)', 'Min/pieza',
  'Daño origen', 'Desc. daño origen', 'Daño maniobra', 'Desc. daño maniobra',
  'Observaciones', 'Semáforo', 'Registrado por', 'Timestamp',
  'Montacargas asignados',
  // ── Bases para la Bitácora de Maniobras (15/08/2026) ──
  'Tipo maniobra', 'Toneladas netas', 'Atados', 'Piezas sueltas', 'Aditamento',
  'Hora posicionamiento', 'Hora liberación', 'Min ocupación spot',
  'Min por atado', 'Min por tonelada', 'Min montacargas', 'Min montacargas por ton',
  'Prueba controlada', 'Etiqueta prueba',
  'Revisión', 'Motivo revisión', 'Validado por',
  'Min por tarima', 'Comentario supervisor'
];

// Índices de las columnas nuevas (para no contar a mano)
var C_TIPO_MAN = 40, C_TON = 41, C_ATADOS = 42, C_PZAS = 43, C_ADIT = 44,
    C_H_POS = 45, C_H_LIB = 46, C_OCUPACION = 47,
    C_MIN_ATADO = 48, C_MIN_TON = 49, C_MIN_MONTA = 50, C_MIN_MONTA_TON = 51,
    C_PRUEBA = 52, C_ETIQ_PRUEBA = 53,
    C_REVISION = 54, C_MOTIVO_REV = 55, C_VALIDADO = 56,
    C_MIN_TARIMA = 57, C_COMENT_SUP = 58;
var C_MIN_PIEZA = 30;   // columna original "Min/pieza", ahora sobre piezas sueltas

/** Columnas de MANIOBRAS que guardan una hora "HH:mm" y deben ser texto plano */
var COLS_HORA_MAN = [24, 25, C_H_POS, C_H_LIB];

// ETAPAS (19 cols)
// idx: 0=ID 1=ID_man 2=Folio 3=Num 4=Nombre 5=Estado
//      6=Inicio_dt 7=Hora_ini 8=Fin_dt 9=Hora_fin
//      10=Tiempo_min 11=Est_min 12=Retraso_min 13=NoAplica
//      14=PausaAcum_seg 15=Causa 16=Obs 17=RegistradoPor 18=TS
var COL_ETA = [
  'ID_etapa', 'ID_maniobra', 'Folio', 'Num_etapa', 'Nombre_etapa', 'Estado',
  'Inicio_dt', 'Hora_inicio', 'Fin_dt', 'Hora_fin',
  'Tiempo_min', 'Tiempo_estimado_min', 'Retraso_min', 'No_aplica',
  'Pausa_acum_seg', 'Causa_demora', 'Observaciones', 'Registrado_por', 'Timestamp',
  'Departamento'
];
var C_ETA_DEPTO = 19;

var COL_EMP = ['ID', 'Nombre', 'Posición', 'Montacargas', 'Activo'];
var COL_USR = ['ID', 'Email', 'Nombre', 'PIN', 'Rol', 'Activo', 'Timestamp', 'Departamento'];
var COL_DEP = ['ID', 'Nombre', 'Descripción', 'Activo'];
var COL_FLU = ['Flujo', 'Orden', 'Etapa', 'Departamento', 'Tiempo estimado (min)', 'Activo'];
var COL_MON = ['ID', 'Código', 'Tipo', 'Marca', 'Modelo', 'Capacidad (ton)',
               'Estado', 'Ubicación', 'Notas', 'Activo', 'Timestamp'];
var COL_CAM = ['Campo', 'Etiqueta', 'Sección', 'Obligatorio', 'Visible', 'Orden', 'Departamentos'];
var COL_SEM = ['Tipo maniobra', 'Verde hasta (min)', 'Amarillo hasta (min)'];
var COL_INC = ['ID', 'Fecha', 'Folio maniobra', 'Empleado', 'Tipo', 'Severidad',
               'Descripción', 'Estado', 'Resolución', 'Registrado por', 'Timestamp'];
var COL_CFG = ['Clave', 'Valor', 'Descripción'];
var COL_TEM = ['Etapa', 'Tiempo estimado (min)'];

/* ════════════════════════════════════════════════════════════
   UTILIDADES INTERNAS
════════════════════════════════════════════════════════════ */

/** Accede al spreadsheet ya sea bound o standalone */
function ss_() {
  var a = SpreadsheetApp.getActiveSpreadsheet();
  if (a) return a;
  var p = PropertiesService.getScriptProperties();
  var id = p.getProperty('LOGITIME_SS_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  var ss = SpreadsheetApp.create('LogiTime — Base de datos');
  p.setProperty('LOGITIME_SS_ID', ss.getId());
  return ss;
}

function _pintarCabecera_(rango) {
  return rango.setFontWeight('bold').setBackground('#0f2748').setFontColor('#ffffff');
}

/**
 * Rellena únicamente las celdas de cabecera que estén vacías.
 * Nunca sobrescribe un encabezado existente, así que es seguro
 * ejecutarlo sobre hojas con datos reales.
 */
function _migrarCabecera_(sh, cols) {
  var maxCols = sh.getMaxColumns();
  if (maxCols < cols.length) sh.insertColumnsAfter(maxCols, cols.length - maxCols);
  var rng = sh.getRange(1, 1, 1, cols.length);
  var act = rng.getValues()[0];
  var cambio = false;
  for (var i = 0; i < cols.length; i++) {
    if (String(act[i] || '').trim() === '') { act[i] = cols[i]; cambio = true; }
  }
  if (cambio) _pintarCabecera_(rng.setValues([act]));
}

/** Obtiene o crea una hoja con cabeceras, migrando columnas nuevas */
function hoja_(nombre, cols) {
  var ss = ss_(), sh = ss.getSheetByName(nombre);
  if (!sh) {
    sh = ss.insertSheet(nombre);
    _pintarCabecera_(sh.getRange(1, 1, 1, cols.length).setValues([cols]));
    sh.setFrozenRows(1);
    return sh;
  }
  _migrarCabecera_(sh, cols);
  return sh;
}

function uuid_() { return Utilities.getUuid(); }

function usuario_() {
  try { return Session.getActiveUser().getEmail() || 'anónimo'; } catch (e) { return 'anónimo'; }
}

/** Convierte cualquier valor a milisegundos de forma robusta */
function toMs_(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (v instanceof Date) { var t = v.getTime(); return isNaN(t) ? 0 : t; }
  if (typeof v === 'number') return v > 1e11 ? v : 0;   // ya viene en ms
  var d = new Date(String(v));
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function bool_(v) {
  return v === true || v === 1 || v === '1' ||
         String(v).toUpperCase() === 'TRUE' || String(v).toUpperCase() === 'SÍ' ||
         String(v).toUpperCase() === 'SI';
}

function hhmm_(fecha) {
  if (!fecha) return '';
  var d = (fecha instanceof Date) ? fecha : new Date(fecha);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'HH:mm');
}

/**
 * Devuelve SIEMPRE "HH:mm" a partir de una celda de hora.
 *
 * Si la columna quedó con formato de hora, Sheets guarda "10:22" como la
 * fracción de día sobre su epoch (30/12/1899) y getValues() regresa
 * "Sat Dec 30 1899 10:22:00". Aquí se recupera solo la hora, sin importar
 * si la celda venía como texto, como Date o como número.
 */
function horaTexto_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  }
  if (typeof v === 'number') {
    // Fracción de día: 0.5 = 12:00
    var mins = Math.round((v - Math.floor(v)) * 24 * 60);
    return _pad2_(Math.floor(mins / 60) % 24) + ':' + _pad2_(mins % 60);
  }
  var s = String(v).trim();
  var m = s.match(/(\d{1,2}):(\d{2})/);   // sirve igual para "10:22" que para la cadena larga de 1899
  return m ? _pad2_(Number(m[1])) + ':' + _pad2_(Number(m[2])) : s;
}

function _pad2_(n) { return (n < 10 ? '0' : '') + n; }

function fechaISO_(v) {
  if (v instanceof Date && !isNaN(v.getTime()))
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v || '');
}

function fechaHora_(v) {
  if (v instanceof Date && !isNaN(v.getTime()))
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  return String(v || '');
}

function minutosEntre(inicio, fin) {
  if (!inicio || !fin) return 0;
  var a = String(inicio).split(':'), b = String(fin).split(':');
  var d = (Number(b[0]) * 60 + Number(b[1] || 0)) - (Number(a[0]) * 60 + Number(a[1] || 0));
  if (d < 0) d += 1440;
  return d;
}

function semaforo_(min, cfg) {
  var m = Number(min);
  if (!m && m !== 0) return 'SIN DATO';
  var verde = Number((cfg || {}).UMBRAL_VERDE_MIN || 45);
  var ambar = Number((cfg || {}).UMBRAL_AMBAR_MIN || 90);
  return m <= verde ? 'VERDE' : m <= ambar ? 'ÁMBAR' : 'ROJO';
}

function generarFolio(cliente, fecha, unidad) {
  var c = String(cliente || 'GEN').replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 3) || 'GEN';
  var f = String(fecha || '').replace(/-/g, '').substring(0, 8) || '00000000';
  var u = String(unidad || 'SN').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'SN';
  return c + '-' + f + '-' + u;
}

function filaAObjeto_(fila) {
  var o = {};
  for (var i = 0; i < COLUMNAS.length; i++) o[COLUMNAS[i]] = fila[i];
  return o;
}

function buscarFila_(sh, id) {
  if (sh.getLastRow() < 2) return -1;
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function listaTexto_(v) {
  return [].concat(v || []).map(function(s) { return String(s || '').trim(); })
    .filter(Boolean).join('; ');
}

function textoLista_(v) {
  return String(v || '').split(';').map(function(s) { return s.trim(); }).filter(Boolean);
}

/** Envoltura uniforme de errores para que el cliente nunca reciba una excepción cruda */
function seguro_(nombre, fn) {
  try {
    return fn();
  } catch (err) {
    return { ok: false, error: nombre + ': ' + String((err && err.message) || err) };
  }
}

/* ════════════════════════════════════════════════════════════
   AUTENTICACIÓN / USUARIOS
════════════════════════════════════════════════════════════ */

function login(email, pin) {
  if (!email || !pin) return { ok: false, msg: 'Email y PIN requeridos' };
  var sh = ss_().getSheetByName(HOJA_USR);
  if (!sh || sh.getLastRow() < 2) return { ok: false, msg: 'Sin usuarios. Ejecuta setup() en el editor.' };
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, COL_USR.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var matchEmail = String(r[1]).toLowerCase().trim() === String(email).toLowerCase().trim();
    var matchPin   = String(r[3]).trim() === String(pin).trim();
    if (matchEmail && matchPin) {
      if (!bool_(r[5])) return { ok: false, msg: 'Usuario desactivado' };
      return { ok: true, email: String(r[1]).trim(), nombre: String(r[2]).trim(),
               rol: String(r[4]).trim(), departamento: String(r[7] || '').trim() };
    }
  }
  return { ok: false, msg: 'Email o PIN incorrectos' };
}

function getUsuarios() {
  var sh = hoja_(HOJA_USR, COL_USR);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COL_USR.length).getValues().map(function(r) {
    return { id: String(r[0]), email: String(r[1]), nombre: String(r[2]),
             rol: String(r[4]), activo: bool_(r[5]), departamento: String(r[7] || '') };
  });
}

function crearUsuario(data) {
  var sh = hoja_(HOJA_USR, COL_USR);
  var pin = String(data.pin || '').trim();
  if (!data.email || !data.nombre || !pin || !data.rol) return { ok: false, msg: 'Faltan datos' };
  if (pin.length < 4) return { ok: false, msg: 'PIN mínimo 4 caracteres' };
  if (sh.getLastRow() >= 2) {
    var emails = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < emails.length; i++) {
      if (String(emails[i][0]).toLowerCase() === data.email.toLowerCase())
        return { ok: false, msg: 'El email ya existe' };
    }
  }
  sh.appendRow([uuid_(), data.email, data.nombre, pin, data.rol, true, new Date(),
                data.departamento || '']);
  return { ok: true };
}

var ERR_USR = 'Usuario no encontrado';

function actualizarUsuario(id, data) {
  var sh = ss_().getSheetByName(HOJA_USR);
  if (!sh || sh.getLastRow() < 2) return { ok: false, error: ERR_USR };
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      if (data.nombre) sh.getRange(i + 2, 3).setValue(data.nombre);
      if (data.rol)    sh.getRange(i + 2, 5).setValue(data.rol);
      if (data.departamento !== undefined) sh.getRange(i + 2, 8).setValue(data.departamento);
      return { ok: true };
    }
  }
  return { ok: false, error: ERR_USR };
}

function resetPinAdmin(id, pinNuevo) {
  if (!pinNuevo || String(pinNuevo).trim().length < 4)
    return { ok: false, error: 'PIN mínimo 4 caracteres' };
  var sh = ss_().getSheetByName(HOJA_USR);
  if (!sh || sh.getLastRow() < 2) return { ok: false, error: ERR_USR };
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      sh.getRange(i + 2, 4).setValue(String(pinNuevo).trim());
      return { ok: true };
    }
  }
  return { ok: false, error: ERR_USR };
}

function toggleUsuario(id, activo) {
  var sh = ss_().getSheetByName(HOJA_USR);
  if (!sh || sh.getLastRow() < 2) return { ok: false, error: ERR_USR };
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) { sh.getRange(i + 2, 6).setValue(!!activo); return { ok: true }; }
  }
  return { ok: false, error: ERR_USR };
}

function eliminarUsuario(id) {
  var sh = ss_().getSheetByName(HOJA_USR);
  if (!sh || sh.getLastRow() < 2) return { ok: false, error: ERR_USR };
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) { sh.deleteRow(i + 2); return { ok: true }; }
  }
  return { ok: false, error: ERR_USR };
}

function cambiarPin(email, pinActual, pinNuevo) {
  var sh = ss_().getSheetByName(HOJA_USR);
  if (!sh || sh.getLastRow() < 2) return { ok: false, msg: 'Sin usuarios' };
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, COL_USR.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1]).toLowerCase() === email.toLowerCase() && String(rows[i][3]) === String(pinActual)) {
      sh.getRange(i + 2, 4).setValue(pinNuevo);
      return { ok: true };
    }
  }
  return { ok: false, msg: 'PIN actual incorrecto' };
}

/* ════════════════════════════════════════════════════════════
   CONFIGURACIÓN
════════════════════════════════════════════════════════════ */

function getConfigObj() {
  var sh  = hoja_(HOJA_CFG, COL_CFG);
  var out = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function(r) {
    var k = String(r[0] || '').trim();
    if (k) out[k] = String(r[1] || '');
  });
  return out;
}

function getConfigAll() { return getConfigObj(); }

function setConfig(clave, valor) {
  var sh = hoja_(HOJA_CFG, COL_CFG);
  if (sh.getLastRow() >= 2) {
    var claves = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < claves.length; i++) {
      if (String(claves[i][0]).trim() === clave) {
        sh.getRange(i + 2, 2).setValue(valor);
        return { ok: true };
      }
    }
  }
  sh.appendRow([clave, valor, '']);
  return { ok: true };
}

/* ════════════════════════════════════════════════════════════
   CAMPOS DEL FORMULARIO — obligatorio / visible configurable
════════════════════════════════════════════════════════════ */

function _sembrarCampos_(sh) {
  var existentes = {};
  if (sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function(r) {
      var k = String(r[0] || '').trim();
      if (k) existentes[k] = true;
    });
  }
  var nuevos = CAMPOS_DEFAULT.filter(function(c) { return !existentes[c[0]]; });
  if (nuevos.length) {
    sh.getRange(sh.getLastRow() + 1, 1, nuevos.length, COL_CAM.length).setValues(nuevos);
  }
  return nuevos.length;
}

/**
 * Configuración de campos. Si se pasa el contexto del usuario (rol y
 * departamento), se ocultan los campos restringidos a otros departamentos.
 */
function getCamposConfig(ctx) {
  var sh = hoja_(HOJA_CAM, COL_CAM);
  _sembrarCampos_(sh);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COL_CAM.length).getValues()
    .filter(function(r) { return String(r[0] || '').trim(); })
    .map(function(r) {
      var visible = r[4] === '' || r[4] === null || r[4] === undefined ? true : bool_(r[4]);
      return {
        campo:         String(r[0]).trim(),
        etiqueta:      String(r[1] || r[0]).trim(),
        seccion:       String(r[2] || 'esenciales').trim(),
        obligatorio:   bool_(r[3]),
        visible:       visible && _puedeVer_(r[6], ctx),
        orden:         Number(r[5] || 999),
        departamentos: String(r[6] || '')
      };
    })
    .sort(function(a, b) { return a.orden - b.orden; });
}

function guardarCamposConfig(items) {
  return seguro_('guardarCamposConfig', function() {
    var sh = hoja_(HOJA_CAM, COL_CAM);
    if (!items || !items.length) return { ok: false, error: 'Sin campos que guardar' };
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, COL_CAM.length).clearContent();
    var filas = items.map(function(c, i) {
      return [String(c.campo || ''), String(c.etiqueta || c.campo || ''),
              String(c.seccion || 'esenciales'), !!c.obligatorio, c.visible !== false,
              Number(c.orden || (i + 1) * 10),
              listaTexto_(c.departamentos)];
    });
    sh.getRange(2, 1, filas.length, COL_CAM.length).setValues(filas);
    return { ok: true, guardados: filas.length };
  });
}

function restablecerCamposConfig() {
  return seguro_('restablecerCamposConfig', function() {
    var sh = hoja_(HOJA_CAM, COL_CAM);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, COL_CAM.length).clearContent();
    sh.getRange(2, 1, CAMPOS_DEFAULT.length, COL_CAM.length).setValues(CAMPOS_DEFAULT);
    return { ok: true };
  });
}

/** Valida un payload de maniobra contra la configuración de campos obligatorios */
function _validarObligatorios_(data, ctx) {
  var faltan = [];
  getCamposConfig(ctx).forEach(function(c) {
    if (!c.obligatorio || !c.visible) return;
    var v = data[c.campo];
    var vacio = (v === undefined || v === null || v === '' ||
                 (Object.prototype.toString.call(v) === '[object Array]' && !v.length));
    if (vacio) faltan.push(c.etiqueta);
  });
  // Regla condicional: "Otro" exige justificar en Observaciones
  if (String(data[CAMPO_OBLIGA_OBS] || '').toLowerCase() === 'otro' &&
      !String(data.observaciones || '').trim()) {
    faltan.push('Observaciones (obligatorias cuando el tipo de maniobra es "Otro")');
  }
  return faltan;
}

/**
 * Regla madre: un registro = una maniobra.
 * Rechaza tipos combinados como "Descarga y acomodo" o "Descarga / Carga".
 */
function _validarTipoUnico_(tipo) {
  var t = String(tipo || '').trim();
  if (!t) return '';
  if (TIPOS_MANIOBRA_PROHIBIDOS.test(t) && t.toLowerCase().indexOf('trasvase') !== 0) {
    return 'El tipo de maniobra "' + t + '" combina dos operaciones. ' +
           'Cada maniobra debe registrarse por separado: captura un registro por cada evento.';
  }
  return '';
}

/* ════════════════════════════════════════════════════════════
   SEMÁFOROS POR TIPO DE MANIOBRA
   Sustituyen al umbral genérico único de 45/90 minutos.
════════════════════════════════════════════════════════════ */

function getSemaforos() {
  var sh = hoja_(HOJA_SEM, COL_SEM);
  if (sh.getLastRow() < 2) {
    sh.getRange(2, 1, SEMAFOROS_DEFAULT.length, COL_SEM.length).setValues(SEMAFOROS_DEFAULT);
  }
  return sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), COL_SEM.length).getValues()
    .filter(function(r) { return String(r[0] || '').trim(); })
    .map(function(r) {
      return { tipo: String(r[0]).trim(), verde: Number(r[1] || 0), ambar: Number(r[2] || 0) };
    });
}

function guardarSemaforos(items) {
  return seguro_('guardarSemaforos', function() {
    var sh = hoja_(HOJA_SEM, COL_SEM);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, COL_SEM.length).clearContent();
    var filas = (items || [])
      .filter(function(i) { return String(i.tipo || '').trim(); })
      .map(function(i) { return [String(i.tipo).trim(), Number(i.verde || 0), Number(i.ambar || 0)]; });
    if (filas.length) sh.getRange(2, 1, filas.length, COL_SEM.length).setValues(filas);
    return { ok: true, guardados: filas.length };
  });
}

/** Semáforo con escala propia del tipo de maniobra; cae al genérico si no hay regla */
function semaforoPorTipo_(tipo, min, cfg, mapa) {
  var m = Number(min);
  if (!m && m !== 0) return 'SIN DATO';
  var regla = null;
  (mapa || getSemaforos()).forEach(function(s) {
    if (s.tipo.toLowerCase() === String(tipo || '').trim().toLowerCase()) regla = s;
  });
  if (!regla || !regla.verde) return semaforo_(min, cfg);
  if (m <= regla.verde) return 'VERDE';
  if (m <= (regla.ambar || regla.verde)) return 'ÁMBAR';
  return 'ROJO';
}

/* ════════════════════════════════════════════════════════════
   MÉTRICAS AUTOCALCULADAS Y DETECCIÓN DE ANOMALÍAS
   Nadie captura estos valores a mano.
════════════════════════════════════════════════════════════ */

/** Número real de montacargas: prioriza la lista de unidades asignadas */
function _numMontacargas_(row) {
  var asignados = textoLista_(row[39]).length;
  if (asignados) return asignados;
  var n = Number(row[17] || 0);
  return n > 0 ? n : 1;
}

function _redondea_(v, dec) {
  var f = Math.pow(10, dec === undefined ? 2 : dec);
  return Math.round(v * f) / f;
}

/**
 * Calcula las cuatro métricas de costeo y decide si la fila necesita revisión.
 * Devuelve un objeto listo para escribirse en la fila.
 */
function _calcularMetricas_(row, cfg) {
  cfg = cfg || getConfigObj();
  var totalMin  = Number(row[26] || 0);
  var paroMin   = Number(row[27] || 0);
  var efectivo  = Math.max(0, totalMin - paroMin);
  var toneladas = Number(row[C_TON] || 0);
  var atados    = Number(row[C_ATADOS] || 0);
  var piezas    = Number(row[C_PZAS] || 0) || Number(row[12] || 0);  // piezas sueltas, o el campo viejo
  var tarimas   = Number(row[14] || 0);
  var nMonta    = _numMontacargas_(row);

  var minAtado    = atados    > 0 ? _redondea_(efectivo / atados, 2)    : '';
  var minTon      = toneladas > 0 ? _redondea_(efectivo / toneladas, 2) : '';
  var minPieza    = piezas    > 0 ? _redondea_(efectivo / piezas, 2)    : '';
  var minTarima   = tarimas   > 0 ? _redondea_(efectivo / tarimas, 2)   : '';
  var minMonta    = _redondea_(totalMin * nMonta, 1);
  var minMontaTon = toneladas > 0 ? _redondea_(minMonta / toneladas, 2) : '';

  var ocupacion = minutosEntre(String(row[C_H_POS] || ''), String(row[C_H_LIB] || ''));

  // ── Anomalías: velocidades fuera de lo humanamente posible ──
  var motivos = [];
  function fuera(valor, minCfg, maxCfg, etiqueta) {
    if (valor === '' || !isFinite(valor)) return;
    var lo = Number(cfg[minCfg]), hi = Number(cfg[maxCfg]);
    if (isFinite(lo) && valor < lo) motivos.push(etiqueta + ' = ' + valor + ' (mínimo esperado ' + lo + ')');
    if (isFinite(hi) && valor > hi) motivos.push(etiqueta + ' = ' + valor + ' (máximo esperado ' + hi + ')');
  }
  fuera(minAtado, 'ANOMALIA_MIN_POR_ATADO_MIN', 'ANOMALIA_MIN_POR_ATADO_MAX', 'Min/atado');
  fuera(minTon,   'ANOMALIA_MIN_POR_TON_MIN',   'ANOMALIA_MIN_POR_TON_MAX',   'Min/tonelada');
  if (totalMin > 0) {
    fuera(totalMin, 'ANOMALIA_DURACION_MIN_MIN', 'ANOMALIA_DURACION_MIN_MAX', 'Duración total');
  }
  if (totalMin > 0 && !toneladas && !atados) {
    motivos.push('Sin toneladas ni atados: no se puede costear');
  }

  return {
    efectivo:     efectivo,
    ocupacion:    ocupacion,
    minAtado:     minAtado,
    minTon:       minTon,
    minPieza:     minPieza,
    minTarima:    minTarima,
    minMonta:     minMonta,
    minMontaTon:  minMontaTon,
    revision:     motivos.length ? 'REVISIÓN' : 'OK',
    motivo:       motivos.join(' · ')
  };
}

/** Escribe métricas + semáforo en una fila ya cargada en memoria */
function _aplicarMetricas_(row, cfg, mapaSem) {
  var m = _calcularMetricas_(row, cfg);
  row[29]              = m.efectivo;
  row[C_OCUPACION]     = m.ocupacion || '';
  row[C_MIN_ATADO]     = m.minAtado;
  row[C_MIN_TON]       = m.minTon;
  row[C_MIN_PIEZA]     = m.minPieza;
  row[C_MIN_TARIMA]    = m.minTarima;
  row[C_MIN_MONTA]     = m.minMonta;
  row[C_MIN_MONTA_TON] = m.minMontaTon;
  row[36]              = semaforoPorTipo_(row[C_TIPO_MAN], row[26], cfg, mapaSem);
  // Una fila ya validada por un supervisor no se vuelve a marcar
  if (String(row[C_VALIDADO] || '').trim()) {
    row[C_REVISION] = 'VALIDADO';
  } else {
    row[C_REVISION]    = m.revision;
    row[C_MOTIVO_REV]  = m.motivo;
  }
  return m;
}

/** Recalcula métricas de todas las maniobras finalizadas (o de las indicadas) */
function recalcularMetricas(ids) {
  return seguro_('recalcularMetricas', function() {
    var sh = hoja_(HOJA, COLUMNAS);
    if (sh.getLastRow() < 2) return { ok: true, recalculadas: 0 };
    var rango = sh.getRange(2, 1, sh.getLastRow() - 1, COLUMNAS.length);
    var vals  = rango.getValues();
    var cfg   = getConfigObj();
    var mapa  = getSemaforos();
    var filtro = null;
    if (ids && ids.length) {
      filtro = {};
      [].concat(ids).forEach(function(i) { filtro[String(i)] = true; });
    }
    var n = 0;
    vals.forEach(function(row) {
      if (!String(row[0] || '').trim()) return;
      if (filtro && !filtro[String(row[0])]) return;
      if (String(row[20] || '') !== 'finalizada') return;
      _aplicarMetricas_(row, cfg, mapa);
      n++;
    });
    if (n) rango.setValues(vals);
    return { ok: true, recalculadas: n };
  });
}

/** Un supervisor acepta la fila: deja de estar excluida del dashboard */
function validarRegistros(ids, quien, comentario) {
  return seguro_('validarRegistros', function() {
    var texto = String(comentario || '').trim();
    if (!texto) {
      return { ok: false, requiere_comentario: true,
        error: 'Escribe un comentario explicando por qué el registro es válido. ' +
               'Queda como respaldo de la decisión.' };
    }
    var sh = hoja_(HOJA, COLUMNAS);
    if (sh.getLastRow() < 2) return { ok: true, validados: 0 };
    var set = {};
    [].concat(ids || []).forEach(function(i) { set[String(i)] = true; });
    var rango = sh.getRange(2, 1, sh.getLastRow() - 1, COLUMNAS.length);
    var vals  = rango.getValues();
    var sello = String(quien || usuario_()) + ' · ' +
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    var n = 0;
    vals.forEach(function(row) {
      if (!set[String(row[0])]) return;
      row[C_REVISION] = 'VALIDADO';
      row[C_VALIDADO] = sello;
      // Los comentarios se acumulan: nunca se pisa el historial anterior
      var previo = String(row[C_COMENT_SUP] || '').trim();
      row[C_COMENT_SUP] = (previo ? previo + '\n' : '') + '[' + sello + '] ' + texto;
      n++;
    });
    if (n) rango.setValues(vals);
    return { ok: true, validados: n };
  });
}

/** Agrega un comentario de supervisión sin cambiar el estado de revisión */
function comentarManiobra(ids, quien, comentario) {
  return seguro_('comentarManiobra', function() {
    var texto = String(comentario || '').trim();
    if (!texto) return { ok: false, error: 'El comentario no puede ir vacío' };
    var sh = hoja_(HOJA, COLUMNAS);
    if (sh.getLastRow() < 2) return { ok: true, comentados: 0 };
    var set = {};
    [].concat(ids || []).forEach(function(i) { set[String(i)] = true; });
    var rango = sh.getRange(2, 1, sh.getLastRow() - 1, COLUMNAS.length);
    var vals  = rango.getValues();
    var sello = String(quien || usuario_()) + ' · ' +
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    var n = 0;
    vals.forEach(function(row) {
      if (!set[String(row[0])]) return;
      var previo = String(row[C_COMENT_SUP] || '').trim();
      row[C_COMENT_SUP] = (previo ? previo + '\n' : '') + '[' + sello + '] ' + texto;
      n++;
    });
    if (n) rango.setValues(vals);
    return { ok: true, comentados: n };
  });
}

/** Vuelve a marcar filas para revisión manual */
function marcarRevision(ids, motivo) {
  return seguro_('marcarRevision', function() {
    var sh = hoja_(HOJA, COLUMNAS);
    if (sh.getLastRow() < 2) return { ok: true, marcados: 0 };
    var set = {};
    [].concat(ids || []).forEach(function(i) { set[String(i)] = true; });
    var rango = sh.getRange(2, 1, sh.getLastRow() - 1, COLUMNAS.length);
    var vals  = rango.getValues();
    var n = 0;
    vals.forEach(function(row) {
      if (!set[String(row[0])]) return;
      row[C_REVISION]   = 'REVISIÓN';
      row[C_MOTIVO_REV] = String(motivo || 'Marcada manualmente');
      row[C_VALIDADO]   = '';
      n++;
    });
    if (n) rango.setValues(vals);
    return { ok: true, marcados: n };
  });
}

/** Pinta de rojo las filas marcadas REVISIÓN para que salten a la vista en la hoja */
function resaltarRevisiones() {
  return seguro_('resaltarRevisiones', function() {
    var sh = hoja_(HOJA, COLUMNAS);
    if (sh.getLastRow() < 2) return { ok: true, resaltadas: 0 };
    var n = sh.getLastRow() - 1;
    var estados = sh.getRange(2, C_REVISION + 1, n, 1).getValues();
    var fondos = estados.map(function(r) {
      var v = String(r[0] || '');
      var color = v === 'REVISIÓN' ? '#f8d7da' : (v === 'VALIDADO' ? '#d8f0e3' : null);
      var fila = [];
      for (var i = 0; i < COLUMNAS.length; i++) fila.push(color);
      return fila;
    });
    sh.getRange(2, 1, n, COLUMNAS.length).setBackgrounds(fondos);
    var marcadas = estados.filter(function(r) { return String(r[0]) === 'REVISIÓN'; }).length;
    return { ok: true, resaltadas: marcadas };
  });
}

/** Formato de fecha estricto dd/MM/yyyy para evitar ambigüedades */
/**
 * Formato estricto de fechas y, sobre todo, reparación de las horas.
 *
 * Las columnas "HH:mm" deben ser TEXTO. Si quedan con formato de hora,
 * Sheets las guarda como fracción de día sobre el 30/12/1899 y la app
 * termina mostrando "Sat Dec 30 1899 10:22:00". Aquí se convierten a
 * texto y se reescriben ya normalizadas.
 */
function formatearFechas() {
  return seguro_('formatearFechas', function() {
    var sh = hoja_(HOJA, COLUMNAS);
    var arregladas = 0;

    if (sh.getLastRow() >= 2) {
      var n = sh.getLastRow() - 1;
      sh.getRange(2,  3, n, 1).setNumberFormat('dd/mm/yyyy');
      sh.getRange(2, 22, n, 1).setNumberFormat('dd/mm/yyyy hh:mm');
      sh.getRange(2, 23, n, 1).setNumberFormat('dd/mm/yyyy hh:mm');

      COLS_HORA_MAN.forEach(function(idx) {
        var rng = sh.getRange(2, idx + 1, n, 1);
        var vals = rng.getValues();
        var limpias = vals.map(function(f) { return [horaTexto_(f[0])]; });
        rng.setNumberFormat('@').setValues(limpias);
        vals.forEach(function(f, i) {
          if (String(f[0]) !== limpias[i][0]) arregladas++;
        });
      });
    }

    var shEta = hoja_(HOJA_ETA, COL_ETA);
    if (shEta.getLastRow() >= 2) {
      var ne = shEta.getLastRow() - 1;
      shEta.getRange(2, 7, ne, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
      shEta.getRange(2, 9, ne, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
      [8, 10].forEach(function(col) {          // Hora_inicio y Hora_fin
        var rng = shEta.getRange(2, col, ne, 1);
        var vals = rng.getValues();
        var limpias = vals.map(function(f) { return [horaTexto_(f[0])]; });
        rng.setNumberFormat('@').setValues(limpias);
        vals.forEach(function(f, i) {
          if (String(f[0]) !== limpias[i][0]) arregladas++;
        });
      });
    }
    return { ok: true, arregladas: arregladas,
             msg: 'Formato aplicado · ' + arregladas + ' hora(s) corregidas' };
  });
}

/* ════════════════════════════════════════════════════════════
   DEPARTAMENTOS
   Definen quién es responsable de cada etapa y qué campos ve
   cada usuario. El rol MASTER siempre ve y opera todo.
════════════════════════════════════════════════════════════ */

var DEPARTAMENTOS_DEFAULT = [
  ['Patio',          'Recepción, posicionamiento y liberación de unidades'],
  ['Almacén',        'Descarga, carga, acomodo y estiba'],
  ['Documentación',  'Revisión y firma de documentos'],
  ['Supervisión',    'Validación y cierre de maniobras']
];

function getDepartamentos(soloActivos) {
  var sh = hoja_(HOJA_DEP, COL_DEP);
  if (sh.getLastRow() < 2) {
    sh.getRange(2, 1, DEPARTAMENTOS_DEFAULT.length, COL_DEP.length).setValues(
      DEPARTAMENTOS_DEFAULT.map(function(d) { return [uuid_(), d[0], d[1], true]; })
    );
  }
  return sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), COL_DEP.length).getValues()
    .filter(function(r) { return String(r[1] || '').trim(); })
    .map(function(r) {
      return { id: String(r[0]), nombre: String(r[1]).trim(),
               descripcion: String(r[2] || ''),
               activo: r[3] === '' || r[3] === null || r[3] === undefined ? true : bool_(r[3]) };
    })
    .filter(function(d) { return soloActivos ? d.activo : true; });
}

function guardarDepartamento(data) {
  return seguro_('guardarDepartamento', function() {
    var sh = hoja_(HOJA_DEP, COL_DEP);
    var nombre = String(data.nombre || '').trim();
    if (!nombre) return { ok: false, error: 'El nombre del departamento es obligatorio' };

    if (sh.getLastRow() >= 2) {
      var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
      for (var i = 0; i < vals.length; i++) {
        if (String(vals[i][1]).trim().toLowerCase() === nombre.toLowerCase() &&
            String(vals[i][0]) !== String(data.id || '')) {
          return { ok: false, error: 'Ya existe el departamento ' + nombre };
        }
      }
    }
    var id = data.id || uuid_();
    var row = [id, nombre, data.descripcion || '', data.activo !== false];
    var fila = data.id ? buscarFila_(sh, data.id) : -1;
    if (fila > 0) sh.getRange(fila, 1, 1, COL_DEP.length).setValues([row]);
    else          sh.appendRow(row);
    return { ok: true, id: id };
  });
}

function eliminarDepartamento(id) {
  return seguro_('eliminarDepartamento', function() {
    var sh   = hoja_(HOJA_DEP, COL_DEP);
    var fila = buscarFila_(sh, id);
    if (fila > 0) sh.deleteRow(fila);
    return { ok: true };
  });
}

/** ¿Este usuario puede ver algo restringido a esta lista de departamentos? */
function _puedeVer_(deptosPermitidos, ctx) {
  if (!ctx || ctx.rol === 'MASTER') return true;         // MASTER no tiene límites
  var lista = textoLista_(deptosPermitidos);
  if (!lista.length) return true;                        // sin restricción explícita
  var mio = String((ctx.departamento || '')).trim().toLowerCase();
  if (!mio) return false;
  for (var i = 0; i < lista.length; i++) {
    if (lista[i].toLowerCase() === mio) return true;
  }
  return false;
}

/* ════════════════════════════════════════════════════════════
   SECUENCIAS DE ETAPAS POR FLUJO
   Antes estaban fijas en el código; ahora se administran desde
   la app, con departamento responsable y tiempo estimado.
════════════════════════════════════════════════════════════ */

function _sembrarFlujos_(sh) {
  if (sh.getLastRow() >= 2) return 0;
  var tiempos = getTimeposEstimados();
  var filas = [];
  Object.keys(ETAPAS_FLUJO).forEach(function(flujo) {
    ETAPAS_FLUJO[flujo].forEach(function(etapa, i) {
      filas.push([flujo, i + 1, etapa, '', Number(tiempos[etapa] || 0), true]);
    });
  });
  if (filas.length) sh.getRange(2, 1, filas.length, COL_FLU.length).setValues(filas);
  return filas.length;
}

/** { ENTRADA: [{orden, etapa, departamento, tiempo_est}], ... } */
function getFlujosEtapas() {
  var sh = hoja_(HOJA_FLU, COL_FLU);
  _sembrarFlujos_(sh);
  var out = {};
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, COL_FLU.length).getValues().forEach(function(r) {
    var flujo = String(r[0] || '').trim().toUpperCase();
    var etapa = String(r[2] || '').trim();
    if (!flujo || !etapa) return;
    if (r[5] === false) return;                       // etapa desactivada
    if (!out[flujo]) out[flujo] = [];
    out[flujo].push({
      orden:        Number(r[1] || out[flujo].length + 1),
      etapa:        etapa,
      departamento: String(r[3] || ''),
      tiempo_est:   Number(r[4] || 0)
    });
  });
  Object.keys(out).forEach(function(f) {
    out[f].sort(function(a, b) { return a.orden - b.orden; });
  });
  return out;
}

/** Guarda la secuencia completa de un flujo, reemplazando la anterior */
function guardarFlujoEtapas(flujo, items) {
  return seguro_('guardarFlujoEtapas', function() {
    var nombre = String(flujo || '').trim().toUpperCase();
    if (!nombre) return { ok: false, error: 'Falta el nombre del flujo' };

    var limpios = (items || [])
      .filter(function(i) { return String(i.etapa || '').trim(); })
      .map(function(i, idx) {
        return [nombre, idx + 1, String(i.etapa).trim(),
                String(i.departamento || ''), Number(i.tiempo_est || 0),
                i.activo !== false];
      });
    if (!limpios.length) return { ok: false, error: 'El flujo necesita al menos una etapa' };

    var sh = hoja_(HOJA_FLU, COL_FLU);
    _borrarFilasFlujo_(sh, nombre);
    sh.getRange(sh.getLastRow() + 1, 1, limpios.length, COL_FLU.length).setValues(limpios);

    // El flujo debe existir también en el catálogo para poder elegirlo
    _asegurarValoresCatalogo_('FLUJOS', [nombre]);
    return { ok: true, etapas: limpios.length };
  });
}

function _borrarFilasFlujo_(sh, nombre) {
  if (sh.getLastRow() < 2) return 0;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  var n = 0;
  for (var i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]).trim().toUpperCase() === nombre) { sh.deleteRow(i + 2); n++; }
  }
  return n;
}

function eliminarFlujoEtapas(flujo) {
  return seguro_('eliminarFlujoEtapas', function() {
    var nombre = String(flujo || '').trim().toUpperCase();
    var sh = hoja_(HOJA_FLU, COL_FLU);
    var n = _borrarFilasFlujo_(sh, nombre);
    return { ok: true, eliminadas: n };
  });
}

/* ════════════════════════════════════════════════════════════
   MONTACARGAS — inventario de equipos
════════════════════════════════════════════════════════════ */

function getMontacargas(soloActivos) {
  var sh = hoja_(HOJA_MON, COL_MON);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COL_MON.length).getValues()
    .filter(function(r) { return String(r[0] || '').trim(); })
    .map(function(r) {
      return {
        id:         String(r[0]),
        codigo:     String(r[1] || ''),
        tipo:       String(r[2] || ''),
        marca:      String(r[3] || ''),
        modelo:     String(r[4] || ''),
        capacidad:  r[5] === '' ? '' : Number(r[5] || 0),
        estado:     String(r[6] || 'disponible'),
        ubicacion:  String(r[7] || ''),
        notas:      String(r[8] || ''),
        activo:     r[9] === '' || r[9] === null || r[9] === undefined ? true : bool_(r[9])
      };
    })
    .filter(function(m) { return soloActivos ? m.activo : true; });
}

function guardarMontacargas(data) {
  return seguro_('guardarMontacargas', function() {
    var sh = hoja_(HOJA_MON, COL_MON);
    var codigo = String(data.codigo || '').trim();
    if (!codigo) return { ok: false, error: 'El código del montacargas es obligatorio' };

    var estado = ESTADOS_MONTACARGAS.indexOf(String(data.estado)) >= 0 ? data.estado : 'disponible';
    var fila   = data.id ? buscarFila_(sh, data.id) : -1;

    // Código único
    if (sh.getLastRow() >= 2) {
      var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
      for (var i = 0; i < vals.length; i++) {
        if (String(vals[i][1]).trim().toLowerCase() === codigo.toLowerCase() &&
            String(vals[i][0]) !== String(data.id || '')) {
          return { ok: false, error: 'Ya existe un montacargas con el código ' + codigo };
        }
      }
    }

    var id  = data.id || uuid_();
    var row = [id, codigo, data.tipo || '', data.marca || '', data.modelo || '',
               data.capacidad === '' || data.capacidad === undefined ? '' : Number(data.capacidad),
               estado, data.ubicacion || '', data.notas || '',
               data.activo !== false, new Date()];

    if (fila > 0) sh.getRange(fila, 1, 1, COL_MON.length).setValues([row]);
    else          sh.appendRow(row);
    return { ok: true, id: id };
  });
}

function eliminarMontacargas(id) {
  return seguro_('eliminarMontacargas', function() {
    var sh   = hoja_(HOJA_MON, COL_MON);
    var fila = buscarFila_(sh, id);
    if (fila > 0) sh.deleteRow(fila);
    return { ok: true };
  });
}

function eliminarMontacargasLote(ids) {
  return seguro_('eliminarMontacargasLote', function() {
    var sh = hoja_(HOJA_MON, COL_MON);
    if (sh.getLastRow() < 2) return { ok: true, eliminados: 0 };
    var set = {};
    [].concat(ids || []).forEach(function(i) { set[String(i)] = true; });
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    var n = 0;
    for (var i = vals.length - 1; i >= 0; i--) {
      if (set[String(vals[i][0])]) { sh.deleteRow(i + 2); n++; }
    }
    return { ok: true, eliminados: n };
  });
}

function cambiarEstadoMontacargas(ids, estado) {
  return seguro_('cambiarEstadoMontacargas', function() {
    if (ESTADOS_MONTACARGAS.indexOf(String(estado)) < 0)
      return { ok: false, error: 'Estado no válido: ' + estado };
    var sh = hoja_(HOJA_MON, COL_MON);
    if (sh.getLastRow() < 2) return { ok: true, actualizados: 0 };
    var set = {};
    [].concat(ids || []).forEach(function(i) { set[String(i)] = true; });
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    var n = 0;
    for (var i = 0; i < vals.length; i++) {
      if (set[String(vals[i][0])]) { sh.getRange(i + 2, 7).setValue(estado); n++; }
    }
    return { ok: true, actualizados: n };
  });
}

/** Marca por CÓDIGO los montacargas usados por una maniobra */
function _setEstadoPorCodigo_(codigos, estado) {
  try {
    var lista = [].concat(codigos || []).filter(Boolean);
    if (!lista.length) return;
    var sh = hoja_(HOJA_MON, COL_MON);
    if (sh.getLastRow() < 2) return;
    var set = {};
    lista.forEach(function(c) { set[String(c).trim().toLowerCase()] = true; });
    var vals = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (set[String(vals[i][0]).trim().toLowerCase()]) sh.getRange(i + 2, 7).setValue(estado);
    }
  } catch (e) { /* nunca bloquear la operación por el inventario */ }
}

/* ════════════════════════════════════════════════════════════
   TIEMPOS ESTIMADOS
════════════════════════════════════════════════════════════ */

function getTimeposEstimados() {
  var sh = hoja_(HOJA_TEMS, COL_TEM);
  if (sh.getLastRow() < 2) return {};
  var out = {};
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function(r) {
    var k = String(r[0] || '').trim();
    if (k) out[k] = Number(r[1] || 0);
  });
  return out;
}

function guardarTiemposEst(items) {
  var sh = hoja_(HOJA_TEMS, COL_TEM);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
  if (items && items.length) {
    sh.getRange(2, 1, items.length, 2).setValues(
      items.map(function(it) { return [String(it.etapa || ''), Number(it.minutos || 0)]; })
    );
  }
  return { ok: true };
}

/* ════════════════════════════════════════════════════════════
   SETUP / MIGRACIÓN
════════════════════════════════════════════════════════════ */

function setup() {
  hoja_(HOJA,     COLUMNAS);
  hoja_(HOJA_EMP, COL_EMP);
  hoja_(HOJA_INC, COL_INC);
  hoja_(HOJA_ETA, COL_ETA);
  hoja_(HOJA_CFG, COL_CFG);
  hoja_(HOJA_MON, COL_MON);

  // CATALOGOS — solo se siembra si la hoja no existía
  var cs = ss_().getSheetByName(HOJA_CAT);
  if (!cs) {
    cs = ss_().insertSheet(HOJA_CAT);
    var keys = Object.keys(CATALOGOS_DEFAULT);
    for (var i = 0; i < keys.length; i++) {
      var vals = CATALOGOS_DEFAULT[keys[i]];
      _pintarCabecera_(cs.getRange(1, i + 1).setValue(keys[i]));
      if (vals.length) cs.getRange(2, i + 1, vals.length, 1).setValues(vals.map(function(v) { return [v]; }));
    }
    cs.setFrozenRows(1);
  }

  // TIEMPOS_EST
  var ts = hoja_(HOJA_TEMS, COL_TEM);
  if (ts.getLastRow() < 2) ts.getRange(2, 1, DEFAULT_TIEMPOS.length, 2).setValues(DEFAULT_TIEMPOS);

  // CONFIG defaults
  var cfgSh = hoja_(HOJA_CFG, COL_CFG);
  if (cfgSh.getLastRow() < 2) {
    Object.keys(DEFAULT_CONFIG).forEach(function(k) { cfgSh.appendRow([k, DEFAULT_CONFIG[k], '']); });
  }

  // CAMPOS del formulario
  _sembrarCampos_(hoja_(HOJA_CAM, COL_CAM));

  // DEPARTAMENTOS y secuencias de etapas por flujo
  getDepartamentos(false);
  _sembrarFlujos_(hoja_(HOJA_FLU, COL_FLU));

  // SEMÁFOROS por tipo de maniobra
  var semSh = hoja_(HOJA_SEM, COL_SEM);
  if (semSh.getLastRow() < 2) {
    semSh.getRange(2, 1, SEMAFOROS_DEFAULT.length, COL_SEM.length).setValues(SEMAFOROS_DEFAULT);
  }

  // Catálogos nuevos sobre hojas ya existentes (no borra valores previos)
  _asegurarValoresCatalogo_('TIPOS_MANIOBRA', TIPOS_MANIOBRA_DEFAULT);
  _asegurarValoresCatalogo_('ADITAMENTOS',    CATALOGOS_DEFAULT.ADITAMENTOS);
  _asegurarValoresCatalogo_('TURNOS',         CATALOGOS_DEFAULT.TURNOS);
  _asegurarValoresCatalogo_('CAUSAS_DEMORA',  CATALOGOS_DEFAULT.CAUSAS_DEMORA);

  // Formato de fecha estricto dd/MM/yyyy
  try { formatearFechas(); } catch (e) {}

  // USUARIOS — cuenta master
  var uSh = hoja_(HOJA_USR, COL_USR);
  if (uSh.getLastRow() < 2) {
    uSh.appendRow([uuid_(), 'mrodriguez@tlterminals.com', 'M. Rodríguez', '1234', 'MASTER', true, new Date()]);
  }

  try { configurarTriggers(); } catch (e) {}
  return '✓ Setup completo. Hojas: MANIOBRAS · ETAPAS · CATALOGOS · TIEMPOS_EST · EMPLEADOS · MONTACARGAS · CAMPOS · INCIDENCIAS · CONFIG · USUARIOS';
}

/* ════════════════════════════════════════════════════════════
   TRIGGERS Y REPORTES
════════════════════════════════════════════════════════════ */

function configurarTriggers() {
  _eliminarTriggers();
  var cfg  = getConfigObj();
  var hora = parseInt(cfg.REPORTE_DIARIO_HORA || 6);
  ScriptApp.newTrigger('enviarReporteDaily').timeBased().atHour(hora).everyDays(1).create();
  var diasMap = {
    DOMINGO:ScriptApp.WeekDay.SUNDAY, LUNES:ScriptApp.WeekDay.MONDAY,
    MARTES:ScriptApp.WeekDay.TUESDAY, MIERCOLES:ScriptApp.WeekDay.WEDNESDAY,
    JUEVES:ScriptApp.WeekDay.THURSDAY, VIERNES:ScriptApp.WeekDay.FRIDAY,
    SABADO:ScriptApp.WeekDay.SATURDAY
  };
  var dia = diasMap[String(cfg.REPORTE_SEMANAL_DIA || 'LUNES').toUpperCase()] || ScriptApp.WeekDay.MONDAY;
  ScriptApp.newTrigger('enviarReporteSemanal').timeBased().onWeekDay(dia).atHour(hora).create();
  return { ok: true };
}

function _eliminarTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'enviarReporteDaily' || t.getHandlerFunction() === 'enviarReporteSemanal')
      ScriptApp.deleteTrigger(t);
  });
}

function enviarReporteDaily()   { _enviarReporte(1); }
function enviarReporteSemanal() { _enviarReporte(7); }

function _enviarReporte(dias) {
  var cfg     = getConfigObj();
  var correos = String(cfg.CORREOS_REPORTE || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  if (!correos.length) { try { correos = [Session.getEffectiveUser().getEmail()]; } catch(e) { return; } }
  var k    = indicadores(dias);
  var tipo = dias === 1 ? 'diario' : 'semanal';
  var html = _buildEmailHTML(k, tipo === 'diario' ? 'Hoy' : 'Últimos 7 días');
  var fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
  correos.forEach(function(correo) {
    MailApp.sendEmail({ to: correo, subject: 'LogiTime — Reporte ' + tipo + ' · ' + fecha, htmlBody: html });
  });
}

function _buildEmailHTML(k, periodo) {
  var s = k.semaforo || {};
  return ['<div style="font-family:system-ui,sans-serif;max-width:600px;margin:auto;background:#f0f4fb;padding:24px;border-radius:14px">',
    '<h1 style="color:#1a2332;font-size:22px;margin:0 0 2px">LogiTime</h1>',
    '<p style="color:#5a7090;margin:0 0 20px;font-size:14px">Reporte · ' + periodo + '</p>',
    '<table style="width:100%;border-collapse:separate;border-spacing:8px"><tr>',
    _kpiEmail('Maniobras finalizadas', k.maniobras),
    _kpiEmail('En curso', k.en_curso),
    '</tr><tr>',
    _kpiEmail('Promedio total', (k.promedio_min || 0) + ' min'),
    _kpiEmail('Promedio efectivo', (k.promedio_efectivo_min || 0) + ' min'),
    '</tr><tr>',
    _kpiEmail('Demora acumulada', (k.demora_total_min || 0) + ' min'),
    _kpiEmail('Con daño', k.danos),
    '</tr></table>',
    '<p style="color:#1a2332;margin-top:16px;font-size:14px"><strong>Semáforo:</strong> ',
    '<span style="color:#14855a">● ' + (s.VERDE || 0) + ' verde</span>  ',
    '<span style="color:#c07000">● ' + (s['ÁMBAR'] || 0) + ' ámbar</span>  ',
    '<span style="color:#d03030">● ' + (s.ROJO || 0) + ' rojo</span></p>',
    '</div>'].join('');
}

function _kpiEmail(label, val) {
  return '<td style="background:#fff;border-radius:10px;padding:14px;border:1px solid #dce5f0;width:50%">' +
    '<div style="color:#5a7090;font-size:12px">' + label + '</div>' +
    '<div style="color:#1a2332;font-size:24px;font-weight:700">' + val + '</div></td>';
}

/* ════════════════════════════════════════════════════════════
   TURNO AUTOMÁTICO
════════════════════════════════════════════════════════════ */

function getTurnoActual() {
  var cfg  = getConfigObj();
  var tz   = Session.getScriptTimeZone();
  var ahora = new Date();
  var hhmm  = Utilities.formatDate(ahora, tz, 'HH:mm').split(':');
  var mins  = parseInt(hhmm[0]) * 60 + parseInt(hhmm[1]);
  function toM(s) {
    var p = String(s || '00:00').split(':');
    return parseInt(p[0] || 0) * 60 + parseInt(p[1] || 0);
  }
  var turnos = [
    { nombre: 'Matutino',   ini: toM(cfg.TURNO_MATUTINO_INICIO),   fin: toM(cfg.TURNO_MATUTINO_FIN) },
    { nombre: 'Vespertino', ini: toM(cfg.TURNO_VESPERTINO_INICIO), fin: toM(cfg.TURNO_VESPERTINO_FIN) },
    { nombre: 'Nocturno',   ini: toM(cfg.TURNO_NOCTURNO_INICIO),   fin: toM(cfg.TURNO_NOCTURNO_FIN) }
  ];
  var turno = '';
  turnos.forEach(function(t) {
    if (t.ini === t.fin) return;
    var dentro = t.fin > t.ini ? (mins >= t.ini && mins < t.fin) : (mins >= t.ini || mins < t.fin);
    if (dentro) turno = t.nombre;
  });
  return { turno: turno, fecha: Utilities.formatDate(ahora, tz, 'yyyy-MM-dd'),
           server_now_ms: Date.now() };
}

/* ════════════════════════════════════════════════════════════
   CATÁLOGOS
════════════════════════════════════════════════════════════ */

function getCatalogos(ctx) {
  var cs = ss_().getSheetByName(HOJA_CAT);
  if (!cs) { setup(); cs = ss_().getSheetByName(HOJA_CAT); }
  var vals = cs.getDataRange().getValues();
  var out  = {};
  if (vals.length) {
    for (var c = 0; c < vals[0].length; c++) {
      var key = String(vals[0][c] || '').trim();
      if (!key) continue;
      var lista = [];
      for (var r = 1; r < vals.length; r++) {
        var v = String(vals[r][c] || '').trim();
        if (v) lista.push(v);
      }
      out[key] = lista;
    }
  }
  out.EMPLEADOS    = getEmpleados().filter(function(e) { return e.activo; }).map(function(e) { return e.nombre; });
  out.MONTACARGAS  = getMontacargas(true)
    .filter(function(m) { return m.estado !== 'baja'; })
    .map(function(m) { return m.codigo + (m.tipo ? ' · ' + m.tipo : ''); });
  out.TIEMPOS_EST    = getTimeposEstimados();
  out.ETAPAS_FLUJO   = {};
  var seq = getFlujosEtapas();
  Object.keys(seq).forEach(function(f) {
    out.ETAPAS_FLUJO[f] = seq[f].map(function(e) { return e.etapa; });
  });
  Object.keys(ETAPAS_FLUJO).forEach(function(f) {          // respaldo de fábrica
    if (!out.ETAPAS_FLUJO[f]) out.ETAPAS_FLUJO[f] = ETAPAS_FLUJO[f];
  });
  out.SECUENCIAS     = seq;
  out.DEPARTAMENTOS  = getDepartamentos(true).map(function(d) { return d.nombre; });
  out.CAMPOS         = getCamposConfig(ctx);
  out.SEMAFOROS      = getSemaforos();
  // El catálogo de tipos de maniobra es cerrado: si la hoja no lo trae, se usa el maestro
  if (!out.TIPOS_MANIOBRA || !out.TIPOS_MANIOBRA.length) out.TIPOS_MANIOBRA = TIPOS_MANIOBRA_DEFAULT;
  if (!out.ADITAMENTOS   || !out.ADITAMENTOS.length)    out.ADITAMENTOS    = CATALOGOS_DEFAULT.ADITAMENTOS;
  out.server_now_ms = Date.now();
  return out;
}

/**
 * Añade a un catálogo los valores que le falten, sin borrar los que ya tenga.
 * Sirve para propagar catálogos nuevos a hojas ya en producción.
 */
function _asegurarValoresCatalogo_(tipo, valores) {
  var cs = ss_().getSheetByName(HOJA_CAT);
  if (!cs) return 0;
  var vals = cs.getDataRange().getValues();
  if (!vals.length) return 0;

  var col = -1;
  for (var c = 0; c < vals[0].length; c++) {
    if (String(vals[0][c] || '').trim() === tipo) { col = c + 1; break; }
  }
  if (col === -1) {
    col = vals[0].length + 1;
    _pintarCabecera_(cs.getRange(1, col).setValue(tipo));
    vals = cs.getDataRange().getValues();
  }

  var existentes = {}, ultima = 1;
  for (var r = 1; r < vals.length; r++) {
    var v = String((vals[r] || [])[col - 1] || '').trim();
    if (v) { existentes[v.toLowerCase()] = true; ultima = r + 1; }
  }
  var faltan = (valores || []).filter(function(v) { return !existentes[String(v).toLowerCase()]; });
  if (faltan.length) {
    cs.getRange(ultima + 1, col, faltan.length, 1).setValues(faltan.map(function(v) { return [v]; }));
  }
  return faltan.length;
}

function agregarCatalogo(catalogo, valor) {
  var cs   = ss_().getSheetByName(HOJA_CAT);
  var vals = cs.getDataRange().getValues();
  var col  = -1;
  for (var c = 0; c < vals[0].length; c++) if (String(vals[0][c]).trim() === catalogo) col = c + 1;
  if (col === -1) { col = vals[0].length + 1; _pintarCabecera_(cs.getRange(1, col).setValue(catalogo)); }
  var ultima = cs.getRange(1, col, cs.getMaxRows(), 1).getValues()
    .filter(function(r) { return String(r[0]).trim() !== ''; }).length;
  cs.getRange(ultima + 1, col).setValue(valor);
  return getCatalogos();
}

/* ════════════════════════════════════════════════════════════
   ADMINISTRACIÓN DE CATÁLOGOS (MASTER)
════════════════════════════════════════════════════════════ */

function getCatalogosAdmin() {
  var cs = ss_().getSheetByName(HOJA_CAT);
  if (!cs) return [];
  var vals = cs.getDataRange().getValues();
  var out  = [];
  if (vals.length) {
    for (var c = 0; c < vals[0].length; c++) {
      var key = String(vals[0][c] || '').trim();
      if (!key) continue;
      var items = [];
      for (var r = 1; r < vals.length; r++) {
        var v = String(vals[r][c] || '').trim();
        if (v) items.push(v);
      }
      out.push({ tipo: key, items: items });
    }
  }
  return out;
}

function guardarCatalogo(tipo, items) {
  var cs = ss_().getSheetByName(HOJA_CAT);
  if (!cs) { setup(); cs = ss_().getSheetByName(HOJA_CAT); }
  var vals = cs.getDataRange().getValues();
  var col  = -1;
  for (var c = 0; c < vals[0].length; c++) {
    if (String(vals[0][c]).trim() === tipo) { col = c + 1; break; }
  }
  if (col === -1) {
    col = vals[0].length + 1;
    _pintarCabecera_(cs.getRange(1, col).setValue(tipo));
  } else {
    if (cs.getMaxRows() > 1) cs.getRange(2, col, cs.getMaxRows() - 1, 1).clearContent();
  }
  if (items && items.length)
    cs.getRange(2, col, items.length, 1).setValues(items.map(function(v) { return [v]; }));
  return { ok: true };
}

function eliminarCatalogo(tipo) {
  var cs = ss_().getSheetByName(HOJA_CAT);
  if (!cs) return { ok: false, error: 'No existe la hoja CATALOGOS' };
  var vals = cs.getDataRange().getValues();
  for (var c = 0; c < vals[0].length; c++) {
    if (String(vals[0][c]).trim() === tipo) { cs.deleteColumn(c + 1); return { ok: true }; }
  }
  return { ok: false, error: 'No se encontró el catálogo ' + tipo };
}

/* ════════════════════════════════════════════════════════════
   EMPLEADOS
════════════════════════════════════════════════════════════ */

function getEmpleados() {
  var sh = hoja_(HOJA_EMP, COL_EMP);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COL_EMP.length).getValues()
    .filter(function(r) { return String(r[0] || '').trim(); })
    .map(function(r) {
      return { id: String(r[0]), nombre: String(r[1]), posicion: String(r[2]),
               montacargas: String(r[3] || ''),
               activo: r[4] === '' || r[4] === null || r[4] === undefined ? true : bool_(r[4]) };
    });
}

function guardarEmpleado(data) {
  var sh = hoja_(HOJA_EMP, COL_EMP);
  if (data.id) {
    var fila = buscarFila_(sh, data.id);
    if (fila > 0) {
      sh.getRange(fila, 1, 1, COL_EMP.length).setValues([[data.id, data.nombre, data.posicion, data.montacargas || '', data.activo !== false]]);
      return { ok: true, id: data.id };
    }
  }
  var id = uuid_();
  sh.appendRow([id, data.nombre, data.posicion, data.montacargas || '', data.activo !== false]);
  return { ok: true, id: id };
}

function eliminarEmpleado(id) {
  var sh   = hoja_(HOJA_EMP, COL_EMP);
  var fila = buscarFila_(sh, id);
  if (fila > 0) sh.deleteRow(fila);
  return { ok: true };
}

function eliminarEmpleadosLote(ids) {
  return seguro_('eliminarEmpleadosLote', function() {
    var sh = hoja_(HOJA_EMP, COL_EMP);
    if (sh.getLastRow() < 2) return { ok: true, eliminados: 0 };
    var set = {};
    [].concat(ids || []).forEach(function(i) { set[String(i)] = true; });
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    var n = 0;
    for (var i = vals.length - 1; i >= 0; i--) {
      if (set[String(vals[i][0])]) { sh.deleteRow(i + 2); n++; }
    }
    return { ok: true, eliminados: n };
  });
}

/* ════════════════════════════════════════════════════════════
   INCIDENCIAS
════════════════════════════════════════════════════════════ */

function getIncidencias() {
  var sh = hoja_(HOJA_INC, COL_INC);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COL_INC.length).getValues()
    .filter(function(r) { return String(r[0] || '').trim(); })
    .map(function(r) {
      return { id: String(r[0]), fecha: fechaISO_(r[1]),
        folio: String(r[2] || ''), empleado: String(r[3] || ''), tipo: String(r[4] || ''),
        severidad: String(r[5] || ''), descripcion: String(r[6] || ''),
        estado: String(r[7] || ''), resolucion: String(r[8] || ''), usuario: String(r[9] || '') };
    }).reverse();
}

function guardarIncidencia(data) {
  var sh = hoja_(HOJA_INC, COL_INC);
  if (data.id) {
    var fila = buscarFila_(sh, data.id);
    if (fila > 0) {
      sh.getRange(fila, 1, 1, COL_INC.length).setValues([[
        data.id, data.fecha, data.folio || '', data.empleado || '',
        data.tipo, data.severidad, data.descripcion, data.estado,
        data.resolucion || '', usuario_(), new Date()
      ]]);
      return { ok: true, id: data.id };
    }
  }
  var id = uuid_();
  var tz = Session.getScriptTimeZone();
  sh.appendRow([id, data.fecha || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'),
    data.folio || '', data.empleado || '', data.tipo, data.severidad,
    data.descripcion, data.estado || 'abierta', data.resolucion || '', usuario_(), new Date()]);
  return { ok: true, id: id };
}

function eliminarIncidencia(id) {
  var sh   = hoja_(HOJA_INC, COL_INC);
  var fila = buscarFila_(sh, id);
  if (fila > 0) sh.deleteRow(fila);
  return { ok: true };
}

function eliminarIncidenciasLote(ids) {
  return seguro_('eliminarIncidenciasLote', function() {
    var sh = hoja_(HOJA_INC, COL_INC);
    if (sh.getLastRow() < 2) return { ok: true, eliminados: 0 };
    var set = {};
    [].concat(ids || []).forEach(function(i) { set[String(i)] = true; });
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    var n = 0;
    for (var i = vals.length - 1; i >= 0; i--) {
      if (set[String(vals[i][0])]) { sh.deleteRow(i + 2); n++; }
    }
    return { ok: true, eliminados: n };
  });
}

/* ════════════════════════════════════════════════════════════
   ETAPAS — LÓGICA INTERNA
════════════════════════════════════════════════════════════ */

/** Secuencia configurada del flujo; si la hoja no la tiene, usa la de fábrica */
function _secuenciaFlujo_(flujo) {
  var f = String(flujo || '').trim().toUpperCase();
  var conf = getFlujosEtapas()[f];
  if (conf && conf.length) return conf;
  return (ETAPAS_FLUJO[f] || []).map(function(e, i) {
    return { orden: i + 1, etapa: e, departamento: '', tiempo_est: 0 };
  });
}

/** Solo los nombres, para el resto del código que ya trabajaba así */
function _etapasFlujo(flujo) {
  return _secuenciaFlujo_(flujo).map(function(s) { return s.etapa; });
}

/**
 * Crea la etapa y ESCRIBE Inicio_dt como Date real, forzando el formato
 * de la celda a datetime para que getValues() siempre devuelva un Date.
 * Ésta era la causa raíz de que el cronómetro no arrancara.
 */
function _crearEtapa(shEta, idManiobra, folio, numEtapa, nombreEtapa, tiempoEst, departamento) {
  var ahora = new Date();
  var id    = uuid_();
  shEta.appendRow([
    id, idManiobra, folio, numEtapa, nombreEtapa, 'en_curso',
    ahora, hhmm_(ahora), '', '',
    '', tiempoEst || 0, '', 'NO',
    0, '', '', usuario_(), ahora,
    departamento || ''
  ]);
  var fila = shEta.getLastRow();
  shEta.getRange(fila, 7).setNumberFormat('yyyy-mm-dd hh:mm:ss').setValue(ahora);
  // La hora va como texto: con formato de hora Sheets la guardaría sobre 1899
  shEta.getRange(fila, 8).setNumberFormat('@').setValue(hhmm_(ahora));
  SpreadsheetApp.flush();
  return id;
}

/* ════════════════════════════════════════════════════════════
   MANIOBRAS
════════════════════════════════════════════════════════════ */

function _fmtObs(data) {
  var extra = data.campos_extra || {};
  var keys  = Object.keys(extra).filter(function(k) { return String(extra[k] || '').trim(); });
  var prefix = keys.length
    ? '[' + keys.map(function(k) { return k + ': ' + extra[k]; }).join(' | ') + '] '
    : '';
  return prefix + (data.observaciones || '');
}

function iniciarManiobra(data) {
  return seguro_('iniciarManiobra', function() {
    data = data || {};

    var faltan = _validarObligatorios_(data);
    if (faltan.length)
      return { ok: false, error: 'Faltan campos obligatorios: ' + faltan.join(', '), campos_faltantes: faltan };

    var errTipo = _validarTipoUnico_(data.tipo_maniobra);
    if (errTipo) return { ok: false, error: errTipo };

    var sh      = hoja_(HOJA, COLUMNAS);
    var shEta   = hoja_(HOJA_ETA, COL_ETA);
    var tiempos = getTimeposEstimados();
    var id      = uuid_();
    var ahora   = new Date();
    var tz      = Session.getScriptTimeZone();
    var fecha   = data.fecha || Utilities.formatDate(ahora, tz, 'yyyy-MM-dd');
    var flujo   = String(data.flujo || '').toUpperCase();
    var secuencia = _secuenciaFlujo_(flujo);
    if (!secuencia.length) return { ok: false, error: 'Flujo sin etapas definidas: ' + flujo };

    var lista   = secuencia.map(function(s) { return s.etapa; });
    var primera = secuencia[0];
    var folio   = generarFolio(data.cliente, fecha, data.no_unidad);
    var monta   = listaTexto_(data.montacargas);

    sh.appendRow([
      id, folio, fecha, data.turno, data.flujo, primera.etapa,
      data.cliente, data.no_unidad, data.tipo_equipo,
      Number(data.cant_equipos || 1), data.material, data.presentacion,
      data.cant_piezas || '', data.unidad_medida, data.tarimas || '', data.peso_tons || '',
      data.tipo_montacargas, data.num_montacargas || '',
      listaTexto_(data.montacarguistas),
      listaTexto_(data.ayudantes),
      'en_curso', ahora, '', 0, '', '', '', 0, '', '', '',
      data.dano_origen ? 'SÍ' : 'NO', data.dano_origen_desc || '',
      'NO', '', _fmtObs(data), 'EN CURSO', usuario_(), ahora,
      monta,
      data.tipo_maniobra || '',
      data.toneladas_netas === '' || data.toneladas_netas === undefined ? '' : Number(data.toneladas_netas),
      data.atados         === '' || data.atados         === undefined ? '' : Number(data.atados),
      data.piezas_sueltas === '' || data.piezas_sueltas === undefined ? '' : Number(data.piezas_sueltas),
      data.aditamento || '',
      data.hora_posicionamiento || '', data.hora_liberacion || '', '',
      '', '', '', '',
      data.prueba_controlada ? 'SÍ' : 'NO', data.etiqueta_prueba || '',
      '', '', ''
    ]);

    var tiempoEst = primera.tiempo_est || tiempos[primera.etapa] || 0;
    var idEtapa   = _crearEtapa(shEta, id, folio, 1, primera.etapa, tiempoEst, primera.departamento);

    // El montacargas queda ocupado mientras la maniobra esté activa
    _setEstadoPorCodigo_(_codigosMontacargas_(monta), 'en_uso');

    return { ok: true, id: id, folio: folio,
      etapa: { id: idEtapa, num: 1, nombre: primera.etapa, total: lista.length,
               tiempo_estimado_min: tiempoEst, departamento: primera.departamento }
    };
  });
}

function registrarManiobra(data) {
  return seguro_('registrarManiobra', function() {
    data = data || {};
    var faltan = _validarObligatorios_(data);
    if (faltan.length)
      return { ok: false, error: 'Faltan campos obligatorios: ' + faltan.join(', '), campos_faltantes: faltan };

    var errTipo = _validarTipoUnico_(data.tipo_maniobra);
    if (errTipo) return { ok: false, error: errTipo };

    var sh    = hoja_(HOJA, COLUMNAS);
    var id    = uuid_();
    var tz    = Session.getScriptTimeZone();
    var fecha = data.fecha || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    var folio = generarFolio(data.cliente, fecha, data.no_unidad);
    var cfg   = getConfigObj();
    var demora   = Number(data.demora_min || 0);
    var total    = minutosEntre(data.hora_inicio, data.hora_fin);
    var efectivo = Math.max(0, total - demora);
    var piezas   = Number(data.cant_piezas || 0);
    var minPieza = (efectivo > 0 && piezas > 0) ? Math.round((efectivo / piezas) * 100) / 100 : '';

    var row = [
      id, folio, fecha, data.turno, data.flujo, data.etapa || '—',
      data.cliente, data.no_unidad, data.tipo_equipo,
      Number(data.cant_equipos || 1), data.material, data.presentacion,
      data.cant_piezas || '', data.unidad_medida, data.tarimas || '', data.peso_tons || '',
      data.tipo_montacargas, data.num_montacargas || '',
      listaTexto_(data.montacarguistas),
      listaTexto_(data.ayudantes),
      'finalizada', '', new Date(), 0, data.hora_inicio, data.hora_fin,
      total, demora, data.causa_demora || '', efectivo, minPieza,
      data.dano_origen ? 'SÍ' : 'NO', data.dano_origen_desc || '',
      data.dano_maniobra ? 'SÍ' : 'NO', data.dano_maniobra_desc || '',
      _fmtObs(data), semaforo_(total, cfg), usuario_(), new Date(),
      listaTexto_(data.montacargas),
      data.tipo_maniobra || '',
      data.toneladas_netas === '' || data.toneladas_netas === undefined ? '' : Number(data.toneladas_netas),
      data.atados         === '' || data.atados         === undefined ? '' : Number(data.atados),
      data.piezas_sueltas === '' || data.piezas_sueltas === undefined ? '' : Number(data.piezas_sueltas),
      data.aditamento || '',
      data.hora_posicionamiento || '', data.hora_liberacion || '', '',
      '', '', '', '',
      data.prueba_controlada ? 'SÍ' : 'NO', data.etiqueta_prueba || '',
      '', '', ''
    ];

    // Las métricas de costeo se calculan aquí mismo: el registro ya nace cerrado
    var m = _aplicarMetricas_(row, cfg, getSemaforos());
    sh.appendRow(row);

    return { ok: true, id: id, folio: folio, tiempo_total_min: total,
             revision: m.revision, motivo_revision: m.motivo };
  });
}

function eliminarManiobra(id) {
  return eliminarManiobrasLote([id]);
}

function eliminarManiobrasLote(ids) {
  return seguro_('eliminarManiobrasLote', function() {
    var lista = [].concat(ids || []).map(String).filter(Boolean);
    if (!lista.length) return { ok: true, eliminados: 0 };
    var set = {};
    lista.forEach(function(i) { set[i] = true; });

    var sh    = hoja_(HOJA, COLUMNAS);
    var shEta = hoja_(HOJA_ETA, COL_ETA);
    var props = PropertiesService.getScriptProperties();
    var n = 0;

    if (sh.getLastRow() >= 2) {
      var mans = sh.getRange(2, 1, sh.getLastRow() - 1, COLUMNAS.length).getValues();
      for (var i = mans.length - 1; i >= 0; i--) {
        if (!set[String(mans[i][0])]) continue;
        // El equipo asignado vuelve al inventario antes de borrar el registro
        _setEstadoPorCodigo_(_codigosMontacargas_(mans[i][39]), 'disponible');
        sh.deleteRow(i + 2);
        n++;
      }
    }

    if (shEta.getLastRow() >= 2) {
      var eta = shEta.getRange(2, 1, shEta.getLastRow() - 1, 2).getValues();
      for (var j = eta.length - 1; j >= 0; j--) {
        if (set[String(eta[j][1])]) {
          props.deleteProperty('pe_' + String(eta[j][0]));
          shEta.deleteRow(j + 2);
        }
      }
    }
    return { ok: true, eliminados: n };
  });
}

function editarManiobra(id, data) {
  return seguro_('editarManiobra', function() {
    var sh   = hoja_(HOJA, COLUMNAS);
    var fila = buscarFila_(sh, id);
    if (fila < 0) return { ok: false, error: 'Maniobra no encontrada: ' + id };
    var row  = sh.getRange(fila, 1, 1, COLUMNAS.length).getValues()[0];

    if (data.cliente          !== undefined) row[6]  = data.cliente;
    if (data.no_unidad        !== undefined) row[7]  = data.no_unidad;
    if (data.tipo_equipo      !== undefined) row[8]  = data.tipo_equipo;
    if (data.material         !== undefined) row[10] = data.material;
    if (data.presentacion     !== undefined) row[11] = data.presentacion;
    if (data.cant_piezas      !== undefined) row[12] = data.cant_piezas;
    if (data.unidad_medida    !== undefined) row[13] = data.unidad_medida;
    if (data.tarimas          !== undefined) row[14] = data.tarimas;
    if (data.peso_tons        !== undefined) row[15] = data.peso_tons;
    if (data.tipo_montacargas !== undefined) row[16] = data.tipo_montacargas;
    if (data.montacarguistas  !== undefined) row[18] = listaTexto_(data.montacarguistas);
    if (data.ayudantes        !== undefined) row[19] = listaTexto_(data.ayudantes);
    if (data.observaciones    !== undefined) row[35] = data.observaciones;
    if (data.montacargas      !== undefined) {
      var activa = String(row[20] || '') === 'en_curso' || String(row[20] || '') === 'en_pausa';
      if (activa) {
        // Suelta los que salen y ocupa los que entran
        _setEstadoPorCodigo_(_codigosMontacargas_(row[39]), 'disponible');
        _setEstadoPorCodigo_(_codigosMontacargas_(listaTexto_(data.montacargas)), 'en_uso');
      }
      row[39] = listaTexto_(data.montacargas);
    }

    if (data.tipo_maniobra    !== undefined) {
      var errTipo = _validarTipoUnico_(data.tipo_maniobra);
      if (errTipo) return { ok: false, error: errTipo };
      row[C_TIPO_MAN] = data.tipo_maniobra;
    }
    if (data.toneladas_netas  !== undefined) row[C_TON]    = data.toneladas_netas === '' ? '' : Number(data.toneladas_netas);
    if (data.atados           !== undefined) row[C_ATADOS] = data.atados         === '' ? '' : Number(data.atados);
    if (data.piezas_sueltas   !== undefined) row[C_PZAS]   = data.piezas_sueltas === '' ? '' : Number(data.piezas_sueltas);
    if (data.aditamento       !== undefined) row[C_ADIT]   = data.aditamento;
    if (data.hora_posicionamiento !== undefined) row[C_H_POS] = data.hora_posicionamiento;
    if (data.hora_liberacion      !== undefined) row[C_H_LIB] = data.hora_liberacion;
    if (data.prueba_controlada    !== undefined) row[C_PRUEBA] = data.prueba_controlada ? 'SÍ' : 'NO';
    if (data.etiqueta_prueba      !== undefined) row[C_ETIQ_PRUEBA] = data.etiqueta_prueba;

    // Editar datos de costeo obliga a recalcular las métricas derivadas
    if (String(row[20] || '') === 'finalizada') _aplicarMetricas_(row, getConfigObj(), getSemaforos());

    sh.getRange(fila, 1, 1, COLUMNAS.length).setValues([row]);
    return { ok: true };
  });
}

function forzarCierreManiobra(id) {
  return forzarCierreManiobrasLote([id]);
}

function forzarCierreManiobrasLote(ids) {
  return seguro_('forzarCierreManiobrasLote', function() {
    var lista = [].concat(ids || []).map(String).filter(Boolean);
    if (!lista.length) return { ok: true, cerradas: 0 };
    var set = {};
    lista.forEach(function(i) { set[i] = true; });

    var sh    = hoja_(HOJA, COLUMNAS);
    var shEta = hoja_(HOJA_ETA, COL_ETA);
    var props = PropertiesService.getScriptProperties();
    var ahora = new Date();
    var n = 0;

    // Cerrar etapas abiertas
    if (shEta.getLastRow() >= 2) {
      var etaVals = shEta.getRange(2, 1, shEta.getLastRow() - 1, COL_ETA.length).getValues();
      etaVals.forEach(function(r, i) {
        if (!set[String(r[1])]) return;
        if (r[5] !== 'en_curso' && r[5] !== 'en_pausa') return;
        r[5]  = 'finalizada';
        r[8]  = ahora;
        r[9]  = hhmm_(ahora);
        if (!r[10]) r[10] = minutosEntre(horaTexto_(r[7]), hhmm_(ahora));
        r[18] = ahora;
        props.deleteProperty('pe_' + String(r[0]));
        shEta.getRange(i + 2, 1, 1, COL_ETA.length).setValues([r]);
      });
    }

    // Cerrar maniobras
    if (sh.getLastRow() >= 2) {
      var mans = sh.getRange(2, 1, sh.getLastRow() - 1, COLUMNAS.length).getValues();
      mans.forEach(function(r, i) {
        if (!set[String(r[0])]) return;
        _cerrarManiobra(String(r[0]), i + 2, sh, shEta, {});   // libera el equipo por dentro
        n++;
      });
    }
    return { ok: true, cerradas: n };
  });
}

/**
 * Devuelve todas las maniobras con claves normalizadas (snake_case).
 * El filtrado fino se hace en el cliente para que sea instantáneo.
 */
function getManiobras(filtros) {
  return seguro_('getManiobras', function() {
    filtros = filtros || {};
    var sh = hoja_(HOJA, COLUMNAS);
    if (sh.getLastRow() < 2) return { ok: true, maniobras: [], server_now_ms: Date.now() };

    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, COLUMNAS.length).getValues();
    var out  = [];
    var limite = Number(filtros.limite || 1000);

    for (var i = vals.length - 1; i >= 0; i--) {
      var r = vals[i];
      if (!String(r[0] || '').trim()) continue;
      out.push({
        id:                  String(r[0]),
        folio:               String(r[1] || ''),
        fecha:               fechaISO_(r[2]),
        turno:               String(r[3] || ''),
        flujo:               String(r[4] || ''),
        etapa:               String(r[5] || ''),
        cliente:             String(r[6] || ''),
        no_unidad:           String(r[7] || ''),
        tipo_equipo:         String(r[8] || ''),
        cant_equipos:        Number(r[9] || 0),
        material:            String(r[10] || ''),
        presentacion:        String(r[11] || ''),
        cant_piezas:         r[12] === '' ? '' : Number(r[12] || 0),
        unidad_medida:       String(r[13] || ''),
        tarimas:             r[14] === '' ? '' : Number(r[14] || 0),
        peso_tons:           r[15] === '' ? '' : Number(r[15] || 0),
        tipo_montacargas:    String(r[16] || ''),
        num_montacargas:     String(r[17] || ''),
        montacarguistas:     String(r[18] || ''),
        ayudantes:           String(r[19] || ''),
        estado:              String(r[20] || ''),
        iniciado_en:         fechaHora_(r[21]),
        finalizado_en:       fechaHora_(r[22]),
        hora_inicio:         horaTexto_(r[24]),
        hora_fin:            horaTexto_(r[25]),
        tiempo_total_min:    r[26] === '' ? '' : Number(r[26] || 0),
        demora_min:          r[27] === '' ? '' : Number(r[27] || 0),
        causa_demora:        String(r[28] || ''),
        tiempo_efectivo_min: r[29] === '' ? '' : Number(r[29] || 0),
        min_pieza:           r[30] === '' ? '' : Number(r[30] || 0),
        dano_origen:         String(r[31] || ''),
        dano_origen_desc:    String(r[32] || ''),
        dano_maniobra:       String(r[33] || ''),
        dano_maniobra_desc:  String(r[34] || ''),
        observaciones:       String(r[35] || ''),
        semaforo:            String(r[36] || ''),
        registrado_por:      String(r[37] || ''),
        montacargas:         String(r[39] || ''),

        tipo_maniobra:       String(r[C_TIPO_MAN] || ''),
        toneladas_netas:     r[C_TON]    === '' ? '' : Number(r[C_TON] || 0),
        atados:              r[C_ATADOS] === '' ? '' : Number(r[C_ATADOS] || 0),
        piezas_sueltas:      r[C_PZAS]   === '' ? '' : Number(r[C_PZAS] || 0),
        aditamento:          String(r[C_ADIT] || ''),
        hora_posicionamiento:horaTexto_(r[C_H_POS]),
        hora_liberacion:     horaTexto_(r[C_H_LIB]),
        ocupacion_spot_min:  r[C_OCUPACION] === '' ? '' : Number(r[C_OCUPACION] || 0),
        min_por_atado:       r[C_MIN_ATADO] === '' ? '' : Number(r[C_MIN_ATADO] || 0),
        min_por_tonelada:    r[C_MIN_TON]   === '' ? '' : Number(r[C_MIN_TON] || 0),
        min_por_pieza:       r[C_MIN_PIEZA] === '' ? '' : Number(r[C_MIN_PIEZA] || 0),
        min_por_tarima:      r[C_MIN_TARIMA]=== '' ? '' : Number(r[C_MIN_TARIMA] || 0),
        min_montacargas:     r[C_MIN_MONTA] === '' ? '' : Number(r[C_MIN_MONTA] || 0),
        min_montacargas_ton: r[C_MIN_MONTA_TON] === '' ? '' : Number(r[C_MIN_MONTA_TON] || 0),
        prueba_controlada:   String(r[C_PRUEBA] || 'NO'),
        etiqueta_prueba:     String(r[C_ETIQ_PRUEBA] || ''),
        revision:            String(r[C_REVISION] || ''),
        motivo_revision:     String(r[C_MOTIVO_REV] || ''),
        validado_por:        String(r[C_VALIDADO] || ''),
        comentario_supervisor: String(r[C_COMENT_SUP] || '')
      });
      if (out.length >= limite) break;
    }
    return { ok: true, maniobras: out, server_now_ms: Date.now() };
  });
}

/**
 * Maniobras en curso con TODOS los datos que el cronómetro necesita.
 *
 * El cliente recibe, por cada etapa:
 *   inicio_ms       → instante de arranque en epoch ms (fuente principal)
 *   elapsed_seg     → segundos ya transcurridos según el servidor (respaldo)
 *   pausa_acum_seg  → pausas acumuladas
 *   pausa_desde_ms  → si está pausada, desde cuándo
 * más un server_now_ms global para corregir la desviación del reloj local.
 * Con eso el cronómetro corre 100 % en el navegador, sin depender de refrescos.
 */
function getManiobrasEnCurso(ctx) {
  return seguro_('getManiobrasEnCurso', function() {
    var shM   = hoja_(HOJA, COLUMNAS);
    var shEta = hoja_(HOJA_ETA, COL_ETA);
    var props = PropertiesService.getScriptProperties();
    var ahora = Date.now();

    if (shM.getLastRow() < 2) return { ok: true, server_now_ms: ahora, maniobras: [] };
    var mansVals = shM.getRange(2, 1, shM.getLastRow() - 1, COLUMNAS.length).getValues();
    var active   = mansVals.filter(function(r) {
      var e = String(r[20] || '');
      return e === 'en_curso' || e === 'en_pausa';
    });
    if (!active.length) return { ok: true, server_now_ms: ahora, maniobras: [] };

    // Índice de etapas por maniobra
    var etaIdx = {};
    if (shEta.getLastRow() >= 2) {
      shEta.getRange(2, 1, shEta.getLastRow() - 1, COL_ETA.length).getValues().forEach(function(r) {
        var idM = String(r[1] || '');
        if (!idM) return;
        if (!etaIdx[idM]) etaIdx[idM] = [];

        var estado    = String(r[5] || '');
        var activa    = (estado === 'en_curso' || estado === 'en_pausa');
        var inicioMs  = toMs_(r[6]);
        var pausaAcum = Number(r[14] || 0);
        var pausaDesde = 0;
        if (estado === 'en_pausa') pausaDesde = Number(props.getProperty('pe_' + String(r[0])) || 0);

        // Segundos vivos calculados en el servidor (respaldo del cálculo cliente)
        var pausaActual = pausaDesde ? Math.round((ahora - pausaDesde) / 1000) : 0;
        var elapsed = 0;
        if (activa && inicioMs) {
          elapsed = Math.max(0, Math.round((ahora - inicioMs) / 1000) - pausaAcum - pausaActual);
        } else if (estado === 'finalizada') {
          elapsed = Math.round(Number(r[10] || 0) * 60);
        }

        etaIdx[idM].push({
          id:                  String(r[0] || ''),
          num:                 Number(r[3] || 0),
          nombre:              String(r[4] || ''),
          estado:              estado,
          inicio_ms:           inicioMs,
          fin_ms:              toMs_(r[8]),
          hora_inicio:         horaTexto_(r[7]),
          hora_fin:            horaTexto_(r[9]),
          tiempo_min:          Number(r[10] || 0),
          tiempo_estimado_min: Number(r[11] || 0),
          pausa_acum_seg:      pausaAcum,
          pausa_desde_ms:      pausaDesde,
          elapsed_seg:         elapsed,
          departamento:        String(r[C_ETA_DEPTO] || ''),
          // Un operador solo ve y opera las etapas de su departamento
          visible:             _puedeVer_(r[C_ETA_DEPTO], ctx),
          sin_inicio:          activa && !inicioMs   // bandera para reparación
        });
      });
    }

    var maniobras = active.map(function(r) {
      var idM    = String(r[0] || '');
      var etapas = (etaIdx[idM] || []).sort(function(a, b) { return a.num - b.num; });

      var etapaActual = null;
      for (var i = 0; i < etapas.length; i++) {
        if (etapas[i].estado === 'en_curso' || etapas[i].estado === 'en_pausa') {
          etapaActual = etapas[i];
          break;
        }
      }

      // Segundos ya consolidados de las etapas finalizadas
      var completadoSeg = etapas.reduce(function(s, e) {
        return s + (e.estado === 'finalizada' ? Math.round(Number(e.tiempo_min || 0) * 60) : 0);
      }, 0);

      return {
        id:              idM,
        folio:           String(r[1] || ''),
        fecha:           fechaISO_(r[2]),
        turno:           String(r[3] || ''),
        flujo:           String(r[4] || ''),
        cliente:         String(r[6] || ''),
        no_unidad:       String(r[7] || ''),
        tipo_equipo:     String(r[8] || ''),
        material:        String(r[10] || ''),
        presentacion:    String(r[11] || ''),
        cant_piezas:     r[12] === '' ? '' : Number(r[12] || 0),
        tarimas:         Number(r[14] || 0),
        montacarguistas: String(r[18] || ''),
        ayudantes:       String(r[19] || ''),
        estado:          String(r[20] || ''),
        iniciado_ms:     toMs_(r[21]),
        observaciones:   String(r[35] || ''),
        montacargas:     String(r[39] || ''),
        tipo_maniobra:   String(r[C_TIPO_MAN] || ''),
        // Cantidades para calcular productividad en vivo contra el cronómetro
        toneladas_netas: Number(r[C_TON]    || 0),
        atados:          Number(r[C_ATADOS] || 0),
        piezas_sueltas:  Number(r[C_PZAS]   || 0) || Number(r[12] || 0),
        num_montacargas: _numMontacargas_(r),
        aditamento:      String(r[C_ADIT] || ''),
        hora_posicionamiento: horaTexto_(r[C_H_POS]),
        hora_liberacion:      horaTexto_(r[C_H_LIB]),
        prueba_controlada:    String(r[C_PRUEBA] || 'NO'),
        completado_seg:  completadoSeg,
        etapa_actual:    etapaActual,
        // Puede operar el cronómetro solo si la etapa activa es de su área
        puede_operar:    !etapaActual || etapaActual.visible !== false,
        etapas:          etapas
      };
    });

    return { ok: true, server_now_ms: ahora, maniobras: maniobras };
  });
}

/* ════════════════════════════════════════════════════════════
   ETAPAS — OPERACIONES
════════════════════════════════════════════════════════════ */

function pausarEtapa(idEtapa) {
  return seguro_('pausarEtapa', function() {
    var shEta = hoja_(HOJA_ETA, COL_ETA);
    var fila  = buscarFila_(shEta, idEtapa);
    if (fila < 0) return { ok: false, error: 'Etapa no encontrada: ' + idEtapa };

    var rowData  = shEta.getRange(fila, 1, 1, COL_ETA.length).getValues()[0];
    var estado   = String(rowData[5]  || '');
    var idMan    = String(rowData[1]  || '');
    var acumPrev = Number(rowData[14] || 0);

    var props    = PropertiesService.getScriptProperties();
    var propKey  = 'pe_' + idEtapa;
    var shM      = hoja_(HOJA, COLUMNAS);
    var filaM    = buscarFila_(shM, idMan);
    var nuevo;

    if (estado === 'en_pausa') {
      var desde = Number(props.getProperty(propKey) || 0);
      var acum  = acumPrev + (desde ? Math.round((Date.now() - desde) / 1000) : 0);
      shEta.getRange(fila, 15).setValue(acum);
      shEta.getRange(fila,  6).setValue('en_curso');
      props.deleteProperty(propKey);
      if (filaM > 0) shM.getRange(filaM, 21).setValue('en_curso');
      nuevo = 'en_curso';
    } else {
      props.setProperty(propKey, String(Date.now()));
      shEta.getRange(fila, 6).setValue('en_pausa');
      if (filaM > 0) shM.getRange(filaM, 21).setValue('en_pausa');
      nuevo = 'en_pausa';
    }
    SpreadsheetApp.flush();
    return { ok: true, estado: nuevo };
  });
}

function finalizarEtapa(idEtapa, extras) {
  return seguro_('finalizarEtapa', function() {
    extras = extras || {};
    var shEta = hoja_(HOJA_ETA, COL_ETA);
    var fila  = buscarFila_(shEta, idEtapa);
    if (fila < 0) return { ok: false, error: 'Etapa no encontrada: ' + idEtapa };

    var rowData    = shEta.getRange(fila, 1, 1, COL_ETA.length).getValues()[0];
    var idManiobra = String(rowData[1]  || '');
    var folio      = String(rowData[2]  || '');
    var numEtapa   = Number(rowData[3]  || 0);
    var horaInicio = horaTexto_(rowData[7]);
    var inicioMs   = toMs_(rowData[6]);
    var tiempoEst  = Number(rowData[11] || 0);
    var acum       = Number(rowData[14] || 0);

    var props   = PropertiesService.getScriptProperties();
    var propKey = 'pe_' + idEtapa;
    var desde   = Number(props.getProperty(propKey) || 0);
    if (desde) { acum += Math.round((Date.now() - desde) / 1000); props.deleteProperty(propKey); }

    var ahora   = new Date();
    var horaFin = hhmm_(ahora);

    // Preferimos la diferencia real en ms; hh:mm es el respaldo
    var tiempoMin = inicioMs
      ? Math.max(0, Math.round((ahora.getTime() - inicioMs) / 60000))
      : minutosEntre(horaInicio, horaFin);

    var pausaMins = Math.round(acum / 60);
    var demora    = Number(extras.demora_min || 0) + pausaMins;
    var retraso   = (tiempoEst > 0) ? Math.max(0, tiempoMin - tiempoEst) : 0;

    var updRow = rowData.slice();
    updRow[5]  = 'finalizada';
    updRow[8]  = ahora;
    updRow[9]  = horaFin;
    updRow[10] = tiempoMin;
    updRow[12] = retraso;
    updRow[14] = acum;
    if (extras.causa_demora)  updRow[15] = extras.causa_demora;
    if (extras.observaciones) updRow[16] = extras.observaciones;
    shEta.getRange(fila, 1, 1, COL_ETA.length).setValues([updRow]);

    return _avanzarOManiobra(idManiobra, folio, numEtapa, extras);
  });
}

function marcarEtapaNoAplica(idEtapa) {
  return seguro_('marcarEtapaNoAplica', function() {
    var shEta = hoja_(HOJA_ETA, COL_ETA);
    var fila  = buscarFila_(shEta, idEtapa);
    if (fila < 0) return { ok: false, error: 'Etapa no encontrada: ' + idEtapa };

    PropertiesService.getScriptProperties().deleteProperty('pe_' + idEtapa);

    var rowData    = shEta.getRange(fila, 1, 1, COL_ETA.length).getValues()[0];
    var idManiobra = String(rowData[1] || '');
    var folio      = String(rowData[2] || '');
    var numEtapa   = Number(rowData[3] || 0);

    shEta.getRange(fila,  6).setValue('no_aplica');
    shEta.getRange(fila, 14).setValue('SÍ');

    return _avanzarOManiobra(idManiobra, folio, numEtapa, {});
  });
}

/** Flujo de una maniobra, por id */
function _flujoDe_(idManiobra) {
  var sh   = hoja_(HOJA, COLUMNAS);
  var fila = buscarFila_(sh, idManiobra);
  return fila > 0 ? String(sh.getRange(fila, 5).getValue() || '') : '';
}

/** Hora de liberación ya capturada, si la hay */
function _horaLiberacionDe_(idManiobra) {
  var sh   = hoja_(HOJA, COLUMNAS);
  var fila = buscarFila_(sh, idManiobra);
  return fila > 0 ? horaTexto_(sh.getRange(fila, C_H_LIB + 1).getValue()) : '';
}

/** Guarda la hora de liberación desde la tarjeta, sin cerrar nada */
function registrarLiberacion(idManiobra, hora) {
  return seguro_('registrarLiberacion', function() {
    var h = horaTexto_(hora);
    if (!h) return { ok: false, error: 'Hora de liberación no válida' };
    var sh   = hoja_(HOJA, COLUMNAS);
    var fila = buscarFila_(sh, idManiobra);
    if (fila < 0) return { ok: false, error: 'Maniobra no encontrada' };
    sh.getRange(fila, C_H_LIB + 1).setNumberFormat('@').setValue(h);
    return { ok: true, hora: h };
  });
}

/**
 * Repara una etapa activa cuya hora de inicio se perdió o quedó en texto.
 * Es la salida de emergencia cuando un cronómetro no arranca.
 */
function repararEtapa(idEtapa, inicioIso) {
  return seguro_('repararEtapa', function() {
    var shEta = hoja_(HOJA_ETA, COL_ETA);
    var fila  = buscarFila_(shEta, idEtapa);
    if (fila < 0) return { ok: false, error: 'Etapa no encontrada: ' + idEtapa };

    var inicio = inicioIso ? new Date(inicioIso) : new Date();
    if (isNaN(inicio.getTime())) inicio = new Date();

    shEta.getRange(fila, 7).setNumberFormat('yyyy-mm-dd hh:mm:ss').setValue(inicio);
    shEta.getRange(fila, 8).setValue(hhmm_(inicio));
    shEta.getRange(fila, 15).setValue(0);
    PropertiesService.getScriptProperties().deleteProperty('pe_' + idEtapa);
    SpreadsheetApp.flush();
    return { ok: true, inicio_ms: inicio.getTime() };
  });
}

function _avanzarOManiobra(idManiobra, folio, numActual, extras) {
  var shM   = hoja_(HOJA, COLUMNAS);
  var filaM = buscarFila_(shM, idManiobra);
  if (filaM < 0) return { ok: false, error: 'Maniobra no encontrada: ' + idManiobra };

  var flujo  = String(shM.getRange(filaM, 5).getValue() || '');
  var secuencia = _secuenciaFlujo_(flujo);
  var sigNum = numActual + 1;
  var shEta  = hoja_(HOJA_ETA, COL_ETA);

  if (sigNum <= secuencia.length) {
    var sig       = secuencia[sigNum - 1];
    var tiempos   = getTimeposEstimados();
    var tiempoEst = sig.tiempo_est || tiempos[sig.etapa] || 0;
    var idSig     = _crearEtapa(shEta, idManiobra, folio, sigNum, sig.etapa, tiempoEst, sig.departamento);
    shM.getRange(filaM,  6).setValue(sig.etapa);
    shM.getRange(filaM, 21).setValue('en_curso');
    return { ok: true, maniobra_finalizada: false,
      siguiente: { id: idSig, num: sigNum, nombre: sig.etapa, total: secuencia.length,
                   tiempo_estimado_min: tiempoEst, departamento: sig.departamento }
    };
  }

  return _cerrarManiobra(idManiobra, filaM, shM, shEta, extras);
}

/** Extrae los códigos de montacargas de un valor "MC-01 · Contrabalanceado; MC-02 · …" */
function _codigosMontacargas_(valor) {
  return textoLista_(valor).map(function(s) { return s.split('·')[0].trim(); }).filter(Boolean);
}

function _cerrarManiobra(idManiobra, filaM, shM, shEta, extras) {
  var etapas = [];
  if (shEta.getLastRow() >= 2) {
    shEta.getRange(2, 1, shEta.getLastRow() - 1, COL_ETA.length).getValues().forEach(function(r) {
      if (String(r[1]) !== String(idManiobra)) return;
      etapas.push({ num: Number(r[3]), estado: String(r[5]),
        hora_inicio: horaTexto_(r[7]), hora_fin: horaTexto_(r[9]),
        tiempo_min: Number(r[10] || 0), pausa_acum_seg: Number(r[14] || 0) });
    });
  }
  etapas.sort(function(a, b) { return a.num - b.num; });

  var finalizadas = etapas.filter(function(e) { return e.estado === 'finalizada'; });
  var sumaTotal   = 0, sumaDemora = 0;
  finalizadas.forEach(function(e) {
    sumaTotal  += e.tiempo_min;
    sumaDemora += Math.round(e.pausa_acum_seg / 60);
  });
  sumaDemora += Number((extras || {}).demora_min || 0);
  var efectivo = Math.max(0, sumaTotal - sumaDemora);
  var piezas   = Number(shM.getRange(filaM, 13).getValue() || 0);
  var minPieza = (piezas > 0 && efectivo > 0) ? Math.round((efectivo / piezas) * 100) / 100 : '';

  var horaInicio = finalizadas.length ? finalizadas[0].hora_inicio : '';
  var horaFin    = finalizadas.length ? finalizadas[finalizadas.length - 1].hora_fin : '';
  var ahora      = new Date();
  var cfg        = getConfigObj();

  // Se escribe la fila completa de una sola pasada para poder calcular
  // las métricas de costeo sobre los valores ya consolidados.
  var rango = shM.getRange(filaM, 1, 1, COLUMNAS.length);
  var row   = rango.getValues()[0];

  row[5]  = 'Completada';
  row[20] = 'finalizada';
  row[22] = ahora;
  row[24] = horaInicio;
  row[25] = horaFin;
  row[26] = sumaTotal;
  row[27] = sumaDemora;
  row[29] = efectivo;
  row[30] = minPieza;
  if (extras && extras.causa_demora && !String(row[28] || '').trim()) row[28] = extras.causa_demora;
  if (extras && extras.dano_maniobra) {
    row[33] = 'SÍ';
    row[34] = extras.dano_maniobra_desc || '';
  }
  // Hora de liberación del furgón: se toma la del cierre si no se capturó antes
  if (!String(row[C_H_LIB] || '').trim() && extras && extras.hora_liberacion) {
    row[C_H_LIB] = extras.hora_liberacion;
  }

  var m = _aplicarMetricas_(row, cfg, getSemaforos());
  rango.setValues([row]);

  // Al cerrar la maniobra el equipo vuelve al inventario disponible.
  // Va aquí dentro para que ocurra por cualquier vía de cierre.
  _setEstadoPorCodigo_(_codigosMontacargas_(row[39]), 'disponible');

  return { ok: true, maniobra_finalizada: true,
    tiempo_total_min: sumaTotal, tiempo_efectivo_min: efectivo, demora_min: sumaDemora,
    min_por_atado: m.minAtado, min_por_tonelada: m.minTon,
    min_montacargas: m.minMonta, min_montacargas_por_ton: m.minMontaTon,
    revision: m.revision, motivo_revision: m.motivo,
    semaforo: row[36] };
}

/* ════════════════════════════════════════════════════════════
   INDICADORES Y SERIES
════════════════════════════════════════════════════════════ */

function indicadores(dias) {
  return seguro_('indicadores', function() {
    dias = Number(dias || 30);
    var sh = hoja_(HOJA, COLUMNAS);
    var base = { ok: true, maniobras: 0, en_curso: 0, promedio_min: 0, promedio_efectivo_min: 0,
      demora_total_min: 0, danos: 0, total_registros: 0, excluidos_revision: 0,
      semaforo: { VERDE: 0, 'ÁMBAR': 0, ROJO: 0 },
      por_cliente: [], por_etapa: [], por_flujo: [], por_empleado: [], por_tipo: [] };
    if (sh.getLastRow() < 2) return base;

    var vals   = sh.getRange(2, 1, sh.getLastRow() - 1, COLUMNAS.length).getValues();
    var limite = new Date();
    limite.setDate(limite.getDate() - dias);
    limite.setHours(0, 0, 0, 0);

    var tot = 0, enCurso = 0, sumaTotal = 0, sumaEfec = 0, conTiempo = 0, demoras = 0, danos = 0;
    var excluidos = 0;
    var sem = { VERDE: 0, 'ÁMBAR': 0, ROJO: 0 };
    var cli = {}, eta = {}, flu = {}, emp = {}, tip = {};

    function acum(mapa, clave, min) {
      clave = String(clave || '').trim();
      if (!clave) return;
      if (!mapa[clave]) mapa[clave] = { nombre: clave, maniobras: 0, suma: 0, con: 0 };
      mapa[clave].maniobras++;
      if (typeof min === 'number' && min > 0) { mapa[clave].suma += min; mapa[clave].con++; }
    }
    function lista(mapa) {
      return Object.keys(mapa).map(function(k) {
        var m = mapa[k];
        return { nombre: m.nombre, maniobras: m.maniobras, promedio_min: m.con ? Math.round(m.suma / m.con) : 0 };
      }).sort(function(a, b) { return b.maniobras - a.maniobras; });
    }
    /** Fecha del registro: usa Fecha, y si falla cae a "Iniciado en" o "Finalizado en" */
    function fechaDe(r) {
      var cand = [r[2], r[21], r[22]];
      for (var i = 0; i < cand.length; i++) {
        var ms = toMs_(cand[i]);
        if (ms) return new Date(ms);
      }
      return null;
    }

    for (var i = 0; i < vals.length; i++) {
      var r = vals[i];
      if (!String(r[0] || '').trim()) continue;
      base.total_registros++;

      var estado = String(r[20] || '');
      var f = fechaDe(r);

      if (estado !== 'finalizada') {
        // Las maniobras activas cuentan siempre, sin importar la fecha
        if (estado === 'en_curso' || estado === 'en_pausa') enCurso++;
        continue;
      }
      if (!f || f < limite) continue;

      // Las filas marcadas REVISIÓN no ensucian los promedios generales
      if (String(r[C_REVISION] || '') === 'REVISIÓN') { excluidos++; continue; }

      tot++;
      var min = Number(r[26] || 0);
      if (min > 0) { sumaTotal += min; conTiempo++; }
      var efec = Number(r[29] || 0);
      if (efec > 0) sumaEfec += efec;
      demoras += Number(r[27] || 0);
      if (String(r[33]) === 'SÍ' || String(r[31]) === 'SÍ') danos++;
      var s = String(r[36] || '');
      if (sem[s] !== undefined) sem[s]++;

      acum(cli, r[6],  min);
      acum(eta, r[5],  min);
      acum(flu, r[4],  min);
      acum(tip, r[C_TIPO_MAN], min);
      textoLista_(r[18]).concat(textoLista_(r[19])).forEach(function(n) { acum(emp, n, min); });
    }

    base.maniobras             = tot;
    base.en_curso              = enCurso;
    base.promedio_min          = conTiempo ? Math.round(sumaTotal / conTiempo) : 0;
    base.promedio_efectivo_min = conTiempo ? Math.round(sumaEfec / conTiempo) : 0;
    base.demora_total_min      = Math.round(demoras);
    base.danos                 = danos;
    base.semaforo              = sem;
    base.por_cliente           = lista(cli);
    base.por_etapa             = lista(eta);
    base.por_flujo             = lista(flu);
    base.por_empleado          = lista(emp);
    base.por_tipo              = lista(tip);
    base.excluidos_revision    = excluidos;
    return base;
  });
}

/* ════════════════════════════════════════════════════════════
   ESTADÍSTICA POR TIPO DE MANIOBRA
   Regla de oro: segmentar primero por tipo, luego por cliente.
   Nunca se promedian maniobras de tipos distintos.
════════════════════════════════════════════════════════════ */

function _percentil_(arr, p) {
  if (!arr || !arr.length) return 0;
  var a = arr.slice().sort(function(x, y) { return x - y; });
  if (a.length === 1) return _redondea_(a[0], 1);
  var idx = (a.length - 1) * p;
  var lo  = Math.floor(idx), hi = Math.ceil(idx);
  var val = lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (idx - lo);
  return _redondea_(val, 1);
}
function _mediana_(arr) { return _percentil_(arr, 0.5); }
function _promedio_(arr) {
  if (!arr || !arr.length) return 0;
  var s = 0;
  arr.forEach(function(v) { s += v; });
  return _redondea_(s / arr.length, 1);
}

function _nuevoAcum_(nombre) {
  return { nombre: nombre, total: [], atado: [], ton: [], pieza: [], tarima: [],
           montaTon: [], ocupacion: [], paro: [], semaforos: {} };
}

function _acumular_(a, r) {
  var t = Number(r[26] || 0);
  if (t > 0) a.total.push(t);
  if (Number(r[C_MIN_ATADO]     || 0) > 0) a.atado.push(Number(r[C_MIN_ATADO]));
  if (Number(r[C_MIN_TON]       || 0) > 0) a.ton.push(Number(r[C_MIN_TON]));
  if (Number(r[C_MIN_PIEZA]     || 0) > 0) a.pieza.push(Number(r[C_MIN_PIEZA]));
  if (Number(r[C_MIN_TARIMA]    || 0) > 0) a.tarima.push(Number(r[C_MIN_TARIMA]));
  if (Number(r[C_MIN_MONTA_TON] || 0) > 0) a.montaTon.push(Number(r[C_MIN_MONTA_TON]));
  if (Number(r[C_OCUPACION]     || 0) > 0) a.ocupacion.push(Number(r[C_OCUPACION]));
  a.paro.push(Number(r[27] || 0));
  var s = String(r[36] || '');
  if (s) a.semaforos[s] = (a.semaforos[s] || 0) + 1;
}

function _resumir_(a, nMin, semMapa, cfg) {
  var n = a.total.length;
  var suficiente = n >= nMin;
  var mediana = _mediana_(a.total);
  // Umbrales del tipo, para dibujar las bandas en la gráfica de distribución
  var regla = null;
  (semMapa || []).forEach(function(s) {
    if (s.tipo.toLowerCase() === String(a.nombre || '').trim().toLowerCase()) regla = s;
  });
  return {
    regla_verde: regla ? regla.verde : '',
    regla_ambar: regla ? regla.ambar : '',
    nombre:          a.nombre,
    n:               n,
    suficiente:      suficiente,
    // Con menos de N registros no se publica el tiempo: sería engañoso
    mediana_min:     suficiente ? mediana            : '',
    p80_min:         suficiente ? _percentil_(a.total, 0.8) : '',
    promedio_min:    suficiente ? _promedio_(a.total)  : '',
    min_max:         suficiente ? _percentil_(a.total, 0) + ' – ' + _percentil_(a.total, 1) : '',
    med_min_atado:   suficiente ? _mediana_(a.atado)    : '',
    med_min_ton:     suficiente ? _mediana_(a.ton)      : '',
    med_min_pieza:   suficiente ? _mediana_(a.pieza)    : '',
    med_min_tarima:  suficiente ? _mediana_(a.tarima)   : '',
    med_monta_ton:   suficiente ? _mediana_(a.montaTon) : '',
    med_ocupacion:   suficiente ? _mediana_(a.ocupacion): '',
    paro_promedio:   suficiente ? _promedio_(a.paro)    : '',
    p20_min:         suficiente ? _percentil_(a.total, 0.2) : '',
    minimo:          suficiente ? _percentil_(a.total, 0)   : '',
    maximo:          suficiente ? _percentil_(a.total, 1)   : '',
    // Serie cruda para dibujar la distribución en el dashboard
    valores:         a.total.slice(0, 240).sort(function(x, y) { return x - y; }),
    semaforos:       a.semaforos,
    semaforo:        suficiente ? semaforoPorTipo_(a.nombre, mediana, cfg, semMapa) : 'SIN DATO',
    mensaje:         suficiente ? '' : 'Datos insuficientes (' + n + ' de ' + nMin + ' registros)'
  };
}

/**
 * Estadística segmentada por tipo de maniobra y, dentro de cada tipo, por cliente.
 * Excluye las filas marcadas REVISIÓN salvo que se pidan explícitamente.
 *
 * opts: { incluirRevision, prueba: 'solo'|'excluir'|'', cliente, tipo }
 */
function estadisticasPorTipo(dias, opts) {
  return seguro_('estadisticasPorTipo', function() {
    opts = opts || {};
    dias = Number(dias || 30);
    var sh = hoja_(HOJA, COLUMNAS);
    var cfg  = getConfigObj();
    var nMin = Math.max(1, Number(cfg.N_MINIMO_DASHBOARD || 5));
    var semMapa = getSemaforos();
    var vacio = { ok: true, n_minimo: nMin, tipos: [], excluidos_revision: 0,
                  total_evaluados: 0, sin_tipo: 0 };
    if (sh.getLastRow() < 2) return vacio;

    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, COLUMNAS.length).getValues();
    var limite = new Date();
    limite.setDate(limite.getDate() - dias);
    limite.setHours(0, 0, 0, 0);

    var porTipo = {}, excluidos = 0, evaluados = 0, sinTipo = 0;

    vals.forEach(function(r) {
      if (!String(r[0] || '').trim()) return;
      if (String(r[20] || '') !== 'finalizada') return;

      var ms = toMs_(r[2]) || toMs_(r[22]) || toMs_(r[21]);
      if (!ms || new Date(ms) < limite) return;

      // Filas anómalas fuera del promedio hasta que un supervisor las valide
      if (String(r[C_REVISION] || '') === 'REVISIÓN' && !opts.incluirRevision) { excluidos++; return; }

      var esPrueba = String(r[C_PRUEBA] || '') === 'SÍ';
      if (opts.prueba === 'solo'    && !esPrueba) return;
      if (opts.prueba === 'excluir' &&  esPrueba) return;
      if (opts.cliente && String(r[6] || '') !== opts.cliente) return;

      var tipo = String(r[C_TIPO_MAN] || '').trim();
      if (!tipo) { sinTipo++; tipo = '(sin tipo de maniobra)'; }
      if (opts.tipo && tipo !== opts.tipo) return;

      evaluados++;
      if (!porTipo[tipo]) porTipo[tipo] = { acum: _nuevoAcum_(tipo), clientes: {} };
      _acumular_(porTipo[tipo].acum, r);

      var cli = String(r[6] || '(sin cliente)');
      if (!porTipo[tipo].clientes[cli]) porTipo[tipo].clientes[cli] = _nuevoAcum_(cli);
      _acumular_(porTipo[tipo].clientes[cli], r);
    });

    var tipos = Object.keys(porTipo).map(function(t) {
      var nodo = porTipo[t];
      var res  = _resumir_(nodo.acum, nMin, semMapa, cfg);
      res.clientes = Object.keys(nodo.clientes)
        .map(function(c) { return _resumir_(nodo.clientes[c], nMin, semMapa, cfg); })
        .sort(function(a, b) { return b.n - a.n; });
      return res;
    }).sort(function(a, b) { return b.n - a.n; });

    return { ok: true, n_minimo: nMin, tipos: tipos, excluidos_revision: excluidos,
             total_evaluados: evaluados, sin_tipo: sinTipo };
  });
}

/**
 * Análisis de la prueba controlada: compara el mismo tipo de maniobra
 * según cuántos montacargas se usaron. Responde "¿1 o 2 montacargas?".
 */
function analisisPruebaControlada(dias, etiqueta) {
  return seguro_('analisisPruebaControlada', function() {
    dias = Number(dias || 365);
    var sh = hoja_(HOJA, COLUMNAS);
    if (sh.getLastRow() < 2) return { ok: true, grupos: [], etiquetas: [] };

    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, COLUMNAS.length).getValues();
    var limite = new Date();
    limite.setDate(limite.getDate() - dias);
    limite.setHours(0, 0, 0, 0);

    var cfg   = getConfigObj();
    var nMin  = 1;   // en una prueba controlada cada registro cuenta
    var mapa  = {}, etiquetas = {};

    vals.forEach(function(r) {
      if (String(r[20] || '') !== 'finalizada') return;
      if (String(r[C_PRUEBA] || '') !== 'SÍ') return;
      var ms = toMs_(r[2]) || toMs_(r[22]);
      if (!ms || new Date(ms) < limite) return;

      var etq = String(r[C_ETIQ_PRUEBA] || '(sin etiqueta)');
      etiquetas[etq] = true;
      if (etiqueta && etq !== etiqueta) return;

      var nMonta = _numMontacargas_(r);
      var clave  = String(r[C_TIPO_MAN] || 'Sin tipo') + ' · ' + nMonta + ' montacargas';
      if (!mapa[clave]) {
        mapa[clave] = _nuevoAcum_(clave);
        mapa[clave].tipo = String(r[C_TIPO_MAN] || '');
        mapa[clave].montacargas = nMonta;
        mapa[clave].etiqueta = etq;
      }
      _acumular_(mapa[clave], r);
    });

    var grupos = Object.keys(mapa).map(function(k) {
      var res = _resumir_(mapa[k], nMin, getSemaforos(), cfg);
      res.tipo        = mapa[k].tipo;
      res.montacargas = mapa[k].montacargas;
      res.etiqueta    = mapa[k].etiqueta;
      return res;
    }).sort(function(a, b) {
      return a.tipo === b.tipo ? a.montacargas - b.montacargas : a.tipo.localeCompare(b.tipo, 'es');
    });

    return { ok: true, grupos: grupos, etiquetas: Object.keys(etiquetas).sort() };
  });
}

/** Filas marcadas REVISIÓN pendientes de que un supervisor las valide */
function getRegistrosEnRevision() {
  return seguro_('getRegistrosEnRevision', function() {
    var sh = hoja_(HOJA, COLUMNAS);
    if (sh.getLastRow() < 2) return { ok: true, filas: [] };
    var filas = [];
    sh.getRange(2, 1, sh.getLastRow() - 1, COLUMNAS.length).getValues().forEach(function(r) {
      if (String(r[C_REVISION] || '') !== 'REVISIÓN') return;
      filas.push({
        id:              String(r[0]),
        folio:           String(r[1] || ''),
        fecha:           fechaISO_(r[2]),
        cliente:         String(r[6] || ''),
        no_unidad:       String(r[7] || ''),
        tipo_maniobra:   String(r[C_TIPO_MAN] || ''),
        tiempo_total_min: Number(r[26] || 0),
        atados:          r[C_ATADOS] === '' ? '' : Number(r[C_ATADOS] || 0),
        toneladas_netas: r[C_TON]    === '' ? '' : Number(r[C_TON] || 0),
        min_por_atado:   r[C_MIN_ATADO] === '' ? '' : Number(r[C_MIN_ATADO] || 0),
        min_por_tonelada:r[C_MIN_TON]   === '' ? '' : Number(r[C_MIN_TON] || 0),
        motivo_revision: String(r[C_MOTIVO_REV] || ''),
        comentario_supervisor: String(r[C_COMENT_SUP] || '')
      });
    });
    return { ok: true, filas: filas };
  });
}

function serie(periodo, dias) {
  return seguro_('serie', function() {
    periodo = periodo || 'mes'; dias = Number(dias || 90);
    var sh = hoja_(HOJA, COLUMNAS);
    if (sh.getLastRow() < 2) return { ok: true, filas: [] };
    var vals   = sh.getRange(2, 1, sh.getLastRow() - 1, COLUMNAS.length).getValues();
    var limite = new Date();
    limite.setDate(limite.getDate() - dias);
    limite.setHours(0, 0, 0, 0);
    var tz     = Session.getScriptTimeZone();
    var mapa   = {};

    for (var i = 0; i < vals.length; i++) {
      var r = vals[i];
      if (String(r[20] || '') !== 'finalizada') continue;
      var ms = toMs_(r[2]) || toMs_(r[22]) || toMs_(r[21]);
      if (!ms) continue;
      var f = new Date(ms);
      if (f < limite) continue;

      var k;
      if (periodo === 'anio')        k = Utilities.formatDate(f, tz, 'yyyy');
      else if (periodo === 'semana') k = Utilities.formatDate(f, tz, 'yyyy') + '-S' + Utilities.formatDate(f, tz, 'ww');
      else if (periodo === 'dia')    k = Utilities.formatDate(f, tz, 'yyyy-MM-dd');
      else                           k = Utilities.formatDate(f, tz, 'yyyy-MM');

      if (!mapa[k]) mapa[k] = { periodo: k, maniobras: 0, suma: 0, con: 0, demora: 0 };
      mapa[k].maniobras++;
      mapa[k].demora += Number(r[27] || 0);
      var min = Number(r[26] || 0);
      if (min > 0) { mapa[k].suma += min; mapa[k].con++; }
    }
    var filas = Object.keys(mapa).sort().map(function(k) {
      var m = mapa[k];
      return { periodo: k, maniobras: m.maniobras,
               promedio_min: m.con ? Math.round(m.suma / m.con) : 0, demora_min: Math.round(m.demora) };
    });
    return { ok: true, filas: filas };
  });
}

function getDetalleEtapas(dias) {
  return seguro_('getDetalleEtapas', function() {
    dias = Number(dias || 30);
    var shEta  = hoja_(HOJA_ETA, COL_ETA);
    var limite = new Date();
    limite.setDate(limite.getDate() - dias);
    limite.setHours(0, 0, 0, 0);
    var tz = Session.getScriptTimeZone();
    var porEtapa = {}, movimientos = [];

    if (shEta.getLastRow() >= 2) {
      shEta.getRange(2, 1, shEta.getLastRow() - 1, COL_ETA.length).getValues().forEach(function(r) {
        if (String(r[5]) !== 'finalizada') return;
        var ms = toMs_(r[6]) || toMs_(r[8]);
        if (!ms) return;
        var dt = new Date(ms);
        if (dt < limite) return;

        var nombre    = String(r[4] || '');
        var tiempoMin = Number(r[10] || 0);
        var tiempoEst = Number(r[11] || 0);
        var retraso   = Number(r[12] || 0);

        if (!porEtapa[nombre]) porEtapa[nombre] = { nombre: nombre, count: 0, sumaTiempo: 0, sumaEst: 0, sumaRetraso: 0, conEst: 0 };
        var pe = porEtapa[nombre];
        pe.count++; pe.sumaTiempo += tiempoMin; pe.sumaRetraso += retraso;
        if (tiempoEst > 0) { pe.sumaEst += tiempoEst; pe.conEst++; }

        movimientos.push({
          folio:          String(r[2] || ''),
          fecha:          Utilities.formatDate(dt, tz, 'yyyy-MM-dd'),
          etapa:          nombre,
          tiempo_min:     tiempoMin,
          tiempo_est_min: tiempoEst,
          retraso_min:    retraso
        });
      });
    }

    var arr = Object.keys(porEtapa).map(function(k) {
      var e = porEtapa[k];
      return { nombre: e.nombre, count: e.count,
        promedio_min:         e.count  ? Math.round(e.sumaTiempo  / e.count)  : 0,
        promedio_est_min:     e.conEst ? Math.round(e.sumaEst     / e.conEst) : 0,
        promedio_retraso_min: e.count  ? Math.round(e.sumaRetraso / e.count)  : 0 };
    }).sort(function(a, b) { return b.count - a.count; });

    movimientos.sort(function(a, b) { return a.fecha > b.fecha ? -1 : 1; });
    return { ok: true, porEtapa: arr, movimientos: movimientos.slice(0, 400) };
  });
}

/* ════════════════════════════════════════════════════════════
   SOPORTE / DIAGNÓSTICO
════════════════════════════════════════════════════════════ */

/**
 * Radiografía completa del estado del sistema.
 * Es la primera parada cuando algo "no funciona".
 */
function diagnostico() {
  return seguro_('diagnostico', function() {
    var ss = ss_();
    var out = {
      ok: true,
      server_now_ms: Date.now(),
      zona_horaria:  Session.getScriptTimeZone(),
      spreadsheet:   { nombre: ss.getName(), id: ss.getId(), url: ss.getUrl() },
      hojas:         [],
      problemas:     [],
      etapas_rotas:  [],
      resumen:       {}
    };

    var esperadas = [
      [HOJA, COLUMNAS], [HOJA_ETA, COL_ETA], [HOJA_CAT, null], [HOJA_TEMS, COL_TEM],
      [HOJA_EMP, COL_EMP], [HOJA_MON, COL_MON], [HOJA_CAM, COL_CAM],
      [HOJA_SEM, COL_SEM], [HOJA_DEP, COL_DEP], [HOJA_FLU, COL_FLU],
      [HOJA_INC, COL_INC], [HOJA_CFG, COL_CFG], [HOJA_USR, COL_USR]
    ];

    esperadas.forEach(function(par) {
      var nombre = par[0], cols = par[1];
      var sh = ss.getSheetByName(nombre);
      if (!sh) {
        out.hojas.push({ nombre: nombre, existe: false, filas: 0, columnas: 0, estado: 'FALTA' });
        out.problemas.push('Falta la hoja ' + nombre + '. Ejecuta setup().');
        return;
      }
      var filas = Math.max(0, sh.getLastRow() - 1);
      var estado = 'OK';
      if (cols) {
        var cab = sh.getRange(1, 1, 1, Math.max(cols.length, sh.getLastColumn())).getValues()[0];
        for (var i = 0; i < cols.length; i++) {
          if (String(cab[i] || '').trim() !== cols[i]) {
            estado = 'ESQUEMA DESFASADO';
            out.problemas.push('La hoja ' + nombre + ' no tiene la columna "' + cols[i] +
                               '" en la posición ' + (i + 1) + '. Ejecuta setup() para migrarla.');
            break;
          }
        }
      }
      out.hojas.push({ nombre: nombre, existe: true, filas: filas,
                       columnas: sh.getLastColumn(), estado: estado });
    });

    // Etapas activas sin hora de inicio válida → causa típica de cronómetro muerto
    var shEta = ss.getSheetByName(HOJA_ETA);
    var activas = 0, sinInicio = 0;
    if (shEta && shEta.getLastRow() >= 2) {
      shEta.getRange(2, 1, shEta.getLastRow() - 1, COL_ETA.length).getValues().forEach(function(r) {
        var est = String(r[5] || '');
        if (est !== 'en_curso' && est !== 'en_pausa') return;
        activas++;
        if (!toMs_(r[6])) {
          sinInicio++;
          out.etapas_rotas.push({
            id_etapa:    String(r[0] || ''),
            id_maniobra: String(r[1] || ''),
            folio:       String(r[2] || ''),
            etapa:       String(r[4] || ''),
            valor_crudo: String(r[6] || '(vacío)')
          });
        }
      });
    }
    if (sinInicio) {
      out.problemas.push(sinInicio + ' etapa(s) activa(s) sin hora de inicio válida. ' +
                         'Usa "Reparar cronómetros" para arrancarlas de nuevo.');
    }

    // Maniobras activas sin ninguna etapa abierta → quedarían atoradas
    var shM = ss.getSheetByName(HOJA);
    var manActivas = 0, huerfanas = 0;
    if (shM && shM.getLastRow() >= 2 && shEta) {
      var abiertas = {};
      if (shEta.getLastRow() >= 2) {
        shEta.getRange(2, 1, shEta.getLastRow() - 1, COL_ETA.length).getValues().forEach(function(r) {
          var est = String(r[5] || '');
          if (est === 'en_curso' || est === 'en_pausa') abiertas[String(r[1])] = true;
        });
      }
      shM.getRange(2, 1, shM.getLastRow() - 1, COLUMNAS.length).getValues().forEach(function(r) {
        var est = String(r[20] || '');
        if (est !== 'en_curso' && est !== 'en_pausa') return;
        manActivas++;
        if (!abiertas[String(r[0])]) {
          huerfanas++;
          out.problemas.push('La maniobra ' + String(r[1] || r[0]) +
                             ' está activa pero no tiene ninguna etapa abierta. Usa "Forzar cierre".');
        }
      });
    }

    // Calidad del dato de costeo: tipo faltante, sin toneladas/atados y filas en revisión
    var enRevision = 0, sinTipo = 0, sinCosteo = 0, finalizadas = 0, tiposMalos = {};
    if (shM && shM.getLastRow() >= 2) {
      shM.getRange(2, 1, shM.getLastRow() - 1, COLUMNAS.length).getValues().forEach(function(r) {
        if (String(r[20] || '') !== 'finalizada') return;
        finalizadas++;
        if (String(r[C_REVISION] || '') === 'REVISIÓN') enRevision++;
        var tipo = String(r[C_TIPO_MAN] || '').trim();
        if (!tipo) sinTipo++;
        else if (_validarTipoUnico_(tipo)) tiposMalos[tipo] = (tiposMalos[tipo] || 0) + 1;
        if (!Number(r[C_TON] || 0) && !Number(r[C_ATADOS] || 0)) sinCosteo++;
      });
    }
    if (enRevision) {
      out.problemas.push(enRevision + ' registro(s) marcados REVISIÓN están excluidos de los promedios. ' +
                         'Valídalos o corrígelos desde el Dashboard.');
    }
    if (sinTipo) {
      out.problemas.push(sinTipo + ' maniobra(s) finalizadas sin Tipo de maniobra. ' +
                         'El dashboard no puede segmentarlas: edítalas y asígnales tipo.');
    }
    if (sinCosteo) {
      out.problemas.push(sinCosteo + ' maniobra(s) finalizadas sin toneladas ni atados: ' +
                         'no producen minutos por tonelada ni por atado.');
    }
    Object.keys(tiposMalos).forEach(function(t) {
      out.problemas.push('El tipo "' + t + '" combina dos maniobras (' + tiposMalos[t] +
                         ' registros). Sepáralos: un registro = una maniobra.');
    });

    var props = PropertiesService.getScriptProperties().getProperties();
    var pausas = Object.keys(props).filter(function(k) { return k.indexOf('pe_') === 0; });

    out.calidad = {
      finalizadas: finalizadas, en_revision: enRevision,
      sin_tipo_maniobra: sinTipo, sin_datos_costeo: sinCosteo
    };

    out.resumen = {
      maniobras_activas:       manActivas,
      maniobras_huerfanas:     huerfanas,
      etapas_activas:          activas,
      etapas_sin_inicio:       sinInicio,
      pausas_registradas:      pausas.length,
      registros_en_revision:   enRevision,
      sin_tipo_maniobra:       sinTipo,
      campos_configurados:     getCamposConfig().length,
      montacargas_registrados: getMontacargas(false).length,
      usuarios:                getUsuarios().length
    };
    if (!out.problemas.length) out.problemas.push('Sin problemas detectados. Todo en orden.');
    return out;
  });
}

/** Repara de golpe todas las etapas activas sin hora de inicio */
function repararCronometros() {
  return seguro_('repararCronometros', function() {
    var shEta = hoja_(HOJA_ETA, COL_ETA);
    if (shEta.getLastRow() < 2) return { ok: true, reparadas: 0 };
    var vals  = shEta.getRange(2, 1, shEta.getLastRow() - 1, COL_ETA.length).getValues();
    var ahora = new Date();
    var n = 0;
    for (var i = 0; i < vals.length; i++) {
      var est = String(vals[i][5] || '');
      if (est !== 'en_curso' && est !== 'en_pausa') continue;
      if (toMs_(vals[i][6])) continue;
      shEta.getRange(i + 2, 7).setNumberFormat('yyyy-mm-dd hh:mm:ss').setValue(ahora);
      shEta.getRange(i + 2, 8).setValue(hhmm_(ahora));
      n++;
    }
    if (n) SpreadsheetApp.flush();
    return { ok: true, reparadas: n };
  });
}

/** Borra las marcas de pausa que ya no corresponden a ninguna etapa pausada */
function limpiarPausasHuerfanas() {
  return seguro_('limpiarPausasHuerfanas', function() {
    var props  = PropertiesService.getScriptProperties();
    var todas  = props.getProperties();
    var shEta  = hoja_(HOJA_ETA, COL_ETA);
    var validas = {};
    if (shEta.getLastRow() >= 2) {
      shEta.getRange(2, 1, shEta.getLastRow() - 1, COL_ETA.length).getValues().forEach(function(r) {
        if (String(r[5]) === 'en_pausa') validas['pe_' + String(r[0])] = true;
      });
    }
    var n = 0;
    Object.keys(todas).forEach(function(k) {
      if (k.indexOf('pe_') === 0 && !validas[k]) { props.deleteProperty(k); n++; }
    });
    return { ok: true, eliminadas: n };
  });
}

/** Sincroniza el inventario: libera los montacargas de maniobras ya cerradas */
function sincronizarMontacargas() {
  return seguro_('sincronizarMontacargas', function() {
    var shM = hoja_(HOJA, COLUMNAS);
    var enUso = {};
    if (shM.getLastRow() >= 2) {
      shM.getRange(2, 1, shM.getLastRow() - 1, COLUMNAS.length).getValues().forEach(function(r) {
        var est = String(r[20] || '');
        if (est !== 'en_curso' && est !== 'en_pausa') return;
        textoLista_(r[39]).forEach(function(c) {
          enUso[c.split('·')[0].trim().toLowerCase()] = true;
        });
      });
    }
    var sh = hoja_(HOJA_MON, COL_MON);
    if (sh.getLastRow() < 2) return { ok: true, actualizados: 0 };
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, COL_MON.length).getValues();
    var n = 0;
    for (var i = 0; i < vals.length; i++) {
      var estado = String(vals[i][6] || 'disponible');
      if (estado === 'mantenimiento' || estado === 'baja') continue;
      var ocupado = !!enUso[String(vals[i][1]).trim().toLowerCase()];
      var deseado = ocupado ? 'en_uso' : 'disponible';
      if (estado !== deseado) { sh.getRange(i + 2, 7).setValue(deseado); n++; }
    }
    return { ok: true, actualizados: n };
  });
}

/** Reejecuta setup() desde la interfaz (migra hojas y columnas nuevas) */
function ejecutarSetup() {
  return seguro_('ejecutarSetup', function() {
    return { ok: true, msg: setup() };
  });
}

/* ════════════════════════════════════════════════════════════
   WEB APP
════════════════════════════════════════════════════════════ */

function doGet(e) {
  var page = ((e && e.parameter && e.parameter.page) || 'index').toLowerCase();
  if (page === 'json') {
    var dias = (e && e.parameter && e.parameter.dias) || 30;
    return ContentService.createTextOutput(JSON.stringify(indicadores(dias)))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var file = page === 'dashboard' ? 'Dashboard' : 'Index';
  return HtmlService.createTemplateFromFile(file).evaluate()
    .setTitle('LogiTime')
    // addMetaTag solo admite "viewport" y "google-site-verification";
    // el resto de las etiquetas de app instalable van en el HTML directamente.
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(nombre) { return HtmlService.createHtmlOutputFromFile(nombre).getContent(); }
function urlApp()        { return ScriptApp.getService().getUrl(); }

/* ════════════════════════════════════════════════════════════
   MENÚ EN HOJA (bound scripts)
════════════════════════════════════════════════════════════ */

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('LogiTime')
      .addItem('⚙ Configurar / migrar hojas', 'setup')
      .addItem('📊 Ver indicadores (30 días)', 'mostrarIndicadores')
      .addItem('🩺 Diagnóstico del sistema', 'mostrarDiagnostico')
      .addItem('🔧 Reparar cronómetros', 'repararCronometros')
      .addItem('🧮 Recalcular métricas de costeo', 'recalcularMetricas')
      .addItem('🚩 Resaltar filas en revisión', 'resaltarRevisiones')
      .addItem('📅 Aplicar formato dd/MM/yyyy', 'formatearFechas')
      .addItem('📧 Reconfigurar triggers', 'configurarTriggers')
      .addToUi();
  } catch (e) {}
}

function mostrarIndicadores() {
  var k = indicadores(30);
  SpreadsheetApp.getUi().alert(
    'Últimos 30 días\n\n' +
    'Maniobras finalizadas: ' + k.maniobras + '\n' +
    'En curso: ' + k.en_curso + '\n' +
    'Promedio total: ' + k.promedio_min + ' min\n' +
    'Promedio efectivo: ' + k.promedio_efectivo_min + ' min\n' +
    'Demora acumulada: ' + k.demora_total_min + ' min\n' +
    'Con daño: ' + k.danos + '\n\n' +
    'Semáforo: ' + k.semaforo.VERDE + ' verde · ' + k.semaforo['ÁMBAR'] + ' ámbar · ' + k.semaforo.ROJO + ' rojo'
  );
}

function mostrarDiagnostico() {
  var d = diagnostico();
  SpreadsheetApp.getUi().alert(
    'Diagnóstico LogiTime\n\n' +
    'Zona horaria: ' + d.zona_horaria + '\n' +
    'Maniobras activas: ' + d.resumen.maniobras_activas + '\n' +
    'Etapas activas: ' + d.resumen.etapas_activas + '\n' +
    'Etapas sin hora de inicio: ' + d.resumen.etapas_sin_inicio + '\n\n' +
    d.problemas.join('\n')
  );
}
