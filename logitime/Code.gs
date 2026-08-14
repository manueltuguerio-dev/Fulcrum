/**
 * LogiTime v3 · Registro de maniobras de almacén con flujo por etapas
 * Google Apps Script + Google Sheets + Web App (HTML Service)
 *
 * Hojas: MANIOBRAS · ETAPAS · CATALOGOS · TIEMPOS_EST · EMPLEADOS · INCIDENCIAS · CONFIG · USUARIOS
 *
 * INSTALACIÓN:
 * 1. Google Sheets → Extensiones › Apps Script.
 * 2. Pega este archivo como Code.gs + crea los 3 HTML (Index, Dashboard, Estilos).
 * 3. Ejecuta setup() una vez y autoriza permisos.
 * 4. Implementar › Nueva implementación › Aplicación web · access = ANYONE.
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

/* ════════════════════════════════════════════════════════════
   CATÁLOGOS Y ETAPAS POR DEFECTO
════════════════════════════════════════════════════════════ */
var DEFAULT_CONFIG = {
  TURNO_MATUTINO_INICIO:   '06:00', TURNO_MATUTINO_FIN:      '14:00',
  TURNO_VESPERTINO_INICIO: '14:00', TURNO_VESPERTINO_FIN:    '22:00',
  TURNO_NOCTURNO_INICIO:   '22:00', TURNO_NOCTURNO_FIN:      '06:00',
  CORREOS_REPORTE: '', UMBRAL_VERDE_MIN: '45', UMBRAL_AMBAR_MIN: '90',
  REPORTE_DIARIO_HORA: '6', REPORTE_SEMANAL_DIA: 'LUNES'
};

var CATALOGOS_DEFAULT = {
  TURNOS:            ['Matutino', 'Vespertino', 'Nocturno'],
  FLUJOS:            ['ENTRADA', 'SALIDA', 'TRANSBORDO', 'INTERNO'],
  CLIENTES:          ['Cliente demo'],
  TIPOS_EQUIPO:      ['Caja seca', 'Caja refrigerada', 'Plataforma', 'Contenedor 20', 'Contenedor 40'],
  TIPOS_MONTACARGAS: ['Contrabalanceado', 'Patín eléctrico', 'Doble tarima', 'Manual'],
  MATERIALES:        ['Materia prima', 'Producto terminado', 'Empaque'],
  PRESENTACIONES:    ['Tarima', 'Caja', 'Saco', 'Granel', 'Rollo'],
  UNIDADES_MEDIDA:   ['Tarima', 'Caja', 'Saco', 'Pieza', 'Tonelada'],
  CAUSAS_DEMORA:     ['Falta de personal', 'Falla de equipo', 'Documentación', 'Espera de andén', 'Producto dañado', 'Otro']
};

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

/* ════════════════════════════════════════════════════════════
   ESQUEMAS DE COLUMNAS
════════════════════════════════════════════════════════════ */
// MANIOBRAS (39 cols)
var COLUMNAS = [
  'ID', 'Folio', 'Fecha', 'Turno', 'Flujo', 'Etapa', 'Cliente', 'No. unidad', 'Tipo equipo',
  'Cant. equipos', 'Material', 'Presentación', 'Cant. piezas', 'Unidad de medida', 'Tarimas', 'Peso (ton)',
  'Tipo montacargas', 'Núm. montacargas', 'Montacarguistas', 'Ayudantes',
  'Estado', 'Iniciado en', 'Finalizado en', 'Pausa acum (seg)', 'Hora inicio', 'Hora fin',
  'Tiempo total (min)', 'Demora (min)', 'Causa demora', 'Tiempo efectivo (min)', 'Min/pieza',
  'Daño origen', 'Desc. daño origen', 'Daño maniobra', 'Desc. daño maniobra',
  'Observaciones', 'Semáforo', 'Registrado por', 'Timestamp'
];

// ETAPAS (19 cols)
// idx: 0=ID 1=ID_man 2=Folio 3=Num 4=Nombre 5=Estado
//      6=Inicio_dt 7=Hora_ini 8=Fin_dt 9=Hora_fin
//      10=Tiempo_min 11=Est_min 12=Retraso_min 13=NoAplica
//      14=PausaAcum_seg 15=Causa 16=Obs 17=RegistradoPor 18=TS
var COL_ETA = [
  'ID_etapa', 'ID_maniobra', 'Folio', 'Num_etapa', 'Nombre_etapa', 'Estado',
  'Inicio_dt', 'Hora_inicio', 'Fin_dt', 'Hora_fin',
  'Tiempo_min', 'Tiempo_estimado_min', 'Retraso_min', 'No_aplica',
  'Pausa_acum_seg', 'Causa_demora', 'Observaciones', 'Registrado_por', 'Timestamp'
];

