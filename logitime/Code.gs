/**
 * LogiTime v2 · Registro de maniobras de almacén con flujo por etapas
 * Google Apps Script + Google Sheets + Web App (HTML)
 *
 * Hojas creadas por setup():
 *   MANIOBRAS · ETAPAS · CATALOGOS · TIEMPOS_EST · EMPLEADOS · INCIDENCIAS · CONFIG
 *
 * INSTALACIÓN
 * 1. Crea un Google Sheets nuevo.
 * 2. Extensiones › Apps Script. Pega este archivo como Code.gs.
 * 3. Crea archivos HTML: Index · Dashboard · Estilos.
 * 4. Ejecuta setup() una vez y autoriza permisos.
 * 5. Implementar › Nueva implementación › Aplicación web.
 */

/* ================================================================
   CONSTANTES GLOBALES
   ================================================================ */

var HOJA      = 'MANIOBRAS';
var HOJA_CAT  = 'CATALOGOS';
var HOJA_EMP  = 'EMPLEADOS';
var HOJA_INC  = 'INCIDENCIAS';
var HOJA_ETA  = 'ETAPAS';
var HOJA_CFG  = 'CONFIG';
var HOJA_TEMS = 'TIEMPOS_EST';
var HOJA_USR  = 'USUARIOS';

var DEFAULT_CONFIG = {
  TURNO_MATUTINO_INICIO:   '06:00',
  TURNO_MATUTINO_FIN:      '14:00',
  TURNO_VESPERTINO_INICIO: '14:00',
  TURNO_VESPERTINO_FIN:    '22:00',
  TURNO_NOCTURNO_INICIO:   '22:00',
  TURNO_NOCTURNO_FIN:      '06:00',
  CORREOS_REPORTE:         '',
  UMBRAL_VERDE_MIN:        '45',
  UMBRAL_AMBAR_MIN:        '90',
  REPORTE_DIARIO_HORA:     '6',
  REPORTE_SEMANAL_DIA:     'LUNES'
};

var CATALOGOS = {
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

// Secuencia de etapas por tipo de flujo
var ETAPAS_FLUJO = {
  ENTRADA:    ['Llegada', 'Ingreso a andén', 'Descarga', 'Documentación', 'Salida'],
  SALIDA:     ['Llegada', 'Ingreso a andén', 'Carga',    'Documentación', 'Salida'],
  TRANSBORDO: ['Llegada', 'Descarga',        'Carga',    'Documentación', 'Salida'],
  INTERNO:    ['Carga',   'Descarga',        'Documentación']
};

var DEFAULT_TIEMPOS = [
  ['Llegada',         10],
  ['Ingreso a andén', 15],
  ['Descarga',        30],
  ['Carga',           30],
  ['Documentación',   15],
  ['Salida',          10]
];

// MANIOBRAS — 39 columnas (0-indexed en arrays; 1-indexed en getRange)
var COLUMNAS = [
  'ID', 'Folio', 'Fecha', 'Turno', 'Flujo', 'Etapa', 'Cliente', 'No. unidad', 'Tipo equipo',
  'Cant. equipos', 'Material', 'Presentación', 'Cant. piezas', 'Unidad de medida', 'Tarimas', 'Peso (ton)',
  'Tipo montacargas', 'Núm. montacargas', 'Montacarguistas', 'Ayudantes',
  'Estado', 'Iniciado en', 'Finalizado en', 'Pausa acum (seg)', 'Hora inicio', 'Hora fin',
  'Tiempo total (min)', 'Demora (min)', 'Causa demora', 'Tiempo efectivo (min)', 'Min/pieza',
  'Daño origen', 'Desc. daño origen', 'Daño maniobra', 'Desc. daño maniobra',
  'Observaciones', 'Semáforo', 'Registrado por', 'Timestamp'
];

// ETAPAS — 19 columnas
// 0:ID_etapa 1:ID_maniobra 2:Folio 3:Num_etapa 4:Nombre_etapa 5:Estado
// 6:Inicio_dt 7:Hora_inicio 8:Fin_dt 9:Hora_fin
// 10:Tiempo_min 11:Tiempo_estimado_min 12:Retraso_min 13:No_aplica
// 14:Pausa_acum_seg 15:Causa_demora 16:Observaciones 17:Registrado_por 18:Timestamp
var COL_ETA = [
  'ID_etapa', 'ID_maniobra', 'Folio', 'Num_etapa', 'Nombre_etapa', 'Estado',
  'Inicio_dt', 'Hora_inicio', 'Fin_dt', 'Hora_fin',
  'Tiempo_min', 'Tiempo_estimado_min', 'Retraso_min', 'No_aplica',
  'Pausa_acum_seg', 'Causa_demora', 'Observaciones', 'Registrado_por', 'Timestamp'
];

var COL_EMP = ['ID', 'Nombre', 'Posición', 'Montacargas', 'Activo'];
// USUARIOS: ID · Email · Nombre · PIN · Rol (MASTER|OPERADOR|DASHBOARD) · Activo · Timestamp
var COL_USR = ['ID', 'Email', 'Nombre', 'PIN', 'Rol', 'Activo', 'Timestamp'];
var COL_INC = ['ID', 'Fecha', 'Folio maniobra', 'Empleado', 'Tipo', 'Severidad',
               'Descripción', 'Estado', 'Resolución', 'Registrado por', 'Timestamp'];
var COL_CFG = ['Clave', 'Valor', 'Descripción'];
var COL_TEM = ['Etapa', 'Tiempo estimado (min)'];

/* ================================================================
   UTILIDADES
   ================================================================ */

function ss_() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  // Script autónomo: buscar o crear la hoja y guardar su ID
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('LOGITIME_SS_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* ID obsoleto, crear nueva */ }
  }
  var ss = SpreadsheetApp.create('LogiTime — Base de datos');
  props.setProperty('LOGITIME_SS_ID', ss.getId());
  return ss;
}

