/**
 * TLTERMINALS · Comedor — reportes de producción y de cobros.
 */

/**
 * Consolidado del día para la cocina o el proveedor.
 */
function apiResumenProduccion(fecha) {
  exigirAdmin_();
  var f = String(fecha);
  var nombres = {};
  leerTodo_('Platillos').forEach(function (p) { nombres[String(p.id)] = String(p.nombre); });

  var principales = {};
  var complementos = {};
  var salsas = {};
  var detalle = [];
  var totalComidas = 0;

  leerTodo_('Pedidos').forEach(function (p) {
    if (textoFecha_(p.fecha) !== f) {
      return;
    }
    var estado = String(p.estado);
    if (estado === 'cancelado' || estado === 'no_come') {
      return;
    }
    totalComidas++;
    var principal = nombres[String(p.principalId)] || String(p.principalId);
    principales[principal] = (principales[principal] || 0) + 1;
    listaDeTexto_(p.complementos).forEach(function (id) {
      var n = nombres[id] || id;
      complementos[n] = (complementos[n] || 0) + 1;
    });
    listaDeTexto_(p.salsas).forEach(function (id) {
      var n = nombres[id] || id;
      salsas[n] = (salsas[n] || 0) + 1;
    });
    detalle.push({
      nombre: String(p.nombre),
      platillo: principal,
      complementos: listaDeTexto_(p.complementos).map(function (id) { return nombres[id] || id; }),
      salsas: listaDeTexto_(p.salsas).map(function (id) { return nombres[id] || id; }),
      comentarios: String(p.comentarios || '')
    });
  });

  detalle.sort(function (a, b) { return a.nombre < b.nombre ? -1 : 1; });

  return {
    fecha: f,
    totalComidas: totalComidas,
    principales: aConteo_(principales),
    complementos: aConteo_(complementos),
    salsas: aConteo_(salsas),
    detalle: detalle
  };
}

function aConteo_(mapa) {
  return Object.keys(mapa)
    .map(function (nombre) { return { nombre: nombre, cantidad: mapa[nombre] }; })
    .sort(function (a, b) { return b.cantidad - a.cantidad; });
}

/**
 * Cobros acumulados por empleado en un rango, con su detalle diario.
 */
function apiReporteCobros(desde, hasta) {
  exigirAdmin_();
  var d = String(desde);
  var h = String(hasta);
  var nombres = {};
  leerTodo_('Platillos').forEach(function (p) { nombres[String(p.id)] = String(p.nombre); });

  var porEmpleado = {};
  var detalle = [];
  var total = 0;
  var excepciones = 0;

  leerTodo_('Pedidos').forEach(function (p) {
    var f = textoFecha_(p.fecha);
    if (f < d || f > h) {
      return;
    }
    var cobra = cobrable_(p);
    var importe = cobra ? Number(p.importe) || 0 : 0;
    var esExcepcion = esSi_(p.condonado) || String(p.origen) === 'admin_expreso';
    if (esExcepcion) {
      excepciones++;
    }

    var clave = String(p.email);
    if (!porEmpleado[clave]) {
      porEmpleado[clave] = {
        nombre: String(p.nombre), email: clave, numeroNomina: '',
        comidas: 0, importe: 0, excepciones: 0
      };
      var empleado = buscarEmpleadoPorEmail_(clave);
      if (empleado) {
        porEmpleado[clave].numeroNomina = String(empleado.numeroNomina || '');
        porEmpleado[clave].area = String(empleado.area || '');
      }
    }
    if (cobra) {
      porEmpleado[clave].comidas++;
      porEmpleado[clave].importe += importe;
      total += importe;
    }
    if (esExcepcion) {
      porEmpleado[clave].excepciones++;
    }

    detalle.push({
      fecha: f, nombre: String(p.nombre), email: clave,
      numeroNomina: porEmpleado[clave].numeroNomina,
      platillo: nombres[String(p.principalId)] || '',
      estado: String(p.estado), importe: importe,
      origen: String(p.origen || ''), condonado: esSi_(p.condonado) ? 'SI' : 'NO'
    });
  });

  var resumen = Object.keys(porEmpleado).map(function (k) {
    var e = porEmpleado[k];
    e.importe = Math.round(e.importe * 100) / 100;
    return e;
  }).sort(function (a, b) { return a.nombre < b.nombre ? -1 : 1; });

  detalle.sort(function (a, b) {
    if (a.fecha !== b.fecha) { return a.fecha < b.fecha ? -1 : 1; }
    return a.nombre < b.nombre ? -1 : 1;
  });

  return {
    desde: d, hasta: h, resumen: resumen, detalle: detalle,
    total: Math.round(total * 100) / 100,
    empleados: resumen.length, excepciones: excepciones
  };
}

/**
 * Genera una hoja de cálculo nueva con el reporte, lista para enviar a Nómina.
 * @return {Object} {url, nombre}
 */
function apiExportarCobros(desde, hasta) {
  exigirAdmin_();
  var datos = apiReporteCobros(desde, hasta);
  var empresa = leerConfig('empresa') || 'TLTERMINALS';
  var titulo = 'Comedor ' + empresa + ' — cobros ' + datos.desde + ' a ' + datos.hasta;
  var libro = SpreadsheetApp.create(titulo);

  var resumen = libro.getActiveSheet();
  resumen.setName('Resumen');
  var filasResumen = [['Número de nómina', 'Empleado', 'Correo', 'Área', 'Comidas', 'Importe', 'Excepciones']];
  datos.resumen.forEach(function (e) {
    filasResumen.push([e.numeroNomina, e.nombre, e.email, e.area || '',
                       e.comidas, e.importe, e.excepciones]);
  });
  filasResumen.push(['', '', '', 'TOTAL', '', datos.total, '']);
  resumen.getRange(1, 1, filasResumen.length, 7).setValues(filasResumen);
  resumen.getRange(1, 1, 1, 7).setFontWeight('bold');
  resumen.getRange(filasResumen.length, 1, 1, 7).setFontWeight('bold');
  resumen.setFrozenRows(1);
  resumen.autoResizeColumns(1, 7);

  var hojaDetalle = libro.insertSheet('Detalle');
  var filasDetalle = [['Fecha', 'Número de nómina', 'Empleado', 'Platillo', 'Estado',
                       'Importe', 'Origen', 'Condonado']];
  datos.detalle.forEach(function (r) {
    filasDetalle.push([r.fecha, r.numeroNomina, r.nombre, r.platillo, r.estado,
                       r.importe, r.origen, r.condonado]);
  });
  hojaDetalle.getRange(1, 1, filasDetalle.length, 8).setValues(filasDetalle);
  hojaDetalle.getRange(1, 1, 1, 8).setFontWeight('bold');
  hojaDetalle.setFrozenRows(1);
  hojaDetalle.autoResizeColumns(1, 8);

  try {
    DriveApp.getFileById(libro.getId()).moveTo(carpeta_());
  } catch (err) {
    Logger.log('No pude mover el reporte a la carpeta: ' + err.message);
  }

  bitacora_('reporte_exportado', datos.desde + '..' + datos.hasta,
            { total: datos.total, url: libro.getUrl() });
  return { url: libro.getUrl(), nombre: titulo };
}
