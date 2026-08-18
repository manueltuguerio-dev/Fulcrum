/**
 * TLTERMINALS · Almacén — maniobras con cronómetro multietapa por sub-etapas.
 *
 * El cronómetro es autoritativo en el servidor: guardamos las marcas de tiempo
 * en milisegundos en la hoja, así que si el navegador se cierra o se recarga no
 * se pierde el conteo. El cliente solo dibuja el tiempo a partir de esas marcas.
 *
 * Sub-etapas de una maniobra (cada una con su marca de tiempo):
 *   1. Arribo / Recepción en patio      -> arriboMs   (estado 'arribo')
 *   2. Asignación de andén / espera      -> andenMs    (estado 'espera')
 *   3. Inicio de maniobra / carga-descarga -> inicioMs  (estado 'ejecucion')
 *   4. Inspección / cierre               -> finMs      (estado 'finalizado')
 *
 * Durante cualquier etapa activa se puede registrar una DEMORA (pausa con causa
 * obligatoria); el tiempo de demora se descuenta del tiempo efectivo.
 *
 * Tiempos calculados al cerrar:
 *   recepción = andén - arribo | espera = inicio - andén
 *   ejecución = (fin - inicio) - demora | total = fin - arribo
 *   efectivo  = total - demora | min/pieza = efectivo / piezas
 */

/* -------------------------------- lecturas --------------------------------- */

/** Convierte un renglón de REGISTRO en el objeto que consume el cliente. @private */
function registroParaCliente_(r) {
  var arribo = Number(r.arriboMs) || 0;
  var anden = Number(r.andenMs) || 0;
  var inicio = Number(r.inicioMs) || 0;
  var fin = Number(r.finMs) || 0;

  var staff = parseJson_(r.staffJson, []);
  var maquinas = parseJson_(r.maquinasJson, []);
  var umbrales = umbralesSla_(r.cliente, r.material, r.etapa);

  return {
    id: String(r.id),
    folio: String(r.folio || ''),
    furgonId: String(r.furgonId || ''),
    tipoManiobra: String(r.tipoManiobra || ''),
    codManiobra: String(r.codManiobra || ''),
    consecutivo: numeroODefault_(r.consecutivo, ''),
    fecha: textoFecha_(r.fecha),
    turno: String(r.turno || ''),
    cliente: String(r.cliente || ''),
    flujo: String(r.flujo || ''),
    etapa: String(r.etapa || ''),
    tipoEquipo: String(r.tipoEquipo || ''),
    noUnidad: String(r.noUnidad || ''),
    cantEquipos: numeroODefault_(r.cantEquipos, ''),
    material: String(r.material || ''),
    presentacion: String(r.presentacion || ''),
    cantPiezas: numeroODefault_(r.cantPiezas, ''),
    unidadMedida: String(r.unidadMedida || ''),
    tarimas: numeroODefault_(r.tarimas, ''),
    pesoTons: numeroODefault_(r.pesoTons, ''),
    placaPlataforma: String(r.placaPlataforma || ''),
    transportista: String(r.transportista || ''),
    pesoCargado: numeroODefault_(r.pesoCargado, ''),
    montacarguistas: String(r.montacarguistas || ''),
    numMontac: numeroODefault_(r.numMontac, ''),
    ayudantes: String(r.ayudantes || ''),
    numAyud: numeroODefault_(r.numAyud, ''),
    tipoMontacargas: String(r.tipoMontacargas || ''),
    numMontacargas: String(r.numMontacargas || ''),
    staff: staff,
    maquinas: maquinas,
    horaArribo: textoHora_(r.horaArribo),
    horaInicio: textoHora_(r.horaInicio),
    horaFin: textoHora_(r.horaFin),
    tiempoRecepcionMin: numeroODefault_(r.tiempoRecepcionMin, ''),
    tiempoEsperaMin: numeroODefault_(r.tiempoEsperaMin, ''),
    tiempoEjecucionMin: numeroODefault_(r.tiempoEjecucionMin, ''),
    tiempoTotalMin: numeroODefault_(r.tiempoTotalMin, ''),
    demoraMin: numeroODefault_(r.demoraMin, ''),
    causaDemora: String(r.causaDemora || ''),
    tiempoEfectivoMin: numeroODefault_(r.tiempoEfectivoMin, ''),
    minPorPieza: numeroODefault_(r.minPorPieza, ''),
    observaciones: String(r.observaciones || ''),
    danoLlegada: esSi_(r.danoLlegada),
    danoManiobra: esSi_(r.danoManiobra),
    detalleDano: String(r.detalleDano || ''),
    estado: String(r.estado || ''),
    arriboMs: arribo, andenMs: anden, inicioMs: inicio, finMs: fin,
    pausaAbiertaMs: Number(r.pausaAbiertaMs) || 0,
    demoraAcumMs: Number(r.demoraAcumMs) || 0,
    pausas: parseJson_(r.pausasJson, []),
    campos: parseJson_(r.camposJson, {}),
    operadorId: String(r.operadorId || ''),
    slaObjetivoMin: umbrales.objetivoMin,
    slaAmbarMin: umbrales.ambarMin,
    slaRegla: umbrales.regla,
    sla: r.estado === 'finalizado'
      ? colorSla_(Number(r.tiempoTotalMin) || 0, umbrales, false) : ''
  };
}