function hoja_(nombre, columnas) {
  var ss = ss_(), sh = ss.getSheetByName(nombre);
  if (!sh) {
    sh = ss.insertSheet(nombre);
    sh.getRange(1, 1, 1, columnas.length).setValues([columnas])
      .setFontWeight('bold').setBackground('#0f2748').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function uuid_()    { return Utilities.getUuid(); }
function usuario_() {
  try { return Session.getActiveUser().getEmail() || 'anónimo'; } catch (e) { return 'anónimo'; }
}

/* ================================================================
   LOGIN / USUARIOS
   ================================================================ */

function login(email, pin) {
  if (!email || !pin) return { ok: false, msg: 'Email y PIN son requeridos' };
  var sh = ss_().getSheetByName(HOJA_USR);
  if (!sh || sh.getLastRow() < 2) return { ok: false, msg: 'Sin usuarios configurados. Ejecuta setup() en el editor.' };
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, COL_USR.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    // COL_USR: 0:ID 1:Email 2:Nombre 3:PIN 4:Rol 5:Activo 6:Timestamp
    var matchEmail = String(r[1]).toLowerCase().trim() === String(email).toLowerCase().trim();
    var matchPin   = String(r[3]).trim() === String(pin).trim();
    var activo     = r[5] === true || r[5] === 'TRUE' || r[5] === 1;
    if (matchEmail && matchPin && activo) {
      return { ok: true, email: String(r[1]).trim(), nombre: String(r[2]).trim(), rol: String(r[4]).trim() };
    }
  }
  return { ok: false, msg: 'Email o PIN incorrectos' };
}

function getUsuarios() {
  var sh = ss_().getSheetByName(HOJA_USR);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COL_USR.length).getValues().map(function(r) {
    return { id: r[0], email: r[1], nombre: r[2], rol: r[4], activo: r[5] };
  });
}

function crearUsuario(data) {
  var sh = hoja_(HOJA_USR, COL_USR);
  var pin = String(data.pin || '').trim();
  if (!data.email || !data.nombre || !pin || !data.rol) return { ok: false, msg: 'Faltan datos' };
  // Verificar que no exista ya
  if (sh.getLastRow() >= 2) {
    var emails = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < emails.length; i++) {
      if (String(emails[i][0]).toLowerCase() === data.email.toLowerCase()) return { ok: false, msg: 'El email ya existe' };
    }
  }
  sh.appendRow([uuid_(), data.email, data.nombre, pin, data.rol, true, new Date()]);
  return { ok: true };
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

function toggleUsuario(id, activo) {
  var sh = ss_().getSheetByName(HOJA_USR);
  if (!sh || sh.getLastRow() < 2) return { ok: false };
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) { sh.getRange(i + 2, 6).setValue(activo); return { ok: true }; }
  }
  return { ok: false };
}

function hhmm_(fecha) {
  if (!fecha) return '';
  return Utilities.formatDate(new Date(fecha), Session.getScriptTimeZone(), 'HH:mm');
}

function minutosEntre(inicio, fin) {
  if (!inicio || !fin) return '';
  var a = String(inicio).split(':'), b = String(fin).split(':');
  var d = (Number(b[0]) * 60 + Number(b[1] || 0)) - (Number(a[0]) * 60 + Number(a[1] || 0));
  if (d < 0) d += 1440;
  return d;
}

