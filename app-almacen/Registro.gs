/**
 * TLTERMINALS · Almacén — maniobras y cronómetro multietapa.
 *
 * El cronómetro es autoritativo en el servidor: guardamos las marcas de tiempo
 * en milisegundos en la hoja, así que si el navegador se cierra o se recarga no
 * se pierde el conteo. El cliente solo dibuja el tiempo que transcurre a partir
 * de esas marcas.
 *
 * Estados de una maniobra:
 *   en_proceso   corriendo
 *   pausado      en demora (con causa obligatoria)
 *   finalizado   cerrada; ya tiene tiempos calculados
 */

/* -------------------------------- lecturas --------------------------------- */

/**
 * Convierte un renglón de REGISTRO en el objeto que consume el cliente,
 * incluyendo el estado vivo del cronómetro.
 * @private
 */
function registroParaCliente_(r) {
  var demoraAcum = Number(r.demoraAcumMs) || 0;
  var pausaAbierta = Number(r.pausaAbiertaMs) || 0;
  var inicio = Number(r.inicioMs) || 0;
  var fin = Number(r.finMs) || 0;

  var pausas = [];
  try {
    pausas = r.pausasJson ? JSON.parse(r.pausasJson) : [];
  } catch (err) {
    pausas = [];
  }
  var campos = {};
  try {
    campos = r.camposJson ? JSON.parse(r.camposJson) : {};
  } catch (err) {
    campos = {};
  }

  return {
    id: String(r.id),
    folio: String(r.folio || ''),
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
    montacarguistas: String(r.montacarguistas || ''),
    numMontac: numeroODefault_(r.numMontac, ''),
    ayudantes: String(r.ayudantes || ''),
    numAyud: numeroODefault_(r.numAyud, ''),
    tipoMontacargas: String(r.tipoMontacargas || ''),
    numMontacargas: String(r.numMontacargas || ''),
    horaInicio: textoHora_(r.horaInicio),
    horaFin: textoHora_(r.horaFin),
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
    inicioMs: inicio,
    finMs: fin,
    pausaAbiertaMs: pausaAbierta,
    demoraAcumMs: demoraAcum,
    pausas: pausas,
    campos: campos,
    operadorId: String(r.operadorId || ''),
    sla: r.estado === 'finalizado' ? semaforo_(Number(r.tiempoTotalMin) || 0) : ''
  };
}

function numeroODefault_(valor, porDefecto) {
  if (valor === '' || valor === null || valor === undefined) {
    return porDefecto;
  }
  var n = Number(valor);
  return isNaN(n) ? porDefecto : n;
}

/** Verde/ámbar/rojo según el tiempo total en minutos y los umbrales de Config. */
function semaforo_(totalMin) {
  var verde = Number(leerConfig('slaVerde')) || 45;
  var ambar = Number(leerConfig('slaAmbar')) || 90;
  if (totalMin <= verde) {
    return 'verde';
  }
  if (totalMin <= ambar) {
    return 'ambar';
  }
  return 'rojo';
}

/* --------------------------- estado que ve el cliente ---------------------- */

/**
 * Todo lo que la app necesita al arrancar: el usuario, la config, los catálogos,
 * los campos dinámicos, las maniobras vivas y las últimas finalizadas.
 */
function apiEstadoApp() {
  var u = usuarioActual_();
  if (!u) {
    return { sesion: false, operativos: apiOperativos() };
  }

  var registros = leerTodo_('REGISTRO');
  var vivas = registros.filter(function (r) {
    return String(r.estado) === 'en_proceso' || String(r.estado) === 'pausado';
  });
  // El operativo solo ve maniobras vivas; admin y master ven también historial.
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
    vivas: vivas.map(registroParaCliente_),
    historial: historial.map(registroParaCliente_)
  };
}

/** Refresco ligero de las maniobras vivas (para el reloj y cambios de otros). */
function apiVivas() {
  exigirSesion_();
  var vivas = leerTodo_('REGISTRO').filter(function (r) {
    return String(r.estado) === 'en_proceso' || String(r.estado) === 'pausado';
  });
  return {
    serverNowMs: Date.now(),
    vivas: vivas.map(registroParaCliente_)
  };
}

/* ------------------------------- cronómetro -------------------------------- */

/**
 * Arranca una maniobra. Requiere al menos folio y cliente; lo demás se puede
 * completar al cerrar. Devuelve la maniobra viva ya con su cronómetro corriendo.
 * @param {Object} datos Campos de la maniobra.
 */
