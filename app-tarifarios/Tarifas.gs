/**
 * TLTERMINALS · Tarifarios — captura de tarifas y cómo se arma el costo total.
 *
 * Una tarifa es el precio que un transportista cobra por una ruta, para un tipo
 * de carga, un tipo de unidad y un tipo de movimiento —redondo u one way—,
 * durante un periodo de vigencia. Comparar peras con peras exige llevarlo todo
 * al mismo lugar: costo total, en la moneda base, con combustible, casetas y
 * maniobras ya incluidos.
 */

var MONEDAS = ['MXN', 'USD'];

/**
 * Lo que hace falta para calcular cualquier costo: la configuración y el tipo
 * de cambio del día, consultados una sola vez por petición.
 * @return {Object} {cfg, base, tc}
 * @private
 */
function contextoCosto_() {
  var cfg = configCompleta_();
  return {
    cfg: cfg,
    base: String(cfg.monedaBase || 'MXN').toUpperCase(),
    tc: tipoCambioDelDia_(false)
  };
}

/**
 * Cuánto vale un peso de esta moneda en la moneda base.
 * @private
 */
function factorMoneda_(moneda, ctx) {
  var m = String(moneda || ctx.base).toUpperCase();
  if (m === ctx.base) {
    return 1;
  }
  var tc = numero_(ctx.tc.valor, 17.5);
  if (tc <= 0) {
    tc = 17.5;
  }
  if (m === 'USD' && ctx.base === 'MXN') {
    return tc;
  }
  if (m === 'MXN' && ctx.base === 'USD') {
    return 1 / tc;
  }
  return 1;
}

/**
 * Desglosa el costo de una tarifa y lo convierte a la moneda base.
 * @param {Object} t Renglón de la tabla Tarifas.
 * @param {Object} ctx Lo que devuelve contextoCosto_.
 * @return {Object} Desglose y costo total.
 * @private
 */
function costoDe_(t, ctx) {
  var moneda = String(t.moneda || ctx.base).toUpperCase();
  var base = numero_(t.tarifa, 0);
  var pct = numero_(t.combustiblePct, 0);
  var combustible = base * pct / 100;
  var casetas = numero_(t.casetas, 0);
  var maniobras = numero_(t.maniobras, 0);
  var otros = numero_(t.otros, 0);
  var subtotal = base + combustible + casetas + maniobras + otros;
  var factor = factorMoneda_(moneda, ctx);

  return {
    moneda: moneda,
    tarifa: redondear_(base),
    combustiblePct: pct,
    combustible: redondear_(combustible),
    casetas: redondear_(casetas),
    maniobras: redondear_(maniobras),
    otros: redondear_(otros),
    subtotal: redondear_(subtotal),
    factor: factor,
    convertida: moneda !== ctx.base,
    costoTotal: redondear_(subtotal * factor)
  };
}

/**
 * ¿Esta tarifa sirve para la fecha dada? Sin vigencia capturada se toma como
 * abierta: vale hasta que alguien la cambie. La mitad de los tarifarios reales
 * llegan así.
 * @private
 */
function vigenteEn_(t, fecha) {
  var desde = fecha_(t.vigenciaDesde);
  var hasta = fecha_(t.vigenciaHasta);
  if (desde && fecha < desde) {
    return false;
  }
  if (hasta && fecha > hasta) {
    return false;
  }
  return true;
}

/**
 * Lo que hace única a una tarifa. Sirve para no capturar dos veces lo mismo y
 * para que al reimportar un tarifario se actualice en vez de duplicarse.
 *
 * Incluye el movimiento —redondo y one way son precios distintos del mismo
 * transportista por la misma ruta— y los campos personalizados marcados como
 * "separa la comparación", por ejemplo la cuenta.
 * @private
 */
function claveCombinacion_(t, extras) {
  var valores = extras || {};
  var partes = [
    String(t.proveedorId), String(t.rutaId), normalizar_(t.mercancia),
    normalizar_(t.equipo), normalizar_(t.movimiento), String(t.vigenciaDesde || '')
  ];
  campos_('tarifa', true).forEach(function (campo) {
    if (campo.compara) {
      partes.push(campo.clave + '=' + normalizar_(valores[campo.clave]));
    }
  });
  return partes.join('|');
}

/**
 * Convierte un renglón de Tarifas en el objeto que usan la pantalla, el
 * comparador y la exportación: con nombres en vez de ids y el costo ya armado.
 * @private
 */