function semaforo_(min, cfg) {
  if (min === '' || min === null || isNaN(min)) return 'SIN DATO';
  var verde = Number((cfg || {}).UMBRAL_VERDE_MIN || 45);
  var ambar = Number((cfg || {}).UMBRAL_AMBAR_MIN || 90);
  if (min <= verde)  return 'VERDE';
  if (min <= ambar)  return 'ÁMBAR';
  return 'ROJO';
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
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

/* ================================================================
   CONFIG
   ================================================================ */

function getConfigObj() {
  var sh = hoja_(HOJA_CFG, COL_CFG);
  var out = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  if (sh.getLastRow() < 2) return out;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  vals.forEach(function (r) {
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

/* ================================================================
   TIEMPOS ESTIMADOS POR ETAPA
   ================================================================ */

function getTimeposEstimados() {
  var sh = ss_().getSheetByName(HOJA_TEMS);
  if (!sh || sh.getLastRow() < 2) return {};
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  var out = {};
  vals.forEach(function (r) {
    var k = String(r[0] || '').trim();
    if (k) out[k] = Number(r[1] || 0);
  });
  return out;
}

/* ================================================================
   SETUP
   ================================================================ */

function setup() {
  hoja_(HOJA,     COLUMNAS);
  hoja_(HOJA_EMP, COL_EMP);
  hoja_(HOJA_INC, COL_INC);
  hoja_(HOJA_ETA, COL_ETA);
  hoja_(HOJA_CFG, COL_CFG);

  // CATALOGOS
  var cs = ss_().getSheetByName(HOJA_CAT) || ss_().insertSheet(HOJA_CAT);
  cs.clear();
  var keys = Object.keys(CATALOGOS);
  for (var i = 0; i < keys.length; i++) {
    var vals = CATALOGOS[keys[i]];
    cs.getRange(1, i + 1).setValue(keys[i]).setFontWeight('bold').setBackground('#0f2748').setFontColor('#ffffff');
    for (var j = 0; j < vals.length; j++) cs.getRange(j + 2, i + 1).setValue(vals[j]);
  }
  cs.setFrozenRows(1);

  // TIEMPOS_EST
  var ts = ss_().getSheetByName(HOJA_TEMS) || ss_().insertSheet(HOJA_TEMS);
  ts.clear();
  ts.getRange(1, 1, 1, 2).setValues([COL_TEM]).setFontWeight('bold').setBackground('#0f2748').setFontColor('#ffffff');
  ts.setFrozenRows(1);
  ts.getRange(2, 1, DEFAULT_TIEMPOS.length, 2).setValues(DEFAULT_TIEMPOS);

  // CONFIG defaults (solo si la hoja está vacía)
  var cfgSh = hoja_(HOJA_CFG, COL_CFG);
  if (cfgSh.getLastRow() < 2) {
    Object.keys(DEFAULT_CONFIG).forEach(function (k) {
      cfgSh.appendRow([k, DEFAULT_CONFIG[k], '']);
    });
  }

  // USUARIOS — cuenta master pre-cargada
  var uSh = hoja_(HOJA_USR, COL_USR);
  if (uSh.getLastRow() < 2) {
    uSh.appendRow([uuid_(), 'mrodriguez@tlterminals.com', 'M. Rodríguez', '1234', 'MASTER', true, new Date()]);
  }

  configurarTriggers();
  return '✓ Setup completo. Hojas: MANIOBRAS · ETAPAS · CATALOGOS · TIEMPOS_EST · EMPLEADOS · INCIDENCIAS · CONFIG · USUARIOS';
}

/* ================================================================
   TRIGGERS Y REPORTES AUTOMÁTICOS
   ================================================================ */

function configurarTriggers() {
  _eliminarTriggers();
  var cfg  = getConfigObj();
  var hora = parseInt(cfg.REPORTE_DIARIO_HORA || 6);

  ScriptApp.newTrigger('enviarReporteDaily').timeBased().atHour(hora).everyDays(1).create();

  var diasMap = {
    DOMINGO: ScriptApp.WeekDay.SUNDAY,   LUNES:   ScriptApp.WeekDay.MONDAY,
    MARTES:  ScriptApp.WeekDay.TUESDAY,  MIERCOLES: ScriptApp.WeekDay.WEDNESDAY,
    JUEVES:  ScriptApp.WeekDay.THURSDAY, VIERNES:   ScriptApp.WeekDay.FRIDAY,
    SABADO:  ScriptApp.WeekDay.SATURDAY
  };
  var diaKey  = String(cfg.REPORTE_SEMANAL_DIA || 'LUNES').toUpperCase();
  var diaWeek = diasMap[diaKey] || ScriptApp.WeekDay.MONDAY;
  ScriptApp.newTrigger('enviarReporteSemanal').timeBased().onWeekDay(diaWeek).atHour(hora).create();

  return { ok: true };
}

function _eliminarTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'enviarReporteDaily' || fn === 'enviarReporteSemanal') ScriptApp.deleteTrigger(t);
  });
}

function enviarReporteDaily()   { _enviarReporte('diario', 1); }
function enviarReporteSemanal() { _enviarReporte('semanal', 7); }

