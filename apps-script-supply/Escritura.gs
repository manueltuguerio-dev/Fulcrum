/**
 * Escritura de las hojas "Details" y "KB Supply" en el libro de trabajo.
 *
 * Diferencia deliberada con la version de Excel: aqui se escriben los valores
 * que calculo el motor, no las formulas. Replicar el arrastre con formulas
 * vivas significaria unas 24,000 VLOOKUP y SUMIFS contra hojas de 97 y 110 mil
 * renglones; Excel las recalcula una sola vez al abrir el archivo, pero Sheets
 * recalcula en el servidor y la hoja quedaria inservible. Las cifras son las
 * mismas; lo que se pierde es poder hacer clic en una celda y ver su formula.
 *
 * El rojo si se conserva: se aplica como formato condicional "menor que cero"
 * sobre los renglones de proyeccion, con el mismo relleno #FFC7CE del libro.
 */

var ESCRITURA = (function () {

  function hojaDeTrabajo(nombre) {
    var libro = libroTrabajo();
    var hoja = libro.getSheetByName(nombre);
    if (!hoja) hoja = libro.insertSheet(nombre);
    return hoja;
  }

  // -------------------------------------------------------------------------
  // Details
  // -------------------------------------------------------------------------

  /**
   * Details!A9:J escribe el consecutivo ID en A y las nueve columnas del
   * archivo Data en B..J, que es la correspondencia que espera el proceso:
   * Data!A -> Details!B, y asi hasta Data!I -> Details!J.
   */
  function escribirDetails(registros) {
    var hoja = hojaDeTrabajo(CFG.HOJAS.DETAILS);
    // clear() borra contenido y formato pero no el filtro; createFilter falla
    // si ya hay uno, asi que se quita antes.
    var filtroPrevio = hoja.getFilter();
    if (filtroPrevio) filtroPrevio.remove();
    hoja.clear();

    hoja.getRange(CFG.DETAILS_FILA_ENCABEZADO, 1, 1, CFG.DETAILS_ENCABEZADOS.length)
      .setValues([CFG.DETAILS_ENCABEZADOS])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground(CFG.MARCA);

    var filas = registros.map(function (r) {
      return [r.id, r.concat, r.org, r.part, r.description, r.supplier,
        r.category, r.coldLT, r.buyer, r.programFlag === undefined ? '' : r.programFlag];
    });
    if (filas.length) {
      hoja.getRange(CFG.DETAILS_PRIMERA_FILA, 1, filas.length, 10).setValues(filas);
    }

    hoja.setFrozenRows(CFG.DETAILS_FILA_ENCABEZADO);
    hoja.getRange(CFG.DETAILS_FILA_ENCABEZADO, 1,
      filas.length + 1, CFG.DETAILS_ENCABEZADOS.length).createFilter();
    ajustarAnchos(hoja, [50, 150, 70, 160, 260, 220, 90, 90, 130, 120]);
    return { filas: filas.length, ultimaFila: CFG.DETAILS_PRIMERA_FILA + filas.length - 1 };
  }

  // -------------------------------------------------------------------------
  // KB Supply
  // -------------------------------------------------------------------------

  var ENCABEZADOS_KB = ['ID', 'CONCAT', 'ORG', 'PART', 'DESCRIPTION', 'SUPPLIER', 'DEFAULT_BUYER',
    'Category', 'Acuity OH', 'Cold LT', 'Shortage date', 'SHORTAGE IF LT INVOLVED?',
    'Supplier OH', 'Total inv', 'Sections'];

  /**
   * Escribe el encabezado y los bloques por tramos.
   *
   * @param {Object} estado  estado de la corrida
   * @param {number} cursor  indice del siguiente registro por escribir
   * @param {Object} reloj   presupuesto de tiempo de esta ejecucion
   */
  function escribirKB(estado, cursor, reloj) {
    var hoja = hojaDeTrabajo(CFG.HOJAS.KB);
    var registros = estado.registros;
    var enc = estado.encabezado;

    if (cursor === 0) {
      hoja.clear();
      var filtroPrevio = hoja.getFilter();
      if (filtroPrevio) filtroPrevio.remove();
      escribirEncabezadoKB(hoja, enc, estado);
    }

    var porTanda = Math.max(1, Math.floor(CFG.FILAS_POR_ESCRITURA / CFG.BLOQUE));
    var i = cursor;
    while (i < registros.length) {
      if (reloj && reloj.seAcaba()) return { terminado: false, siguiente: i };
      var hasta = Math.min(i + porTanda, registros.length);
      var filas = [];
      for (var k = i; k < hasta; k++) filas = filas.concat(filasDelBloque(registros[k], estado));
      var primeraFila = CFG.PRIMERA_FILA_BLOQUE + i * CFG.BLOQUE;
      hoja.getRange(primeraFila, 1, filas.length, CFG.COL_RIESGO).setValues(filas);
      i = hasta;
    }

    terminarKB(hoja, estado);
    return { terminado: true, siguiente: registros.length };
  }

  function escribirEncabezadoKB(hoja, enc, estado) {
    var ancho = CFG.COL_RIESGO;
    var vacio = function (n) { var a = []; for (var i = 0; i < n; i++) a.push(''); return a; };

    // Fila 5: ano de cada semana. Fila 6: numero de semana. Fila 7: w1..w13.
    var f5 = vacio(ancho); f5[CFG.COL_P - 2] = 'YEAR';
    var f6 = vacio(ancho); f6[5] = 'Copy until line'; f6[6] = estado.ultimaFilaKB;
    f6[CFG.COL_P - 2] = 'week number';
    var f7 = vacio(ancho); f7[CFG.COL_P - 2] = 'week of projection';
    for (var w = 0; w < CFG.SEMANAS; w++) {
      f5[CFG.COL_P - 1 + w] = enc.anios[w];
      f6[CFG.COL_P - 1 + w] = enc.numerosSemana[w];
      f7[CFG.COL_P - 1 + w] = 'w' + (w + 1);
    }
    hoja.getRange(5, 1, 3, ancho).setValues([f5, f6, f7]);

    // Fila 9: encabezados, las 13 fechas de semana, los tres meses y las dos
    // columnas de cierre.
    var f9 = vacio(ancho);
    for (var c = 0; c < ENCABEZADOS_KB.length; c++) f9[c] = ENCABEZADOS_KB[c];
    for (var w2 = 0; w2 < CFG.SEMANAS; w2++) f9[CFG.COL_P - 1 + w2] = FECHAS.aFecha(enc.semanas[w2]);
    for (var m = 0; m < 3; m++) f9[CFG.COL_P - 1 + CFG.SEMANAS + m] = FECHAS.aFecha(enc.meses[m]);
    f9[CFG.COL_AF - 1] = 'Buyer Comments';
    f9[CFG.COL_RIESGO - 1] = 'En riesgo';
    hoja.getRange(9, 1, 1, ancho).setValues([f9])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground(CFG.MARCA)
      .setWrap(true).setVerticalAlignment('middle');
    hoja.getRange(9, CFG.COL_P, 1, CFG.SEMANAS + 3).setNumberFormat('dd-mmm');
    hoja.setRowHeight(9, 34);
    hoja.setFrozenRows(9);
    hoja.setFrozenColumns(4);
  }

  /** Las seis filas de un bloque, en el orden que las nombra la columna O. */
  function filasDelBloque(r, estado) {
    var ancho = CFG.COL_RIESGO;
    var enRiesgo = estaEnRiesgo(r, estado);
    var filas = [];

    for (var k = 0; k < CFG.BLOQUE; k++) {
      var f = [];
      for (var c = 0; c < ancho; c++) f.push('');

      // Columnas que el bloque arrastra desde la fila base con formulas +X.
      f[0] = r.id;
      f[2] = r.org;
      f[3] = r.part;
      f[5] = r.supplier;
      f[6] = r.buyer;
      f[7] = r.category;
      f[10] = r.fechaFaltante === null ? 'FALSE' : FECHAS.aFecha(r.fechaFaltante);
      f[11] = r.estatus;

      if (k === CFG.FILA_BASE) {
        f[1] = r.concat;
        f[4] = r.description;
        f[8] = r.acuityOH;
        f[9] = r.coldLT;
        f[12] = r.supplierOH;
        f[13] = r.totalInv;
        f[14] = '';
      } else {
        f[14] = CFG.NOMBRES_SECCION[k];
        var serie = k === CFG.FILA_ARRIBOS ? r.arribos
          : k === CFG.FILA_PLAN ? r.demanda
            : k === CFG.FILA_PROYECCION ? r.proyeccion
              : k === CFG.FILA_PO_PROMESA ? r.poPromesa : r.poNecesidad;
        for (var w = 0; w < CFG.SEMANAS; w++) f[CFG.COL_P - 1 + w] = serie[w];
        if (k === CFG.FILA_PROYECCION) {
          for (var m = 0; m < r.meses.length; m++) f[CFG.COL_P - 1 + CFG.SEMANAS + m] = r.meses[m];
          f[CFG.COL_RIESGO - 1] = enRiesgo ? 'SI' : '';
        }
      }
      filas.push(f);
    }
    return filas;
  }

  function estaEnRiesgo(r, estado) {
    var estatusOk = false;
    for (var i = 0; i < estado.parametros.estatus.length; i++) {
      if (estado.parametros.estatus[i] === r.estatus) { estatusOk = true; break; }
    }
    if (!estatusOk) return false;
    var idx = estado.ventana.indices;
    for (var w = 0; w < idx.length; w++) {
      if (r.proyeccion[idx[w]] < 0) return true;
    }
    return false;
  }

  /** Formato condicional, formatos de numero y filtro, al cerrar la hoja. */
  function terminarKB(hoja, estado) {
    var ultima = estado.ultimaFilaKB;
    var primera = CFG.PRIMERA_FILA_BLOQUE;

    hoja.getRange(primera, 11, ultima - primera + 1, 1).setNumberFormat('dd-mmm-yyyy');

    var semanas = hoja.getRange(primera, CFG.COL_P, ultima - primera + 1, CFG.SEMANAS + 3);
    var reglas = [];

    // El rojo del libro: proyeccion negativa. Se limita a los renglones de
    // proyeccion con la misma condicion sobre la columna O.
    reglas.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($O' + primera + '="Projection",' + numeroALetra(CFG.COL_P) + primera + '<0)')
      .setBackground(CFG.ROJO_FONDO).setFontColor(CFG.ROJO_TEXTO)
      .setRanges([semanas]).build());

    // Verde en las dos filas de ordenes de compra abiertas, como en el libro.
    reglas.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND(OR($O' + primera + '="Promise. Open POs",$O' + primera
        + '="Need. Open POs"),' + numeroALetra(CFG.COL_P) + primera + '>0)')
      .setBackground('#dcfce7').setFontColor('#166534')
      .setRanges([semanas]).build());

    var estatus = hoja.getRange(primera, 12, ultima - primera + 1, 1);
    reglas.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('SHORTAGE')
      .setBackground(CFG.ROJO_FONDO).setFontColor(CFG.ROJO_TEXTO)
      .setRanges([estatus]).build());

    hoja.setConditionalFormatRules(reglas);

    // El filtro equivalente a los dos pasos del proceso: estatus en la columna
    // L y color rojo en las columnas de semana. Como el rojo solo cae en el
    // renglon de proyeccion, filtrar por la columna auxiliar "En riesgo" deja
    // visible exactamente un renglon por parte en riesgo, que es el mismo
    // resultado que filtrar por color en Excel.
    var filtroPrevio = hoja.getFilter();
    if (filtroPrevio) filtroPrevio.remove();
    var filtro = hoja.getRange(9, 1, ultima - 8, CFG.COL_RIESGO).createFilter();
    filtro.setColumnFilterCriteria(CFG.COL_RIESGO,
      SpreadsheetApp.newFilterCriteria().whenTextEqualTo('SI').build());

    ajustarAnchos(hoja, [50, 140, 70, 170, 240, 200, 130, 80, 90, 80, 110, 150, 100, 100, 140]);
  }

  function ajustarAnchos(hoja, anchos) {
    for (var i = 0; i < anchos.length; i++) hoja.setColumnWidth(i + 1, anchos[i]);
  }

  return { escribirDetails: escribirDetails, escribirKB: escribirKB, hojaDeTrabajo: hojaDeTrabajo };
})();