function enriquecer_(t, ctx, proveedores, rutas, hoy, definiciones) {
  var proveedor = proveedores[String(t.proveedorId)];
  var ruta = rutas[String(t.rutaId)];
  var costo = costoDe_(t, ctx);
  var horas = numero_(t.tiempoHoras, 0);
  var km = ruta ? ruta.km : 0;
  var hasta = fecha_(t.vigenciaHasta);
  var extras = extrasDe_(t);

  var extrasTexto = {};
  definiciones.forEach(function (campo) {
    extrasTexto[campo.clave] = valorCampoTexto_(campo, extras[campo.clave]);
  });

  return {
    id: String(t.id),
    proveedorId: String(t.proveedorId),
    proveedor: proveedor ? proveedor.nombre : '(proveedor borrado)',
    proveedorActivo: proveedor ? proveedor.estado === 'activo' : false,
    calificacion: proveedor ? proveedor.calificacion : 0,
    rutaId: String(t.rutaId),
    ruta: ruta ? ruta.nombre : '(ruta borrada)',
    origen: ruta ? ruta.origen : '',
    destino: ruta ? ruta.destino : '',
    km: km,
    mercancia: texto_(t.mercancia),
    mercanciaNombre: nombreCatalogo_('mercancia', t.mercancia),
    equipo: texto_(t.equipo),
    equipoNombre: nombreCatalogo_('equipo', t.equipo),
    movimiento: texto_(t.movimiento),
    movimientoNombre: nombreCatalogo_('movimiento', t.movimiento),
    moneda: costo.moneda,
    tarifa: costo.tarifa,
    combustiblePct: costo.combustiblePct,
    combustible: costo.combustible,
    casetas: costo.casetas,
    maniobras: costo.maniobras,
    otros: costo.otros,
    subtotal: costo.subtotal,
    costoTotal: costo.costoTotal,
    convertida: costo.convertida,
    tipoCambio: costo.convertida ? redondear_(costo.factor, 4) : 0,
    costoPorKm: km > 0 ? redondear_(costo.costoTotal / km) : 0,
    tiempoHoras: horas,
    sinTiempo: horas <= 0,
    capacidadTon: numero_(t.capacidadTon, 0),
    vigenciaDesde: fecha_(t.vigenciaDesde),
    vigenciaHasta: hasta,
    estado: esSi_(t.estado) ? 'activo' : 'inactivo',
    vencida: !!(hasta && hasta < hoy),
    notas: texto_(t.notas),
    extras: extras,
    extrasTexto: extrasTexto,
    actualizado: texto_(t.actualizado)
  };
}

/**
 * Todas las tarifas, ya enriquecidas. Es la base de casi todo lo demás.
 * @private
 */
function tarifasEnriquecidas_() {
  var ctx = contextoCosto_();
  var hoy = hoyTexto_();
  var definiciones = campos_('tarifa', true);
  var proveedores = {};
  listaProveedores_().forEach(function (p) { proveedores[p.id] = p; });
  var rutas = {};
  listaRutas_().forEach(function (r) { rutas[r.id] = r; });

  return leerTodo_('Tarifas').map(function (t) {
    return enriquecer_(t, ctx, proveedores, rutas, hoy, definiciones);
  });
}

/**
 * Lista de tarifas para la pantalla de captura, con filtros opcionales.
 * @param {Object} filtros {rutaId, proveedorId, mercancia, equipo, movimiento,
 *                          texto, soloVigentes}
 * @return {Object} {tarifas, total, hoy, tipoCambio}
 */