function _enviarReporte(tipo, dias) {
  var cfg     = getConfigObj();
  var correos = String(cfg.CORREOS_REPORTE || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (!correos.length) correos = [Session.getEffectiveUser().getEmail()];

  var k       = indicadores(dias);
  var periodo = tipo === 'semanal' ? 'Últimos 7 días' : 'Hoy';
  var html    = _buildEmailHTML(k, periodo, tipo);
  var fecha   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');

  correos.forEach(function (correo) {
    MailApp.sendEmail({
      to: correo,
      subject: 'LogiTime — Reporte ' + tipo + ' · ' + fecha,
      htmlBody: html
    });
  });
}

function _buildEmailHTML(k, periodo) {
  var s = k.semaforo;
  return [
    '<div style="font-family:system-ui,sans-serif;max-width:600px;margin:auto;background:#f0f4fb;padding:24px;border-radius:14px">',
    '<h1 style="color:#1a2332;font-size:22px;margin:0 0 2px">LogiTime</h1>',
    '<p style="color:#5a7090;margin:0 0 20px;font-size:14px">Reporte · ' + periodo + '</p>',
    '<table style="width:100%;border-collapse:separate;border-spacing:8px">',
    '<tr>',
    _kpiEmail('Maniobras finalizadas', k.maniobras),
    _kpiEmail('En curso', k.en_curso),
    '</tr><tr>',
    _kpiEmail('Promedio total', k.promedio_min + ' min'),
    _kpiEmail('Promedio efectivo', k.promedio_efectivo_min + ' min'),
    '</tr><tr>',
    _kpiEmail('Demora acumulada', k.demora_total_min + ' min'),
    _kpiEmail('Con daño', k.danos),
    '</tr></table>',
    '<p style="color:#1a2332;margin-top:16px;font-size:14px">',
    '<strong>Semáforo:</strong> ',
    '<span style="color:#14855a">● ' + (s.VERDE || 0) + ' verde</span>  ',
    '<span style="color:#c07000">● ' + (s['ÁMBAR'] || 0) + ' ámbar</span>  ',
    '<span style="color:#d03030">● ' + (s.ROJO || 0) + ' rojo</span></p>',
    '</div>'
  ].join('');
}

function _kpiEmail(label, val) {
  return '<td style="background:#fff;border-radius:10px;padding:14px;border:1px solid #dce5f0;width:50%">' +
    '<div style="color:#5a7090;font-size:12px">' + label + '</div>' +
    '<div style="color:#1a2332;font-size:24px;font-weight:700">' + val + '</div></td>';
}

/* ================================================================
   TURNO AUTOMÁTICO
   ================================================================ */

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
  turnos.forEach(function (t) {
    if (t.ini === t.fin) return;
    var dentro = t.fin > t.ini
      ? (mins >= t.ini && mins < t.fin)
      : (mins >= t.ini || mins < t.fin);
    if (dentro) turno = t.nombre;
  });
  return { turno: turno, fecha: Utilities.formatDate(ahora, tz, 'yyyy-MM-dd') };
}

/* ================================================================
   CATÁLOGOS
   ================================================================ */

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
  out.EMPLEADOS    = getEmpleados().filter(function (e) { return e.activo; }).map(function (e) { return e.nombre; });
  out.TIEMPOS_EST  = getTimeposEstimados();
  out.ETAPAS_FLUJO = ETAPAS_FLUJO;
  return out;
}

function agregarCatalogo(catalogo, valor) {
  var cs   = ss_().getSheetByName(HOJA_CAT);
  var vals = cs.getDataRange().getValues();
  var col  = -1;
  for (var c = 0; c < vals[0].length; c++) if (String(vals[0][c]).trim() === catalogo) col = c + 1;
  if (col === -1) { col = vals[0].length + 1; cs.getRange(1, col).setValue(catalogo).setFontWeight('bold'); }
  var ultima = cs.getRange(1, col, cs.getMaxRows(), 1).getValues()
    .filter(function (r) { return String(r[0]).trim() !== ''; }).length;
  cs.getRange(ultima + 1, col).setValue(valor);
  return getCatalogos();
}

/* ================================================================
   EMPLEADOS
   ================================================================ */

function getEmpleados() {
  var sh = hoja_(HOJA_EMP, COL_EMP);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COL_EMP.length).getValues().map(function (r) {
    return { id: r[0], nombre: r[1], posicion: r[2], montacargas: r[3],
             activo: r[4] !== false && r[4] !== 'NO' };
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
  var sh = hoja_(HOJA_EMP, COL_EMP);
  var fila = buscarFila_(sh, id);
  if (fila > 0) sh.deleteRow(fila);
  return { ok: true };
}

/* ================================================================
   ETAPAS (INTERNO)
   ================================================================ */

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
    0, '', '',
    usuario_(), ahora
  ]);
  return id;
}

/* ================================================================
   MANIOBRAS
   ================================================================ */

