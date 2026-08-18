/**
 * TLTERMINALS · Almacén — tablero (KPIs), exportación y reportes por correo.
 *
 * - Tablero configurable: métricas listas para armar widgets (volumen, demoras,
 *   productividad por operador, uso de maquinaria por SKU, cumplimiento de SLA).
 * - Exportación instantánea a Excel (.xlsx) o PDF.
 * - Reportes automáticos por correo con un disparador por tiempo (MailApp), que
 *   corren bajo la cuenta que publicó la app (no necesitan conectores externos).
 */

/* --------------------------------- tablero --------------------------------- */

/** Columnas del acta que se exportan y se muestran, en orden legible. @private */
var COLS_EXPORT = [
  'folio', 'fecha', 'turno', 'cliente', 'flujo', 'etapa', 'tipoEquipo', 'noUnidad',
  'material', 'presentacion', 'cantPiezas', 'unidadMedida', 'tarimas', 'pesoTons',
  'montacarguistas', 'numMontac', 'ayudantes', 'numAyud', 'tipoMontacargas', 'numMontacargas',
  'horaArribo', 'horaInicio', 'horaFin',
  'tiempoRecepcionMin', 'tiempoEsperaMin', 'tiempoEjecucionMin',
  'tiempoTotalMin', 'demoraMin', 'causaDemora', 'tiempoEfectivoMin', 'minPorPieza',
  'observaciones', 'danoLlegada', 'danoManiobra', 'detalleDano'
];

/**
 * Métricas del tablero para un rango de fechas (sobre maniobras finalizadas).
 * El cliente elige qué widgets mostrar.
 */
function apiDashboard(desde, hasta) {
  exigirRol_('ADMINISTRADOR');
  var d = String(desde || sumarDias_(hoyTexto_(), -30));
  var h = String(hasta || hoyTexto_());

  var filas = registrosVigentes_().filter(function (r) {
    if (String(r.estado) !== 'finalizado') { return false; }
    var f = textoFecha_(r.fecha);
    return f >= d && f <= h;
  }).map(registroParaCliente_);

  var total = filas.length;
  var sumaTotal = 0, sumaEfectivo = 0, sumaDemora = 0, sumaMinPieza = 0, conPieza = 0;
  var sla = { verde: 0, ambar: 0, rojo: 0 };
  var causas = {}, porDia = {}, porOperador = {}, porSku = {};
  var conDano = 0;

  filas.forEach(function (r) {
    sumaTotal += Number(r.tiempoTotalMin) || 0;
    sumaEfectivo += Number(r.tiempoEfectivoMin) || 0;
    sumaDemora += Number(r.demoraMin) || 0;
    if (Number(r.minPorPieza) > 0) { sumaMinPieza += Number(r.minPorPieza); conPieza++; }
    if (sla[r.sla] !== undefined) { sla[r.sla]++; }
    if (r.danoLlegada || r.danoManiobra) { conDano++; }

    (r.causaDemora ? r.causaDemora.split(' · ') : []).forEach(function (c) {
      c = c.trim(); if (c) { causas[c] = (causas[c] || 0) + 1; }
    });
    porDia[r.fecha] = (porDia[r.fecha] || 0) + 1;
    // Los montacarguistas del evento son los operadores ligados a cada máquina
    // (y, si los hubiera, los del staff con ese puesto).
    var operadoresR = [];
    (r.maquinas || []).forEach(function (m) {
      if (m.operador && operadoresR.indexOf(m.operador) === -1) { operadoresR.push(m.operador); }
    });
    (r.staff || []).forEach(function (s) {
      if (s.puesto === 'Montacarguista' && operadoresR.indexOf(s.nombre) === -1) { operadoresR.push(s.nombre); }
    });
    operadoresR.forEach(function (nombre) {
      if (!porOperador[nombre]) { porOperador[nombre] = { maniobras: 0, sumaMinPieza: 0, conPieza: 0 }; }
      porOperador[nombre].maniobras++;
      if (Number(r.minPorPieza) > 0) { porOperador[nombre].sumaMinPieza += Number(r.minPorPieza); porOperador[nombre].conPieza++; }
    });
    (r.maquinas || []).forEach(function (m) { porSku[m.sku] = (porSku[m.sku] || 0) + 1; });
  });

  var topCausas = Object.keys(causas).map(function (c) { return { causa: c, n: causas[c] }; })
    .sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
  var operadores = Object.keys(porOperador).map(function (n) {
    var o = porOperador[n];
    return { operador: n, maniobras: o.maniobras, minPorPieza: o.conPieza ? redondear2_(o.sumaMinPieza / o.conPieza) : '' };
  }).sort(function (a, b) { return b.maniobras - a.maniobras; });
  var maquinas = Object.keys(porSku).map(function (s) { return { sku: s, n: porSku[s] }; })
    .sort(function (a, b) { return b.n - a.n; });
  var dias = Object.keys(porDia).sort().map(function (f) { return { fecha: f, n: porDia[f] }; });

  return {
    desde: d, hasta: h, total: total,
    promTotal: total ? redondear2_(sumaTotal / total) : 0,
    promEfectivo: total ? redondear2_(sumaEfectivo / total) : 0,
    demoraTotal: redondear2_(sumaDemora),
    promMinPieza: conPieza ? redondear2_(sumaMinPieza / conPieza) : 0,
    conDano: conDano,
    cumplimiento: total ? Math.round(sla.verde / total * 100) : 0,
    sla: sla, topCausas: topCausas, operadores: operadores, maquinas: maquinas, dias: dias
  };
}