function apiTarifas(filtros) {
  exigirSesion_();
  var f = filtros || {};
  var hoy = hoyTexto_();
  var buscado = normalizar_(f.texto);
  var definiciones = campos_('tarifa', true);
  var limiteAviso = sumarDias_(hoy, numero_(leerConfig('diasAvisoVencimiento'), 30));

  var lista = tarifasEnriquecidas_().filter(function (t) {
    if (f.rutaId && t.rutaId !== String(f.rutaId)) {
      return false;
    }
    if (f.proveedorId && t.proveedorId !== String(f.proveedorId)) {
      return false;
    }
    if (f.mercancia && normalizar_(t.mercancia) !== normalizar_(f.mercancia)) {
      return false;
    }
    if (f.equipo && normalizar_(t.equipo) !== normalizar_(f.equipo)) {
      return false;
    }
    if (f.movimiento && normalizar_(t.movimiento) !== normalizar_(f.movimiento)) {
      return false;
    }
    if (f.moneda && t.moneda !== String(f.moneda).toUpperCase()) {
      return false;
    }
    if (!coincideExtras_(t.extras, f.extras, definiciones)) {
      return false;
    }

    // Filtro rápido por situación de la tarifa.
    var arrancada = !t.vigenciaDesde || t.vigenciaDesde <= hoy;
    if (f.estado === 'vigentes' && (t.estado !== 'activo' || t.vencida || !arrancada)) {
      return false;
    }
    if (f.estado === 'porvencer' && !(t.estado === 'activo' && !t.vencida
        && t.vigenciaHasta && t.vigenciaHasta <= limiteAviso)) {
      return false;
    }
    if (f.estado === 'vencidas' && !t.vencida) {
      return false;
    }
    if (f.estado === 'inactivas' && t.estado === 'activo') {
      return false;
    }
    if (f.estado === 'sintiempo' && !t.sinTiempo) {
      return false;
    }

    if (f.soloVigentes) {
      var arranca = !t.vigenciaDesde || t.vigenciaDesde <= hoy;
      if (t.estado !== 'activo' || t.vencida || !arranca) {
        return false;
      }
    }
    if (buscado) {
      var extras = Object.keys(t.extrasTexto).map(function (k) {
        return t.extrasTexto[k];
      }).join(' ');
      var heno = normalizar_(t.proveedor + ' ' + t.ruta + ' ' + t.mercanciaNombre
        + ' ' + t.equipoNombre + ' ' + t.movimientoNombre + ' ' + t.notas + ' ' + extras);
      if (heno.indexOf(buscado) === -1) {
        return false;
      }
    }
    return true;
  });

  lista.sort(function (a, b) {
    if (a.ruta !== b.ruta) {
      return a.ruta < b.ruta ? -1 : 1;
    }
    return a.costoTotal - b.costoTotal;
  });

  return {
    tarifas: lista,
    total: lista.length,
    hoy: hoy,
    campos: campos_('tarifa', false),
    tipoCambio: tipoCambioDelDia_(false)
  };
}

/**
 * Da de alta o actualiza una tarifa.
 * @param {Object} datos Campos de la tarifa. Con id, actualiza.
 * @return {string} Id de la tarifa.
 */
function apiGuardarTarifa(datos) {
  exigirAdmin_();

  var proveedorId = String(datos.proveedorId || '');
  if (!buscarPorId_('Proveedores', proveedorId)) {
    throw new Error('Elige un proveedor dado de alta.');
  }
  var rutaId = String(datos.rutaId || '');
  if (!buscarPorId_('Rutas', rutaId)) {
    throw new Error('Elige una ruta dada de alta.');
  }
  var mercancia = claveCatalogo_('mercancia', datos.mercancia, false);
  if (!mercancia) {
    throw new Error('Elige un tipo de carga del catálogo.');
  }
  var equipo = claveCatalogo_('equipo', datos.equipo, false);
  if (!equipo) {
    throw new Error('Elige un tipo de unidad del catálogo.');
  }
  var movimiento = claveCatalogo_('movimiento', datos.movimiento, false);
  if (!movimiento) {
    throw new Error('Elige el tipo de movimiento: redondo u one way.');
  }

  var tarifa = numero_(datos.tarifa, -1);
  if (tarifa < 0) {
    throw new Error('Captura la tarifa.');
  }
  // El tiempo de entrega es opcional: la mayoría de los tarifarios no lo trae.
  // Sin él la tarifa se compara solo por precio, y se avisa en pantalla.
  var horas = numero_(datos.tiempoHoras, 0);
  if (horas < 0) {
    throw new Error('El tiempo de entrega no puede ser negativo.');
  }
  var moneda = String(datos.moneda || leerConfig('monedaBase') || 'MXN').toUpperCase();
  if (MONEDAS.indexOf(moneda) === -1) {
    throw new Error('La moneda solo puede ser ' + MONEDAS.join(' o ') + '.');
  }
  var desde = fecha_(datos.vigenciaDesde);
  var hasta = fecha_(datos.vigenciaHasta);
  if (desde && hasta && hasta < desde) {
    throw new Error('La vigencia termina antes de empezar.');
  }

  var existente = datos.id ? buscarPorId_('Tarifas', datos.id) : null;
  var extras = extrasParaGuardar_('tarifa', datos.extras,
                                  existente ? extrasDe_(existente) : {});

  var campos = {
    proveedorId: proveedorId,
    rutaId: rutaId,
    mercancia: mercancia,
    equipo: equipo,
    movimiento: movimiento,
    moneda: moneda,
    tarifa: tarifa,
    combustiblePct: numero_(datos.combustiblePct, 0),
    casetas: numero_(datos.casetas, 0),
    maniobras: numero_(datos.maniobras, 0),
    otros: numero_(datos.otros, 0),
    tiempoHoras: horas,
    capacidadTon: numero_(datos.capacidadTon, 0),
    vigenciaDesde: desde,
    vigenciaHasta: hasta,
    estado: datos.estado === 'inactivo' ? 'inactivo' : 'activo',
    notas: texto_(datos.notas),
    extras: extras,
    actualizado: ahora_()
  };

  // Dos tarifas activas iguales serían un error de captura. Una inactiva es otra
  // cosa: es el borrador que dejó "duplicar", o la del año pasado que se guardó
  // como respaldo, y esas sí pueden convivir con la vigente.
  if (campos.estado === 'activo') {
    var duplicada = tarifaGemela_(campos, existente ? String(existente.id) : '', 'activa');
    if (duplicada) {
      throw new Error('Ese proveedor ya tiene una tarifa activa para esa ruta, carga, '
        + 'unidad, movimiento y vigencia. Edítala en vez de capturarla otra vez.');
    }
  }

  if (existente) {
    actualizar_('Tarifas', existente, campos);
    bitacora_('tarifa_actualizada', existente.id, campos);
    return String(existente.id);
  }
  campos.id = nuevoId_();
  insertar_('Tarifas', campos);
  bitacora_('tarifa_alta', campos.id, campos);
  return campos.id;
}

