/**
 * TLTERMINALS · Almacén — módulo de PRUEBA CONTROLADA (estudio de tiempos).
 *
 * Análisis de productividad a fondo sobre cargas de celulosa. A diferencia de un
 * evento normal, aquí interesa el detalle por fases del furgón:
 *   Furgón posicionado → Inicio/Fin extracción (del carro al andén) →
 *   Inicio/Fin acomodo (del andén al almacén) → Furgón liberado.
 *
 * Configuraciones del montaje:
 *   A) 1 montacargas hace extracción + acomodo.
 *   B) 2 montacargas hacen extracción + acomodo en paralelo.
 *   C) 2 montacargas divididos: uno extrae al andén y otro acomoda; se mide el
 *      tiempo que el montacargas 1 esperó al 2.
 *
 * Métricas de espacio: metros cuadrados de huella y niveles de estiba.
 */

var CONFIGS_PRUEBA = ['A', 'B', 'C'];
var MARCAS_PRUEBA = ['inicioExt', 'finExt', 'inicioAco', 'finAco', 'liberado'];
var ESTADO_POR_MARCA = {
  inicioExt: 'extraccion', finExt: 'extraido',
  inicioAco: 'acomodo', finAco: 'acomodado', liberado: 'finalizado'
};

/* -------------------------------- lecturas --------------------------------- */

function pruebaParaCliente_(p) {
  return {
    id: String(p.id), folio: String(p.folio || ''), furgonId: String(p.furgonId || ''),
    fecha: textoFecha_(p.fecha), cliente: String(p.cliente || ''), material: String(p.material || ''),
    totalTons: numeroODefault_(p.totalTons, ''), totalAtados: numeroODefault_(p.totalAtados, ''),
    presentacion: String(p.presentacion || ''), config: String(p.config || ''),
    estado: String(p.estado || ''),
    posicionadoMs: Number(p.posicionadoMs) || 0, inicioExtMs: Number(p.inicioExtMs) || 0,
    finExtMs: Number(p.finExtMs) || 0, inicioAcoMs: Number(p.inicioAcoMs) || 0,
    finAcoMs: Number(p.finAcoMs) || 0, liberadoMs: Number(p.liberadoMs) || 0,
    esperaFL1Min: numeroODefault_(p.esperaFL1Min, ''), m2: numeroODefault_(p.m2, ''),
    nivelesEstiba: numeroODefault_(p.nivelesEstiba, ''),
    tiempoExtraccionMin: numeroODefault_(p.tiempoExtraccionMin, ''),
    tiempoAcomodoMin: numeroODefault_(p.tiempoAcomodoMin, ''),
    tiempoTotalMin: numeroODefault_(p.tiempoTotalMin, ''),
    tonsPorHora: numeroODefault_(p.tonsPorHora, ''),
    staff: parseJson_(p.staffJson, []), maquinas: parseJson_(p.maquinasJson, []),
    observaciones: String(p.observaciones || ''), operadorId: String(p.operadorId || '')
  };
}

function pruebasVigentes_() {
  return leerTodo_('PRUEBAS').filter(function (p) { return !esSi_(p.eliminado); });
}

/** Pruebas vivas (para el operador) y finalizadas (historial). */
function apiPruebas() {
  var u = exigirSesion_();
  var todas = pruebasVigentes_();
  var vivas = todas.filter(function (p) { return String(p.estado) !== 'finalizado'; });
  var puedeHist = (JERARQUIA[u.rol] || 0) >= JERARQUIA.ADMINISTRADOR;
  var historial = puedeHist
    ? todas.filter(function (p) { return String(p.estado) === 'finalizado'; })
        .sort(function (a, b) { return (Number(b.liberadoMs) || 0) - (Number(a.liberadoMs) || 0); })
        .slice(0, 100)
    : [];
  return {
    serverNowMs: Date.now(), configs: CONFIGS_PRUEBA,
    vivas: vivas.map(pruebaParaCliente_), historial: historial.map(pruebaParaCliente_)
  };
}

/* ------------------------------- ciclo de vida ----------------------------- */

/** Arranca una prueba controlada: registra el furgón posicionado (marca 1). */
function apiIniciarPrueba(datos) {
  var u = exigirSesion_();
  datos = datos || {};
  var furgonId = validarFurgonId_(datos.furgonId);
  var config = String(datos.config || '').toUpperCase();
  if (CONFIGS_PRUEBA.indexOf(config) === -1) {
    throw new Error('Elige una configuración de montaje (A, B o C).');
  }
  var fecha = hoyTexto_();
  var consecutivo = pruebasVigentes_().filter(function (p) {
    return String(p.furgonId).toUpperCase() === furgonId && textoFecha_(p.fecha) === fecha;
  }).length + 1;
  var folio = folioEvento_(furgonId, fecha, 'PC', consecutivo);

  var ahoraMs = Date.now();
  var cuadrilla = resolverCuadrilla_(datos.staffIds, datos.maquinas || datos.maquinaIds);
  var prueba = {
    id: nuevoId_(), folio: folio, furgonId: furgonId, fecha: fecha,
    cliente: String(datos.cliente || ''), material: String(datos.material || 'Celulosa'),
    totalTons: datos.totalTons || '', totalAtados: datos.totalAtados || '',
    presentacion: String(datos.presentacion || ''), config: config,
    estado: 'posicionado', posicionadoMs: ahoraMs,
    inicioExtMs: 0, finExtMs: 0, inicioAcoMs: 0, finAcoMs: 0, liberadoMs: 0,
    esperaFL1Min: '', m2: '', nivelesEstiba: '',
    tiempoExtraccionMin: '', tiempoAcomodoMin: '', tiempoTotalMin: '', tonsPorHora: '',
    staffJson: JSON.stringify(cuadrilla.staff), maquinasJson: JSON.stringify(cuadrilla.maquinas),
    observaciones: String(datos.observaciones || ''), operadorId: u.id,
    eliminado: 'NO', creado: ahora_(), actualizado: ahora_()
  };
  insertar_('PRUEBAS', prueba);
  auditar_(folio, u.nombre, 'prueba_iniciar', 'config', '', config);
  return pruebaParaCliente_(prueba);
}