var COL_EMP = ['ID', 'Nombre', 'Posición', 'Montacargas', 'Activo'];
var COL_USR = ['ID', 'Email', 'Nombre', 'PIN', 'Rol', 'Activo', 'Timestamp'];
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

/** Obtiene o crea una hoja con cabeceras */
function hoja_(nombre, cols) {
  var ss = ss_(), sh = ss.getSheetByName(nombre);
  if (!sh) {
    sh = ss.insertSheet(nombre);
    sh.getRange(1, 1, 1, cols.length).setValues([cols])
      .setFontWeight('bold').setBackground('#0f2748').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function uuid_() { return Utilities.getUuid(); }

function usuario_() {
  try { return Session.getActiveUser().getEmail() || 'anónimo'; } catch (e) { return 'anónimo'; }
}

/** Convierte cualquier valor a milisegundos de forma robusta */
function toMs_(v) {
  if (!v || v === '') return 0;
  if (v instanceof Date) return v.getTime();
  var d = new Date(String(v));
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function hhmm_(fecha) {
  if (!fecha) return '';
  var d = (fecha instanceof Date) ? fecha : new Date(fecha);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'HH:mm');
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
    var activo     = r[5] === true || r[5] === 'TRUE' || r[5] === 1 || r[5] === '1';
    if (matchEmail && matchPin) {
      if (!activo) return { ok: false, msg: 'Usuario desactivado' };
      return { ok: true, email: String(r[1]).trim(), nombre: String(r[2]).trim(), rol: String(r[4]).trim() };
    }
  }
  return { ok: false, msg: 'Email o PIN incorrectos' };
}

function getUsuarios() {
  var sh = ss_().getSheetByName(HOJA_USR);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COL_USR.length).getValues().map(function(r) {
    return { id: String(r[0]), email: String(r[1]), nombre: String(r[2]), rol: String(r[4]), activo: r[5] };
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
  sh.appendRow([uuid_(), data.email, data.nombre, pin, data.rol, true, new Date()]);
  return { ok: true };
}

function actualizarUsuario(id, data) {
  var sh = ss_().getSheetByName(HOJA_USR);
  if (!sh || sh.getLastRow() < 2) return { ok: false };
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      if (data.nombre) sh.getRange(i + 2, 3).setValue(data.nombre);
      if (data.rol)    sh.getRange(i + 2, 5).setValue(data.rol);
      return { ok: true };
    }
  }
  return { ok: false };
}

function resetPinAdmin(id, pinNuevo) {
  if (!pinNuevo || String(pinNuevo).trim().length < 4) return { ok: false, msg: 'PIN mínimo 4 caracteres' };
  var sh = ss_().getSheetByName(HOJA_USR);
  if (!sh || sh.getLastRow() < 2) return { ok: false };
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      sh.getRange(i + 2, 4).setValue(String(pinNuevo).trim());
      return { ok: true };
    }
  }
  return { ok: false };
}

function toggleUsuario(id, activo) {
  var sh = ss_().getSheetByName(HOJA_USR);
  if (!sh || sh.getLastRow() < 2) return { ok: false };
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) { sh.getRange(i + 2, 6).setValue(!!activo); return { ok: true }; }
  }
  return { ok: false };
}

function eliminarUsuario(id) {
  var sh = ss_().getSheetByName(HOJA_USR);
  if (!sh || sh.getLastRow() < 2) return { ok: false };
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) { sh.deleteRow(i + 2); return { ok: true }; }
  }
  return { ok: false };
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
   TIEMPOS ESTIMADOS
════════════════════════════════════════════════════════════ */