function apiIniciar(datos) {
  var u = exigirSesion_();
  datos = datos || {};

  var folio = String(datos.folio || '').trim() || folioNuevo_();
  if (buscar_('REGISTRO', function (r) { return String(r.folio) === folio; })) {
    throw new Error('Ya existe una maniobra con el folio ' + folio + '.');
  }

  var ahoraMs = Date.now();
  var registro = {
    id: nuevoId_(),
    folio: folio,
    fecha: hoyTexto_(),
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
    montacarguistas: String(datos.montacarguistas || u.nombre),
    numMontac: datos.numMontac || '',
    ayudantes: String(datos.ayudantes || ''),
    numAyud: datos.numAyud || '',
    tipoMontacargas: String(datos.tipoMontacargas || ''),
    numMontacargas: String(datos.numMontacargas || ''),
    horaInicio: Utilities.formatDate(new Date(ahoraMs), zona_(), 'HH:mm:ss'),
    horaFin: '',
    tiempoTotalMin: '', demoraMin: '', causaDemora: '',
    tiempoEfectivoMin: '', minPorPieza: '',
    observaciones: String(datos.observaciones || ''),
    danoLlegada: esSi_(datos.danoLlegada) ? 'SI' : 'NO',
    danoManiobra: 'NO',
    detalleDano: String(datos.detalleDano || ''),
    estado: 'en_proceso',
    inicioMs: ahoraMs,
    finMs: '',
    pausaAbiertaMs: 0,
    demoraAcumMs: 0,
    pausasJson: '[]',
    camposJson: JSON.stringify(datos.campos || {}),
    operadorId: u.id,
    creado: ahora_(),
    actualizado: ahora_()
  };
  insertar_('REGISTRO', registro);
  auditar_(folio, u.nombre, 'iniciar', 'estado', '', 'en_proceso');
  return registroParaCliente_(registro);
}

/** Pausa una maniobra en curso; la causa de demora es obligatoria. */
function apiPausar(id, causa) {
  var u = exigirSesion_();
  var r = exigirRegistroVivo_(id);
  if (String(r.estado) !== 'en_proceso') {
    throw new Error('La maniobra no está corriendo.');
  }
  var motivo = String(causa || '').trim();
  if (!motivo) {
    throw new Error('Tienes que indicar la causa de la demora.');
  }
  var ahoraMs = Date.now();
  var pausas = JSON.parse(r.pausasJson || '[]');
  pausas.push({ desdeMs: ahoraMs, hastaMs: 0, causa: motivo });
  actualizar_('REGISTRO', r, {
    estado: 'pausado',
    pausaAbiertaMs: ahoraMs,
    pausasJson: JSON.stringify(pausas),
    actualizado: ahora_()
  });
  auditar_(r.folio, u.nombre, 'pausar', 'causaDemora', '', motivo);
  return registroParaCliente_(r);
}

/** Reanuda una maniobra pausada y cierra el tramo de demora. */
function apiReanudar(id) {
  var u = exigirSesion_();
  var r = exigirRegistroVivo_(id);
  if (String(r.estado) !== 'pausado') {
    throw new Error('La maniobra no está en pausa.');
  }
  var ahoraMs = Date.now();
  var abierta = Number(r.pausaAbiertaMs) || ahoraMs;
  var demoraAcum = (Number(r.demoraAcumMs) || 0) + (ahoraMs - abierta);

  var pausas = JSON.parse(r.pausasJson || '[]');
  for (var i = pausas.length - 1; i >= 0; i--) {
    if (!pausas[i].hastaMs) {
      pausas[i].hastaMs = ahoraMs;
      break;
    }
  }
  actualizar_('REGISTRO', r, {
    estado: 'en_proceso',
    pausaAbiertaMs: 0,
    demoraAcumMs: demoraAcum,
    pausasJson: JSON.stringify(pausas),
    actualizado: ahora_()
  });
  auditar_(r.folio, u.nombre, 'reanudar', 'estado', 'pausado', 'en_proceso');
  return registroParaCliente_(r);
}

/**
 * Cierra la maniobra y calcula los tiempos. Acepta datos finales (piezas, peso,
 * observaciones, daño) que suelen conocerse hasta el final.
 */
