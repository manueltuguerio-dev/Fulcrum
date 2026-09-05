/**
 * Consolidado por proveedor, un renglon por numero de parte unico.
 *
 * El acomodo de columnas es el de la hoja oculta "output" del libro MX, mas
 * las columnas de cantidad que hacen falta para pedirle material a un
 * proveedor.
 *
 * Reglas de consolidacion cuando una misma parte aparece en varias ORG:
 *   ORG / Concat  se enlistan separadas por coma
 *   Acuity OH     se suma, porque es inventario por sitio
 *   Supplier OH   se toma una sola vez: en "GAPs files" esta por parte, no por
 *                 sitio, de modo que sumarlo lo contaria dos veces
 *   Fecha de faltante  la mas proxima
 *   Faltante      suma, por sitio, de la peor proyeccion negativa de la ventana
 */

var REPORTE = (function () {

  var COLUMNAS = [
    { titulo: 'ID', ancho: 70 },
    { titulo: 'Concat', ancho: 150 },
    { titulo: 'ORG', ancho: 70 },
    { titulo: 'PART', ancho: 170 },
    { titulo: 'MPN', ancho: 120 },
    { titulo: 'DESCRIPTION', ancho: 260 },
    { titulo: 'SUPPLIER', ancho: 210 },
    { titulo: 'Category', ancho: 80 },
    { titulo: 'Acuity OH', ancho: 90 },
    { titulo: 'Shortage date', ancho: 110 },
    { titulo: 'Cold LT (dias)', ancho: 100 },
    { titulo: 'Supplier OH', ancho: 95 },
    { titulo: 'Total inv', ancho: 90 },
    { titulo: 'Faltante en la ventana', ancho: 140 },
    { titulo: 'Semana del faltante', ancho: 130 },
    { titulo: 'DEFAULT_BUYER', ancho: 130 },
    { titulo: 'Estatus', ancho: 110 },
  ];

  /** Agrupa por proveedor y numero de parte unico. */
  function consolidar(filtrados, indicesSemana) {
    var porProveedor = {};
    var orden = [];

    for (var i = 0; i < filtrados.length; i++) {
      var r = filtrados[i];
      var proveedor = (r.supplier === null || r.supplier === undefined) ? '(sin proveedor)' : String(r.supplier);
      if (!porProveedor[proveedor]) { porProveedor[proveedor] = {}; orden.push(proveedor); }
      var partes = porProveedor[proveedor];
      var llave = String(r.part);

      // Peor proyeccion negativa dentro de la ventana, como cantidad positiva.
      var peor = 0;
      var peorSemana = null;
      for (var w = 0; w < indicesSemana.length; w++) {
        var v = r.proyeccion[indicesSemana[w]];
        if (v < peor) { peor = v; peorSemana = indicesSemana[w]; }
      }

      if (!partes[llave]) {
        partes[llave] = {
          supplier: proveedor, part: r.part, mpn: '',
          description: r.description, category: r.category,
          buyer: r.buyer, coldLT: r.coldLT,
          orgs: [], concats: [], ids: [],
          acuityOH: 0,
          supplierOH: r.supplierOH,   // por parte, no por sitio: se toma una vez
          faltante: 0, peorSemana: null, fechaFaltante: null,
          estatus: r.estatus, meses: r.meses.map(function () { return 0; }),
          renglones: 0,
        };
      }
      var g = partes[llave];
      g.orgs.push(r.org);
      g.concats.push(r.concat);
      g.ids.push(r.id);
      g.acuityOH += r.acuityOH;
      g.faltante += -peor;
      if (peorSemana !== null && (g.peorSemana === null || peorSemana < g.peorSemana)) g.peorSemana = peorSemana;
      if (r.fechaFaltante !== null && (g.fechaFaltante === null || r.fechaFaltante < g.fechaFaltante)) {
        g.fechaFaltante = r.fechaFaltante;
      }
      for (var m = 0; m < r.meses.length; m++) g.meses[m] += r.meses[m];
      g.renglones++;
    }

    var salida = orden.map(function (nombre) {
      var lista = [];
      for (var k in porProveedor[nombre]) {
        var g = porProveedor[nombre][k];
        g.totalInv = g.acuityOH + g.supplierOH;
        lista.push(g);
      }
      lista.sort(function (a, b) {
        var fa = a.fechaFaltante === null ? Infinity : a.fechaFaltante;
        var fb = b.fechaFaltante === null ? Infinity : b.fechaFaltante;
        if (fa !== fb) return fa - fb;
        return String(a.part).localeCompare(String(b.part));
      });
      var totalFaltante = 0, totalRenglones = 0, masProxima = null;
      for (var j = 0; j < lista.length; j++) {
        totalFaltante += lista[j].faltante;
        totalRenglones += lista[j].renglones;
        if (lista[j].fechaFaltante !== null && (masProxima === null || lista[j].fechaFaltante < masProxima)) {
          masProxima = lista[j].fechaFaltante;
        }
      }
      return {
        nombre: nombre, partes: lista, totalPartes: lista.length,
        totalRenglones: totalRenglones, totalFaltante: totalFaltante,
        fechaMasProxima: masProxima,
      };
    });

    salida.sort(function (a, b) {
      var fa = a.fechaMasProxima === null ? Infinity : a.fechaMasProxima;
      var fb = b.fechaMasProxima === null ? Infinity : b.fechaMasProxima;
      if (fa !== fb) return fa - fb;
      if (a.totalPartes !== b.totalPartes) return b.totalPartes - a.totalPartes;
      return a.nombre.localeCompare(b.nombre);
    });
    return salida;
  }

  // -------------------------------------------------------------------------

  function encabezadosCompletos(estado) {
    var cols = COLUMNAS.slice();
    for (var m = 0; m < estado.encabezado.meses.length; m++) {
      cols.push({ titulo: FECHAS.mesLargo(estado.encabezado.meses[m]), ancho: 110 });
    }
    return cols;
  }

  function filaDe(g) {
    var orgs = sinRepetir(g.orgs);
    var base = [
      g.ids.join(', '),
      sinRepetir(g.concats).join(', '),
      orgs.join(', '),
      g.part, g.mpn, g.description, g.supplier, g.category,
      g.acuityOH,
      g.fechaFaltante === null ? '' : FECHAS.aFecha(g.fechaFaltante),
      g.coldLT, g.supplierOH, g.totalInv, g.faltante,
      g.peorSemana === null ? '' : numeroALetra(CFG.COL_P + g.peorSemana),
      g.buyer, g.estatus,
    ];
    return base.concat(g.meses);
  }

  function sinRepetir(lista) {
    var visto = {}, salida = [];
    for (var i = 0; i < lista.length; i++) {
      var v = String(lista[i]);
      if (!visto[v]) { visto[v] = true; salida.push(v); }
    }
    return salida;
  }

  /** Escribe las tres hojas de resultado en el libro de trabajo. */
  function escribirConsolidado(proveedores, filtrados, estado) {
    var cols = encabezadosCompletos(estado);
    var subtitulo = 'Estatus ' + estado.parametros.estatus.join(' / ')
      + ' con proyeccion negativa en ' + estado.ventana.descripcion
      + '. Corrida del ' + FECHAS.enEspanol(estado.parametros.hoy) + '.';

    escribirHojaConsolidado(proveedores, cols, subtitulo);
    escribirHojaResumen(proveedores, subtitulo, estado);
    escribirHojaDetalle(proveedores, cols, subtitulo);
  }

  function prepararHoja(nombre, cols, titulo, subtitulo) {
    var hoja = ESCRITURA.hojaDeTrabajo(nombre);
    hoja.clear();
    var filtro = hoja.getFilter();
    if (filtro) filtro.remove();

    hoja.getRange(1, 1).setValue(titulo)
      .setFontSize(14).setFontWeight('bold').setFontColor(CFG.MARCA);
    hoja.getRange(2, 1).setValue(subtitulo).setFontSize(9).setFontColor('#666666');

    var titulos = cols.map(function (c) { return c.titulo; });
    hoja.getRange(4, 1, 1, titulos.length).setValues([titulos])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground(CFG.MARCA)
      .setWrap(true).setHorizontalAlignment('center').setVerticalAlignment('middle');
    hoja.setRowHeight(4, 34);
    hoja.setFrozenRows(4);
    for (var i = 0; i < cols.length; i++) hoja.setColumnWidth(i + 1, cols[i].ancho);
    return hoja;
  }

  function escribirHojaConsolidado(proveedores, cols, subtitulo) {
    var hoja = prepararHoja(HOJAS_TRABAJO.CONSOLIDADO, cols, 'Consolidado por proveedor', subtitulo);
    var filas = [];
    var filasSeparador = [];
    var fila = 5;

    for (var i = 0; i < proveedores.length; i++) {
      var p = proveedores[i];
      var titulo = p.nombre + '   -   ' + p.totalPartes + ' parte(s), faltante total '
        + redondear(p.totalFaltante)
        + (p.fechaMasProxima ? ', el mas proximo el ' + FECHAS.enEspanol(p.fechaMasProxima) : '');
      filas.push(rellenar([titulo], cols.length));
      filasSeparador.push(fila);
      fila++;
      for (var j = 0; j < p.partes.length; j++) {
        filas.push(filaDe(p.partes[j]));
        fila++;
      }
    }
    if (!filas.length) {
      hoja.getRange(5, 1).setValue('Ninguna parte cumple el filtro con estos parametros.');
      return;
    }

    hoja.getRange(5, 1, filas.length, cols.length).setValues(filas);
    for (var s = 0; s < filasSeparador.length; s++) {
      hoja.getRange(filasSeparador[s], 1, 1, cols.length)
        .setBackground(CFG.SUBTOTAL).setFontWeight('bold');
    }
    formatoDeDatos(hoja, cols, 5, filas.length);
    hoja.getRange(4, 1, filas.length + 1, cols.length).createFilter();
  }

  function escribirHojaDetalle(proveedores, cols, subtitulo) {
    var hoja = prepararHoja(HOJAS_TRABAJO.DETALLE, cols, 'Detalle sin consolidar',
      'Un renglon por combinacion parte + ORG. Sirve para rastrear de donde sale cada cifra del consolidado.');
    hoja.getRange(2, 1).setValue(subtitulo).setFontSize(9).setFontColor('#666666');

    var filas = [];
    for (var i = 0; i < proveedores.length; i++) {
      for (var j = 0; j < proveedores[i].partes.length; j++) {
        filas.push(filaDe(proveedores[i].partes[j]));
      }
    }
    if (!filas.length) return;
    hoja.getRange(5, 1, filas.length, cols.length).setValues(filas);
    formatoDeDatos(hoja, cols, 5, filas.length);
    hoja.getRange(4, 1, filas.length + 1, cols.length).createFilter();
  }

  function escribirHojaResumen(proveedores, subtitulo, estado) {
    var cols = [
      { titulo: 'Proveedor', ancho: 240 },
      { titulo: 'Partes en riesgo', ancho: 110 },
      { titulo: 'Renglones (parte x ORG)', ancho: 140 },
      { titulo: 'Faltante total', ancho: 120 },
      { titulo: 'Faltante mas proximo', ancho: 140 },
      { titulo: 'Correo', ancho: 260 },
    ];
    var hoja = prepararHoja(HOJAS_TRABAJO.RESUMEN, cols, 'Resumen por proveedor', subtitulo);

    var filas = [];
    var totalPartes = 0, totalRenglones = 0, totalFaltante = 0;
    for (var i = 0; i < proveedores.length; i++) {
      var p = proveedores[i];
      var correos = CONTACTOS.correosDe(p.nombre);
      filas.push([
        p.nombre, p.totalPartes, p.totalRenglones, redondear(p.totalFaltante),
        p.fechaMasProxima ? FECHAS.aFecha(p.fechaMasProxima) : '',
        correos.length ? correos.join('; ') : '(sin correo registrado)',
      ]);
      totalPartes += p.totalPartes;
      totalRenglones += p.totalRenglones;
      totalFaltante += p.totalFaltante;
    }
    filas.push(['TOTAL', totalPartes, totalRenglones, redondear(totalFaltante), '', '']);

    hoja.getRange(5, 1, filas.length, cols.length).setValues(filas);
    hoja.getRange(4 + filas.length, 1, 1, cols.length).setFontWeight('bold').setBackground(CFG.SUBTOTAL);
    hoja.getRange(5, 5, filas.length, 1).setNumberFormat('dd-mmm-yyyy');

    // Los proveedores sin correo se marcan: no se les puede enviar hasta
    // cargarlos en la hoja Contactos.
    for (var f = 0; f < filas.length - 1; f++) {
      if (String(filas[f][5]).charAt(0) === '(') {
        hoja.getRange(5 + f, 6).setBackground(CFG.ROJO_FONDO).setFontColor(CFG.ROJO_TEXTO);
      }
    }
    escribirParametros(hoja, filas.length + 7, estado);
  }

  function escribirParametros(hoja, fila, estado) {
    var r = estado.resumen;
    var lineas = [
      ['Parametros de la corrida', ''],
      ['TODAY usado en la columna L', r.hoy],
      ['Partes leidas del archivo Data', r.totalPartes],
      ['Estatus filtrado', r.estatusFiltrado.join(', ')],
      ['Ventana evaluada', estado.ventana.descripcion],
      ['Renglones que pasan el filtro', r.renglonesEnRiesgo],
      ['Numeros de parte unicos', r.partesUnicas],
      ['Proveedores', r.proveedores],
      ['Como se calcula la proyeccion', 'Total inv (Acuity OH + Supplier OH) + Arrivals - Supply Plan, '
        + 'acumulado semana a semana.'],
      ['Como se calcula el estatus', 'SHORTAGE cuando la fecha del primer faltante menos el Cold LT ya paso. '
        + 'OK PER LT cuando todavia alcanza el tiempo de entrega. OK cuando no hay semana negativa.'],
      ['Diferencia con la version de Excel', 'KB Supply lleva los valores calculados, no las formulas. '
        + 'Las cifras son las mismas.'],
    ];
    for (var i = 0; i < estado.avisos.length; i++) lineas.push(['Aviso', estado.avisos[i]]);

    hoja.getRange(fila, 1, lineas.length, 2).setValues(lineas);
    hoja.getRange(fila, 1, lineas.length, 1).setFontWeight('bold');
    hoja.getRange(fila, 2, lineas.length, 1).setWrap(true).setVerticalAlignment('top');
    hoja.getRange(fila, 1).setFontSize(12).setFontColor(CFG.MARCA);
  }

  /** Formatos de numero y el rojo de las columnas de cantidad. */
  function formatoDeDatos(hoja, cols, primeraFila, cuantas) {
    hoja.getRange(primeraFila, 10, cuantas, 1).setNumberFormat('dd-mmm-yyyy');

    var rangos = [hoja.getRange(primeraFila, 14, cuantas, 1)];      // Faltante
    hoja.getRange(primeraFila, 14, cuantas, 1).setNumberFormat('#,##0.##');
    var reglas = hoja.getConditionalFormatRules();
    reglas.push(SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThan(0)
      .setBackground(CFG.ROJO_FONDO).setFontColor(CFG.ROJO_TEXTO)
      .setRanges(rangos).build());

    if (cols.length > COLUMNAS.length) {
      var meses = hoja.getRange(primeraFila, COLUMNAS.length + 1, cuantas, cols.length - COLUMNAS.length);
      meses.setNumberFormat('#,##0.##');
      reglas.push(SpreadsheetApp.newConditionalFormatRule()
        .whenNumberLessThan(0)
        .setBackground(CFG.ROJO_FONDO).setFontColor(CFG.ROJO_TEXTO)
        .setRanges([meses]).build());
    }
    hoja.setConditionalFormatRules(reglas);
  }

  function rellenar(fila, ancho) {
    var f = fila.slice();
    while (f.length < ancho) f.push('');
    return f;
  }

  function redondear(n) { return Math.round(n * 100) / 100; }

  return {
    consolidar: consolidar, escribirConsolidado: escribirConsolidado,
    COLUMNAS: COLUMNAS, filaDe: filaDe,
  };
})();
