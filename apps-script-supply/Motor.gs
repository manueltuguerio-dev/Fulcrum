/**
 * Motor de calculo. Es el mismo de la aplicacion Node, portado casi tal cual:
 * reproduce celda por celda las formulas del bloque de 6 filas de "KB Supply".
 * Cada campo lleva anotada en un comentario la formula que replica.
 *
 * No depende de SpreadsheetApp ni de nada de Google: recibe arreglos y objetos
 * planos y devuelve objetos planos. Por eso se puede probar suelto y por eso
 * el estado intermedio se puede guardar como JSON entre ejecuciones.
 */

// Separador de claves compuestas. Es el caracter "unit separator", que no
// aparece en datos capturados a mano, de modo que el sitio 1 con la parte
// "52X" nunca colisiona con el sitio 15 y la parte "2X".
var SEP = String.fromCharCode(31);

var MOTOR = (function () {

  function clave(v) {
    if (v === undefined || v === null) return '';
    return String(v).toUpperCase();
  }
  function claveRec(v) {
    if (v === undefined || v === null) return '';
    return String(v).trim().toUpperCase();
  }
  function num(v) {
    if (typeof v === 'number') return v;
    if (v === undefined || v === null || v === '') return 0;
    var n = Number(v);
    return isNaN(n) ? 0 : n;
  }
  /** Corta el ruido de punto flotante sin tocar cantidades reales. */
  function redondear9(n) {
    return Math.round(n * 1e9) / 1e9;
  }

  // -------------------------------------------------------------------------
  // Lectura del archivo Data
  // -------------------------------------------------------------------------

  /**
   * Convierte los renglones del archivo Data en la lista de partes.
   *
   * @param {Array[]} filas       valores desde la fila 2, columnas A..I
   * @param {Object} sustituciones  { 'LZR22': 'Luis Rodriguez' }
   */
  function leerPartes(filas, sustituciones) {
    var partes = [];
    var omitidas = [];
    var sustituidas = 0;
    var mapa = {};
    for (var k in sustituciones) mapa[claveRec(k)] = sustituciones[k];

    for (var i = 0; i < filas.length; i++) {
      var v = filas[i];
      var filaOrigen = i + 2;

      // Una fila solo cuenta como parte si trae ORG y PART. El export termina
      // con una nota al pie ("Applied filters: ...") que ocupa unicamente la
      // columna A y que no debe entrar al listado.
      var tieneOrg = v[1] !== undefined && v[1] !== null && v[1] !== '';
      var tienePart = v[2] !== undefined && v[2] !== null && v[2] !== '';
      if (!tieneOrg || !tienePart) {
        if (v[0] !== undefined && v[0] !== null && v[0] !== '') {
          omitidas.push({ fila: filaOrigen, concat: String(v[0]).split('\n')[0].slice(0, 60) });
        }
        continue;
      }

      var compradorOriginal = v[7];
      var nuevo = mapa[claveRec(compradorOriginal)];
      if (nuevo !== undefined && nuevo !== compradorOriginal) sustituidas++;

      partes.push({
        filaOrigen: filaOrigen,
        concat: v[0],
        org: v[1],
        part: v[2],
        description: v[3],
        supplier: v[4],
        purchCat: v[5],
        leadTime: v[6],
        buyer: nuevo !== undefined ? nuevo : compradorOriginal,
        buyerOriginal: compradorOriginal,
        programFlag: v[8],
      });
    }
    return { partes: partes, omitidas: omitidas, sustituidas: sustituidas };
  }

  /**
   * Claves que interesan de cada hoja de origen. Sirven para descartar en la
   * lectura todo lo que no corresponde a estas partes, que es lo que permite
   * que el estado intermedio quepa en un archivo pequeno y el proceso se pueda
   * reanudar entre ejecuciones.
   */
  function clavesDeInteres(partes) {
    var onHand = {}, gaps = {}, plan = {};
    for (var i = 0; i < partes.length; i++) {
      var p = partes[i];
      var concat = (p.part === null || p.part === undefined ? '' : p.part)
        + '-' + (p.org === null || p.org === undefined ? '' : p.org);
      onHand[claveRec(p.org) + SEP + claveRec(p.part)] = true;
      gaps[claveRec(p.part)] = true;
      plan[claveRec(concat)] = true;
    }
    return { onHand: onHand, gaps: gaps, plan: plan };
  }

  // -------------------------------------------------------------------------
  // Calculo
  // -------------------------------------------------------------------------

  /**
   * Calcula el bloque de "KB Supply" para cada parte.
   *
   * @param {Array}  partes    salida de leerPartes
   * @param {Object} fuentes   { onHand, gaps, plan, openPO } ya acumulados
   * @param {Object} encabezado { semanas:[13 seriales], meses:[3], cubetas:[[a,b]x3] }
   * @param {number} hoy       serial que usa la columna L como TODAY()
   */
  function calcular(partes, fuentes, encabezado, hoy) {
    var semanas = encabezado.semanas;
    var cubetas = encabezado.cubetas;
    var avisos = { onHandRec: 0, gapsRec: 0, planRec: 0, sinPlan: 0, sinGaps: 0 };
    var registros = [];

    for (var i = 0; i < partes.length; i++) {
      var p = partes[i];
      var id = i + 1;

      // B: +CONCAT(D,"-",C)
      var concat = (p.part === null || p.part === undefined ? '' : p.part)
        + '-' + (p.org === null || p.org === undefined ? '' : p.org);

      // I: SUMIFS(Current[Qty],Current[Site],C,Current[Part],D)
      var kOH = clave(p.org) + SEP + clave(p.part);
      var acuityOH = fuentes.onHand.exacto[kOH];
      if (acuityOH === undefined) {
        var altOH = fuentes.onHand.recortado[claveRec(p.org) + SEP + claveRec(p.part)];
        if (altOH !== undefined) { acuityOH = altOH; avisos.onHandRec++; } else acuityOH = 0;
      }

      // M: IFNA(SUMIFS('GAPs files'!C:C,'GAPs files'!B:B,D),0) y la fila "Arrivals"
      var g = fuentes.gaps.exacto[clave(p.part)];
      if (!g) {
        var altG = fuentes.gaps.recortado[claveRec(p.part)];
        if (altG) { g = altG; avisos.gapsRec++; } else avisos.sinGaps++;
      }
      var supplierOH = g ? g.oh : 0;
      var arribos = g ? g.arr.slice() : ceros();

      // Fila "Supply Plan": IFNA(VLOOKUP(B,SupplyPlan!A:V,...),0)
      var plan = fuentes.plan.exacto[clave(concat)];
      if (!plan) {
        var altP = fuentes.plan.recortado[claveRec(concat)];
        if (altP) { plan = altP; avisos.planRec++; } else avisos.sinPlan++;
      }
      var demanda = plan ? plan.slice() : ceros();

      // N: +I+M
      var totalInv = acuityOH + supplierOH;

      // Fila "Projection": la primera semana parte de N y de ahi se acumula.
      // Se redondea a 9 decimales en cada paso: acumular 13 restas de flotantes
      // deja residuos del orden de 1e-13 que convertirian un cero exacto en un
      // negativo y dispararian un faltante que no existe.
      var proyeccion = new Array(CFG.SEMANAS);
      for (var w = 0; w < CFG.SEMANAS; w++) {
        var previo = w === 0 ? totalInv : proyeccion[w - 1];
        proyeccion[w] = redondear9(previo + arribos[w] - demanda[w]);
      }

      // K: primera semana con proyeccion negativa, evaluando P..AA.
      // La formula del libro no llega hasta AB, y aqui se respeta.
      var semanaFaltante = -1;
      for (var w2 = 0; w2 < CFG.SEMANAS - 1; w2++) {
        if (proyeccion[w2] < 0) { semanaFaltante = w2; break; }
      }
      var fechaFaltante = semanaFaltante === -1 ? null : semanas[semanaFaltante];

      // L: IF(K="FALSE","OK",IF((K-J)<TODAY(),"SHORTAGE","OK PER LT"))
      var leadTime = num(p.leadTime);
      var estatus;
      if (fechaFaltante === null) estatus = 'OK';
      else if (fechaFaltante - leadTime < hoy) estatus = 'SHORTAGE';
      else estatus = 'OK PER LT';

      // AC/AD/AE: N - SUM(plan del mes) + SUM(arribos del mes). Cada mes parte de N.
      var meses = [];
      for (var c = 0; c < cubetas.length; c++) {
        var s = totalInv;
        for (var w3 = cubetas[c][0]; w3 <= cubetas[c][1] && w3 < CFG.SEMANAS; w3++) {
          s += arribos[w3] - demanda[w3];
        }
        meses.push(redondear9(s));
      }

      // Filas "Promise. Open POs" y "Need. Open POs":
      // SUMIFS(Open_PO[PO_QTY_DUE], Open_PO[Concat], B, Open_PO[week], P$6, Open_PO[Year], P$5)
      var poPromesa = ceros();
      var poNecesidad = ceros();
      if (fuentes.openPO) {
        var ck = clave(concat);
        for (var w4 = 0; w4 < CFG.SEMANAS; w4++) {
          var k = ck + SEP + num(encabezado.numerosSemana[w4]) + SEP + num(encabezado.anios[w4]);
          poPromesa[w4] = fuentes.openPO.promesa[k] || 0;
          poNecesidad[w4] = fuentes.openPO.necesidad[k] || 0;
        }
      }

      registros.push({
        id: id,
        filaOrigen: p.filaOrigen,
        concat: concat,
        org: p.org,
        part: p.part,
        description: p.description,
        supplier: p.supplier,
        buyer: p.buyer,
        category: p.purchCat,
        acuityOH: acuityOH,
        coldLT: leadTime,
        supplierOH: supplierOH,
        totalInv: totalInv,
        arribos: arribos,
        demanda: demanda,
        proyeccion: proyeccion,
        meses: meses,
        poPromesa: poPromesa,
        poNecesidad: poNecesidad,
        semanaFaltante: semanaFaltante,
        fechaFaltante: fechaFaltante,
        estatus: estatus,
      });
    }

    return { registros: registros, avisos: avisos, hoy: hoy };
  }

  function ceros() {
    var a = new Array(CFG.SEMANAS);
    for (var i = 0; i < CFG.SEMANAS; i++) a[i] = 0;
    return a;
  }

  // -------------------------------------------------------------------------
  // Ventana y filtros
  // -------------------------------------------------------------------------

  /**
   * Semanas cuyo tramo de 7 dias se cruza con el rango. Es lo que hace que
   * "mes actual y el siguiente" incluya la semana que empezo el mes pasado
   * pero contiene hoy.
   */
  function semanasEnRango(semanas, desde, hasta) {
    var idx = [];
    for (var w = 0; w < semanas.length; w++) {
      if (semanas[w] + 6 >= desde && semanas[w] <= hasta) idx.push(w);
    }
    return idx;
  }

  /** Traduce los parametros de la hoja Config a indices de semana. */
  function resolverVentana(semanas, p) {
    if (p.modo === 'semana' || p.modo === 'week' || p.modo === 'columna') {
      var idx = letraANumero(p.columna || 'W') - CFG.COL_P;
      if (idx < 0 || idx >= semanas.length) {
        throw new Error('La columna ' + p.columna + ' no es una columna de semana (P a '
          + numeroALetra(CFG.COL_P + semanas.length - 1) + ').');
      }
      return {
        modo: 'semana',
        indices: [idx],
        columnas: [numeroALetra(CFG.COL_P + idx)],
        desde: semanas[idx],
        hasta: semanas[idx] + 6,
        descripcion: 'la columna ' + numeroALetra(CFG.COL_P + idx)
          + ' (semana del ' + FECHAS.enEspanol(semanas[idx]) + ')',
      };
    }

    var indices = semanasEnRango(semanas, p.desde, p.hasta);
    if (!indices.length) {
      throw new Error('El rango ' + FECHAS.enEspanol(p.desde) + ' a ' + FECHAS.enEspanol(p.hasta)
        + ' no toca ninguna de las 13 semanas del libro ('
        + FECHAS.enEspanol(semanas[0]) + ' a ' + FECHAS.enEspanol(semanas[semanas.length - 1] + 6) + ').');
    }
    var columnas = indices.map(function (w) { return numeroALetra(CFG.COL_P + w); });
    return {
      modo: 'rango',
      indices: indices,
      columnas: columnas,
      desde: p.desde,
      hasta: p.hasta,
      descripcion: 'las columnas ' + columnas[0] + ' a ' + columnas[columnas.length - 1]
        + ' (' + FECHAS.enEspanol(p.desde) + ' a ' + FECHAS.enEspanol(p.hasta)
        + ', ' + indices.length + ' semanas)',
    };
  }

  /**
   * Aplica los filtros de la hoja: estatus en la columna L y "rojo" en las
   * columnas de semana. El rojo del libro es el formato condicional
   * "celda < 0" sobre la fila Projection, asi que aqui equivale a proyeccion
   * negativa en alguna de las semanas de la ventana.
   */
  function filtrar(registros, estatus, indicesSemana) {
    var permitidos = {};
    for (var i = 0; i < estatus.length; i++) permitidos[String(estatus[i]).toUpperCase()] = true;

    return registros.filter(function (r) {
      if (!permitidos[r.estatus]) return false;
      if (!indicesSemana.length) return true;
      for (var w = 0; w < indicesSemana.length; w++) {
        if (r.proyeccion[indicesSemana[w]] < 0) return true;
      }
      return false;
    });
  }

  return {
    clave: clave, claveRec: claveRec, num: num, redondear9: redondear9,
    leerPartes: leerPartes, clavesDeInteres: clavesDeInteres, calcular: calcular,
    semanasEnRango: semanasEnRango, resolverVentana: resolverVentana, filtrar: filtrar,
  };
})();