function numeroODefault_(valor, porDefecto) {
  if (valor === '' || valor === null || valor === undefined) {
    return porDefecto;
  }
  var n = Number(valor);
  return isNaN(n) ? porDefecto : n;
}

/** Registros no eliminados. @private */
function registrosVigentes_() {
  return leerTodo_('REGISTRO').filter(function (r) { return !esSi_(r.eliminado); });
}

/* --------------------------- estado que ve el cliente ---------------------- */

/** Todo lo que la app necesita al arrancar. */
function apiEstadoApp() {
  var u = usuarioActual_();
  if (!u) {
    return { sesion: false, operativos: apiOperativos() };
  }

  var registros = registrosVigentes_();
  var vivas = registros.filter(function (r) {
    return ['arribo', 'espera', 'ejecucion', 'pausado'].indexOf(String(r.estado)) !== -1;
  });
  var puedeHistorial = (JERARQUIA[u.rol] || 0) >= JERARQUIA.ADMINISTRADOR;
  var historial = [];
  if (puedeHistorial) {
    historial = registros
      .filter(function (r) { return String(r.estado) === 'finalizado'; })
      .sort(function (a, b) { return (Number(b.finMs) || 0) - (Number(a.finMs) || 0); })
      .slice(0, 100);
  }

  return {
    sesion: true,
    usuario: u,
    serverNowMs: Date.now(),
    config: configCompleta_(),
    catalogos: catalogosAgrupados_(),
    camposCustom: camposCustomActivos_(),
    empleados: empleadosActivos_(),
    maquinas: maquinasActivas_(),
    vivas: vivas.map(registroParaCliente_),
    historial: historial.map(registroParaCliente_)
  };
}

/** Refresco ligero de las maniobras vivas (para el reloj y cambios de otros). */
function apiVivas() {
  exigirSesion_();
  var vivas = registrosVigentes_().filter(function (r) {
    return ['arribo', 'espera', 'ejecucion', 'pausado'].indexOf(String(r.estado)) !== -1;
  });
  return { serverNowMs: Date.now(), vivas: vivas.map(registroParaCliente_) };
}

/* ------------------------------ personal y equipos ------------------------- */

/**
 * Traduce IDs de empleados y equipos a los campos de texto y conteos que van
 * en la hoja, para que el acta se lea sin resolver referencias.
 *
 * @param {Array<string>} staffIds Ayudantes / inspectores / supervisores.
 * @param {Array} maquinas Montacargas del evento. Cada elemento puede ser un id
 *   suelto o un objeto {id, aditamento, operadorId} para ligar operador y
 *   aditamento a ese montacargas en específico. Los operadores de montacargas
 *   son los montacarguistas del evento.
 * @private
 */