function iniciarManiobra(data) {
  var sh      = hoja_(HOJA, COLUMNAS);
  var shEta   = hoja_(HOJA_ETA, COL_ETA);
  var tiempos = getTimeposEstimados();

  var id          = uuid_();
  var ahora       = new Date();
  var tz          = Session.getScriptTimeZone();
  var fecha       = data.fecha || Utilities.formatDate(ahora, tz, 'yyyy-MM-dd');
  var flujo       = String(data.flujo || '').toUpperCase();
  var lista       = _etapasFlujo(flujo);
  var primeraEta  = lista[0] || '';
  var folio       = generarFolio(data.cliente, fecha, data.no_unidad);

  sh.appendRow([
    id, folio, fecha, data.turno, data.flujo, primeraEta,
    data.cliente, data.no_unidad, data.tipo_equipo,
    Number(data.cant_equipos || 1), data.material, data.presentacion,
    data.cant_piezas, data.unidad_medida, data.tarimas, data.peso_tons,
    data.tipo_montacargas, data.num_montacargas,
    [].concat(data.montacarguistas || []).join('; '),
    [].concat(data.ayudantes || []).join('; '),
    'en_curso', ahora, '', 0, '', '', '', 0, '', '', '',
    data.dano_origen ? 'SÍ' : 'NO', data.dano_origen_desc || '',
    'NO', '', data.observaciones || '', 'EN CURSO', usuario_(), ahora
  ]);

  var tiempoEst = tiempos[primeraEta] || 0;
  var idEtapa   = _crearEtapa(shEta, id, folio, 1, primeraEta, tiempoEst);

  return { ok: true, id: id, folio: folio,
    etapa: { id: idEtapa, num: 1, nombre: primeraEta, total: lista.length, tiempo_estimado_min: tiempoEst }
  };
}

// Registro retroactivo (horas manuales, sin flujo por etapas)
function registrarManiobra(data) {
  var sh    = hoja_(HOJA, COLUMNAS);
  var id    = uuid_();
  var tz    = Session.getScriptTimeZone();
  var fecha = data.fecha || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var folio = generarFolio(data.cliente, fecha, data.no_unidad);
  var cfg   = getConfigObj();

  var demora   = Number(data.demora_min || 0);
  var total    = minutosEntre(data.hora_inicio, data.hora_fin);
  var efectivo = total === '' ? '' : Math.max(0, total - demora);
  var piezas   = Number(data.cant_piezas || 0);
  var minPieza = (efectivo !== '' && piezas > 0) ? Math.round((efectivo / piezas) * 100) / 100 : '';

  sh.appendRow([
    id, folio, fecha, data.turno, data.flujo, data.etapa || '—',
    data.cliente, data.no_unidad, data.tipo_equipo,
    Number(data.cant_equipos || 1), data.material, data.presentacion,
    data.cant_piezas, data.unidad_medida, data.tarimas, data.peso_tons,
    data.tipo_montacargas, data.num_montacargas,
    [].concat(data.montacarguistas || []).join('; '),
    [].concat(data.ayudantes || []).join('; '),
    'finalizada', '', new Date(), 0, data.hora_inicio, data.hora_fin,
    total, demora, data.causa_demora || '', efectivo, minPieza,
    data.dano_origen ? 'SÍ' : 'NO', data.dano_origen_desc || '',
    data.dano_maniobra ? 'SÍ' : 'NO', data.dano_maniobra_desc || '',
    data.observaciones || '', semaforo_(total, cfg), usuario_(), new Date()
  ]);
  return { ok: true, id: id, folio: folio, tiempo_total_min: total };
}

