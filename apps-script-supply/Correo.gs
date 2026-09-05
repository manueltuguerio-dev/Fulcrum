/**
 * Armado y envio de correos, uno por proveedor.
 *
 * A diferencia de la version Node, aqui no hace falta configurar un servidor
 * SMTP: Gmail manda con la cuenta que autorizo el script. Eso simplifica la
 * instalacion y a cambio impone la cuota diaria de Google, que se consulta
 * antes de cada lote.
 *
 * El envio siempre es explicito: primero se arma la vista previa y solo
 * despues, con una confirmacion, se manda.
 */

var CORREO = (function () {

  var ASUNTO_POR_OMISION = 'Material en riesgo de faltante - {proveedor} - {partes} parte(s)';
  var INTRO_POR_OMISION = 'Les comparto el material que tenemos en riesgo de faltante para la '
    + 'ventana indicada. Agradecemos confirmar fecha de entrega para cada numero de parte.';
  var CIERRE_POR_OMISION = 'El detalle completo va adjunto. Quedo al pendiente de su respuesta.';

  function fmt(n) {
    if (n === null || n === undefined || n === '') return '';
    var v = Math.round(Number(n) * 100) / 100;
    return isNaN(v) ? String(n) : v.toLocaleString('es-MX');
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function asuntoDe(prov, ctx) {
    return String(ctx.asunto || ASUNTO_POR_OMISION)
      .replace(/\{proveedor\}/g, prov.nombre)
      .replace(/\{partes\}/g, prov.totalPartes)
      .replace(/\{ventana\}/g, ctx.ventana);
  }

  function cuerpoHtml(prov, ctx) {
    var filas = prov.partes.map(function (g) {
      return '<tr>'
        + '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-family:monospace">' + esc(g.part) + '</td>'
        + '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">' + esc(g.description || '') + '</td>'
        + '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">' + fmt(g.totalInv) + '</td>'
        + '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right;color:#9c0006;font-weight:600">' + fmt(g.faltante) + '</td>'
        + '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap">'
        + (g.fechaFaltante ? esc(FECHAS.enEspanol(g.fechaFaltante)) : '') + '</td>'
        + '</tr>';
    }).join('');

    return '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.5">'
      + '<p>' + esc(ctx.saludo || 'Buen dia,') + '</p>'
      + '<p>' + esc(ctx.intro || INTRO_POR_OMISION) + '</p>'
      + '<p style="margin:16px 0 8px"><strong>Proveedor:</strong> ' + esc(prov.nombre) + '<br>'
      + '<strong>Ventana evaluada:</strong> ' + esc(ctx.ventana) + '<br>'
      + '<strong>Partes en riesgo:</strong> ' + prov.totalPartes + '</p>'
      + '<table style="border-collapse:collapse;font-size:13px;margin-top:8px">'
      + '<thead><tr style="background:#1f3864;color:#fff">'
      + '<th style="padding:8px 10px;text-align:left">Numero de parte</th>'
      + '<th style="padding:8px 10px;text-align:left">Descripcion</th>'
      + '<th style="padding:8px 10px;text-align:right">Inventario total</th>'
      + '<th style="padding:8px 10px;text-align:right">Faltante</th>'
      + '<th style="padding:8px 10px;text-align:left">Fecha del faltante</th>'
      + '</tr></thead><tbody>' + filas + '</tbody></table>'
      + '<p style="margin-top:16px">' + esc(ctx.cierre || CIERRE_POR_OMISION) + '</p>'
      + '<p style="margin-top:20px">Saludos,<br><strong>' + esc(ctx.firma || '') + '</strong></p>'
      + '<p style="margin-top:24px;font-size:11px;color:#9ca3af">'
      + 'Generado el ' + esc(ctx.generado) + ' a partir del proceso MX Supply Assurance. '
      + 'Inventario total = Acuity OH + Supplier OH. '
      + 'Faltante = peor proyeccion negativa dentro de la ventana.</p>'
      + '</div>';
  }

  // -------------------------------------------------------------------------
  // Adjunto
  // -------------------------------------------------------------------------

  var ENCABEZADO_ADJUNTO = ['Numero de parte', 'Descripcion', 'ORG', 'Acuity OH', 'Supplier OH',
    'Inventario total', 'Faltante en la ventana', 'Fecha del faltante', 'Lead time (dias)'];

  function filasAdjunto(prov) {
    return prov.partes.map(function (g) {
      var orgs = {};
      var lista = [];
      for (var i = 0; i < g.orgs.length; i++) {
        var v = String(g.orgs[i]);
        if (!orgs[v]) { orgs[v] = true; lista.push(v); }
      }
      return [g.part, g.description, lista.join(', '), g.acuityOH, g.supplierOH,
        g.totalInv, g.faltante,
        g.fechaFaltante ? FECHAS.enEspanol(g.fechaFaltante) : '', g.coldLT];
    });
  }

  /**
   * Adjunto en Excel. Se reutiliza una sola hoja temporal para los 13
   * proveedores en vez de crear una por cada uno, y se borra al terminar.
   */
  function abrirTemporal() {
    var libro = SpreadsheetApp.create('MXSA temporal - adjunto');
    return { libro: libro, id: libro.getId() };
  }

  function adjuntoXlsx(temporal, prov, ctx) {
    var hoja = temporal.libro.getSheets()[0];
    hoja.clear();
    hoja.setName('Faltantes');
    var filas = filasAdjunto(prov);
    hoja.getRange(1, 1, 1, ENCABEZADO_ADJUNTO.length).setValues([ENCABEZADO_ADJUNTO])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground(CFG.MARCA);
    if (filas.length) {
      hoja.getRange(2, 1, filas.length, ENCABEZADO_ADJUNTO.length).setValues(filas);
      hoja.getRange(2, 7, filas.length, 1)
        .setBackground(CFG.ROJO_FONDO).setFontColor(CFG.ROJO_TEXTO).setFontWeight('bold');
    }
    SpreadsheetApp.flush();

    var url = 'https://docs.google.com/spreadsheets/d/' + temporal.id + '/export?format=xlsx';
    var respuesta = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    });
    if (respuesta.getResponseCode() !== 200) {
      // Si la exportacion falla, el CSV sirve igual y no detiene el envio.
      return adjuntoCsv(prov, ctx);
    }
    return respuesta.getBlob().setName(nombreAdjunto(prov, ctx, 'xlsx'));
  }

  function adjuntoCsv(prov, ctx) {
    var filas = [ENCABEZADO_ADJUNTO].concat(filasAdjunto(prov));
    var csv = filas.map(function (f) {
      return f.map(function (c) {
        var s = String(c === null || c === undefined ? '' : c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\n');
    return Utilities.newBlob('﻿' + csv, 'text/csv', nombreAdjunto(prov, ctx, 'csv'));
  }

  function nombreAdjunto(prov, ctx, extension) {
    return 'Faltantes_' + String(prov.nombre).replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40)
      + '_' + ctx.sello + '.' + extension;
  }

  // -------------------------------------------------------------------------
  // Vista previa y envio
  // -------------------------------------------------------------------------

  function contexto(estado, cuerpo) {
    var c = cuerpo || {};
    return {
      ventana: FECHAS.enEspanol(estado.ventana.desde) + ' a ' + FECHAS.enEspanol(estado.ventana.hasta),
      generado: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
      sello: FECHAS.aIso(estado.parametros.hoy).replace(/-/g, ''),
      saludo: c.saludo, intro: c.intro, cierre: c.cierre, firma: c.firma, asunto: c.asunto,
      cc: String(c.cc || '').split(/[;,\s]+/).filter(String),
      adjuntar: c.adjuntar !== false,
      formatoAdjunto: c.formatoAdjunto === 'csv' ? 'csv' : 'xlsx',
    };
  }

  /** Arma los correos sin mandar nada. */
  function previa(estado, seleccion, cuerpo) {
    var proveedores = REPORTE.consolidar(estado.registros, estado.ventana.indices);
    var elegidos = filtrarSeleccion(proveedores, seleccion);
    var ctx = contexto(estado, cuerpo);

    return elegidos.map(function (prov) {
      var para = CONTACTOS.correosDe(prov.nombre);
      return {
        proveedor: prov.nombre,
        para: para,
        sinCorreo: para.length === 0,
        asunto: asuntoDe(prov, ctx),
        html: cuerpoHtml(prov, ctx),
        partes: prov.totalPartes,
      };
    });
  }

  function filtrarSeleccion(proveedores, seleccion) {
    if (!seleccion || !seleccion.length) return proveedores;
    var set = {};
    for (var i = 0; i < seleccion.length; i++) set[seleccion[i]] = true;
    return proveedores.filter(function (p) { return set[p.nombre]; });
  }

  /**
   * Envia el lote. No se detiene cuando un correo falla: devuelve un renglon
   * por proveedor con lo que paso, para que quede claro que si salio.
   */
  function enviar(estado, seleccion, cuerpo) {
    var proveedores = REPORTE.consolidar(estado.registros, estado.ventana.indices);
    var elegidos = filtrarSeleccion(proveedores, seleccion);
    var ctx = contexto(estado, cuerpo);

    var conCorreo = elegidos.filter(function (p) { return CONTACTOS.tiene(p.nombre); });
    if (!conCorreo.length) {
      throw new Error('Ningun proveedor seleccionado tiene correo registrado en la hoja Contactos.');
    }

    var cuota = MailApp.getRemainingDailyQuota();
    if (cuota < conCorreo.length) {
      throw new Error('La cuota de correo de hoy alcanza para ' + cuota + ' mensajes y se necesitan '
        + conCorreo.length + '. Envia el resto manana o desde otra cuenta.');
    }

    var temporal = null;
    var resultados = [];
    try {
      if (ctx.adjuntar && ctx.formatoAdjunto === 'xlsx') temporal = abrirTemporal();

      for (var i = 0; i < elegidos.length; i++) {
        var prov = elegidos[i];
        var para = CONTACTOS.correosDe(prov.nombre);
        if (!para.length) {
          resultados.push({ proveedor: prov.nombre, ok: false, omitido: true,
            mensaje: 'Sin correo registrado en la hoja Contactos.' });
          continue;
        }
        try {
          var adjuntos = [];
          if (ctx.adjuntar) {
            adjuntos.push(temporal ? adjuntoXlsx(temporal, prov, ctx) : adjuntoCsv(prov, ctx));
          }
          var opciones = {
            htmlBody: cuerpoHtml(prov, ctx),
            name: ctx.firma || undefined,
            attachments: adjuntos,
          };
          if (ctx.cc.length) opciones.cc = ctx.cc.join(',');

          GmailApp.sendEmail(para.join(','), asuntoDe(prov, ctx),
            'Este mensaje requiere un lector de correo con HTML.', opciones);

          resultados.push({ proveedor: prov.nombre, ok: true, para: para });
          bitacora('Correo enviado a ' + prov.nombre + ' (' + para.join(', ') + ')', 'ok');
        } catch (e) {
          resultados.push({ proveedor: prov.nombre, ok: false, para: para, mensaje: e.message });
          bitacora('Fallo el correo a ' + prov.nombre + ': ' + e.message, 'error');
        }
      }
    } finally {
      if (temporal) {
        try { DriveApp.getFileById(temporal.id).setTrashed(true); } catch (e) { /* se limpia solo */ }
      }
    }

    var enviados = resultados.filter(function (r) { return r.ok; }).length;
    return {
      enviados: enviados,
      fallidos: resultados.filter(function (r) { return !r.ok && !r.omitido; }).length,
      omitidos: resultados.filter(function (r) { return r.omitido; }).length,
      cuotaRestante: MailApp.getRemainingDailyQuota(),
      resultados: resultados,
    };
  }

  return { previa: previa, enviar: enviar, contexto: contexto };
})();
