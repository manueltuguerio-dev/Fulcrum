/**
 * Lectura de las hojas de origen del libro MX ya convertido a Google Sheets.
 *
 * Las hojas grandes se leen por tramos, y de cada tramo solo se guarda lo que
 * corresponde a las 597 partes del archivo Data. Esa criba es lo que hace
 * viable el proceso en Apps Script: en vez de arrastrar 28,509 renglones de
 * SupplyPlan o 110,653 de On hand entre ejecuciones, el estado intermedio se
 * queda en menos de 600 entradas por fuente y cabe holgado en un JSON.
 */

var FUENTES = (function () {

  function hojaDe(libro, nombre) {
    var h = libro.getSheetByName(nombre);
    if (!h) {
      throw new Error('El libro convertido no tiene la hoja "' + nombre + '". '
        + 'Hojas encontradas: ' + libro.getSheets().map(function (s) { return s.getName(); }).join(', '));
    }
    return h;
  }

  // -------------------------------------------------------------------------
  // Encabezado de KB Supply
  // -------------------------------------------------------------------------

  /**
   * Lee de "KB Supply" las 13 fechas de semana (P9:AB9), los tres meses
   * (AC9:AE9), el numero de semana (fila 6), el ano (fila 5) y como se agrupan
   * las semanas en cada cubeta mensual.
   */
  function leerEncabezado(libro) {
    var hoja = hojaDe(libro, CFG.HOJAS.KB);
    var anchoSemanas = CFG.SEMANAS;

    var fila5 = hoja.getRange(5, CFG.COL_P, 1, anchoSemanas).getValues()[0];
    var fila6 = hoja.getRange(6, CFG.COL_P, 1, anchoSemanas).getValues()[0];
    var fila9 = hoja.getRange(9, CFG.COL_P, 1, anchoSemanas + 3).getValues()[0];

    var semanas = [];
    for (var i = 0; i < anchoSemanas; i++) {
      var s = FECHAS.aSerial(fila9[i]);
      if (s === null) {
        throw new Error('La celda ' + numeroALetra(CFG.COL_P + i) + '9 de "KB Supply" no trae una fecha.');
      }
      semanas.push(s);
    }
    var meses = [
      FECHAS.aSerial(fila9[anchoSemanas]),
      FECHAS.aSerial(fila9[anchoSemanas + 1]),
      FECHAS.aSerial(fila9[anchoSemanas + 2]),
    ];

    return {
      semanas: semanas,
      meses: meses,
      numerosSemana: fila6.map(function (v) { return MOTOR.num(v); }),
      anios: fila5.map(function (v) { return MOTOR.num(v); }),
      cubetas: leerCubetas(hoja),
    };
  }

  /**
   * Deduce de las formulas AC13/AD13/AE13 que semanas entran en cada cubeta
   * mensual (AC13 = N10-SUM(P12:T12)+SUM(P11:T11) agrupa P..T). Si la
   * conversion desde Excel no conservo la formula, se usa el agrupamiento que
   * trae el libro original.
   */
  function leerCubetas(hoja) {
    var respaldo = [[0, 4], [5, 8], [9, 12]];
    try {
      var formulas = hoja.getRange('AC13:AE13').getFormulas()[0];
      var salida = [];
      for (var i = 0; i < 3; i++) {
        var m = /SUM\(([A-Z]{1,3})\d+:([A-Z]{1,3})\d+\)/.exec(formulas[i] || '');
        if (!m) return respaldo;
        salida.push([letraANumero(m[1]) - CFG.COL_P, letraANumero(m[2]) - CFG.COL_P]);
      }
      return salida;
    } catch (e) {
      return respaldo;
    }
  }

  // -------------------------------------------------------------------------
  // Archivo Data
  // -------------------------------------------------------------------------

  /** Lee de un golpe la hoja de partes del archivo Data (A:I desde la fila 2). */
  function leerData(libro, nombreHoja) {
    var hoja = nombreHoja ? libro.getSheetByName(nombreHoja) : libro.getSheets()[0];
    if (!hoja) throw new Error('No se encontro la hoja de partes en el archivo Data.');
    var ultima = hoja.getLastRow();
    if (ultima < 2) throw new Error('La hoja "' + hoja.getName() + '" del archivo Data esta vacia.');
    return hoja.getRange(2, 1, ultima - 1, 9).getValues();
  }

  // -------------------------------------------------------------------------
  // Lectores por tramos
  // -------------------------------------------------------------------------

  /**
   * Envoltura comun: recorre una hoja por tramos llamando a `porFila`, y se
   * detiene cuando se acaba la hoja o cuando `reloj` avisa que se agota el
   * tiempo de esta ejecucion.
   *
   * @returns {{terminado:boolean, siguiente:number, leidas:number}}
   */
  function recorrer(hoja, primeraFila, columnas, desde, reloj, porFila) {
    var ultima = hoja.getLastRow();
    var anchoHoja = hoja.getMaxColumns();
    for (var c = 0; c < columnas.length; c++) {
      var necesarias = columnas[c].inicio + columnas[c].ancho - 1;
      if (necesarias > anchoHoja) {
        throw new Error('La hoja "' + hoja.getName() + '" tiene ' + anchoHoja
          + ' columnas y el proceso necesita llegar hasta la ' + numeroALetra(necesarias)
          + '. Verifica que se haya convertido el libro MX completo.');
      }
    }
    var fila = desde || primeraFila;
    var leidas = 0;

    while (fila <= ultima) {
      if (reloj && reloj.seAcaba()) return { terminado: false, siguiente: fila, leidas: leidas };
      var n = Math.min(CFG.FILAS_POR_CHUNK, ultima - fila + 1);
      var bloques = columnas.map(function (c) {
        return hoja.getRange(fila, c.inicio, n, c.ancho).getValues();
      });
      for (var i = 0; i < n; i++) {
        porFila(bloques, i, fila + i);
      }
      leidas += n;
      fila += n;
    }
    return { terminado: true, siguiente: fila, leidas: leidas };
  }

  /** On hand: B=Site, D=Part, E=Qty. Acumula Site+Part -> cantidad. */
  function leerOnHand(libro, claves, acumulado, desde, reloj) {
    var hoja = hojaDe(libro, CFG.HOJAS.ON_HAND);
    var cols = [{ inicio: CFG.OH_COL_SITE, ancho: 4 }];   // B..E
    return recorrer(hoja, 2, cols, desde, reloj, function (bloques, i) {
      var f = bloques[0][i];
      var site = f[0];
      var part = f[2];
      if ((site === '' || site === null) && (part === '' || part === null)) return;
      var kRec = MOTOR.claveRec(site) + SEP + MOTOR.claveRec(part);
      if (!claves.onHand[kRec]) return;              // no es de nuestras partes
      var qty = MOTOR.num(f[3]);
      var kExa = MOTOR.clave(site) + SEP + MOTOR.clave(part);
      acumulado.exacto[kExa] = (acumulado.exacto[kExa] || 0) + qty;
      acumulado.recortado[kRec] = (acumulado.recortado[kRec] || 0) + qty;
    });
  }

  /** GAPs files: A=Supplier, B=Part, C=On hand, D..P = 13 semanas. */
  function leerGaps(libro, claves, acumulado, desde, reloj) {
    var hoja = hojaDe(libro, CFG.HOJAS.GAPS);
    var cols = [{ inicio: 1, ancho: CFG.GAPS_COL_SEMANA1 - 1 + CFG.SEMANAS }];  // A..P
    return recorrer(hoja, CFG.GAPS_FILA_ENCABEZADO + 1, cols, desde, reloj, function (bloques, i) {
      var f = bloques[0][i];
      var part = f[CFG.GAPS_COL_PART - 1];
      if (part === '' || part === null || part === undefined) return;
      var kRec = MOTOR.claveRec(part);
      if (!claves.gaps[kRec]) return;
      var kExa = MOTOR.clave(part);
      agregarGaps(acumulado.exacto, kExa, f);
      agregarGaps(acumulado.recortado, kRec, f);
      if (!acumulado.proveedorPorParte[kRec]) {
        acumulado.proveedorPorParte[kRec] = f[CFG.GAPS_COL_SUPPLIER - 1];
      }
    });
  }

  function agregarGaps(mapa, k, f) {
    var e = mapa[k];
    if (!e) {
      e = { oh: 0, arr: [] };
      for (var z = 0; z < CFG.SEMANAS; z++) e.arr.push(0);
      mapa[k] = e;
    }
    e.oh += MOTOR.num(f[CFG.GAPS_COL_OH - 1]);
    for (var w = 0; w < CFG.SEMANAS; w++) {
      e.arr[w] += MOTOR.num(f[CFG.GAPS_COL_SEMANA1 - 1 + w]);
    }
  }

  /** SupplyPlan: A=Concat, D..P = 13 semanas. VLOOKUP toma la primera coincidencia. */
  function leerSupplyPlan(libro, claves, acumulado, desde, reloj) {
    var hoja = hojaDe(libro, CFG.HOJAS.SUPPLY_PLAN);
    var cols = [
      { inicio: CFG.PLAN_COL_CONCAT, ancho: 1 },
      { inicio: CFG.PLAN_COL_SEMANA1, ancho: CFG.SEMANAS },
    ];
    return recorrer(hoja, 2, cols, desde, reloj, function (bloques, i) {
      var concat = bloques[0][i][0];
      if (concat === '' || concat === null || concat === undefined) return;
      var kRec = MOTOR.claveRec(concat);
      if (!claves.plan[kRec]) return;
      var semanas = [];
      for (var w = 0; w < CFG.SEMANAS; w++) semanas.push(MOTOR.num(bloques[1][i][w]));
      var kExa = MOTOR.clave(concat);
      if (acumulado.exacto[kExa] === undefined) acumulado.exacto[kExa] = semanas;
      if (acumulado.recortado[kRec] === undefined) acumulado.recortado[kRec] = semanas;
    });
  }

  /**
   * Open_PO: A=Concat, BB=PO_QTY_DUE, BC=week, BD=Year, BE=Nweek, BF=Nyear.
   * Solo alimenta las dos filas informativas del bloque; no interviene en la
   * proyeccion ni en el estatus.
   */
  function leerOpenPO(libro, claves, acumulado, desde, reloj) {
    var hoja = libro.getSheetByName(CFG.HOJAS.OPEN_PO);
    if (!hoja) return { terminado: true, siguiente: 2, leidas: 0, ausente: true };
    var cols = [
      { inicio: CFG.PO_COL_CONCAT, ancho: 1 },
      { inicio: CFG.PO_COL_QTY, ancho: 5 },          // BB..BF
    ];
    return recorrer(hoja, 2, cols, desde, reloj, function (bloques, i) {
      var concat = bloques[0][i][0];
      if (concat === '' || concat === null || concat === undefined) return;
      var kRec = MOTOR.claveRec(concat);
      if (!claves.plan[kRec]) return;                // mismas llaves que SupplyPlan
      var d = bloques[1][i];
      var qty = MOTOR.num(d[0]);
      if (!qty) return;
      var c = MOTOR.clave(concat);
      var kp = c + SEP + MOTOR.num(d[1]) + SEP + MOTOR.num(d[2]);
      acumulado.promesa[kp] = (acumulado.promesa[kp] || 0) + qty;
      var kn = c + SEP + MOTOR.num(d[3]) + SEP + MOTOR.num(d[4]);
      acumulado.necesidad[kn] = (acumulado.necesidad[kn] || 0) + qty;
    });
  }

  /** Acumuladores vacios, listos para serializarse a JSON. */
  function acumuladoresVacios() {
    return {
      onHand: { exacto: {}, recortado: {} },
      gaps: { exacto: {}, recortado: {}, proveedorPorParte: {} },
      plan: { exacto: {}, recortado: {} },
      openPO: { promesa: {}, necesidad: {} },
    };
  }

  return {
    hojaDe: hojaDe, leerEncabezado: leerEncabezado, leerData: leerData,
    leerOnHand: leerOnHand, leerGaps: leerGaps, leerSupplyPlan: leerSupplyPlan,
    leerOpenPO: leerOpenPO, acumuladoresVacios: acumuladoresVacios,
  };
})();

/**
 * Reloj de presupuesto. Apps Script corta a los 6 minutos; este reloj avisa
 * antes para que el proceso alcance a guardar su estado y programar la
 * continuacion.
 */
function nuevoReloj(presupuestoMs) {
  var inicio = Date.now();
  var tope = presupuestoMs || CFG.PRESUPUESTO_MS;
  return {
    seAcaba: function () { return Date.now() - inicio > tope; },
    transcurrido: function () { return Date.now() - inicio; },
  };
}
