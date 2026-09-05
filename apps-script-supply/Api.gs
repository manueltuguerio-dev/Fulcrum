/**
 * Funciones que la interfaz llama con google.script.run.
 *
 * Todas devuelven objetos planos y convierten cualquier excepcion en un
 * mensaje legible: la pantalla nunca debe mostrar un volcado de error.
 */

function apiPreparar() {
  return envolver(function () { return { mensaje: prepararLibro() }; });
}

function apiParametros() {
  return envolver(function () {
    var p = leerParametros();
    return {
      carpeta: p.carpetaEntrada,
      hoy: FECHAS.aIso(p.hoy),
      modo: p.modo,
      columna: p.columna,
      desde: p.desde ? FECHAS.aIso(p.desde) : '',
      hasta: p.hasta ? FECHAS.aIso(p.hasta) : '',
      estatus: p.estatus,
      incluirOpenPO: p.incluirOpenPO,
      escribirKB: p.escribirKB,
      sustituciones: p.sustituciones,
      urlLibro: libroTrabajo().getUrl(),
    };
  });
}

/**
 * Guarda en la hoja Config lo que se capturo en la pantalla, para que ambas
 * vias de configuracion queden siempre iguales.
 */
function apiGuardarParametros(datos) {
  return envolver(function () {
    var hoja = libroTrabajo().getSheetByName(HOJAS_TRABAJO.CONFIG);
    if (!hoja) throw new Error('Falta la hoja "Config". Presiona "Preparar libro" primero.');

    var mapa = {
      'Carpeta de Drive con el libro MX': datos.carpeta,
      'Fecha de corrida': datos.hoy ? FECHAS.aFecha(FECHAS.aSerial(datos.hoy)) : '',
      'Modo de ventana': datos.modo,
      'Desde': datos.desde ? FECHAS.aFecha(FECHAS.aSerial(datos.desde)) : '',
      'Hasta': datos.hasta ? FECHAS.aFecha(FECHAS.aSerial(datos.hasta)) : '',
      'Columna de semana': datos.columna,
      'Estatus a conservar': (datos.estatus || []).join(', '),
      'Leer Open_PO': datos.incluirOpenPO ? 'SI' : 'NO',
      'Escribir KB Supply': datos.escribirKB ? 'SI' : 'NO',
    };
    if (datos.sustituirDe) mapa['DEFAULT_BUYER a sustituir'] = datos.sustituirDe;
    if (datos.sustituirA) mapa['Se escribe como'] = datos.sustituirA;

    var valores = hoja.getRange(1, 1, hoja.getLastRow(), 2).getValues();
    for (var i = 0; i < valores.length; i++) {
      var clave = String(valores[i][0]).trim();
      if (mapa[clave] !== undefined) hoja.getRange(i + 1, 2).setValue(mapa[clave]);
    }
    return { mensaje: 'Configuracion guardada en la hoja Config.' };
  });
}

function apiIniciar() {
  return envolver(function () { return iniciarProceso(); });
}

function apiEstado() {
  return envolver(function () { return estadoProceso(); });
}

function apiContinuar() {
  return envolver(function () { return continuarProceso(); });
}

function apiCancelar() {
  return envolver(function () { return cancelarProceso(); });
}

// --- Contactos --------------------------------------------------------------

function apiContactosListar() {
  return envolver(function () {
    return { contactos: CONTACTOS.listar(), url: libroTrabajo().getUrl() };
  });
}

function apiContactosGuardar(proveedor, correos, eliminar) {
  return envolver(function () {
    var r = CONTACTOS.guardar(proveedor, correos, eliminar);
    return {
      contactos: CONTACTOS.listar(),
      aviso: r.invalidos.length
        ? 'No son correos validos y se descartaron: ' + r.invalidos.join(', ')
        : null,
    };
  });
}

/**
 * Importa el catalogo desde un archivo de Drive. Acepta la liga o el id de un
 * Excel, un CSV o una hoja de calculo; si no es hoja de calculo se convierte
 * en una copia temporal que se borra al terminar.
 */
function apiContactosImportar(ligaOId, reemplazar) {
  return envolver(function () {
    var id = extraerId(ligaOId);
    var archivo;
    try { archivo = DriveApp.getFileById(id); }
    catch (e) { throw new Error('No pude abrir ese archivo de Drive. Revisa la liga y tus permisos.'); }

    var temporal = null;
    try {
      var idHoja = id;
      if (archivo.getMimeType() !== MimeType.GOOGLE_SHEETS) {
        var copia = Drive.Files.copy(
          { title: 'MXSA temporal - contactos', mimeType: MimeType.GOOGLE_SHEETS }, id);
        temporal = copia.id;
        idHoja = copia.id;
      }
      var r = CONTACTOS.importarDe(idHoja, reemplazar === true);
      return {
        importados: r.importados,
        invalidos: r.invalidos,
        total: r.total,
        contactos: CONTACTOS.listar(),
      };
    } finally {
      if (temporal) {
        try { DriveApp.getFileById(temporal).setTrashed(true); } catch (e) { /* se limpia solo */ }
      }
    }
  });
}

function extraerId(valor) {
  var m = /[-\w]{25,}/.exec(String(valor || ''));
  if (!m) throw new Error('No reconoci un id de Drive en "' + valor + '".');
  return m[0];
}

// --- Correo -----------------------------------------------------------------

function apiCorreoPrevia(seleccion, cuerpo) {
  return envolver(function () {
    var estado = estadoParaCorreo();
    var correos = CORREO.previa(estado, seleccion, cuerpo);
    return {
      total: correos.length,
      conCorreo: correos.filter(function (c) { return !c.sinCorreo; }).length,
      sinCorreo: correos.filter(function (c) { return c.sinCorreo; })
        .map(function (c) { return c.proveedor; }),
      correos: correos,
      cuota: MailApp.getRemainingDailyQuota(),
    };
  });
}

function apiCorreoEnviar(seleccion, cuerpo) {
  return envolver(function () {
    var estado = estadoParaCorreo();
    return CORREO.enviar(estado, seleccion, cuerpo);
  });
}

function estadoParaCorreo() {
  var estado = leerEstado();
  if (!estado || !estado.registros || !estado.registros.length) {
    throw new Error('No hay una corrida terminada. Corre el proceso antes de mandar correos.');
  }
  if (estado.fase !== 'FIN') {
    throw new Error('La corrida todavia va en "' + (DESCRIPCION_FASE[estado.fase] || estado.fase)
      + '". Espera a que termine.');
  }
  return estado;
}

// --- Envoltura --------------------------------------------------------------

/**
 * Ejecuta y devuelve { ok, datos } o { ok:false, error }. La interfaz siempre
 * recibe algo con lo que pueda trabajar.
 */
function envolver(fn) {
  try {
    return { ok: true, datos: fn() };
  } catch (e) {
    console.error(e.stack || e.message);
    return { ok: false, error: e.message || String(e) };
  }
}
