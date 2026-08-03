/**
 * TLTERMINALS · Comedor — funciones que el navegador llama con
 * google.script.run. Aquí viven las reglas de negocio.
 */

/* -------------------------------- sesión ---------------------------------- */

function usuarioActual_() {
  var correo = '';
  try {
    correo = Session.getActiveUser().getEmail();
  } catch (err) {
    correo = '';
  }
  if (!correo) {
    return null;
  }
  var empleado = buscarEmpleadoPorEmail_(correo);
  if (!empleado) {
    return { email: correo, registrado: false };
  }
  return {
    email: correo,
    registrado: true,
    id: empleado.id,
    nombre: empleado.nombre,
    rol: String(empleado.rol || 'empleado'),
    estado: String(empleado.estado || 'activo'),
    area: empleado.area,
    numeroNomina: empleado.numeroNomina
  };
}

function exigirSesion_() {
  var u = usuarioActual_();
  if (!u || !u.registrado) {
    throw new Error('Tu correo no está dado de alta en el comedor. Pídele al administrador que te registre.');
  }
  if (u.estado !== 'activo') {
    throw new Error('Tu cuenta del comedor está desactivada.');
  }
  return u;
}

function exigirAdmin_() {
  var u = exigirSesion_();
  if (u.rol !== 'admin') {
    throw new Error('Esta acción es solo para el administrador.');
  }
  return u;
}

/* ------------------------------- menú del día ------------------------------ */

function horaCorteDe_(fecha) {
  var menu = buscar_('Menus', function (f) { return textoFecha_(f.fecha) === fecha; });
  if (menu && menu.horaCorte) {
    return String(menu.horaCorte);
  }
  return leerConfig('horaCorte') || '11:00';
}

/** Normaliza lo que Sheets pudo haber convertido en objeto Date. @private */
function textoFecha_(valor) {
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, zona_(), 'yyyy-MM-dd');
  }
  return String(valor || '').trim();
}

function textoHora_(valor) {
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, zona_(), 'HH:mm');
  }
  return String(valor || '').trim();
}

/**
 * Arma el menú de una fecha con sus platillos y el estado del corte.
 * @private
 */
function menuDeFecha_(fecha) {
  var menuFila = buscar_('Menus', function (f) { return textoFecha_(f.fecha) === fecha; });
  var horaCorte = menuFila ? textoHora_(menuFila.horaCorte) : (leerConfig('horaCorte') || '11:00');
  if (!horaCorte) {
    horaCorte = leerConfig('horaCorte') || '11:00';
  }
  var corte = momento_(fecha, horaCorte);
  var abierto = menuFila
    && String(menuFila.estado) === 'publicado'
    && new Date().getTime() < corte.getTime();

  var platillos = leerTodo_('Platillos');
  var porId = {};
  platillos.forEach(function (p) { porId[String(p.id)] = p; });

  var items = leerTodo_('MenuItems').filter(function (i) {
    return textoFecha_(i.fecha) === fecha;
  });

  var lista = [];
  items.forEach(function (item) {
    var p = porId[String(item.platilloId)];
    if (!p || !esSi_(p.activo)) {
      return;
    }
    lista.push({
      itemId: item.id,
      platilloId: String(p.id),
      nombre: String(p.nombre),
      descripcion: String(p.descripcion || ''),
      imagen: String(p.imagen || ''),
      tipo: String(p.tipo),
      permiteComplementos: esSi_(p.permiteComplementos),
      disponible: esSi_(item.disponible),
      precio: Number(item.precioDia !== '' ? item.precioDia : p.precio) || 0,
      orden: Number(item.orden) || 0
    });
  });
  lista.sort(function (a, b) { return a.orden - b.orden; });

  return {
    fecha: fecha,
    existe: !!menuFila,
    estado: menuFila ? String(menuFila.estado) : 'sin menú',
    horaCorte: horaCorte,
    aviso: menuFila ? String(menuFila.aviso || '') : '',
    corteISO: Utilities.formatDate(corte, zona_(), "yyyy-MM-dd'T'HH:mm:ss"),
    minutosRestantes: Math.round((corte.getTime() - new Date().getTime()) / 60000),
    abierto: !!abierto,
    platillos: lista
  };
}

/* ------------------------------- tarifas ---------------------------------- */

/**
 * Resuelve cuánto se le cobra a un empleado por un platillo, en este orden:
 * tarifa del empleado para ese platillo, tarifa general del empleado, precio
 * del día y precio base.
 * @private
 */
