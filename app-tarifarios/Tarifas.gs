/**
 * TLTERMINALS · Tarifarios — captura de tarifas y cómo se arma el costo total.
 *
 * Una tarifa es el precio que un transportista cobra por una ruta, para un tipo
 * de mercancía y un tipo de equipo, durante un periodo de vigencia. Comparar
 * peras con peras exige llevarlo todo al mismo lugar: costo total, en la moneda
 * base, con combustible, casetas y maniobras ya incluidos.
 */

var MONEDAS = ['MXN', 'USD'];

/**
 * Cuánto vale un peso de esta moneda en la moneda base.
 * @private
 */
function factorMoneda_(moneda, cfg) {
  var base = String(cfg.monedaBase || 'MXN').toUpperCase();
  var m = String(moneda || base).toUpperCase();
  if (m === base) {
    return 1;
  }
  var tc = numero_(cfg.tipoCambioUSD, 17.5);
  if (tc <= 0) {
    tc = 17.5;
  }
  if (m === 'USD' && base === 'MXN') {
    return tc;
  }
  if (m === 'MXN' && base === 'USD') {
    return 1 / tc;
  }
  return 1;
}

/**
 * Desglosa el costo de una tarifa y lo convierte a la moneda base.
 * @param {Object} t Renglón de la tabla Tarifas.
 * @param {Object} cfg Configuración ya leída.
 * @return {Object} Desglose y costo total.
 * @private
 */
function costoDe_(t, cfg) {
  var moneda = String(t.moneda || cfg.monedaBase || 'MXN').toUpperCase();
  var base = numero_(t.tarifa, 0);
  var pct = numero_(t.combustiblePct, 0);
  var combustible = base * pct / 100;
  var casetas = numero_(t.casetas, 0);
  var maniobras = numero_(t.maniobras, 0);
  var otros = numero_(t.otros, 0);
  var subtotal = base + combustible + casetas + maniobras + otros;
  var factor = factorMoneda_(moneda, cfg);

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
    costoTotal: redondear_(subtotal * factor)
  };
}

/**
 * ¿Esta tarifa sirve para la fecha dada? Sin vigencia capturada se toma como
 * abierta: vale hasta que alguien la cambie.
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
 * Convierte un renglón de Tarifas en el objeto que usan la pantalla, el
 * comparador y la exportación: con nombres en vez de ids y el costo ya armado.
 * @private
 */
function enriquecer_(t, cfg, proveedores, rutas, hoy) {
  var proveedor = proveedores[String(t.proveedorId)];
  var ruta = rutas[String(t.rutaId)];
  var costo = costoDe_(t, cfg);
  var horas = numero_(t.tiempoHoras, 0);
  var km = ruta ? ruta.km : 0;
  var hasta = fecha_(t.vigenciaHasta);
  var activa = esSi_(t.estado);

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
    moneda: costo.moneda,
    tarifa: costo.tarifa,
    combustiblePct: costo.combustiblePct,
    combustible: costo.combustible,
    casetas: costo.casetas,
    maniobras: costo.maniobras,
    otros: costo.otros,
    subtotal: costo.subtotal,
    costoTotal: costo.costoTotal,
    costoPorKm: km > 0 ? redondear_(costo.costoTotal / km) : 0,
    tiempoHoras: horas,
    capacidadTon: numero_(t.capacidadTon, 0),
    vigenciaDesde: fecha_(t.vigenciaDesde),
    vigenciaHasta: hasta,
    estado: activa ? 'activo' : 'inactivo',
    vencida: !!(hasta && hasta < hoy),
    notas: texto_(t.notas),
    actualizado: texto_(t.actualizado)
  };
}

/**
 * Todas las tarifas, ya enriquecidas. Es la base de casi todo lo demás.
 * @private
 */
function tarifasEnriquecidas_() {
  var cfg = configCompleta_();
  var hoy = hoyTexto_();
  var proveedores = {};
  listaProveedores_().forEach(function (p) { proveedores[p.id] = p; });
  var rutas = {};
  listaRutas_().forEach(function (r) { rutas[r.id] = r; });

  return leerTodo_('Tarifas').map(function (t) {
    return enriquecer_(t, cfg, proveedores, rutas, hoy);
  });
}

/**
 * Lista de tarifas para la pantalla de captura, con filtros opcionales.
 * @param {Object} filtros {rutaId, proveedorId, mercancia, equipo, texto, soloVigentes}
 * @return {Object} {tarifas, total}
 */
function apiTarifas(filtros) {
  exigirSesion_();
  var f = filtros || {};
  var hoy = hoyTexto_();
  var buscado = normalizar_(f.texto);

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
    if (f.soloVigentes) {
      var arranca = !t.vigenciaDesde || t.vigenciaDesde <= hoy;
      if (t.estado !== 'activo' || t.vencida || !arranca) {
        return false;
      }
    }
    if (buscado) {
      var heno = normalizar_(t.proveedor + ' ' + t.ruta + ' ' + t.mercanciaNombre
        + ' ' + t.equipoNombre + ' ' + t.notas);
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

  return { tarifas: lista, total: lista.length, hoy: hoy };
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
    throw new Error('Elige un tipo de mercancía del catálogo.');
  }
  var equipo = claveCatalogo_('equipo', datos.equipo, false);
  if (!equipo) {
    throw new Error('Elige un tipo de equipo del catálogo.');
  }

  var tarifa = numero_(datos.tarifa, -1);
  if (tarifa < 0) {
    throw new Error('Captura la tarifa base.');
  }
  var horas = numero_(datos.tiempoHoras, 0);
  if (horas <= 0) {
    // Sin tiempo no hay cómo ordenar por tiempo, y un cero se vería como la
    // opción más rápida de todas.
    throw new Error('Captura el tiempo de entrega en horas, mayor a cero.');
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

  var campos = {
    proveedorId: proveedorId,
    rutaId: rutaId,
    mercancia: mercancia,
    equipo: equipo,
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
    actualizado: ahora_()
  };

  var existente = datos.id ? buscarPorId_('Tarifas', datos.id) : null;
  var duplicada = tarifaGemela_(campos, existente ? String(existente.id) : '');
  if (duplicada) {
    throw new Error('Ese proveedor ya tiene una tarifa para esa ruta, mercancía, '
      + 'equipo y vigencia. Edítala en vez de capturarla otra vez.');
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
 * Busca otra tarifa con la misma combinación. Sirve para no capturar dos veces
 * lo mismo y para que la importación actualice en vez de duplicar.
 * @private
 */
function tarifaGemela_(campos, exceptoId) {
  return buscar_('Tarifas', function (t) {
    if (exceptoId && String(t.id) === exceptoId) {
      return false;
    }
    return String(t.proveedorId) === String(campos.proveedorId)
      && String(t.rutaId) === String(campos.rutaId)
      && normalizar_(t.mercancia) === normalizar_(campos.mercancia)
      && normalizar_(t.equipo) === normalizar_(campos.equipo)
      && fecha_(t.vigenciaDesde) === String(campos.vigenciaDesde || '');
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
 * todo. La copia nace inactiva y sin vigencia, para que nadie la use por error.
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
  copia.notas = texto_(fila.notas);
  copia.actualizado = ahora_();
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