function resolverCuadrilla_(staffIds, maquinas) {
  var emp = {};
  leerTodo_('EMPLEADOS').forEach(function (e) { emp[String(e.id)] = e; });
  var maq = {};
  leerTodo_('MONTACARGAS').forEach(function (m) { maq[String(m.id)] = m; });

  var staff = [];
  (staffIds || []).forEach(function (id) {
    var e = emp[String(id)];
    if (e) { staff.push({ id: String(e.id), nombre: String(e.nombreCompleto), puesto: String(e.puesto) }); }
  });
  var ayud = staff.filter(function (s) { return s.puesto === 'Ayudante de Patio'; });

  var listaMaq = [];
  var operadores = []; // nombres de montacarguistas, en orden y sin repetir
  (maquinas || []).forEach(function (item) {
    var id = (item && typeof item === 'object') ? item.id : item;
    var m = maq[String(id)];
    if (!m) { return; }
    var operador = '';
    if (item && item.operadorId && emp[String(item.operadorId)]) {
      operador = String(emp[String(item.operadorId)].nombreCompleto);
      if (operadores.indexOf(operador) === -1) { operadores.push(operador); }
    }
    listaMaq.push({
      id: String(m.id), sku: String(m.skuEquipo), tipo: String(m.tipo || ''),
      aditamento: (item && item.aditamento) ? String(item.aditamento) : '',
      operadorId: (item && item.operadorId) ? String(item.operadorId) : '',
      operador: operador
    });
  });
  // Montacarguistas del staff que no estén ya ligados a una máquina.
  staff.filter(function (s) { return s.puesto === 'Montacarguista'; })
    .forEach(function (s) { if (operadores.indexOf(s.nombre) === -1) { operadores.push(s.nombre); } });

  var tipos = listaMaq.map(function (m) { return m.tipo; })
    .filter(function (t, i, a) { return t && a.indexOf(t) === i; });

  return {
    staff: staff, maquinas: listaMaq,
    montacarguistas: operadores.join(', '),
    numMontac: operadores.length,
    ayudantes: ayud.map(function (s) { return s.nombre; }).join(', '),
    numAyud: ayud.length,
    tipoMontacargas: tipos.join(', '),
    numMontacargas: listaMaq.map(function (m) { return m.sku; }).join(', ')
  };
}

/* ------------------------------- cronómetro -------------------------------- */

/**
 * Arranca un EVENTO de maniobra sobre un furgón. Requiere el ID de furgón (con
 * formato válido) y el tipo de maniobra (lista cerrada). El folio se arma solo:
 *   [ID_FURGON]-[AAMMDD]-[CÓDIGO]-[CONSECUTIVO]
 * y el consecutivo se calcula por furgón + fecha + tipo de maniobra.
 *
 * Por defecto empieza en 'arribo'; con datos.arrancarEjecucion = true se salta
 * directo a ejecución (cuando no se cronometra la recepción/espera).
 */