function getTimeposEstimados() {
  var sh = ss_().getSheetByName(HOJA_TEMS);
  if (!sh || sh.getLastRow() < 2) return {};
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
   SETUP
════════════════════════════════════════════════════════════ */

function setup() {
  hoja_(HOJA,     COLUMNAS);
  hoja_(HOJA_EMP, COL_EMP);
  hoja_(HOJA_INC, COL_INC);
  hoja_(HOJA_ETA, COL_ETA);
  hoja_(HOJA_CFG, COL_CFG);

  // CATALOGOS
  var cs = ss_().getSheetByName(HOJA_CAT) || ss_().insertSheet(HOJA_CAT);
  cs.clearContents();
  var keys = Object.keys(CATALOGOS_DEFAULT);
  for (var i = 0; i < keys.length; i++) {
    var vals = CATALOGOS_DEFAULT[keys[i]];
    cs.getRange(1, i + 1).setValue(keys[i]).setFontWeight('bold').setBackground('#0f2748').setFontColor('#ffffff');
    if (vals.length) cs.getRange(2, i + 1, vals.length, 1).setValues(vals.map(function(v) { return [v]; }));
  }
  cs.setFrozenRows(1);

  // TIEMPOS_EST
  var ts = ss_().getSheetByName(HOJA_TEMS) || ss_().insertSheet(HOJA_TEMS);
  ts.clearContents();
  ts.getRange(1, 1, 1, 2).setValues([COL_TEM]).setFontWeight('bold').setBackground('#0f2748').setFontColor('#ffffff');
  ts.setFrozenRows(1);
  ts.getRange(2, 1, DEFAULT_TIEMPOS.length, 2).setValues(DEFAULT_TIEMPOS);

  // CONFIG defaults
  var cfgSh = hoja_(HOJA_CFG, COL_CFG);
  if (cfgSh.getLastRow() < 2) {
    Object.keys(DEFAULT_CONFIG).forEach(function(k) { cfgSh.appendRow([k, DEFAULT_CONFIG[k], '']); });
  }

  // USUARIOS — cuenta master
  var uSh = hoja_(HOJA_USR, COL_USR);
  if (uSh.getLastRow() < 2) {
    uSh.appendRow([uuid_(), 'mrodriguez@tlterminals.com', 'M. Rodríguez', '1234', 'MASTER', true, new Date()]);
  }

  try { configurarTriggers(); } catch (e) {}
  return '✓ Setup completo. Hojas: MANIOBRAS · ETAPAS · CATALOGOS · TIEMPOS_EST · EMPLEADOS · INCIDENCIAS · CONFIG · USUARIOS';
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
  return { turno: turno, fecha: Utilities.formatDate(ahora, tz, 'yyyy-MM-dd') };
}

/* ════════════════════════════════════════════════════════════
   CATÁLOGOS
════════════════════════════════════════════════════════════ */

function getCatalogos() {
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
  out.TIEMPOS_EST  = getTimeposEstimados();
  out.ETAPAS_FLUJO = ETAPAS_FLUJO;
  return out;
}

function agregarCatalogo(catalogo, valor) {
  var cs   = ss_().getSheetByName(HOJA_CAT);
  var vals = cs.getDataRange().getValues();
  var col  = -1;
  for (var c = 0; c < vals[0].length; c++) if (String(vals[0][c]).trim() === catalogo) col = c + 1;
  if (col === -1) { col = vals[0].length + 1; cs.getRange(1, col).setValue(catalogo).setFontWeight('bold').setBackground('#0f2748').setFontColor('#ffffff'); }
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
    cs.getRange(1, col).setValue(tipo).setFontWeight('bold').setBackground('#0f2748').setFontColor('#ffffff');
  } else {
    if (cs.getMaxRows() > 1) cs.getRange(2, col, cs.getMaxRows() - 1, 1).clearContent();
  }
  if (items && items.length)
    cs.getRange(2, col, items.length, 1).setValues(items.map(function(v) { return [v]; }));
  return { ok: true };
}

function eliminarCatalogo(tipo) {
  var cs = ss_().getSheetByName(HOJA_CAT);
  if (!cs) return { ok: false };
  var vals = cs.getDataRange().getValues();
  for (var c = 0; c < vals[0].length; c++) {
    if (String(vals[0][c]).trim() === tipo) { cs.deleteColumn(c + 1); return { ok: true }; }
  }
  return { ok: false };
}

/* ════════════════════════════════════════════════════════════
   EMPLEADOS
════════════════════════════════════════════════════════════ */