function eliminarManiobra(id) {
  var sh    = hoja_(HOJA, COLUMNAS);
  var shEta = hoja_(HOJA_ETA, COL_ETA);
  var fila  = buscarFila_(sh, id);
  if (fila > 0) sh.deleteRow(fila);

  // Eliminar etapas del registro y limpiar Properties
  if (shEta.getLastRow() >= 2) {
    var eta = shEta.getRange(2, 1, shEta.getLastRow() - 1, 2).getValues();
    var props = PropertiesService.getDocumentProperties();
    for (var i = eta.length - 1; i >= 0; i--) {
      if (String(eta[i][1]) === String(id)) {
        props.deleteProperty('pausa_etapa_' + String(eta[i][0]));
        shEta.deleteRow(i + 2);
      }
    }
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
    o.Fecha           = o.Fecha        instanceof Date ? Utilities.formatDate(o.Fecha, tz, 'yyyy-MM-dd') : o.Fecha;
    o['Iniciado en']  = o['Iniciado en']  instanceof Date ? String(o['Iniciado en'])  : '';
    o['Finalizado en']= o['Finalizado en']instanceof Date ? String(o['Finalizado en']): '';
    o.Timestamp       = o.Timestamp    instanceof Date ? String(o.Timestamp)    : '';

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

// Maniobras activas enriquecidas con datos de la etapa actual (pestaña En curso)
function getManiobrasEnCurso() {
  var shM   = hoja_(HOJA, COLUMNAS);
  var shEta = hoja_(HOJA_ETA, COL_ETA);
  var props = PropertiesService.getDocumentProperties();

  if (shM.getLastRow() < 2) return [];
  var mansVals = shM.getRange(2, 1, shM.getLastRow() - 1, COLUMNAS.length).getValues();
  var active   = mansVals.filter(function (r) { return r[20] === 'en_curso' || r[20] === 'en_pausa'; });
  if (!active.length) return [];

  // Índice de etapas por id_maniobra
  var etaIdx = {};
  if (shEta.getLastRow() >= 2) {
    shEta.getRange(2, 1, shEta.getLastRow() - 1, COL_ETA.length).getValues().forEach(function (r) {
      var idM = String(r[1]);
      if (!etaIdx[idM]) etaIdx[idM] = [];
      etaIdx[idM].push({
        id:                  String(r[0]),
        num:                 Number(r[3]),
        nombre:              String(r[4]),
        estado:              String(r[5]),
        inicio_ms:           r[6] instanceof Date ? r[6].getTime() : 0,
        hora_inicio:         String(r[7] || ''),
        tiempo_min:          Number(r[10] || 0),
        tiempo_estimado_min: Number(r[11] || 0),
        pausa_acum_seg:      Number(r[14] || 0)
      });
    });
  }

  var tz = Session.getScriptTimeZone();
  return active.map(function (r) {
    var o   = filaAObjeto_(r);
    var idM = String(o.ID);
    var etapas = (etaIdx[idM] || []).sort(function (a, b) { return a.num - b.num; });

    var etapaActual = null;
    for (var i = 0; i < etapas.length; i++) {
      if (etapas[i].estado === 'en_curso' || etapas[i].estado === 'en_pausa') {
        etapaActual = JSON.parse(JSON.stringify(etapas[i]));
        etapaActual.pausa_desde_ms = Number(props.getProperty('pausa_etapa_' + etapaActual.id) || 0);
        break;
      }
    }

    return {
      id:         idM,
      folio:      String(o.Folio || ''),
      cliente:    String(o.Cliente || ''),
      flujo:      String(o.Flujo || ''),
      no_unidad:  String(o['No. unidad'] || ''),
      estado:     String(o.Estado || ''),
      fecha:      o.Fecha instanceof Date ? Utilities.formatDate(o.Fecha, tz, 'yyyy-MM-dd') : String(o.Fecha || ''),
      etapa_actual: etapaActual,
      etapas:     etapas,
      total_etapas: _etapasFlujo(String(o.Flujo || '')).length
    };
  });
}

/* ================================================================
   ETAPAS (EXPUESTAS)
   ================================================================ */

function getEtapasManiobra(idManiobra) {
  var shEta = hoja_(HOJA_ETA, COL_ETA);
  if (shEta.getLastRow() < 2) return [];
  return shEta.getRange(2, 1, shEta.getLastRow() - 1, COL_ETA.length).getValues()
    .filter(function (r) { return String(r[1]) === String(idManiobra); })
    .sort(function (a, b) { return a[3] - b[3]; })
    .map(function (r) {
      return { id: r[0], num: r[3], nombre: r[4], estado: r[5],
        hora_inicio: r[7], hora_fin: r[9],
        tiempo_min: r[10], tiempo_estimado_min: r[11],
        retraso_min: r[12], no_aplica: r[13] };
    });
}

function pausarEtapa(idEtapa, causa) {
  var shEta   = hoja_(HOJA_ETA, COL_ETA);
  var fila    = buscarFila_(shEta, idEtapa);
  if (fila < 0) throw new Error('Etapa no encontrada');

  var props   = PropertiesService.getDocumentProperties();
  var propKey = 'pausa_etapa_' + idEtapa;
  var estado  = shEta.getRange(fila, 6).getValue();
  var idMan   = String(shEta.getRange(fila, 2).getValue());
  var shM     = hoja_(HOJA, COLUMNAS);
  var filaM   = buscarFila_(shM, idMan);

  if (estado === 'en_pausa') {
    // Reanudar
    var desde = Number(props.getProperty(propKey) || 0);
    var acum  = Number(shEta.getRange(fila, 15).getValue() || 0);
    if (desde) acum += Math.round((new Date().getTime() - desde) / 1000);
    shEta.getRange(fila, 15).setValue(acum);
    shEta.getRange(fila, 6).setValue('en_curso');
    props.deleteProperty(propKey);
    if (filaM > 0) shM.getRange(filaM, 21).setValue('en_curso');
  } else {
    // Pausar
    props.setProperty(propKey, String(new Date().getTime()));
    shEta.getRange(fila, 6).setValue('en_pausa');
    if (causa) shEta.getRange(fila, 16).setValue(causa);
    if (filaM > 0) shM.getRange(filaM, 21).setValue('en_pausa');
  }
  return { ok: true, estado: shEta.getRange(fila, 6).getValue() };
}

function finalizarEtapa(idEtapa, extras) {
  extras = extras || {};
  var shEta   = hoja_(HOJA_ETA, COL_ETA);
  var fila    = buscarFila_(shEta, idEtapa);
  if (fila < 0) throw new Error('Etapa no encontrada');

  var props   = PropertiesService.getDocumentProperties();
  var propKey = 'pausa_etapa_' + idEtapa;
  var acum    = Number(shEta.getRange(fila, 15).getValue() || 0);
  var desde   = Number(props.getProperty(propKey) || 0);
  if (desde) { acum += Math.round((new Date().getTime() - desde) / 1000); props.deleteProperty(propKey); }

  var ahora      = new Date();
  var horaInicio = String(shEta.getRange(fila, 8).getValue() || '');
  var horaFin    = hhmm_(ahora);
  var tiempoMin  = minutosEntre(horaInicio, horaFin);
  var tiempoEst  = Number(shEta.getRange(fila, 12).getValue() || 0);
  var pausaMins  = Math.round(acum / 60);
  var demora     = Number(extras.demora_min || 0) + pausaMins;
  var efectivo   = (tiempoMin !== '') ? Math.max(0, tiempoMin - demora) : 0;
  var retraso    = (tiempoEst > 0 && tiempoMin !== '') ? Math.max(0, tiempoMin - tiempoEst) : 0;

  shEta.getRange(fila,  6).setValue('finalizada');
  shEta.getRange(fila,  9).setValue(ahora);
  shEta.getRange(fila, 10).setValue(horaFin);
  shEta.getRange(fila, 11).setValue(tiempoMin);
  shEta.getRange(fila, 13).setValue(retraso);
  shEta.getRange(fila, 15).setValue(acum);
  if (extras.causa_demora)  shEta.getRange(fila, 16).setValue(extras.causa_demora);
  if (extras.observaciones) shEta.getRange(fila, 17).setValue(extras.observaciones);

  var idManiobra = String(shEta.getRange(fila, 2).getValue());
  var folio      = String(shEta.getRange(fila, 3).getValue());
  var numEtapa   = Number(shEta.getRange(fila, 4).getValue());

  return _avanzarOManiobra(idManiobra, folio, numEtapa, extras);
}

function marcarEtapaNoAplica(idEtapa) {
  var shEta = hoja_(HOJA_ETA, COL_ETA);
  var fila  = buscarFila_(shEta, idEtapa);
  if (fila < 0) throw new Error('Etapa no encontrada');

  var props = PropertiesService.getDocumentProperties();
  props.deleteProperty('pausa_etapa_' + idEtapa);

  shEta.getRange(fila,  6).setValue('no_aplica');
  shEta.getRange(fila, 14).setValue('SÍ');

  var idManiobra = String(shEta.getRange(fila, 2).getValue());
  var folio      = String(shEta.getRange(fila, 3).getValue());
  var numEtapa   = Number(shEta.getRange(fila, 4).getValue());

  return _avanzarOManiobra(idManiobra, folio, numEtapa, {});
}

function _avanzarOManiobra(idManiobra, folio, numActual, extras) {
  var shM   = hoja_(HOJA, COLUMNAS);
  var filaM = buscarFila_(shM, idManiobra);
  if (filaM < 0) throw new Error('Maniobra no encontrada');

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
    shEta.getRange(2, 1, shEta.getLastRow() - 1, COL_ETA.length).getValues().forEach(function (r) {
      if (String(r[1]) !== String(idManiobra)) return;
      etapas.push({ num: Number(r[3]), estado: String(r[5]),
        hora_inicio: String(r[7] || ''), hora_fin: String(r[9] || ''),
        tiempo_min: Number(r[10] || 0), pausa_acum_seg: Number(r[14] || 0) });
    });
  }
  etapas.sort(function (a, b) { return a.num - b.num; });

  var finalizadas = etapas.filter(function (e) { return e.estado === 'finalizada'; });
  var sumaTotal   = 0, sumaDemora = 0;
  finalizadas.forEach(function (e) {
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

/* ================================================================
   INCIDENCIAS
   ================================================================ */

function getIncidencias() {
  var sh = hoja_(HOJA_INC, COL_INC);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COL_INC.length).getValues().map(function (r) {
    return { id: r[0],
      fecha: r[1] instanceof Date ? Utilities.formatDate(r[1], Session.getScriptTimeZone(), 'yyyy-MM-dd') : r[1],
      folio: r[2], empleado: r[3], tipo: r[4], severidad: r[5],
      descripcion: r[6], estado: r[7], resolucion: r[8], usuario: r[9] };
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
  sh.appendRow([id,
    data.fecha || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    data.folio || '', data.empleado || '', data.tipo, data.severidad,
    data.descripcion, data.estado || 'abierta', data.resolucion || '',
    usuario_(), new Date()
  ]);
  return { ok: true, id: id };
}

function eliminarIncidencia(id) {
  var sh = hoja_(HOJA_INC, COL_INC);
  var fila = buscarFila_(sh, id);
  if (fila > 0) sh.deleteRow(fila);
  return { ok: true };
}

/* ================================================================
   INDICADORES Y SERIES
   ================================================================ */

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
    if (typeof min === 'number') { mapa[clave].suma += min; mapa[clave].con++; }
  }
  function lista(mapa) {
    return Object.keys(mapa).map(function (k) {
      var m = mapa[k];
      return { nombre: m.nombre, maniobras: m.maniobras, promedio_min: m.con ? Math.round(m.suma / m.con) : 0 };
    }).sort(function (a, b) { return b.maniobras - a.maniobras; });
  }

  for (var i = 0; i < vals.length; i++) {
    var o = filaAObjeto_(vals[i]);
    var f = new Date(o.Fecha);
    if (isNaN(f.getTime()) || f < limite) continue;
    if (o.Estado !== 'finalizada') { enCurso++; continue; }
    tot++;
    var min = typeof o['Tiempo total (min)'] === 'number' ? o['Tiempo total (min)'] : null;
    if (min !== null) { sumaTotal += min; conTiempo++; }
    if (typeof o['Tiempo efectivo (min)'] === 'number') sumaEfec += o['Tiempo efectivo (min)'];
    demoras += Number(o['Demora (min)'] || 0);
    if (o['Daño maniobra'] === 'SÍ' || o['Daño origen'] === 'SÍ') danos++;
    if (sem[o['Semáforo']] !== undefined) sem[o['Semáforo']]++;
    acum(cli, o.Cliente, min);
    acum(eta, o.Etapa, min);
    acum(flu, o.Flujo, min);
    String(o.Montacarguistas || '').split(';').concat(String(o.Ayudantes || '').split(';'))
      .forEach(function (n) { n = n.trim(); if (n) acum(emp, n, min); });
  }

  return { maniobras: tot, en_curso: enCurso,
    promedio_min: conTiempo ? Math.round(sumaTotal / conTiempo) : 0,
    promedio_efectivo_min: conTiempo ? Math.round(sumaEfec / conTiempo) : 0,
    demora_total_min: demoras, danos: danos, semaforo: sem,
    por_cliente: lista(cli), por_etapa: lista(eta), por_flujo: lista(flu), por_empleado: lista(emp) };
}

function serie(periodo, dias) {
  periodo = periodo || 'dia'; dias = Number(dias || 90);
  var sh = hoja_(HOJA, COLUMNAS);
  if (sh.getLastRow() < 2) return [];
  var vals   = sh.getRange(2, 1, sh.getLastRow() - 1, COLUMNAS.length).getValues();
  var limite = new Date(); limite.setDate(limite.getDate() - dias);
  var tz     = Session.getScriptTimeZone();
  var mapa   = {};

  for (var i = 0; i < vals.length; i++) {
    var o = filaAObjeto_(vals[i]);
    var f = new Date(o.Fecha);
    if (isNaN(f.getTime()) || f < limite || o.Estado !== 'finalizada') continue;
    var k;
    if (periodo === 'anio')        k = Utilities.formatDate(f, tz, 'yyyy');
    else if (periodo === 'mes')    k = Utilities.formatDate(f, tz, 'yyyy-MM');
    else if (periodo === 'semana') k = Utilities.formatDate(f, tz, 'yyyy') + '-S' + Utilities.formatDate(f, tz, 'ww');
    else                           k = Utilities.formatDate(f, tz, 'yyyy-MM-dd');
    if (!mapa[k]) mapa[k] = { periodo: k, maniobras: 0, suma: 0, con: 0, demora: 0 };
    mapa[k].maniobras++;
    mapa[k].demora += Number(o['Demora (min)'] || 0);
    if (typeof o['Tiempo total (min)'] === 'number') { mapa[k].suma += o['Tiempo total (min)']; mapa[k].con++; }
  }
  return Object.keys(mapa).sort().map(function (k) {
    var m = mapa[k];
    return { periodo: k, maniobras: m.maniobras, promedio_min: m.con ? Math.round(m.suma / m.con) : 0, demora_min: m.demora };
  });
}

/* ================================================================
   WEB APP
   ================================================================ */

function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) || 'form';
  if (page === 'json') {
    return ContentService.createTextOutput(JSON.stringify(indicadores(e.parameter.dias || 30)))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var file = page === 'dashboard' ? 'Dashboard' : 'Index';
  return HtmlService.createTemplateFromFile(file).evaluate()
    .setTitle('LogiTime — Maniobras')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var res  = data.accion === 'iniciar' ? iniciarManiobra(data) : registrarManiobra(data);
    return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function include(nombre) { return HtmlService.createHtmlOutputFromFile(nombre).getContent(); }
function urlApp()        { return ScriptApp.getService().getUrl(); }

/* ================================================================
   MENÚ EN LA HOJA
   ================================================================ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('LogiTime')
    .addItem('⚙ Configurar hojas', 'setup')
    .addItem('📊 Ver indicadores (30 días)', 'mostrarIndicadores')
    .addItem('📧 Reconfigrar triggers de reporte', 'configurarTriggers')
    .addToUi();
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