function apiIniciar(datos) {
  var u = exigirSesion_();
  datos = datos || {};

  var furgonId = validarFurgonId_(datos.furgonId);
  var maniobra = maniobraDeCatalogo_(datos.tipoManiobra);
  var fecha = hoyTexto_();
  var consecutivo = consecutivoFurgon_(furgonId, fecha, maniobra.codigo);
  var folio = folioEvento_(furgonId, fecha, maniobra.codigo, consecutivo);
  if (buscar_('REGISTRO', function (r) { return String(r.folio) === folio && !esSi_(r.eliminado); })) {
    throw new Error('Ya existe un evento con el folio ' + folio + '.');
  }

  var ahoraMs = Date.now();
  var cuadrilla = resolverCuadrilla_(datos.staffIds, datos.maquinas || datos.maquinaIds);
  var directo = !!datos.arrancarEjecucion;
  var esPlataforma = maniobra.valor === (leerConfig('maniobraPlataforma') || '');

  var registro = {
    id: nuevoId_(),
    folio: folio,
    furgonId: furgonId,
    tipoManiobra: maniobra.valor,
    codManiobra: maniobra.codigo,
    consecutivo: consecutivo,
    fecha: fecha,
    turno: String(datos.turno || ''),
    cliente: String(datos.cliente || ''),
    flujo: String(datos.flujo || ''),
    etapa: String(datos.etapa || ''),
    tipoEquipo: String(datos.tipoEquipo || ''),
    noUnidad: String(datos.noUnidad || ''),
    cantEquipos: datos.cantEquipos || '',
    material: String(datos.material || ''),
    presentacion: String(datos.presentacion || ''),
    cantPiezas: datos.cantPiezas || '',
    unidadMedida: String(datos.unidadMedida || ''),
    tarimas: datos.tarimas || '',
    pesoTons: datos.pesoTons || '',
    placaPlataforma: esPlataforma ? String(datos.placaPlataforma || '') : '',
    transportista: esPlataforma ? String(datos.transportista || '') : '',
    pesoCargado: esPlataforma ? (datos.pesoCargado || '') : '',
    montacarguistas: cuadrilla.montacarguistas,
    numMontac: cuadrilla.numMontac,
    ayudantes: cuadrilla.ayudantes,
    numAyud: cuadrilla.numAyud,
    tipoMontacargas: cuadrilla.tipoMontacargas,
    numMontacargas: cuadrilla.numMontacargas,
    horaArribo: hhmmss_(ahoraMs),
    horaInicio: directo ? hhmmss_(ahoraMs) : '',
    horaFin: '',
    tiempoRecepcionMin: '', tiempoEsperaMin: '', tiempoEjecucionMin: '',
    tiempoTotalMin: '', demoraMin: '', causaDemora: '',
    tiempoEfectivoMin: '', minPorPieza: '',
    observaciones: String(datos.observaciones || ''),
    danoLlegada: esSi_(datos.danoLlegada) ? 'SI' : 'NO',
    danoManiobra: 'NO',
    detalleDano: String(datos.detalleDano || ''),
    estado: directo ? 'ejecucion' : 'arribo',
    arriboMs: ahoraMs,
    andenMs: directo ? ahoraMs : 0,
    inicioMs: directo ? ahoraMs : 0,
    finMs: '',
    pausaAbiertaMs: 0,
    demoraAcumMs: 0,
    pausasJson: '[]',
    staffJson: JSON.stringify(cuadrilla.staff),
    maquinasJson: JSON.stringify(cuadrilla.maquinas),
    camposJson: JSON.stringify(datos.campos || {}),
    operadorId: u.id,
    eliminado: 'NO',
    creado: ahora_(),
    actualizado: ahora_()
  };
  insertar_('REGISTRO', registro);
  auditar_(folio, u.nombre, 'iniciar', 'estado', '', registro.estado);
  return registroParaCliente_(registro);
}

/**
 * Avanza a la siguiente sub-etapa: arribo -> espera -> ejecucion. Para pasar de
 * ejecución a cierre se usa apiFinalizar.
 */
function apiAvanzarEtapa(id) {
  var u = exigirSesion_();
  var r = exigirRegistroVivo_(id);
  var ahoraMs = Date.now();
  var estado = String(r.estado);

  if (estado === 'arribo') {
    actualizar_('REGISTRO', r, { estado: 'espera', andenMs: ahoraMs, actualizado: ahora_() });
    auditar_(r.folio, u.nombre, 'avanzar', 'estado', 'arribo', 'espera');
  } else if (estado === 'espera') {
    actualizar_('REGISTRO', r, {
      estado: 'ejecucion', inicioMs: ahoraMs, horaInicio: hhmmss_(ahoraMs), actualizado: ahora_()
    });
    auditar_(r.folio, u.nombre, 'avanzar', 'estado', 'espera', 'ejecucion');
  } else {
    throw new Error('La maniobra ya está en ejecución; ciérrala para terminar.');
  }
  return registroParaCliente_(r);
}