/** Guarda qué widgets muestra el tablero (solo MASTER). */
function apiGuardarWidgets(widgets) {
  exigirRol_('MASTER');
  escribirConfig('dashboardWidgets', JSON.stringify(widgets || []));
  return true;
}

/* ------------------------------- exportación ------------------------------- */

/**
 * Exporta maniobras finalizadas de un rango a Excel o PDF y devuelve el archivo
 * como data URL para que el navegador lo descargue.
 * @param {string} formato 'xlsx' o 'pdf'
 */
function apiExportar(formato, desde, hasta, cliente) {
  exigirRol_('ADMINISTRADOR');
  var filas = apiHistorial(desde, hasta, cliente);
  var blob = construirReporte_(filas, formato === 'pdf' ? 'pdf' : 'xlsx',
    'Reporte de maniobras ' + (desde || '') + ' a ' + (hasta || hoyTexto_()));
  return {
    nombre: blob.getName(),
    tipo: blob.getContentType(),
    dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes())
  };
}

/**
 * Arma un archivo (xlsx/pdf) con las filas dadas usando una hoja temporal que se
 * borra al terminar. Devuelve el Blob.
 * @private
 */
function construirReporte_(filas, formato, titulo) {
  var sello = Utilities.formatDate(new Date(), zona_(), 'yyyyMMdd_HHmmss');
  var temp = SpreadsheetApp.create('tmp_reporte_' + sello);
  var id = temp.getId();
  try {
    var hoja = temp.getActiveSheet();
    hoja.appendRow([titulo]);
    hoja.appendRow(COLS_EXPORT);
    var matriz = filas.map(function (r) {
      return COLS_EXPORT.map(function (c) { return r[c] === undefined ? '' : r[c]; });
    });
    if (matriz.length) {
      hoja.getRange(3, 1, matriz.length, COLS_EXPORT.length).setValues(matriz);
    }
    hoja.getRange(2, 1, 1, COLS_EXPORT.length).setFontWeight('bold');
    SpreadsheetApp.flush();

    var expFormato = formato === 'pdf' ? 'pdf' : 'xlsx';
    var url = 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=' + expFormato
      + '&portrait=false&size=A4&gridlines=false';
    var resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
    var blob = resp.getBlob();
    var ext = expFormato === 'pdf' ? '.pdf' : '.xlsx';
    blob.setName('Maniobras_' + sello + ext);
    return blob;
  } finally {
    try { DriveApp.getFileById(id).setTrashed(true); } catch (err) { /* se limpia solo con el tiempo */ }
  }
}

/* ---------------------------- reportes por correo -------------------------- */

var FRECUENCIAS = ['diario', 'semanal', 'mensual'];

/** Lista de reportes programados (MASTER). */
function apiReportes() {
  exigirRol_('MASTER');
  return {
    frecuencias: FRECUENCIAS,
    disparadorActivo: ScriptApp.getProjectTriggers().some(function (t) {
      return t.getHandlerFunction() === 'jobReportes';
    }),
    reportes: leerTodo_('CONFIG_REPORTES').map(function (r) {
      return {
        id: String(r.id), nombre: String(r.nombre), frecuencia: String(r.frecuencia),
        diaSemana: String(r.diaSemana || ''), hora: String(r.hora || ''),
        destinatarios: String(r.destinatarios || ''), formato: String(r.formato || 'xlsx'),
        activo: esSi_(r.activo), ultimoEnvio: String(r.ultimoEnvio || '')
      };
    })
  };
}