function precioPara_(empleadoId, platilloId, precioDelDia) {
  var base = Number(precioDelDia) || 0;
  var hoy = hoyTexto_();
  var vigentes = leerTodo_('Tarifas').filter(function (t) {
    if (String(t.empleadoId) !== String(empleadoId)) {
      return false;
    }
    var desde = textoFecha_(t.desde);
    var hasta = textoFecha_(t.hasta);
    if (desde && hoy < desde) {
      return false;
    }
    if (hasta && hoy > hasta) {
      return false;
    }
    return true;
  });

  var elegida = null;
  vigentes.forEach(function (t) {
    if (String(t.platilloId) === String(platilloId)) {
      elegida = t;
    }
  });
  if (!elegida) {
    vigentes.forEach(function (t) {
      if (!t.platilloId) {
        elegida = t;
      }
    });
  }
  if (!elegida) {
    return base;
  }

  var valor = Number(elegida.valor) || 0;
  var modo = String(elegida.modo);
  if (modo === 'fijo') {
    return valor;
  }
  if (modo === 'descuento_pct') {
    return Math.round((base * (100 - valor) / 100) * 100) / 100;
  }
  if (modo === 'descuento_monto') {
    return Math.max(0, Math.round((base - valor) * 100) / 100);
  }
  return base;
}

/* ------------------------- lo que consume el cliente ----------------------- */

function apiEstadoInicial() {
  var u = usuarioActual_();
  if (!u) {
    return { sesion: false };
  }
  if (!u.registrado) {
    return { sesion: true, registrado: false, email: u.email };
  }
  if (u.estado !== 'activo') {
    return { sesion: true, registrado: true, activo: false, email: u.email };
  }

  var hoy = hoyTexto_();
  var manana = sumarDias_(hoy, 1);
  var dias = [menuDeFecha_(hoy), menuDeFecha_(manana)];
  var mios = leerTodo_('Pedidos').filter(function (p) {
    return String(p.empleadoId) === String(u.id)
      && String(p.estado) !== 'cancelado'
      && (textoFecha_(p.fecha) === hoy || textoFecha_(p.fecha) === manana);
  });

  dias.forEach(function (dia) {
    var mio = null;
    mios.forEach(function (p) {
      if (textoFecha_(p.fecha) === dia.fecha) {
        mio = pedidoParaCliente_(p);
      }
    });
    dia.miPedido = mio;
  });

  return {
    sesion: true,
    registrado: true,
    activo: true,
    usuario: u,
    config: configCompleta_(),
    dias: dias,
    ultimoPedido: ultimoPedidoDe_(u.id)
  };
}

function pedidoParaCliente_(p) {
  return {
    id: String(p.id),
    fecha: textoFecha_(p.fecha),
    estado: String(p.estado),
    principalId: String(p.principalId),
    complementos: listaDeTexto_(p.complementos),
    salsas: listaDeTexto_(p.salsas),
    comentarios: String(p.comentarios || ''),
    importe: Number(p.importe) || 0,
    origen: String(p.origen || ''),
    condonado: esSi_(p.condonado)
  };
}

function ultimoPedidoDe_(empleadoId) {
  var mios = leerTodo_('Pedidos').filter(function (p) {
    return String(p.empleadoId) === String(empleadoId)
      && String(p.estado) !== 'cancelado'
      && String(p.estado) !== 'no_come';
  });
  if (!mios.length) {
    return null;
  }
  mios.sort(function (a, b) {
    return textoFecha_(a.fecha) < textoFecha_(b.fecha) ? 1 : -1;
  });
  return pedidoParaCliente_(mios[0]);
}

/**
 * Crea o actualiza el pedido del empleado para una fecha.
 * @param {Object} datos {fecha, principalId, complementos[], salsas[], comentarios}
 */
function apiGuardarPedido(datos) {
  var u = exigirSesion_();
  return guardarPedido_(u, datos, 'empleado', false);
}

/**
 * Núcleo de guardado, compartido por el empleado y por el pedido expreso.
 * @private
 */