/** Pausa (demora) una maniobra activa; la causa es obligatoria. */
function apiPausar(id, causa) {
  var u = exigirSesion_();
  var r = exigirRegistroVivo_(id);
  if (String(r.estado) === 'pausado') {
    throw new Error('La maniobra ya está en demora.');
  }
  var motivo = String(causa || '').trim();
  if (!motivo) {
    throw new Error('Tienes que indicar la causa de la demora.');
  }
  var ahoraMs = Date.now();
  var pausas = parseJson_(r.pausasJson, []);
  pausas.push({ desdeMs: ahoraMs, hastaMs: 0, causa: motivo, etapa: String(r.estado) });
  actualizar_('REGISTRO', r, {
    estado: 'pausado', pausaAbiertaMs: ahoraMs,
    pausasJson: JSON.stringify(pausas), actualizado: ahora_()
  });
  auditar_(r.folio, u.nombre, 'pausar', 'causaDemora', '', motivo);
  return registroParaCliente_(r);
}

/** Reanuda una maniobra en demora, regresando a la etapa donde estaba. */
function apiReanudar(id) {
  var u = exigirSesion_();
  var r = buscarPorId_('REGISTRO', id);
  if (!r || esSi_(r.eliminado)) {
    throw new Error('No encontré esa maniobra.');
  }
  if (String(r.estado) !== 'pausado') {
    throw new Error('La maniobra no está en demora.');
  }
  var ahoraMs = Date.now();
  var abierta = Number(r.pausaAbiertaMs) || ahoraMs;
  var demoraAcum = (Number(r.demoraAcumMs) || 0) + (ahoraMs - abierta);

  var pausas = parseJson_(r.pausasJson, []);
  var etapaPrevia = 'ejecucion';
  for (var i = pausas.length - 1; i >= 0; i--) {
    if (!pausas[i].hastaMs) {
      pausas[i].hastaMs = ahoraMs;
      etapaPrevia = pausas[i].etapa || etapaPrevia;
      break;
    }
  }
  actualizar_('REGISTRO', r, {
    estado: etapaPrevia, pausaAbiertaMs: 0, demoraAcumMs: demoraAcum,
    pausasJson: JSON.stringify(pausas), actualizado: ahora_()
  });
  auditar_(r.folio, u.nombre, 'reanudar', 'estado', 'pausado', etapaPrevia);
  return registroParaCliente_(r);
}