/** Alta o edición de un reporte programado. */
function apiGuardarReporte(datos) {
  var actor = exigirRol_('MASTER');
  datos = datos || {};
  var nombre = String(datos.nombre || '').trim();
  if (!nombre) {
    throw new Error('Ponle nombre al reporte.');
  }
  if (FRECUENCIAS.indexOf(String(datos.frecuencia)) === -1) {
    throw new Error('Frecuencia no válida.');
  }
  var correos = String(datos.destinatarios || '').split(/[,;\s]+/).filter(function (c) { return c.indexOf('@') !== -1; });
  if (!correos.length) {
    throw new Error('Indica al menos un correo destinatario.');
  }
  var campos = {
    nombre: nombre, frecuencia: String(datos.frecuencia),
    diaSemana: String(datos.diaSemana || ''), hora: ('0' + (Number(datos.hora) || 7)).slice(-2),
    destinatarios: correos.join(', '), formato: datos.formato === 'pdf' ? 'pdf' : 'xlsx',
    activo: datos.activo === false ? 'NO' : 'SI'
  };

  if (datos.id) {
    var r = buscarPorId_('CONFIG_REPORTES', datos.id);
    if (!r) { throw new Error('No encontré ese reporte.'); }
    actualizar_('CONFIG_REPORTES', r, campos);
    auditar_('', actor.nombre, 'reporte_editar', nombre, '', campos.frecuencia);
  } else {
    campos.id = nuevoId_();
    campos.ultimoEnvio = '';
    campos.creado = ahora_();
    insertar_('CONFIG_REPORTES', campos);
    auditar_('', actor.nombre, 'reporte_alta', nombre, '', campos.frecuencia);
  }
  instalarDisparadores();
  return true;
}

/** Borra un reporte programado. */
function apiBorrarReporte(id) {
  var actor = exigirRol_('MASTER');
  var r = buscarPorId_('CONFIG_REPORTES', id);
  if (!r) { throw new Error('No encontré ese reporte.'); }
  borrar_('CONFIG_REPORTES', r);
  auditar_('', actor.nombre, 'reporte_borrar', String(r.nombre), '', '');
  return true;
}

/** Envía un reporte de inmediato (para probar), sin esperar al horario. */
function apiEnviarReporteAhora(id) {
  var actor = exigirRol_('MASTER');
  var r = buscarPorId_('CONFIG_REPORTES', id);
  if (!r) { throw new Error('No encontré ese reporte.'); }
  enviarReporte_(r);
  return true;
}

/**
 * Disparador por tiempo (una vez por hora): revisa qué reportes toca enviar
 * según su frecuencia, hora y último envío.
 */
function jobReportes() {
  var ahora = new Date();
  var horaActual = Utilities.formatDate(ahora, zona_(), 'HH');
  var hoy = hoyTexto_();
  var diaSemana = ahora.getDay(); // 0 = domingo

  leerTodo_('CONFIG_REPORTES').forEach(function (r) {
    if (!esSi_(r.activo)) { return; }
    if (String(r.hora) !== String(horaActual)) { return; }
    if (textoFecha_(r.ultimoEnvio) === hoy) { return; } // ya se envió hoy

    var toca = false;
    if (String(r.frecuencia) === 'diario') { toca = true; }
    else if (String(r.frecuencia) === 'semanal') { toca = (String(diaSemana) === String(r.diaSemana || '1')); }
    else if (String(r.frecuencia) === 'mensual') { toca = (ahora.getDate() === 1); }

    if (toca) {
      try { enviarReporte_(r); } catch (err) { auditar_('', 'sistema', 'reporte_error', String(r.nombre), '', err.message); }
    }
  });
}

/** Construye y envía por correo un reporte. @private */
function enviarReporte_(r) {
  var hasta = hoyTexto_();
  var desde;
  if (String(r.frecuencia) === 'diario') { desde = sumarDias_(hasta, -1); }
  else if (String(r.frecuencia) === 'semanal') { desde = sumarDias_(hasta, -7); }
  else { desde = sumarDias_(hasta, -31); }

  var filas = registrosVigentes_().filter(function (x) {
    if (String(x.estado) !== 'finalizado') { return false; }
    var f = textoFecha_(x.fecha);
    return f >= desde && f <= hasta;
  }).map(registroParaCliente_);

  var blob = construirReporte_(filas, String(r.formato) === 'pdf' ? 'pdf' : 'xlsx',
    'Reporte ' + r.nombre + ' · ' + desde + ' a ' + hasta);

  var empresa = leerConfig('empresa') || 'TLTERMINALS';
  MailApp.sendEmail({
    to: String(r.destinatarios),
    subject: '[' + empresa + '] ' + r.nombre + ' (' + desde + ' a ' + hasta + ')',
    body: 'Reporte automático de maniobras de almacén.\n\n'
      + 'Periodo: ' + desde + ' a ' + hasta + '\n'
      + 'Maniobras finalizadas: ' + filas.length + '\n\n'
      + 'Generado por el sistema de registro de tiempos de ' + empresa + '.',
    attachments: [blob]
  });
  actualizar_('CONFIG_REPORTES', r, { ultimoEnvio: ahora_() });
  auditar_('', 'sistema', 'reporte_enviado', String(r.nombre), '', String(r.destinatarios));
}

/**
 * Programa el disparador por hora que dispara jobReportes. Idempotente: no crea
 * un segundo disparador si ya existe.
 */
function instalarDisparadores() {
  var existe = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'jobReportes';
  });
  if (!existe) {
    ScriptApp.newTrigger('jobReportes').timeBased().everyHours(1).create();
    Logger.log('Disparador de reportes instalado (cada hora).');
  } else {
    Logger.log('El disparador de reportes ya existía.');
  }
  return true;
}