function getEmpleados() {
  var sh = hoja_(HOJA_EMP, COL_EMP);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COL_EMP.length).getValues().map(function(r) {
    return { id: String(r[0]), nombre: String(r[1]), posicion: String(r[2]),
             montacargas: String(r[3] || ''), activo: r[4] !== false && r[4] !== 'NO' && r[4] !== false };
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

/* ════════════════════════════════════════════════════════════
   INCIDENCIAS
════════════════════════════════════════════════════════════ */

function getIncidencias() {
  var sh = hoja_(HOJA_INC, COL_INC);
  if (sh.getLastRow() < 2) return [];
  var tz = Session.getScriptTimeZone();
  return sh.getRange(2, 1, sh.getLastRow() - 1, COL_INC.length).getValues().map(function(r) {
    return { id: String(r[0]),
      fecha: r[1] instanceof Date ? Utilities.formatDate(r[1], tz, 'yyyy-MM-dd') : String(r[1] || ''),
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

/* ════════════════════════════════════════════════════════════
   ETAPAS — LÓGICA INTERNA
════════════════════════════════════════════════════════════ */

function _etapasFlujo(flujo) {
  return ETAPAS_FLUJO[String(flujo || '').toUpperCase()] || [];
}

function _crearEtapa(shEta, idManiobra, folio, numEtapa, nombreEtapa, tiempoEst) {
  var ahora = new Date();
  var id    = uuid_();
  shEta.appendRow([
    id, idManiobra, folio, numEtapa, nombreEtapa, 'en_curso',
    ahora, hhmm_(ahora), '', '',
    '', tiempoEst || 0, '', 'NO',
    0, '', '', usuario_(), ahora
  ]);
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
  var sh      = hoja_(HOJA, COLUMNAS);
  var shEta   = hoja_(HOJA_ETA, COL_ETA);
  var tiempos = getTimeposEstimados();
  var id      = uuid_();
  var ahora   = new Date();
  var tz      = Session.getScriptTimeZone();
  var fecha   = data.fecha || Utilities.formatDate(ahora, tz, 'yyyy-MM-dd');
  var flujo   = String(data.flujo || '').toUpperCase();
  var lista   = _etapasFlujo(flujo);
  if (!lista.length) throw new Error('Flujo sin etapas definidas: ' + flujo);
  var primera = lista[0];
  var folio   = generarFolio(data.cliente, fecha, data.no_unidad);

  sh.appendRow([
    id, folio, fecha, data.turno, data.flujo, primera,
    data.cliente, data.no_unidad, data.tipo_equipo,
    Number(data.cant_equipos || 1), data.material, data.presentacion,
    data.cant_piezas || '', data.unidad_medida, data.tarimas || '', data.peso_tons || '',
    data.tipo_montacargas, data.num_montacargas || '',
    [].concat(data.montacarguistas || []).join('; '),
    [].concat(data.ayudantes || []).join('; '),
    'en_curso', ahora, '', 0, '', '', '', 0, '', '', '',
    data.dano_origen ? 'SÍ' : 'NO', data.dano_origen_desc || '',
    'NO', '', _fmtObs(data), 'EN CURSO', usuario_(), ahora
  ]);

  var tiempoEst = tiempos[primera] || 0;
  var idEtapa   = _crearEtapa(shEta, id, folio, 1, primera, tiempoEst);

  return { ok: true, id: id, folio: folio,
    etapa: { id: idEtapa, num: 1, nombre: primera, total: lista.length, tiempo_estimado_min: tiempoEst }
  };
}

function registrarManiobra(data) {
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

  sh.appendRow([
    id, folio, fecha, data.turno, data.flujo, data.etapa || '—',
    data.cliente, data.no_unidad, data.tipo_equipo,
    Number(data.cant_equipos || 1), data.material, data.presentacion,
    data.cant_piezas || '', data.unidad_medida, data.tarimas || '', data.peso_tons || '',
    data.tipo_montacargas, data.num_montacargas || '',
    [].concat(data.montacarguistas || []).join('; '),
    [].concat(data.ayudantes || []).join('; '),
    'finalizada', '', new Date(), 0, data.hora_inicio, data.hora_fin,
    total, demora, data.causa_demora || '', efectivo, minPieza,
    data.dano_origen ? 'SÍ' : 'NO', data.dano_origen_desc || '',
    data.dano_maniobra ? 'SÍ' : 'NO', data.dano_maniobra_desc || '',
    _fmtObs(data), semaforo_(total, cfg), usuario_(), new Date()
  ]);
  return { ok: true, id: id, folio: folio, tiempo_total_min: total };
}

function eliminarManiobra(id) {
  var sh    = hoja_(HOJA, COLUMNAS);
  var shEta = hoja_(HOJA_ETA, COL_ETA);
  var fila  = buscarFila_(sh, id);
  if (fila > 0) sh.deleteRow(fila);

  if (shEta.getLastRow() >= 2) {
    var eta   = shEta.getRange(2, 1, shEta.getLastRow() - 1, 2).getValues();
    var props = PropertiesService.getScriptProperties();
    for (var i = eta.length - 1; i >= 0; i--) {
      if (String(eta[i][1]) === String(id)) {
        props.deleteProperty('pe_' + String(eta[i][0]));
        shEta.deleteRow(i + 2);
      }
    }
  }
  return { ok: true };
}

function editarManiobra(id, data) {
  var sh   = hoja_(HOJA, COLUMNAS);
  var fila = buscarFila_(sh, id);
  if (fila < 0) throw new Error('Maniobra no encontrada: ' + id);
  var row  = sh.getRange(fila, 1, 1, COLUMNAS.length).getValues()[0];
  if (data.cliente       !== undefined) row[6]  = data.cliente;
  if (data.no_unidad     !== undefined) row[7]  = data.no_unidad;
  if (data.tipo_equipo   !== undefined) row[8]  = data.tipo_equipo;
  if (data.material      !== undefined) row[10] = data.material;
  if (data.presentacion  !== undefined) row[11] = data.presentacion;
  if (data.observaciones !== undefined) row[35] = data.observaciones;
  sh.getRange(fila, 1, 1, COLUMNAS.length).setValues([row]);
  return { ok: true };
}

function forzarCierreManiobra(id) {
  var sh    = hoja_(HOJA, COLUMNAS);
  var shEta = hoja_(HOJA_ETA, COL_ETA);
  var fila  = buscarFila_(sh, id);
  if (fila < 0) throw new Error('Maniobra no encontrada: ' + id);
  var row   = sh.getRange(fila, 1, 1, COLUMNAS.length).getValues()[0];
  var ahora = new Date();
  row[20] = 'finalizada';
  row[22] = ahora;
  sh.getRange(fila, 1, 1, COLUMNAS.length).setValues([row]);
  if (shEta.getLastRow() >= 2) {
    var etaVals = shEta.getRange(2, 1, shEta.getLastRow() - 1, COL_ETA.length).getValues();
    var props   = PropertiesService.getScriptProperties();
    etaVals.forEach(function(r, i) {
      if (String(r[1]) !== String(id)) return;
      if (r[5] === 'en_curso' || r[5] === 'en_pausa') {
        r[5] = 'finalizada'; r[8] = ahora; r[18] = ahora;
        props.deleteProperty('pe_' + String(r[0]));
        shEta.getRange(i + 2, 1, 1, COL_ETA.length).setValues([r]);
      }
    });
  }
  return { ok: true };
}

function getManiobras(filtros) {
  filtros = filtros || {};
  var sh = hoja_(HOJA, COLUMNAS);
  if (sh.getLastRow() < 2) return [];
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, COLUMNAS.length).getValues();
  var tz   = Session.getScriptTimeZone();
  var out  = [];

  for (var i = vals.length - 1; i >= 0; i--) {
    var o = filaAObjeto_(vals[i]);
    o.ID              = String(o.ID || '');
    o.Fecha           = o.Fecha instanceof Date ? Utilities.formatDate(o.Fecha, tz, 'yyyy-MM-dd') : String(o.Fecha || '');
    o['Iniciado en']  = o['Iniciado en']  instanceof Date ? Utilities.formatDate(o['Iniciado en'],  tz, 'yyyy-MM-dd HH:mm') : '';
    o['Finalizado en']= o['Finalizado en']instanceof Date ? Utilities.formatDate(o['Finalizado en'],tz, 'yyyy-MM-dd HH:mm') : '';
    o.Timestamp       = '';

    if (filtros.estado  && o.Estado  !== filtros.estado)  continue;
    if (filtros.cliente && o.Cliente !== filtros.cliente) continue;
    if (filtros.flujo   && o.Flujo   !== filtros.flujo)   continue;
    if (filtros.q) {
      var q = String(filtros.q).toLowerCase();
      if (String(o.Folio).toLowerCase().indexOf(q) === -1 &&
          String(o['No. unidad']).toLowerCase().indexOf(q) === -1) continue;
    }
    out.push(o);
    if (out.length >= (filtros.limite || 300)) break;
  }
  return out;
}

/**
 * Maniobras en curso enriquecidas con estado de etapa actual.
 * Calcula elapsed_seg en el servidor para que el cronómetro del cliente
 * sea preciso independientemente del reloj local.
 */
function getManiobrasEnCurso() {
  var shM   = hoja_(HOJA, COLUMNAS);
  var shEta = hoja_(HOJA_ETA, COL_ETA);
  var props = PropertiesService.getScriptProperties();
  var ahora = Date.now();

  if (shM.getLastRow() < 2) return [];
  var mansVals = shM.getRange(2, 1, shM.getLastRow() - 1, COLUMNAS.length).getValues();
  var active   = mansVals.filter(function(r) { return r[20] === 'en_curso' || r[20] === 'en_pausa'; });
  if (!active.length) return [];

  // Construir índice de etapas por ID de maniobra
  var etaIdx = {};
  if (shEta.getLastRow() >= 2) {
    shEta.getRange(2, 1, shEta.getLastRow() - 1, COL_ETA.length).getValues().forEach(function(r) {
      var idM = String(r[1] || '');
      if (!idM) return;
      if (!etaIdx[idM]) etaIdx[idM] = [];
      etaIdx[idM].push({
        id:                  String(r[0] || ''),
        num:                 Number(r[3] || 0),
        nombre:              String(r[4] || ''),
        estado:              String(r[5] || ''),
        inicio_ms:           toMs_(r[6]),          // robusto: Date | string | number
        hora_inicio:         String(r[7] || ''),
        tiempo_min:          Number(r[10] || 0),
        tiempo_estimado_min: Number(r[11] || 0),
        pausa_acum_seg:      Number(r[14] || 0)
      });
    });
  }

  var tz = Session.getScriptTimeZone();
  return active.map(function(r) {
    var o   = filaAObjeto_(r);
    var idM = String(o.ID || '');
    var etapas = (etaIdx[idM] || []).sort(function(a, b) { return a.num - b.num; });

    var etapaActual = null;
    for (var i = 0; i < etapas.length; i++) {
      var e = etapas[i];
      if (e.estado !== 'en_curso' && e.estado !== 'en_pausa') continue;

      var propKey      = 'pe_' + e.id;
      var pausaDesde   = Number(props.getProperty(propKey) || 0);
      var is_paused    = (e.estado === 'en_pausa');

      // Calcular segundos transcurridos EN EL SERVIDOR
      var pausaActSeg  = (is_paused && pausaDesde) ? Math.round((ahora - pausaDesde) / 1000) : 0;
      var elapsed_seg  = e.inicio_ms
        ? Math.max(0, Math.round((ahora - e.inicio_ms) / 1000) - e.pausa_acum_seg - pausaActSeg)
        : 0;

      etapaActual = {
        id:                  e.id,
        num:                 e.num,
        nombre:              e.nombre,
        estado:              e.estado,
        hora_inicio:         e.hora_inicio,
        tiempo_estimado_min: e.tiempo_estimado_min,
        elapsed_seg:         elapsed_seg,   // segundos transcurridos al momento de la llamada
        refresh_ms:          ahora,         // timestamp cliente para calcular deriva
        is_paused:           is_paused
      };
      break;
    }

    return {
      id:          idM,
      folio:       String(o.Folio || ''),
      cliente:     String(o.Cliente || ''),
      flujo:       String(o.Flujo || ''),
      no_unidad:   String(o['No. unidad'] || ''),
      material:    String(o.Material || ''),
      estado:      String(o.Estado || ''),
      fecha:       o.Fecha instanceof Date ? Utilities.formatDate(o.Fecha, tz, 'yyyy-MM-dd') : String(o.Fecha || ''),
      etapa_actual: etapaActual,
      etapas:      etapas.map(function(e) {
        return { id: e.id, num: e.num, nombre: e.nombre, estado: e.estado,
                 tiempo_min: e.tiempo_min, tiempo_estimado_min: e.tiempo_estimado_min };
      })
    };
  });
}

/* ════════════════════════════════════════════════════════════
   ETAPAS — OPERACIONES
════════════════════════════════════════════════════════════ */

function pausarEtapa(idEtapa) {
  var shEta = hoja_(HOJA_ETA, COL_ETA);
  var fila  = buscarFila_(shEta, idEtapa);
  if (fila < 0) throw new Error('Etapa no encontrada: ' + idEtapa);

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
    // Reanudar: acumular pausa
    var desde = Number(props.getProperty(propKey) || 0);
    var acum  = acumPrev + (desde ? Math.round((Date.now() - desde) / 1000) : 0);
    shEta.getRange(fila, 15).setValue(acum);
    shEta.getRange(fila,  6).setValue('en_curso');
    props.deleteProperty(propKey);
    if (filaM > 0) shM.getRange(filaM, 21).setValue('en_curso');
    nuevo = 'en_curso';
  } else {
    // Pausar
    props.setProperty(propKey, String(Date.now()));
    shEta.getRange(fila, 6).setValue('en_pausa');
    if (filaM > 0) shM.getRange(filaM, 21).setValue('en_pausa');
    nuevo = 'en_pausa';
  }
  return { ok: true, estado: nuevo };
}

function finalizarEtapa(idEtapa, extras) {
  extras = extras || {};
  var shEta = hoja_(HOJA_ETA, COL_ETA);
  var fila  = buscarFila_(shEta, idEtapa);
  if (fila < 0) throw new Error('Etapa no encontrada: ' + idEtapa);

  var rowData    = shEta.getRange(fila, 1, 1, COL_ETA.length).getValues()[0];
  var idManiobra = String(rowData[1]  || '');
  var folio      = String(rowData[2]  || '');
  var numEtapa   = Number(rowData[3]  || 0);
  var horaInicio = String(rowData[7]  || '');
  var tiempoEst  = Number(rowData[11] || 0);
  var acum       = Number(rowData[14] || 0);

  var props   = PropertiesService.getScriptProperties();
  var propKey = 'pe_' + idEtapa;
  var desde   = Number(props.getProperty(propKey) || 0);
  if (desde) { acum += Math.round((Date.now() - desde) / 1000); props.deleteProperty(propKey); }

  var ahora     = new Date();
  var horaFin   = hhmm_(ahora);
  var tiempoMin = minutosEntre(horaInicio, horaFin);
  var pausaMins = Math.round(acum / 60);
  var demora    = Number(extras.demora_min || 0) + pausaMins;
  var efectivo  = Math.max(0, tiempoMin - demora);
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
}

function marcarEtapaNoAplica(idEtapa) {
  var shEta = hoja_(HOJA_ETA, COL_ETA);
  var fila  = buscarFila_(shEta, idEtapa);
  if (fila < 0) throw new Error('Etapa no encontrada: ' + idEtapa);

  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('pe_' + idEtapa);

  var rowData    = shEta.getRange(fila, 1, 1, COL_ETA.length).getValues()[0];
  var idManiobra = String(rowData[1] || '');
  var folio      = String(rowData[2] || '');
  var numEtapa   = Number(rowData[3] || 0);

  shEta.getRange(fila,  6).setValue('no_aplica');
  shEta.getRange(fila, 14).setValue('SÍ');

  return _avanzarOManiobra(idManiobra, folio, numEtapa, {});
}

function _avanzarOManiobra(idManiobra, folio, numActual, extras) {
  var shM   = hoja_(HOJA, COLUMNAS);
  var filaM = buscarFila_(shM, idManiobra);
  if (filaM < 0) throw new Error('Maniobra no encontrada: ' + idManiobra);

  var flujo  = String(shM.getRange(filaM, 5).getValue() || '');
  var lista  = _etapasFlujo(flujo);
  var sigNum = numActual + 1;
  var shEta  = hoja_(HOJA_ETA, COL_ETA);

  if (sigNum <= lista.length) {
    var nombreSig = lista[sigNum - 1];
    var tiempos   = getTimeposEstimados();
    var tiempoEst = tiempos[nombreSig] || 0;
    var idSig     = _crearEtapa(shEta, idManiobra, folio, sigNum, nombreSig, tiempoEst);
    shM.getRange(filaM,  6).setValue(nombreSig);
    shM.getRange(filaM, 21).setValue('en_curso');
    return { ok: true, maniobra_finalizada: false,
      siguiente: { id: idSig, num: sigNum, nombre: nombreSig, total: lista.length, tiempo_estimado_min: tiempoEst }
    };
  }

  return _cerrarManiobra(idManiobra, filaM, shM, shEta, extras);
}

function _cerrarManiobra(idManiobra, filaM, shM, shEta, extras) {
  var etapas = [];
  if (shEta.getLastRow() >= 2) {
    shEta.getRange(2, 1, shEta.getLastRow() - 1, COL_ETA.length).getValues().forEach(function(r) {
      if (String(r[1]) !== String(idManiobra)) return;
      etapas.push({ num: Number(r[3]), estado: String(r[5]),
        hora_inicio: String(r[7] || ''), hora_fin: String(r[9] || ''),
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

  shM.getRange(filaM,  6).setValue('Completada');
  shM.getRange(filaM, 21).setValue('finalizada');
  shM.getRange(filaM, 23).setValue(ahora);
  shM.getRange(filaM, 25).setValue(horaInicio);
  shM.getRange(filaM, 26).setValue(horaFin);
  shM.getRange(filaM, 27).setValue(sumaTotal);
  shM.getRange(filaM, 28).setValue(sumaDemora);
  shM.getRange(filaM, 30).setValue(efectivo);
  shM.getRange(filaM, 31).setValue(minPieza);
  if (extras && extras.dano_maniobra) {
    shM.getRange(filaM, 34).setValue('SÍ');
    shM.getRange(filaM, 35).setValue(extras.dano_maniobra_desc || '');
  }
  shM.getRange(filaM, 37).setValue(semaforo_(sumaTotal, cfg));

  return { ok: true, maniobra_finalizada: true,
    tiempo_total_min: sumaTotal, tiempo_efectivo_min: efectivo, demora_min: sumaDemora };
}

/* ════════════════════════════════════════════════════════════
   INDICADORES Y SERIES
════════════════════════════════════════════════════════════ */

function indicadores(dias) {
  dias = Number(dias || 30);
  var sh = hoja_(HOJA, COLUMNAS);
  var empty = { maniobras: 0, en_curso: 0, promedio_min: 0, promedio_efectivo_min: 0,
    demora_total_min: 0, danos: 0, semaforo: { VERDE: 0, 'ÁMBAR': 0, ROJO: 0 },
    por_cliente: [], por_etapa: [], por_flujo: [], por_empleado: [] };
  if (sh.getLastRow() < 2) return empty;

  var vals   = sh.getRange(2, 1, sh.getLastRow() - 1, COLUMNAS.length).getValues();
  var limite = new Date(); limite.setDate(limite.getDate() - dias);
  var tot = 0, enCurso = 0, sumaTotal = 0, sumaEfec = 0, conTiempo = 0, demoras = 0, danos = 0;
  var sem = { VERDE: 0, 'ÁMBAR': 0, ROJO: 0 };
  var cli = {}, eta = {}, flu = {}, emp = {};

  function acum(mapa, clave, min) {
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

  for (var i = 0; i < vals.length; i++) {
    var o = filaAObjeto_(vals[i]);
    var f = o.Fecha instanceof Date ? o.Fecha : new Date(String(o.Fecha || ''));
    if (isNaN(f.getTime())) continue;

    if (o.Estado !== 'finalizada') {
      if (f >= limite) enCurso++;
      continue;
    }
    if (f < limite) continue;

    tot++;
    var min = typeof o['Tiempo total (min)'] === 'number' ? o['Tiempo total (min)'] : Number(o['Tiempo total (min)'] || 0);
    if (min > 0) { sumaTotal += min; conTiempo++; }
    var efec = typeof o['Tiempo efectivo (min)'] === 'number' ? o['Tiempo efectivo (min)'] : Number(o['Tiempo efectivo (min)'] || 0);
    if (efec > 0) sumaEfec += efec;
    demoras += Number(o['Demora (min)'] || 0);
    if (o['Daño maniobra'] === 'SÍ' || o['Daño origen'] === 'SÍ') danos++;
    var s = String(o['Semáforo'] || '');
    if (sem[s] !== undefined) sem[s]++;
    acum(cli, o.Cliente, min);
    acum(eta, o.Etapa, min);
    acum(flu, o.Flujo, min);
    String(o.Montacarguistas || '').split(';').concat(String(o.Ayudantes || '').split(';'))
      .forEach(function(n) { n = n.trim(); if (n) acum(emp, n, min); });
  }

  return { maniobras: tot, en_curso: enCurso,
    promedio_min: conTiempo ? Math.round(sumaTotal / conTiempo) : 0,
    promedio_efectivo_min: conTiempo ? Math.round(sumaEfec / conTiempo) : 0,
    demora_total_min: Math.round(demoras), danos: danos, semaforo: sem,
    por_cliente: lista(cli), por_etapa: lista(eta), por_flujo: lista(flu), por_empleado: lista(emp) };
}

function serie(periodo, dias) {
  periodo = periodo || 'mes'; dias = Number(dias || 90);
  var sh = hoja_(HOJA, COLUMNAS);
  if (sh.getLastRow() < 2) return [];
  var vals   = sh.getRange(2, 1, sh.getLastRow() - 1, COLUMNAS.length).getValues();
  var limite = new Date(); limite.setDate(limite.getDate() - dias);
  var tz     = Session.getScriptTimeZone();
  var mapa   = {};

  for (var i = 0; i < vals.length; i++) {
    var o = filaAObjeto_(vals[i]);
    if (o.Estado !== 'finalizada') continue;
    var f = o.Fecha instanceof Date ? o.Fecha : new Date(String(o.Fecha || ''));
    if (isNaN(f.getTime()) || f < limite) continue;
    var k;
    if (periodo === 'anio')        k = Utilities.formatDate(f, tz, 'yyyy');
    else if (periodo === 'semana') k = Utilities.formatDate(f, tz, 'yyyy') + '-S' + Utilities.formatDate(f, tz, 'ww');
    else if (periodo === 'dia')    k = Utilities.formatDate(f, tz, 'yyyy-MM-dd');
    else                           k = Utilities.formatDate(f, tz, 'yyyy-MM');
    if (!mapa[k]) mapa[k] = { periodo: k, maniobras: 0, suma: 0, con: 0, demora: 0 };
    mapa[k].maniobras++;
    mapa[k].demora += Number(o['Demora (min)'] || 0);
    var min = Number(o['Tiempo total (min)'] || 0);
    if (min > 0) { mapa[k].suma += min; mapa[k].con++; }
  }
  return Object.keys(mapa).sort().map(function(k) {
    var m = mapa[k];
    return { periodo: k, maniobras: m.maniobras,
             promedio_min: m.con ? Math.round(m.suma / m.con) : 0, demora_min: Math.round(m.demora) };
  });
}

function getDetalleEtapas(dias) {
  dias = Number(dias || 30);
  var shEta  = hoja_(HOJA_ETA, COL_ETA);
  var limite = new Date(); limite.setDate(limite.getDate() - dias);
  var tz     = Session.getScriptTimeZone();
  var porEtapa = {};
  var movimientos = [];

  if (shEta.getLastRow() >= 2) {
    shEta.getRange(2, 1, shEta.getLastRow() - 1, COL_ETA.length).getValues().forEach(function(r) {
      if (String(r[5]) !== 'finalizada') return;
      var dt = r[6] instanceof Date ? r[6] : new Date(String(r[6] || ''));
      if (isNaN(dt.getTime()) || dt < limite) return;

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
  return { porEtapa: arr, movimientos: movimientos.slice(0, 150) };
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
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
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
      .addItem('⚙ Configurar hojas', 'setup')
      .addItem('📊 Ver indicadores (30 días)', 'mostrarIndicadores')
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
