/**
 * TLTERMINALS · Tarifarios — exportación.
 *
 * Dos salidas, según para qué:
 *   · CSV, para descargar al instante y abrirlo en Excel.
 *   · Una hoja de cálculo en Drive, con el comparativo ya armado, que es lo que
 *     se manda a dirección o se lleva a una negociación.
 */

/** Escapa una celda para CSV. @private */
function celdaCsv_(valor) {
  var t = valor === null || valor === undefined ? '' : String(valor);
  if (/[",\n\r]/.test(t)) {
    return '"' + t.replace(/"/g, '""') + '"';
  }
  return t;
}

function csvDe_(filas) {
  return filas.map(function (fila) {
    return fila.map(celdaCsv_).join(',');
  }).join('\n');
}

/**
 * Arma las tablas que se exportan. Se comparten entre el CSV y la hoja de
 * cálculo para que las dos salidas digan exactamente lo mismo.
 * @private
 */
function tablasDe_(tipo, filtros) {
  var cfg = configCompleta_();
  var base = String(cfg.monedaBase || 'MXN');

  if (tipo === 'proveedores') {
    var filas = [['Nombre', 'RFC', 'Contacto', 'Teléfono', 'Correo', 'Ciudad',
                  'Calificación', 'Estado', 'Notas']];
    listaProveedores_().forEach(function (p) {
      filas.push([p.nombre, p.rfc, p.contacto, p.telefono, p.correo, p.ciudad,
                  p.calificacion, p.estado, p.notas]);
    });
    return { nombre: 'Proveedores', filas: filas };
  }

  if (tipo === 'rutas') {
    var filasR = [['Origen', 'Destino', 'Km', 'Estado', 'Notas']];
    listaRutas_().forEach(function (r) {
      filasR.push([r.origen, r.destino, r.km, r.estado, r.notas]);
    });
    return { nombre: 'Rutas', filas: filasR };
  }

  if (tipo === 'tarifas') {
    var filasT = [['Proveedor', 'Origen', 'Destino', 'Mercancía', 'Equipo', 'Moneda',
                   'Tarifa', 'Combustible %', 'Casetas', 'Maniobras', 'Otros',
                   'Costo total (' + base + ')', 'Costo por km', 'Tiempo (h)',
                   'Capacidad (ton)', 'Vigencia desde', 'Vigencia hasta', 'Estado',
                   'Notas']];
    var lista = apiTarifas(filtros || {}).tarifas;
    lista.forEach(function (t) {
      filasT.push([t.proveedor, t.origen, t.destino, t.mercanciaNombre, t.equipoNombre,
                   t.moneda, t.tarifa, t.combustiblePct, t.casetas, t.maniobras, t.otros,
                   t.costoTotal, t.costoPorKm, t.tiempoHoras, t.capacidadTon,
                   t.vigenciaDesde, t.vigenciaHasta, t.estado, t.notas]);
    });
    return { nombre: 'Tarifas', filas: filasT };
  }

  if (tipo === 'mejores') {
    var datos = apiMejoresOpciones(filtros || {});
    var filasM = [['Origen', 'Destino', 'Mercancía', 'Equipo', 'Mejor opción',
                   'Costo total (' + datos.monedaBase + ')', 'Costo por km',
                   'Tiempo', 'Puntaje', 'Por qué', 'Segunda opción',
                   'Costo segunda', 'Diferencia', 'Opciones', 'Costo promedio',
                   'Costo más alto', 'Ahorro contra la peor', 'Vigencia hasta']];
    datos.mejores.forEach(function (m) {
      filasM.push([m.origen, m.destino, m.mercanciaNombre, m.equipoNombre, m.proveedor,
                   m.costoTotal, m.costoPorKm, m.tiempoTexto, m.puntaje, m.motivo,
                   m.segundo, m.segundoCosto, m.ventaja, m.opciones, m.costoPromedio,
                   m.costoMax, m.ahorro, m.vigenciaHasta]);
    });
    return { nombre: 'Mejores opciones', filas: filasM, datos: datos };
  }

  if (tipo === 'comparativo') {
    var comp = apiComparar(filtros || {});
    var filasC = [['Origen', 'Destino', 'Mercancía', 'Equipo', 'Lugar', 'Proveedor',
                   'Costo total (' + comp.monedaBase + ')', 'Contra el mejor',
                   'Contra el mejor %', 'Tiempo', 'Tiempo (h)', 'Puntaje',
                   'Tarifa', 'Combustible', 'Casetas', 'Maniobras', 'Otros',
                   'Moneda', 'Costo por km', 'Vigencia hasta', 'Por qué']];
    comp.grupos.forEach(function (g) {
      g.opciones.forEach(function (o) {
        filasC.push([g.origen, g.destino, g.mercanciaNombre, g.equipoNombre, o.posicion,
                     o.proveedor, o.costoTotal, o.sobreprecio, o.sobreprecioPct,
                     o.tiempoTexto, o.tiempoHoras, o.puntaje, o.tarifa, o.combustible,
                     o.casetas, o.maniobras, o.otros, o.moneda, o.costoPorKm,
                     o.vigenciaHasta, o.motivo]);
      });
    });
    return { nombre: 'Comparativo', filas: filasC, datos: comp };
  }

  throw new Error('No sé exportar "' + tipo + '".');
}

/**
 * Devuelve un CSV listo para descargar desde el navegador.
 * @param {string} tipo proveedores | rutas | tarifas | mejores | comparativo
 * @param {Object} filtros Los mismos del comparador.
 * @return {Object} {nombre, contenido}
 */
function apiExportarCsv(tipo, filtros) {
  exigirSesion_();
  var tabla = tablasDe_(tipo, filtros);
  bitacora_('exportacion_csv', tipo, { renglones: tabla.filas.length - 1 });
  return {
    nombre: 'tarifarios-' + tipo + '-' + hoyTexto_() + '.csv',
    contenido: csvDe_(tabla.filas),
    renglones: tabla.filas.length - 1
  };
}

/**
 * Genera una hoja de cálculo en Drive con todo el tarifario y el comparativo
 * ya resuelto.
 * @param {Object} filtros Los mismos del comparador.
 * @return {Object} {url, nombre}
 */
function apiExportarLibro(filtros) {
  exigirSesion_();
  var f = filtros || {};
  var empresa = leerConfig('empresa') || 'TLTERMINALS';
  var titulo = 'Tarifarios ' + empresa + ' — ' + hoyTexto_();
  var libro = SpreadsheetApp.create(titulo);

  var partes = [
    tablasDe_('mejores', f),
    tablasDe_('comparativo', f),
    tablasDe_('tarifas', f),
    tablasDe_('proveedores', f),
    tablasDe_('rutas', f)
  ];

  partes.forEach(function (parte, i) {
    var hoja = i === 0 ? libro.getActiveSheet() : libro.insertSheet();
    hoja.setName(parte.nombre);
    var columnas = parte.filas[0].length;
    hoja.getRange(1, 1, parte.filas.length, columnas).setValues(parte.filas);
    hoja.getRange(1, 1, 1, columnas).setFontWeight('bold');
    hoja.setFrozenRows(1);
    hoja.autoResizeColumns(1, columnas);
  });

  var portada = libro.insertSheet('Criterio', 0);
  var datos = partes[0].datos;
  portada.getRange(1, 1, 9, 2).setValues([
    ['Tarifarios de transportistas', empresa],
    ['Generado', ahora_()],
    ['Vigencia consultada', datos.fecha],
    ['Moneda base', datos.monedaBase],
    ['Peso del precio', datos.criterio.pesoPrecio + ' %'],
    ['Peso del tiempo de entrega', datos.criterio.pesoTiempo + ' %'],
    ['Combinaciones ruta + características', datos.resumen.combinaciones],
    ['Opciones comparadas', datos.resumen.opciones],
    ['Diferencia entre la mejor y la peor opción', datos.resumen.ahorroTotal]
  ]);
  portada.getRange(1, 1, 9, 1).setFontWeight('bold');
  portada.autoResizeColumns(1, 2);

  try {
    DriveApp.getFileById(libro.getId()).moveTo(carpeta_());
  } catch (err) {
    Logger.log('No pude mover el archivo a la carpeta: ' + err.message);
  }

  bitacora_('exportacion_libro', titulo, { url: libro.getUrl() });
  return { url: libro.getUrl(), nombre: titulo };
}

/**
 * Copia de seguridad completa en un solo CSV por tabla, para llevarse los datos
 * a otro lado sin depender de Google.
 * @return {Array<Object>} [{nombre, contenido}]
 */
function apiRespaldo() {
  exigirAdmin_();
  return ['proveedores', 'rutas', 'tarifas'].map(function (tipo) {
    var tabla = tablasDe_(tipo, {});
    return {
      nombre: 'respaldo-' + tipo + '-' + hoyTexto_() + '.csv',
      contenido: csvDe_(tabla.filas)
    };
  });
}