/** Registra una marca de tiempo de la prueba (inicioExt, finExt, ...). */
function apiMarcaPrueba(id, marca) {
  var u = exigirSesion_();
  var p = buscarPorId_('PRUEBAS', id);
  if (!p || esSi_(p.eliminado)) {
    throw new Error('No encontré esa prueba.');
  }
  if (String(p.estado) === 'finalizado') {
    throw new Error('Esa prueba ya está cerrada.');
  }
  if (MARCAS_PRUEBA.indexOf(String(marca)) === -1) {
    throw new Error('Marca no válida.');
  }
  var campo = String(marca) + 'Ms';
  if (Number(p[campo]) > 0) {
    throw new Error('Esa marca ya se registró.');
  }
  var ahoraMs = Date.now();
  var cambios = { actualizado: ahora_() };
  cambios[campo] = ahoraMs;
  cambios.estado = ESTADO_POR_MARCA[String(marca)] || p.estado;
  if (String(marca) === 'liberado') {
    aplicarCalculosPrueba_(p, cambios, ahoraMs);
  }
  actualizar_('PRUEBAS', p, cambios);
  auditar_(p.folio, u.nombre, 'prueba_marca', String(marca), '', hhmmss_(ahoraMs));
  return pruebaParaCliente_(p);
}

/** Cierra la prueba (marca 'liberado' si falta) y guarda métricas de espacio. */
function apiFinalizarPrueba(id, datos) {
  var u = exigirSesion_();
  var p = buscarPorId_('PRUEBAS', id);
  if (!p || esSi_(p.eliminado)) {
    throw new Error('No encontré esa prueba.');
  }
  if (String(p.estado) === 'finalizado') {
    throw new Error('Esa prueba ya está cerrada.');
  }
  datos = datos || {};
  var ahoraMs = Date.now();
  var cambios = { estado: 'finalizado', actualizado: ahora_() };
  if (!(Number(p.liberadoMs) > 0)) { cambios.liberadoMs = ahoraMs; }
  ['totalTons', 'totalAtados', 'presentacion', 'esperaFL1Min', 'm2', 'nivelesEstiba', 'observaciones']
    .forEach(function (c) { if (datos[c] !== undefined && datos[c] !== '') { cambios[c] = datos[c]; } });
  aplicarCalculosPrueba_(p, cambios, cambios.liberadoMs || Number(p.liberadoMs) || ahoraMs);
  actualizar_('PRUEBAS', p, cambios);
  auditar_(p.folio, u.nombre, 'prueba_finalizar', 'tiempoTotalMin', '', cambios.tiempoTotalMin);
  return pruebaParaCliente_(p);
}

/** Calcula tiempos por fase, total y toneladas por hora. @private */
function aplicarCalculosPrueba_(p, cambios, liberadoMs) {
  var posic = Number(cambios.posicionadoMs || p.posicionadoMs) || 0;
  var iniExt = Number(cambios.inicioExtMs || p.inicioExtMs) || 0;
  var finExt = Number(cambios.finExtMs || p.finExtMs) || 0;
  var iniAco = Number(cambios.inicioAcoMs || p.inicioAcoMs) || 0;
  var finAco = Number(cambios.finAcoMs || p.finAcoMs) || 0;

  var extr = (iniExt && finExt) ? redondear2_(Math.max(0, finExt - iniExt) / 60000) : '';
  var acom = (iniAco && finAco) ? redondear2_(Math.max(0, finAco - iniAco) / 60000) : '';
  var total = (posic && liberadoMs) ? redondear2_(Math.max(0, liberadoMs - posic) / 60000) : '';

  var tons = Number(cambios.totalTons !== undefined ? cambios.totalTons : p.totalTons) || 0;
  var tph = (tons > 0 && total && Number(total) > 0)
    ? redondear2_(tons / (Number(total) / 60)) : '';

  cambios.tiempoExtraccionMin = extr;
  cambios.tiempoAcomodoMin = acom;
  cambios.tiempoTotalMin = total;
  cambios.tonsPorHora = tph;
}

/** Borra (suave, o duro si es MASTER) una prueba. */
function apiEliminarPrueba(id, duro) {
  var u = exigirRol_('ADMINISTRADOR');
  var p = buscarPorId_('PRUEBAS', id);
  if (!p) {
    throw new Error('No encontré esa prueba.');
  }
  if (duro && u.rol !== 'MASTER') {
    throw new Error('El borrado definitivo es solo para el MASTER.');
  }
  if (duro) {
    auditar_(p.folio, u.nombre, 'prueba_borrar_duro', 'prueba', String(p.folio), '');
    borrar_('PRUEBAS', p);
    return { borrado: 'duro' };
  }
  actualizar_('PRUEBAS', p, { eliminado: 'SI', actualizado: ahora_() });
  auditar_(p.folio, u.nombre, 'prueba_borrar_suave', 'prueba', String(p.folio), '');
  return { borrado: 'suave' };
}