function apiFinalizar(id, datos) {
  var u = exigirSesion_();
  var r = exigirRegistroVivo_(id);
  datos = datos || {};
  var ahoraMs = Date.now();

  // Si venía en pausa, se cierra el último tramo de demora.
  var demoraAcum = Number(r.demoraAcumMs) || 0;
  var pausas = JSON.parse(r.pausasJson || '[]');
  if (String(r.estado) === 'pausado') {
    var abierta = Number(r.pausaAbiertaMs) || ahoraMs;
    demoraAcum += (ahoraMs - abierta);
    for (var i = pausas.length - 1; i >= 0; i--) {
      if (!pausas[i].hastaMs) {
        pausas[i].hastaMs = ahoraMs;
        break;
      }
    }
  }

  var inicio = Number(r.inicioMs) || ahoraMs;
  var totalMs = ahoraMs - inicio;
  var efectivoMs = Math.max(0, totalMs - demoraAcum);

  var totalMin = redondear2_(totalMs / 60000);
  var demoraMin = redondear2_(demoraAcum / 60000);
  var efectivoMin = redondear2_(efectivoMs / 60000);

  var piezas = Number(datos.cantPiezas !== undefined ? datos.cantPiezas : r.cantPiezas) || 0;
  var minPorPieza = piezas > 0 ? redondear2_(efectivoMin / piezas) : '';

  var causas = pausas.map(function (p) { return p.causa; })
    .filter(function (c, idx, arr) { return c && arr.indexOf(c) === idx; })
    .join(' · ');

  var cambios = {
    estado: 'finalizado',
    finMs: ahoraMs,
    pausaAbiertaMs: 0,
    demoraAcumMs: demoraAcum,
    pausasJson: JSON.stringify(pausas),
    horaFin: Utilities.formatDate(new Date(ahoraMs), zona_(), 'HH:mm:ss'),
    tiempoTotalMin: totalMin,
    demoraMin: demoraMin,
    causaDemora: causas,
    tiempoEfectivoMin: efectivoMin,
    minPorPieza: minPorPieza,
    actualizado: ahora_()
  };
  // Campos que se pueden completar al cerrar.
  ['cantPiezas', 'tarimas', 'pesoTons', 'material', 'presentacion',
   'unidadMedida', 'observaciones', 'detalleDano'].forEach(function (c) {
    if (datos[c] !== undefined && datos[c] !== '') {
      cambios[c] = datos[c];
    }
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

/* ------------------------------ edición (admin) ---------------------------- */

/**
 * Edita cualquier campo de una maniobra ya registrada. Solo ADMINISTRADOR o
 * MASTER. Cada cambio de valor queda en la bitácora con anterior y nuevo.
 * Si cambian piezas o los tiempos base, se recalcula el minuto por pieza.
 */
function apiEditarRegistro(id, cambios) {
  var u = exigirRol_('ADMINISTRADOR');
  var r = buscarPorId_('REGISTRO', id);
  if (!r) {
    throw new Error('No encontré esa maniobra.');
  }
  cambios = cambios || {};

  var editables = [
    'folio', 'fecha', 'turno', 'cliente', 'flujo', 'etapa', 'tipoEquipo',
    'noUnidad', 'cantEquipos', 'material', 'presentacion', 'cantPiezas',
    'unidadMedida', 'tarimas', 'pesoTons', 'montacarguistas', 'numMontac',
    'ayudantes', 'numAyud', 'tipoMontacargas', 'numMontacargas',
    'tiempoTotalMin', 'demoraMin', 'causaDemora', 'tiempoEfectivoMin',
    'observaciones', 'danoLlegada', 'danoManiobra', 'detalleDano'
  ];
  var aplicar = {};
  editables.forEach(function (campo) {
    if (cambios[campo] === undefined) {
      return;
    }
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

  if (cambios.campos !== undefined) {
    aplicar.camposJson = JSON.stringify(cambios.campos || {});
    auditar_(r.folio, u.nombre, 'editar', 'campos', r.camposJson || '{}', aplicar.camposJson);
  }

  // Recalcula el minuto por pieza si cambió algo que lo afecta.
  var efectivo = Number(aplicar.tiempoEfectivoMin !== undefined
    ? aplicar.tiempoEfectivoMin : r.tiempoEfectivoMin) || 0;
  var piezas = Number(aplicar.cantPiezas !== undefined
    ? aplicar.cantPiezas : r.cantPiezas) || 0;
  if (piezas > 0) {
    aplicar.minPorPieza = redondear2_(efectivo / piezas);
  }

  if (Object.keys(aplicar).length) {
    aplicar.actualizado = ahora_();
    actualizar_('REGISTRO', r, aplicar);
  }
  return registroParaCliente_(r);
}

/** Historial filtrable para admin/master. */
function apiHistorial(desde, hasta, cliente) {
  exigirRol_('ADMINISTRADOR');
  var d = String(desde || '');
  var h = String(hasta || '');
  var c = String(cliente || '').toLowerCase().trim();
  var filas = leerTodo_('REGISTRO').filter(function (r) {
    if (String(r.estado) !== 'finalizado') {
      return false;
    }
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
  if (!r) {
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

/** Folio automático: M-AAAAMMDD-### según cuántas maniobras van en el día. */
function folioNuevo_() {
  var hoy = hoyTexto_();
  var delDia = leerTodo_('REGISTRO').filter(function (r) {
    return textoFecha_(r.fecha) === hoy;
  }).length;
  var consecutivo = ('000' + (delDia + 1)).slice(-3);
  return 'M-' + hoy.replace(/-/g, '') + '-' + consecutivo;
}
