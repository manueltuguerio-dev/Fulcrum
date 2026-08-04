/**
 * TLTERMINALS · Tarifarios — el comparador.
 *
 * Aquí se contesta la pregunta que motiva todo el sistema: para esta ruta, con
 * esta mercancía y este equipo, ¿quién conviene y por qué? Las opciones se
 * acomodan de la mejor a la peor combinando precio y tiempo de entrega, con el
 * peso que la empresa decida (por omisión 70 % precio, 30 % tiempo).
 */

/**
 * Arma los grupos comparables. Un grupo es una combinación de ruta + tipo de
 * mercancía + tipo de equipo: solo dentro de un grupo tiene sentido ordenar de
 * mejor a peor, porque un full y un rabón no compiten por lo mismo.
 *
 * @param {Object} filtros {rutaId, mercancia, equipo, fecha, incluirVencidas,
 *                          incluirInactivos, capacidadMin, pesoPrecio, orden, texto}
 * @return {Object} {grupos, criterio, fecha, descartadas}
 * @private
 */
function agrupar_(filtros) {
  var f = filtros || {};
  var fecha = fecha_(f.fecha) || hoyTexto_();
  var cfg = configCompleta_();

  var pesoPrecio = f.pesoPrecio === undefined || f.pesoPrecio === null || f.pesoPrecio === ''
    ? numero_(cfg.pesoPrecio, 70) : numero_(f.pesoPrecio, 70);
  pesoPrecio = Math.max(0, Math.min(100, pesoPrecio));
  var pesoTiempo = 100 - pesoPrecio;

  var capacidadMin = numero_(f.capacidadMin, 0);
  var buscado = normalizar_(f.texto);
  var descartadas = { inactivas: 0, vencidas: 0, sinVigencia: 0, capacidad: 0, proveedorInactivo: 0 };

  var candidatas = tarifasEnriquecidas_().filter(function (t) {
    if (f.rutaId && t.rutaId !== String(f.rutaId)) {
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
    if (f.proveedorId && t.proveedorId !== String(f.proveedorId)) {
      return false;
    }
    if (buscado && normalizar_(t.proveedor + ' ' + t.ruta).indexOf(buscado) === -1) {
      return false;
    }
    if (t.estado !== 'activo') {
      descartadas.inactivas++;
      return false;
    }
    if (!t.proveedorActivo && !f.incluirInactivos) {
      descartadas.proveedorInactivo++;
      return false;
    }
    if (capacidadMin > 0 && t.capacidadTon > 0 && t.capacidadTon < capacidadMin) {
      descartadas.capacidad++;
      return false;
    }
    if (!f.incluirVencidas) {
      var fila = { vigenciaDesde: t.vigenciaDesde, vigenciaHasta: t.vigenciaHasta };
      if (!vigenteEn_(fila, fecha)) {
        if (t.vencida) {
          descartadas.vencidas++;
        } else {
          descartadas.sinVigencia++;
        }
        return false;
      }
    }
    return true;
  });

  // Un grupo son las tarifas que de verdad compiten entre sí: misma ruta, misma
  // carga, misma unidad, mismo movimiento —un one way no compite con un
  // redondo— y mismo valor en los campos personalizados marcados como "separa
  // la comparación", por ejemplo la cuenta.
  var separadores = campos_('tarifa', true).filter(function (c) { return c.compara; });
  var mapa = {};
  candidatas.forEach(function (t) {
    var clave = [t.rutaId, normalizar_(t.mercancia), normalizar_(t.equipo),
                 normalizar_(t.movimiento)].join('|');
    var etiquetas = [];
    separadores.forEach(function (campo) {
      clave += '|' + campo.clave + '=' + normalizar_(t.extras[campo.clave]);
      etiquetas.push({
        etiqueta: campo.etiqueta,
        valor: t.extrasTexto[campo.clave] || '(sin ' + campo.etiqueta.toLowerCase() + ')'
      });
    });
    if (!mapa[clave]) {
      mapa[clave] = {
        clave: clave,
        rutaId: t.rutaId,
        ruta: t.ruta,
        origen: t.origen,
        destino: t.destino,
        km: t.km,
        mercancia: t.mercancia,
        mercanciaNombre: t.mercanciaNombre,
        equipo: t.equipo,
        equipoNombre: t.equipoNombre,
        movimiento: t.movimiento,
        movimientoNombre: t.movimientoNombre,
        etiquetas: etiquetas,
        opciones: []
      };
    }
    mapa[clave].opciones.push(t);
  });

  var grupos = Object.keys(mapa).map(function (clave) {
    return calificarGrupo_(mapa[clave], pesoPrecio, pesoTiempo, f.orden);
  });

  grupos.sort(function (a, b) {
    if (a.ruta !== b.ruta) {
      return a.ruta < b.ruta ? -1 : 1;
    }
    if (a.movimientoNombre !== b.movimientoNombre) {
      return a.movimientoNombre < b.movimientoNombre ? -1 : 1;
    }
    if (a.mercanciaNombre !== b.mercanciaNombre) {
      return a.mercanciaNombre < b.mercanciaNombre ? -1 : 1;
    }
    return a.equipoNombre < b.equipoNombre ? -1 : 1;
  });

  return {
    grupos: grupos,
    fecha: fecha,
    monedaBase: String(cfg.monedaBase || 'MXN'),
    tipoCambio: tipoCambioDelDia_(false),
    criterio: { pesoPrecio: pesoPrecio, pesoTiempo: pesoTiempo, orden: f.orden || 'puntaje' },
    descartadas: descartadas
  };
}

/**
 * Pone en orden las opciones de un grupo y explica por qué gana la que gana.
 *
 * El puntaje normaliza precio y tiempo dentro del grupo —el más barato vale 0 y
 * el más caro 1— y los combina con los pesos. Así 100 es "lo mejor que hay hoy
 * en esta ruta" y no un número absoluto que no significaría nada.
 * @private
 */
function calificarGrupo_(grupo, pesoPrecio, pesoTiempo, orden) {
  var opciones = grupo.opciones;
  var precios = opciones.map(function (o) { return o.costoTotal; });

  // El tiempo de entrega es opcional y casi ningún tarifario lo trae. Si a
  // alguna opción del grupo le falta, no se puede repartir el puntaje entre
  // precio y tiempo sin inventar datos: el grupo entero se ordena solo por
  // precio y se dice en pantalla.
  var conTiempo = opciones.every(function (o) { return o.tiempoHoras > 0; });
  if (!conTiempo) {
    pesoPrecio = 100;
    pesoTiempo = 0;
  }
  var tiempos = opciones.map(function (o) { return o.tiempoHoras; });
  var minP = Math.min.apply(null, precios);
  var maxP = Math.max.apply(null, precios);
  var minT = conTiempo ? Math.min.apply(null, tiempos) : 0;
  var maxT = conTiempo ? Math.max.apply(null, tiempos) : 0;

  opciones.forEach(function (o) {
    var normP = maxP > minP ? (o.costoTotal - minP) / (maxP - minP) : 0;
    var normT = maxT > minT ? (o.tiempoHoras - minT) / (maxT - minT) : 0;
    o.puntaje = redondear_(100 * (1 - (pesoPrecio * normP + pesoTiempo * normT) / 100), 1);
    o.esMasBarata = o.costoTotal === minP;
    o.esMasRapida = conTiempo && o.tiempoHoras === minT;
    o.sobreprecio = redondear_(o.costoTotal - minP);
    o.sobreprecioPct = minP > 0 ? redondear_((o.costoTotal - minP) * 100 / minP, 1) : 0;
    o.horasDeMas = conTiempo ? redondear_(o.tiempoHoras - minT, 1) : 0;
    o.tiempoTexto = tiempoTexto_(o.tiempoHoras);
  });

  opciones.sort(comparador_(conTiempo ? orden : 'precio'));

  opciones.forEach(function (o, i) {
    o.posicion = i + 1;
    o.motivo = motivo_(o, conTiempo);
  });

  var mejor = opciones[0];
  var peor = opciones[opciones.length - 1];

  grupo.opciones = opciones;
  grupo.conTiempo = conTiempo;
  grupo.sinTiempo = opciones.filter(function (o) { return o.sinTiempo; }).length;
  grupo.mejor = mejor;
  grupo.segunda = opciones.length > 1 ? opciones[1] : null;
  grupo.total = opciones.length;
  grupo.proveedores = contarProveedores_(opciones);
  grupo.costoMin = minP;
  grupo.costoMax = maxP;
  grupo.costoPromedio = redondear_(precios.reduce(function (a, b) { return a + b; }, 0) / opciones.length);
  grupo.tiempoMin = minT;
  grupo.tiempoMax = maxT;
  // Lo que se deja de gastar por no tomar la peor opción del tablero.
  grupo.ahorro = redondear_(peor.costoTotal - mejor.costoTotal);
  grupo.ahorroPct = peor.costoTotal > 0
    ? redondear_((peor.costoTotal - mejor.costoTotal) * 100 / peor.costoTotal, 1) : 0;
  // Cuánto más cuesta la segunda opción que la primera. Sale negativo cuando la
  // segunda es más barata pero perdió por tiempo de entrega: ese número es
  // justo lo que se está pagando por llegar antes, y es con lo que se negocia.
  grupo.ventaja = grupo.segunda ? redondear_(grupo.segunda.costoTotal - mejor.costoTotal) : 0;
  return grupo;
}

/**
 * El orden con el que se acomodan las opciones.
 *   puntaje  precio y tiempo combinados (el que se usa por omisión)
 *   precio   de la más barata a la más cara
 *   tiempo   de la más rápida a la más lenta
 * En los tres, los empates se rompen igual: primero precio, luego tiempo, luego
 * la calificación del proveedor.
 * @private
 */
function comparador_(orden) {
  return function (a, b) {
    if (orden === 'precio' && a.costoTotal !== b.costoTotal) {
      return a.costoTotal - b.costoTotal;
    }
    if (orden === 'tiempo' && a.tiempoHoras !== b.tiempoHoras) {
      return a.tiempoHoras - b.tiempoHoras;
    }
    if (orden !== 'precio' && orden !== 'tiempo' && a.puntaje !== b.puntaje) {
      return b.puntaje - a.puntaje;
    }
    if (a.costoTotal !== b.costoTotal) {
      return a.costoTotal - b.costoTotal;
    }
    if (a.tiempoHoras !== b.tiempoHoras) {
      return a.tiempoHoras - b.tiempoHoras;
    }
    if (a.calificacion !== b.calificacion) {
      return b.calificacion - a.calificacion;
    }
    return a.proveedor < b.proveedor ? -1 : 1;
  };
}

/**
 * Una línea que explica la posición, para que la tabla no sea solo números.
 * @private
 */
function motivo_(o, conTiempo) {
  if (!conTiempo) {
    // Sin tiempos capturados solo se puede hablar de dinero.
    return o.esMasBarata ? 'La más barata.'
      : 'Cuesta ' + o.sobreprecioPct + ' % más que la más barata.';
  }
  if (o.esMasBarata && o.esMasRapida) {
    return 'La más barata y la más rápida.';
  }
  if (o.esMasBarata) {
    return 'La más barata; llega ' + tiempoTexto_(o.horasDeMas) + ' después de la más rápida.';
  }
  if (o.esMasRapida) {
    return 'La más rápida; cuesta ' + o.sobreprecioPct + ' % más que la más barata.';
  }
  return 'Cuesta ' + o.sobreprecioPct + ' % más que la más barata y llega '
    + tiempoTexto_(o.horasDeMas) + ' después de la más rápida.';
}

function contarProveedores_(opciones) {
  var vistos = {};
  opciones.forEach(function (o) { vistos[o.proveedorId] = true; });
  return Object.keys(vistos).length;
}

/**
 * Horas en algo que se lee: "36 h" pasa a "1 d 12 h".
 * @private
 */
function tiempoTexto_(horas) {
  var h = numero_(horas, 0);
  if (h <= 0) {
    return '—';
  }
  if (h < 24) {
    return redondear_(h, 1) + ' h';
  }
  var dias = Math.floor(h / 24);
  var resto = redondear_(h - dias * 24, 1);
  return dias + ' d' + (resto > 0 ? ' ' + resto + ' h' : '');
}

/* --------------------------------- la API ---------------------------------- */

/**
 * Comparativo completo. Si se pide una ruta sin especificar mercancía ni
 * equipo, devuelve un tablero por cada combinación que exista en esa ruta.
 *
 * @param {Object} filtros Ver agrupar_.
 * @return {Object} {grupos, criterio, fecha, descartadas, catalogos}
 */
function apiComparar(filtros) {
  exigirSesion_();
  var datos = agrupar_(filtros);
  datos.total = datos.grupos.reduce(function (suma, g) { return suma + g.total; }, 0);
  return datos;
}

/**
 * El apartado de mejores opciones: una sola línea por ruta y características,
 * con quién gana, quién queda en segundo y cuánto cuesta la diferencia.
 *
 * @param {Object} filtros Ver agrupar_.
 * @return {Object} {mejores, resumen, criterio, fecha}
 */
function apiMejoresOpciones(filtros) {
  exigirSesion_();
  var datos = agrupar_(filtros);

  var mejores = datos.grupos.map(function (g) {
    return {
      clave: g.clave,
      rutaId: g.rutaId,
      ruta: g.ruta,
      origen: g.origen,
      destino: g.destino,
      km: g.km,
      mercancia: g.mercancia,
      mercanciaNombre: g.mercanciaNombre,
      equipo: g.equipo,
      equipoNombre: g.equipoNombre,
      movimiento: g.movimiento,
      movimientoNombre: g.movimientoNombre,
      etiquetas: g.etiquetas,
      conTiempo: g.conTiempo,
      opciones: g.total,
      proveedores: g.proveedores,
      proveedor: g.mejor.proveedor,
      proveedorId: g.mejor.proveedorId,
      tarifaId: g.mejor.id,
      costoTotal: g.mejor.costoTotal,
      costoPorKm: g.mejor.costoPorKm,
      tiempoHoras: g.mejor.tiempoHoras,
      tiempoTexto: g.mejor.tiempoTexto,
      puntaje: g.mejor.puntaje,
      motivo: g.mejor.motivo,
      vigenciaHasta: g.mejor.vigenciaHasta,
      segundo: g.segunda ? g.segunda.proveedor : '',
      segundoCosto: g.segunda ? g.segunda.costoTotal : 0,
      segundoTiempo: g.segunda ? g.segunda.tiempoHoras : 0,
      ventaja: g.ventaja,
      costoPromedio: g.costoPromedio,
      costoMax: g.costoMax,
      ahorro: g.ahorro,
      ahorroPct: g.ahorroPct
    };
  });

  var ahorroTotal = mejores.reduce(function (suma, m) { return suma + m.ahorro; }, 0);
  var combosSinCompetencia = mejores.filter(function (m) { return m.opciones === 1; }).length;

  return {
    mejores: mejores,
    fecha: datos.fecha,
    monedaBase: datos.monedaBase,
    tipoCambio: datos.tipoCambio,
    criterio: datos.criterio,
    descartadas: datos.descartadas,
    resumen: {
      combinaciones: mejores.length,
      rutas: contarRutas_(mejores),
      opciones: datos.grupos.reduce(function (s, g) { return s + g.total; }, 0),
      ahorroTotal: redondear_(ahorroTotal),
      sinCompetencia: combosSinCompetencia
    }
  };
}

function contarRutas_(mejores) {
  var vistas = {};
  mejores.forEach(function (m) { vistas[m.rutaId] = true; });
  return Object.keys(vistas).length;
}

/**
 * Historial de precios de una combinación: todas las tarifas capturadas,
 * incluidas las vencidas, para ver cómo se ha movido un proveedor.
 * @return {Object} {ruta, mercancia, equipo, historial}
 */
function apiHistorial(rutaId, mercancia, equipo, movimiento) {
  exigirSesion_();
  var lista = tarifasEnriquecidas_().filter(function (t) {
    return t.rutaId === String(rutaId)
      && normalizar_(t.mercancia) === normalizar_(mercancia)
      && normalizar_(t.equipo) === normalizar_(equipo)
      && (!movimiento || normalizar_(t.movimiento) === normalizar_(movimiento));
  });
  lista.sort(function (a, b) {
    var da = a.vigenciaDesde || '0000-00-00';
    var db = b.vigenciaDesde || '0000-00-00';
    if (da !== db) {
      return da < db ? 1 : -1;
    }
    return a.proveedor < b.proveedor ? -1 : 1;
  });
  lista.forEach(function (t) { t.tiempoTexto = tiempoTexto_(t.tiempoHoras); });
  return {
    ruta: lista.length ? lista[0].ruta : '',
    mercanciaNombre: lista.length ? lista[0].mercanciaNombre : '',
    equipoNombre: lista.length ? lista[0].equipoNombre : '',
    movimientoNombre: lista.length ? lista[0].movimientoNombre : '',
    historial: lista
  };
}