/**
 * Busca otra tarifa con la misma combinación.
 * @param {Object} campos La tarifa que se quiere guardar.
 * @param {string} exceptoId Id que no cuenta (la que se está editando).
 * @param {string} cual 'activa', 'inactiva' o vacío para cualquiera.
 * @private
 */
function tarifaGemela_(campos, exceptoId, cual) {
  var buscada = claveCombinacion_(campos, extrasDe_({ extras: campos.extras }));
  return buscar_('Tarifas', function (t) {
    if (exceptoId && String(t.id) === exceptoId) {
      return false;
    }
    if (cual === 'activa' && !esSi_(t.estado)) {
      return false;
    }
    if (cual === 'inactiva' && esSi_(t.estado)) {
      return false;
    }
    return claveCombinacion_({
      proveedorId: t.proveedorId, rutaId: t.rutaId, mercancia: t.mercancia,
      equipo: t.equipo, movimiento: t.movimiento,
      vigenciaDesde: fecha_(t.vigenciaDesde)
    }, extrasDe_(t)) === buscada;
  });
}

function apiBorrarTarifa(id) {
  exigirAdmin_();
  var fila = buscarPorId_('Tarifas', id);
  if (!fila) {
    throw new Error('No encuentro esa tarifa.');
  }
  borrar_('Tarifas', fila);
  bitacora_('tarifa_borrada', id, {
    proveedorId: String(fila.proveedorId), rutaId: String(fila.rutaId)
  });
  return true;
}

/**
 * Copia una tarifa para capturar la del año que entra sin volver a teclear
 * todo. La copia nace inactiva y sin vigencia, para que nadie la use por error
 * y para que no choque con la original.
 * @return {string} Id de la copia.
 */
function apiDuplicarTarifa(id) {
  exigirAdmin_();
  var fila = buscarPorId_('Tarifas', id);
  if (!fila) {
    throw new Error('No encuentro esa tarifa.');
  }
  var copia = {};
  TABLAS.Tarifas.forEach(function (campo) { copia[campo] = fila[campo]; });
  copia.id = nuevoId_();
  copia.vigenciaDesde = '';
  copia.vigenciaHasta = '';
  copia.estado = 'inactivo';
  copia.actualizado = ahora_();

  if (tarifaGemela_(copia, '', 'inactiva')) {
    // Ya hay un borrador igual esperando a que lo editen: hacer otro solo
    // llenaría la pantalla de copias sin vigencia.
    throw new Error('Ya hay una copia de esa tarifa sin vigencia. Edítala en vez '
      + 'de hacer otra.');
  }
  insertar_('Tarifas', copia);
  bitacora_('tarifa_duplicada', copia.id, { origen: String(id) });
  return copia.id;
}

/** Activa o desactiva sin abrir el formulario. */
function apiCambiarEstadoTarifa(id, activo) {
  exigirAdmin_();
  var fila = buscarPorId_('Tarifas', id);
  if (!fila) {
    throw new Error('No encuentro esa tarifa.');
  }
  actualizar_('Tarifas', fila, {
    estado: activo ? 'activo' : 'inactivo',
    actualizado: ahora_()
  });
  bitacora_('tarifa_estado', id, { estado: activo ? 'activo' : 'inactivo' });
  return true;
}