function guardarPedido_(empleado, datos, origen, ignorarCorte) {
  var fecha = String(datos.fecha);
  var menu = menuDeFecha_(fecha);

  if (!ignorarCorte) {
    var hoy = hoyTexto_();
    if (fecha !== hoy && fecha !== sumarDias_(hoy, 1)) {
      throw new Error('Solo puedes pedir para hoy y para mañana.');
    }
    if (!menu.abierto) {
      throw new Error('Los pedidos de ese día ya cerraron (hora corte ' + menu.horaCorte + ').');
    }
  }

  var porId = {};
  menu.platillos.forEach(function (p) { porId[p.platilloId] = p; });

  var principal = porId[String(datos.principalId)];
  if (!principal) {
    throw new Error('El platillo elegido no está en el menú de ese día.');
  }
  if (principal.tipo !== 'principal' && principal.tipo !== 'base') {
    throw new Error('Tienes que elegir un platillo principal o uno base.');
  }
  if (!principal.disponible && !ignorarCorte) {
    throw new Error('Ese platillo se marcó como agotado.');
  }

  var complementos = (datos.complementos || []).map(String);
  var salsas = (datos.salsas || []).map(String);
  var maximo = Number(leerConfig('maxComplementos')) || 2;

  if (complementos.length && !principal.permiteComplementos) {
    throw new Error('El platillo "' + principal.nombre + '" no lleva complementos.');
  }
  if (complementos.length > maximo) {
    throw new Error('Puedes elegir máximo ' + maximo + ' complementos.');
  }
  complementos.forEach(function (id) {
    if (!porId[id] || porId[id].tipo !== 'complemento') {
      throw new Error('Uno de los complementos no está en el menú de ese día.');
    }
  });
  salsas.forEach(function (id) {
    if (!porId[id] || porId[id].tipo !== 'salsa') {
      throw new Error('Una de las salsas no está en el menú de ese día.');
    }
  });

  var importe = precioPara_(empleado.id, principal.platilloId, principal.precio);
  var existente = buscar_('Pedidos', function (p) {
    return String(p.empleadoId) === String(empleado.id)
      && textoFecha_(p.fecha) === fecha
      && String(p.estado) !== 'cancelado';
  });

  var campos = {
    principalId: principal.platilloId,
    complementos: complementos.join(','),
    salsas: salsas.join(','),
    comentarios: String(datos.comentarios || '').substring(0, 300),
    importe: importe,
    estado: 'confirmado',
    origen: origen,
    actualizado: ahora_()
  };

  if (existente) {
    actualizar_('Pedidos', existente, campos);
    bitacora_('pedido_actualizado', existente.id, { fecha: fecha, origen: origen });
    return pedidoParaCliente_(existente);
  }

  var nuevo = {
    id: nuevoId_(),
    fecha: fecha,
    empleadoId: empleado.id,
    email: empleado.email,
    nombre: empleado.nombre,
    condonado: 'NO',
    motivo: '',
    creado: ahora_()
  };
  Object.keys(campos).forEach(function (k) { nuevo[k] = campos[k]; });
  insertar_('Pedidos', nuevo);
  bitacora_('pedido_creado', nuevo.id, { fecha: fecha, origen: origen });
  return pedidoParaCliente_(nuevo);
}

function apiCancelarPedido(id) {
  var u = exigirSesion_();
  var pedido = buscarPorId_('Pedidos', id);
  if (!pedido) {
    throw new Error('No encontré ese pedido.');
  }
  if (String(pedido.empleadoId) !== String(u.id) && u.rol !== 'admin') {
    throw new Error('Ese pedido no es tuyo.');
  }
  var menu = menuDeFecha_(textoFecha_(pedido.fecha));
  if (!menu.abierto && u.rol !== 'admin') {
    throw new Error('Ya pasó la hora corte; pídele al administrador que lo cancele.');
  }
  actualizar_('Pedidos', pedido, { estado: 'cancelado', actualizado: ahora_() });
  bitacora_('pedido_cancelado', pedido.id, { fecha: textoFecha_(pedido.fecha) });
  return true;
}

function apiMisPedidos(desde, hasta) {
  var u = exigirSesion_();
  var d = String(desde || sumarDias_(hoyTexto_(), -30));
  var h = String(hasta || hoyTexto_());
  var mios = leerTodo_('Pedidos').filter(function (p) {
    var f = textoFecha_(p.fecha);
    return String(p.empleadoId) === String(u.id) && f >= d && f <= h;
  });
  var platillos = {};
  leerTodo_('Platillos').forEach(function (p) { platillos[String(p.id)] = String(p.nombre); });

  var total = 0;
  var filas = mios.map(function (p) {
    var cobra = cobrable_(p);
    total += cobra ? Number(p.importe) || 0 : 0;
    return {
      fecha: textoFecha_(p.fecha),
      estado: String(p.estado),
      platillo: platillos[String(p.principalId)] || '',
      importe: Number(p.importe) || 0,
      cobrado: cobra,
      condonado: esSi_(p.condonado)
    };
  });
  filas.sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
  return { filas: filas, total: Math.round(total * 100) / 100, desde: d, hasta: h };
}

/** Un pedido suma al corte si está confirmado o entregado y no fue condonado. */
function cobrable_(p) {
  var estado = String(p.estado);
  return (estado === 'confirmado' || estado === 'entregado') && !esSi_(p.condonado);
}