/** Cierra la maniobra, completa marcas faltantes y calcula todos los tiempos. */
function apiFinalizar(id, datos) {
  var u = exigirSesion_();
  var r = exigirRegistroVivo_(id);
  datos = datos || {};
  var ahoraMs = Date.now();

  // Cierra la demora abierta, si la hay.
  var demoraAcum = Number(r.demoraAcumMs) || 0;
  var pausas = parseJson_(r.pausasJson, []);
  if (String(r.estado) === 'pausado') {
    var abierta = Number(r.pausaAbiertaMs) || ahoraMs;
    demoraAcum += (ahoraMs - abierta);
    for (var i = pausas.length - 1; i >= 0; i--) {
      if (!pausas[i].hastaMs) { pausas[i].hastaMs = ahoraMs; break; }
    }
  }

  // Completa marcas de sub-etapas que se hayan saltado (quedan en cero de duración).
  var arribo = Number(r.arriboMs) || ahoraMs;
  var anden = Number(r.andenMs) || 0;
  var inicio = Number(r.inicioMs) || 0;
  if (!anden) { anden = inicio || ahoraMs; }
  if (!inicio) { inicio = ahoraMs; }

  var recepcionMin = redondear2_(Math.max(0, anden - arribo) / 60000);
  var esperaMin = redondear2_(Math.max(0, inicio - anden) / 60000);
  var ejecBrutoMs = Math.max(0, ahoraMs - inicio);
  var ejecucionMin = redondear2_(Math.max(0, ejecBrutoMs - demoraAcum) / 60000);
  var totalMin = redondear2_(Math.max(0, ahoraMs - arribo) / 60000);
  var demoraMin = redondear2_(demoraAcum / 60000);
  var efectivoMin = redondear2_(Math.max(0, (ahoraMs - arribo) - demoraAcum) / 60000);

  var piezas = Number(datos.cantPiezas !== undefined ? datos.cantPiezas : r.cantPiezas) || 0;
  var minPorPieza = piezas > 0 ? redondear2_(efectivoMin / piezas) : '';

  var causas = pausas.map(function (p) { return p.causa; })
    .filter(function (c, idx, arr) { return c && arr.indexOf(c) === idx; }).join(' · ');

  var cambios = {
    estado: 'finalizado',
    andenMs: anden, inicioMs: inicio, finMs: ahoraMs,
    pausaAbiertaMs: 0, demoraAcumMs: demoraAcum, pausasJson: JSON.stringify(pausas),
    horaInicio: r.horaInicio ? r.horaInicio : hhmmss_(inicio),
    horaFin: hhmmss_(ahoraMs),
    tiempoRecepcionMin: recepcionMin, tiempoEsperaMin: esperaMin, tiempoEjecucionMin: ejecucionMin,
    tiempoTotalMin: totalMin, demoraMin: demoraMin, causaDemora: causas,
    tiempoEfectivoMin: efectivoMin, minPorPieza: minPorPieza,
    actualizado: ahora_()
  };
  ['cantPiezas', 'tarimas', 'pesoTons', 'material', 'presentacion',
   'unidadMedida', 'observaciones', 'detalleDano'].forEach(function (c) {
    if (datos[c] !== undefined && datos[c] !== '') { cambios[c] = datos[c]; }
  });
  if (datos.danoManiobra !== undefined) {
    cambios.danoManiobra = esSi_(datos.danoManiobra) ? 'SI' : 'NO';
  }
  if (datos.campos !== undefined) {
    cambios.camposJson = JSON.stringify(datos.campos || {});
  }

  actualizar_('REGISTRO', r, cambios);
  auditar_(r.folio, u.nombre, 'finalizar', 'tiempoTotalMin', '', totalMin);
  return registroParaCliente_(r);
}

/* ------------------------------ edición / borrado -------------------------- */

/**
 * Edita cualquier campo de una maniobra. Solo ADMINISTRADOR o MASTER. Cada
 * cambio de valor queda en la bitácora. Acepta también nueva cuadrilla y equipos.
 */
function apiEditarRegistro(id, cambios) {
  var u = exigirRol_('ADMINISTRADOR');
  var r = buscarPorId_('REGISTRO', id);
  if (!r || esSi_(r.eliminado)) {
    throw new Error('No encontré esa maniobra.');
  }
  cambios = cambios || {};

  var editables = [
    'furgonId', 'tipoManiobra', 'fecha', 'turno', 'cliente', 'flujo', 'etapa', 'tipoEquipo',
    'noUnidad', 'cantEquipos', 'material', 'presentacion', 'cantPiezas',
    'unidadMedida', 'tarimas', 'pesoTons',
    'placaPlataforma', 'transportista', 'pesoCargado',
    'tiempoRecepcionMin', 'tiempoEsperaMin', 'tiempoEjecucionMin',
    'tiempoTotalMin', 'demoraMin', 'causaDemora', 'tiempoEfectivoMin',
    'observaciones', 'danoLlegada', 'danoManiobra', 'detalleDano'
  ];
  var aplicar = {};
  editables.forEach(function (campo) {
    if (cambios[campo] === undefined) { return; }
    var nuevo = cambios[campo];
    if (campo === 'danoLlegada' || campo === 'danoManiobra') {
      nuevo = esSi_(nuevo) ? 'SI' : 'NO';
    }
    var anterior = r[campo] === undefined ? '' : r[campo];
    if (String(anterior) !== String(nuevo)) {
      aplicar[campo] = nuevo;
      auditar_(r.folio, u.nombre, 'editar', campo, anterior, nuevo);
    }
  });

  // Cambio de cuadrilla / equipos.
  if (cambios.staffIds !== undefined || cambios.maquinas !== undefined || cambios.maquinaIds !== undefined) {
    var staffIds = cambios.staffIds !== undefined
      ? cambios.staffIds : parseJson_(r.staffJson, []).map(function (s) { return s.id; });
    var maquinas = (cambios.maquinas !== undefined) ? cambios.maquinas
      : (cambios.maquinaIds !== undefined ? cambios.maquinaIds
        : parseJson_(r.maquinasJson, []));
    var cuad = resolverCuadrilla_(staffIds, maquinas);
    aplicar.staffJson = JSON.stringify(cuad.staff);
    aplicar.maquinasJson = JSON.stringify(cuad.maquinas);
    aplicar.montacarguistas = cuad.montacarguistas; aplicar.numMontac = cuad.numMontac;
    aplicar.ayudantes = cuad.ayudantes; aplicar.numAyud = cuad.numAyud;
    aplicar.tipoMontacargas = cuad.tipoMontacargas; aplicar.numMontacargas = cuad.numMontacargas;
    auditar_(r.folio, u.nombre, 'editar', 'cuadrilla', r.montacarguistas + '/' + r.ayudantes,
      cuad.montacarguistas + '/' + cuad.ayudantes);
  }

  if (cambios.campos !== undefined) {
    aplicar.camposJson = JSON.stringify(cambios.campos || {});
    auditar_(r.folio, u.nombre, 'editar', 'campos', r.camposJson || '{}', aplicar.camposJson);
  }

  var efectivo = Number(aplicar.tiempoEfectivoMin !== undefined
    ? aplicar.tiempoEfectivoMin : r.tiempoEfectivoMin) || 0;
  var piezas = Number(aplicar.cantPiezas !== undefined ? aplicar.cantPiezas : r.cantPiezas) || 0;
  if (piezas > 0) {
    aplicar.minPorPieza = redondear2_(efectivo / piezas);
  }

  if (Object.keys(aplicar).length) {
    aplicar.actualizado = ahora_();
    actualizar_('REGISTRO', r, aplicar);
  }
  return registroParaCliente_(r);
}

/**
 * Elimina una maniobra. Por defecto es borrado suave (queda oculta pero en la
 * hoja). El MASTER puede pedir borrado duro (duro = true) que sí borra el
 * renglón. Ambos quedan en la bitácora.
 */
function apiEliminarRegistro(id, duro, motivo) {
  var u = exigirRol_('ADMINISTRADOR');
  var r = buscarPorId_('REGISTRO', id);
  if (!r) {
    throw new Error('No encontré esa maniobra.');
  }
  if (duro && u.rol !== 'MASTER') {
    throw new Error('El borrado definitivo es solo para el MASTER.');
  }
  if (duro) {
    auditar_(r.folio, u.nombre, 'borrar_duro', 'registro', String(r.folio), motivo || '');
    borrar_('REGISTRO', r);
    return { borrado: 'duro' };
  }
  actualizar_('REGISTRO', r, { eliminado: 'SI', actualizado: ahora_() });
  auditar_(r.folio, u.nombre, 'borrar_suave', 'registro', String(r.folio), motivo || '');
  return { borrado: 'suave' };
}

/** Historial filtrable para admin/master. */
function apiHistorial(desde, hasta, cliente) {
  exigirRol_('ADMINISTRADOR');
  var d = String(desde || '');
  var h = String(hasta || '');
  var c = String(cliente || '').toLowerCase().trim();
  var filas = registrosVigentes_().filter(function (r) {
    if (String(r.estado) !== 'finalizado') { return false; }
    var f = textoFecha_(r.fecha);
    if (d && f < d) { return false; }
    if (h && f > h) { return false; }
    if (c && String(r.cliente).toLowerCase().indexOf(c) === -1) { return false; }
    return true;
  });
  filas.sort(function (a, b) { return (Number(b.finMs) || 0) - (Number(a.finMs) || 0); });
  return filas.map(registroParaCliente_);
}

/* ---------------------------------- apoyo ---------------------------------- */

function exigirRegistroVivo_(id) {
  var r = buscarPorId_('REGISTRO', id);
  if (!r || esSi_(r.eliminado)) {
    throw new Error('No encontré esa maniobra.');
  }
  if (String(r.estado) === 'finalizado') {
    throw new Error('Esa maniobra ya está cerrada.');
  }
  return r;
}

function redondear2_(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function hhmmss_(ms) {
  return Utilities.formatDate(new Date(ms), zona_(), 'HH:mm:ss');
}

/**
 * Valida y normaliza el ID de furgón. Lo pasa a mayúsculas, quita espacios y lo
 * confronta contra la expresión regular configurable (por defecto, 2–5 letras
 * seguidas de 4–8 dígitos, p.ej. TBOX667792). Garantiza el cruce con sistemas
 * administrativos.
 * @private
 */
function validarFurgonId_(valor) {
  var id = String(valor || '').toUpperCase().replace(/\s+/g, '');
  if (!id) {
    throw new Error('Falta el ID de furgón.');
  }
  var patron = leerConfig('furgonRegex') || '^[A-Z]{2,5}[0-9]{4,8}$';
  var re;
  try { re = new RegExp(patron); } catch (err) { re = /^[A-Z0-9]{6,}$/; }
  if (!re.test(id)) {
    throw new Error('El ID de furgón "' + id + '" no cumple el formato requerido.');
  }
  return id;
}

/**
 * Busca el tipo de maniobra en el catálogo (lista cerrada) y devuelve su valor
 * y su código para el folio. Rechaza cualquier valor fuera del catálogo.
 * @private
 */
function maniobraDeCatalogo_(valor) {
  var buscado = String(valor || '').trim();
  if (!buscado) {
    throw new Error('Elige el tipo de maniobra.');
  }
  var fila = buscar_('CATALOGOS', function (c) {
    return String(c.tipo) === 'tiposManiobra' && esSi_(c.activo)
      && String(c.valor).trim() === buscado;
  });
  if (!fila) {
    throw new Error('Tipo de maniobra no válido: ' + buscado + '.');
  }
  var codigo = String(fila.extra || '').toUpperCase().trim()
    || buscado.substring(0, 4).toUpperCase();
  return { valor: String(fila.valor), codigo: codigo };
}

/**
 * Consecutivo del evento dentro del furgón + fecha + tipo de maniobra. Cuenta
 * TODOS los registros que casen, incluidos los ocultos (borrado suave): así un
 * borrado no deja hueco ni provoca que un folio nuevo choque con uno existente.
 * @private
 */
function consecutivoFurgon_(furgonId, fecha, codManiobra) {
  var previos = leerTodo_('REGISTRO').filter(function (r) {
    return String(r.furgonId).toUpperCase() === String(furgonId).toUpperCase()
      && textoFecha_(r.fecha) === fecha
      && String(r.codManiobra).toUpperCase() === String(codManiobra).toUpperCase();
  }).length;
  return previos + 1;
}

/** Folio: [ID_FURGON]-[AAMMDD]-[CÓDIGO]-[NN]. @private */
function folioEvento_(furgonId, fecha, codManiobra, consecutivo) {
  var yymmdd = String(fecha).replace(/-/g, '').substring(2); // yyyy-MM-dd -> AAMMDD
  var nn = Number(consecutivo) < 10 ? '0' + consecutivo : String(consecutivo);
  return furgonId + '-' + yymmdd + '-' + codManiobra + '-' + nn;
}
