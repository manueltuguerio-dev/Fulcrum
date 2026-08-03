/**
 * TLTERMINALS · Comedor — funciones del administrador.
 */

function apiAdminEstado() {
  exigirAdmin_();
  return {
    empleados: leerTodo_('Empleados').map(function (e) {
      return {
        id: String(e.id), email: String(e.email), nombre: String(e.nombre),
        numeroNomina: String(e.numeroNomina || ''), area: String(e.area || ''),
        rol: String(e.rol), estado: String(e.estado)
      };
    }),
    platillos: leerTodo_('Platillos').map(function (p) {
      return {
        id: String(p.id), nombre: String(p.nombre), descripcion: String(p.descripcion || ''),
        imagen: String(p.imagen || ''), tipo: String(p.tipo),
        permiteComplementos: esSi_(p.permiteComplementos), precio: Number(p.precio) || 0,
        activo: esSi_(p.activo), fijo: esSi_(p.fijo)
      };
    }),
    config: configCompleta_(),
    ligaApp: ligaApp_()
  };
}

function ligaApp_() {
  try {
    return ScriptApp.getService().getUrl() || '';
  } catch (err) {
    return '';
  }
}

/* ------------------------------- empleados -------------------------------- */

function apiGuardarEmpleado(datos) {
  exigirAdmin_();
  var email = String(datos.email || '').toLowerCase().trim();
  if (!email || email.indexOf('@') === -1) {
    throw new Error('Escribe un correo válido.');
  }
  var campos = {
    email: email,
    nombre: String(datos.nombre || email.split('@')[0]).trim(),
    numeroNomina: String(datos.numeroNomina || '').trim(),
    area: String(datos.area || '').trim(),
    rol: datos.rol === 'admin' ? 'admin' : 'empleado'
  };

  var existente = datos.id ? buscarPorId_('Empleados', datos.id) : buscarEmpleadoPorEmail_(email);
  if (existente) {
    if (String(existente.email).toLowerCase() !== email && buscarEmpleadoPorEmail_(email)) {
      throw new Error('Ya hay otro empleado con ese correo.');
    }
    actualizar_('Empleados', existente, campos);
    bitacora_('empleado_actualizado', existente.id, campos);
    return String(existente.id);
  }

  campos.id = nuevoId_();
  campos.estado = 'activo';
  campos.creado = ahora_();
  insertar_('Empleados', campos);
  bitacora_('empleado_creado', campos.id, campos);
  return campos.id;
}

function apiCambiarEstadoEmpleado(id, estado) {
  exigirAdmin_();
  var empleado = buscarPorId_('Empleados', id);
  if (!empleado) {
    throw new Error('No encontré a ese empleado.');
  }
  var nuevo = estado === 'activo' ? 'activo' : 'inactivo';
  actualizar_('Empleados', empleado, { estado: nuevo });

  if (nuevo === 'inactivo') {
    var hoy = hoyTexto_();
    leerTodo_('Pedidos').forEach(function (p) {
      if (String(p.empleadoId) === String(id)
          && textoFecha_(p.fecha) >= hoy
          && String(p.estado) === 'confirmado') {
        actualizar_('Pedidos', p, { estado: 'cancelado', actualizado: ahora_() });
      }
    });
  }
  bitacora_('empleado_' + nuevo, id, {});
  return true;
}

function apiInvitar(id) {
  exigirAdmin_();
  var empleado = buscarPorId_('Empleados', id);
  if (!empleado) {
    throw new Error('No encontré a ese empleado.');
  }
  var liga = ligaApp_();
  if (!liga) {
    throw new Error('Publica primero el Web App: la invitación necesita la liga.');
  }
  var empresa = leerConfig('empresa') || 'TLTERMINALS';
  MailApp.sendEmail({
    to: String(empleado.email),
    subject: 'Comedor ' + empresa + ' — ya puedes pedir tu comida',
    htmlBody: '<p>Hola ' + escaparHtml_(String(empleado.nombre)) + ',</p>'
      + '<p>Ya estás dado de alta en el comedor de ' + escaparHtml_(empresa) + '. '
      + 'Entra con tu cuenta de Google desde esta liga:</p>'
      + '<p><a href="' + liga + '">' + liga + '</a></p>'
      + '<p>Ahí ves el menú del día, haces tu pedido y consultas lo que llevas gastado. '
      + 'Recuerda que hay una hora corte: después de esa hora ya no se puede pedir ni cambiar.</p>'
  });
  bitacora_('invitacion_enviada', id, { email: empleado.email });
  return true;
}

/* -------------------------------- tarifas --------------------------------- */

function apiTarifasDe(empleadoId) {
  exigirAdmin_();
  return leerTodo_('Tarifas')
    .filter(function (t) { return String(t.empleadoId) === String(empleadoId); })
    .map(function (t) {
      return {
        id: String(t.id), platilloId: String(t.platilloId || ''), modo: String(t.modo),
        valor: Number(t.valor) || 0, desde: textoFecha_(t.desde), hasta: textoFecha_(t.hasta)
      };
    });
}

function apiGuardarTarifa(datos) {
  exigirAdmin_();
  var campos = {
    empleadoId: String(datos.empleadoId),
    platilloId: String(datos.platilloId || ''),
    modo: String(datos.modo),
    valor: Number(datos.valor) || 0,
    desde: String(datos.desde || hoyTexto_()),
    hasta: String(datos.hasta || '')
  };
  if (['fijo', 'descuento_pct', 'descuento_monto'].indexOf(campos.modo) === -1) {
    throw new Error('Modo de tarifa no válido.');
  }
  campos.id = nuevoId_();
  insertar_('Tarifas', campos);
  bitacora_('tarifa_creada', campos.id, campos);
  return campos.id;
}

function apiBorrarTarifa(id) {
  exigirAdmin_();
  var fila = buscarPorId_('Tarifas', id);
  if (fila) {
    borrar_('Tarifas', fila);
    bitacora_('tarifa_borrada', id, {});
  }
  return true;
}

/* ------------------------------- platillos -------------------------------- */

function apiGuardarPlatillo(datos) {
  exigirAdmin_();
  var tipos = ['principal', 'base', 'complemento', 'salsa'];
  if (tipos.indexOf(String(datos.tipo)) === -1) {
    throw new Error('Tipo de platillo no válido.');
  }
  var campos = {
    nombre: String(datos.nombre || '').trim(),
    descripcion: String(datos.descripcion || '').trim(),
    imagen: String(datos.imagen || '').trim(),
    tipo: String(datos.tipo),
    permiteComplementos: datos.permiteComplementos ? 'SI' : 'NO',
    precio: Number(datos.precio) || 0,
    activo: datos.activo === false ? 'NO' : 'SI',
    fijo: datos.fijo ? 'SI' : 'NO'
  };
  if (!campos.nombre) {
    throw new Error('El platillo necesita nombre.');
  }

  var existente = datos.id ? buscarPorId_('Platillos', datos.id) : null;
  if (existente) {
    actualizar_('Platillos', existente, campos);
    bitacora_('platillo_actualizado', existente.id, campos);
    return String(existente.id);
  }
  campos.id = nuevoId_();
  insertar_('Platillos', campos);
  bitacora_('platillo_creado', campos.id, campos);
  return campos.id;
}

/* --------------------------------- menús ---------------------------------- */

function apiMenuAdmin(fecha) {
  exigirAdmin_();
  return menuDeFecha_(String(fecha));
}

function apiCrearMenu(fecha) {
  exigirAdmin_();
  var f = String(fecha);
  if (buscar_('Menus', function (m) { return textoFecha_(m.fecha) === f; })) {
    throw new Error('Ese día ya tiene menú.');
  }
  insertar_('Menus', {
    fecha: f, estado: 'borrador', horaCorte: leerConfig('horaCorte') || '11:00',
    aviso: '', publicado: '', cerrado: ''
  });

  var orden = 0;
  leerTodo_('Platillos').forEach(function (p) {
    if (esSi_(p.activo) && esSi_(p.fijo)) {
      orden++;
      insertar_('MenuItems', {
        id: nuevoId_(), fecha: f, platilloId: String(p.id),
        orden: 100 + orden, disponible: 'SI', precioDia: ''
      });
    }
  });
  bitacora_('menu_creado', f, {});
  return menuDeFecha_(f);
}

function apiDuplicarMenu(origen, destino) {
  exigirAdmin_();
  var d = String(destino);
  if (buscar_('Menus', function (m) { return textoFecha_(m.fecha) === d; })) {
    throw new Error('El día destino ya tiene menú.');
  }
  var base = menuDeFecha_(String(origen));
  if (!base.existe) {
    throw new Error('El día de origen no tiene menú que copiar.');
  }
  insertar_('Menus', {
    fecha: d, estado: 'borrador', horaCorte: base.horaCorte,
    aviso: '', publicado: '', cerrado: ''
  });
  base.platillos.forEach(function (p) {
    insertar_('MenuItems', {
      id: nuevoId_(), fecha: d, platilloId: p.platilloId,
      orden: p.orden, disponible: 'SI', precioDia: ''
    });
  });
  bitacora_('menu_duplicado', d, { origen: origen });
  return menuDeFecha_(d);
}

function apiAgregarAlMenu(fecha, platilloId, precioDia) {
  exigirAdmin_();
  var f = String(fecha);
  if (!buscar_('Menus', function (m) { return textoFecha_(m.fecha) === f; })) {
    apiCrearMenu(f);
  }
  var repetido = buscar_('MenuItems', function (i) {
    return textoFecha_(i.fecha) === f && String(i.platilloId) === String(platilloId);
  });
  if (repetido) {
    throw new Error('Ese platillo ya está en el menú de ese día.');
  }
  var cuantos = leerTodo_('MenuItems').filter(function (i) {
    return textoFecha_(i.fecha) === f;
  }).length;
  insertar_('MenuItems', {
    id: nuevoId_(), fecha: f, platilloId: String(platilloId),
    orden: cuantos + 1, disponible: 'SI',
    precioDia: precioDia === '' || precioDia === undefined ? '' : Number(precioDia)
  });
  return menuDeFecha_(f);
}

function apiQuitarDelMenu(itemId) {
  exigirAdmin_();
  var item = buscarPorId_('MenuItems', itemId);
  if (!item) {
    throw new Error('No encontré ese renglón del menú.');
  }
  var fecha = textoFecha_(item.fecha);
  var usado = buscar_('Pedidos', function (p) {
    return textoFecha_(p.fecha) === fecha
      && String(p.estado) !== 'cancelado'
      && (String(p.principalId) === String(item.platilloId)
          || listaDeTexto_(p.complementos).indexOf(String(item.platilloId)) !== -1
          || listaDeTexto_(p.salsas).indexOf(String(item.platilloId)) !== -1);
  });
  if (usado) {
    throw new Error('Ya hay pedidos con ese platillo. Márcalo como agotado en vez de quitarlo.');
  }
  borrar_('MenuItems', item);
  return menuDeFecha_(fecha);
}

function apiCambiarDisponible(itemId, disponible) {
  exigirAdmin_();
  var item = buscarPorId_('MenuItems', itemId);
  if (!item) {
    throw new Error('No encontré ese renglón del menú.');
  }
  actualizar_('MenuItems', item, { disponible: disponible ? 'SI' : 'NO' });
  return menuDeFecha_(textoFecha_(item.fecha));
}

function apiActualizarMenu(fecha, horaCorte, aviso) {
  exigirAdmin_();
  var f = String(fecha);
  var menu = buscar_('Menus', function (m) { return textoFecha_(m.fecha) === f; });
  if (!menu) {
    throw new Error('Ese día no tiene menú.');
  }
  actualizar_('Menus', menu, {
    horaCorte: String(horaCorte || menu.horaCorte),
    aviso: String(aviso || '')
  });
  return menuDeFecha_(f);
}

function apiPublicarMenu(fecha) {
  exigirAdmin_();
  var f = String(fecha);
  var menu = buscar_('Menus', function (m) { return textoFecha_(m.fecha) === f; });
  if (!menu) {
    throw new Error('Ese día no tiene menú.');
  }
  var items = leerTodo_('MenuItems').filter(function (i) { return textoFecha_(i.fecha) === f; });
  if (!items.length) {
    throw new Error('El menú está vacío: agrega platillos antes de publicarlo.');
  }
  actualizar_('Menus', menu, { estado: 'publicado', publicado: ahora_() });
  bitacora_('menu_publicado', f, {});
  return menuDeFecha_(f);
}

function apiMensajeWhatsApp(fecha) {
  exigirAdmin_();
  var menu = menuDeFecha_(String(fecha));
  var empresa = leerConfig('empresa') || 'TLTERMINALS';
  var lineas = ['*Comedor ' + empresa + '* — menú del ' + fechaBonita_(menu.fecha), ''];

  ['principal', 'base'].forEach(function (tipo) {
    var grupo = menu.platillos.filter(function (p) {
      return p.tipo === tipo && p.disponible;
    });
    if (!grupo.length) {
      return;
    }
    lineas.push(tipo === 'principal' ? '*Platillos del día*' : '*Siempre disponibles*');
    grupo.forEach(function (p) {
      lineas.push('• ' + p.nombre + (p.descripcion ? ' — ' + p.descripcion : ''));
    });
    lineas.push('');
  });

  if (menu.aviso) {
    lineas.push(menu.aviso, '');
  }
  lineas.push('Pide antes de las ' + menu.horaCorte + '. Después ya no se puede.');
  var liga = ligaApp_();
  if (liga) {
    lineas.push('', 'Haz tu pedido aquí: ' + liga);
  }

  var texto = lineas.join('\n');
  return {
    texto: texto,
    ligaWhatsApp: 'https://wa.me/?text=' + encodeURIComponent(texto)
  };
}

function fechaBonita_(fechaTexto) {
  var dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var p = String(fechaTexto).split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return dias[d.getDay()] + ' ' + d.getDate() + ' de ' + meses[d.getMonth()];
}

/* -------------------------- pedidos del día (admin) ------------------------ */

function apiPedidosDelDia(fecha) {
  exigirAdmin_();
  var f = String(fecha);
  var menu = menuDeFecha_(f);
  var nombres = {};
  menu.platillos.forEach(function (p) { nombres[p.platilloId] = p.nombre; });
  leerTodo_('Platillos').forEach(function (p) {
    if (!nombres[String(p.id)]) {
      nombres[String(p.id)] = String(p.nombre);
    }
  });

  var pedidos = leerTodo_('Pedidos')
    .filter(function (p) { return textoFecha_(p.fecha) === f; })
    .map(function (p) {
      return {
        id: String(p.id), nombre: String(p.nombre), email: String(p.email),
        estado: String(p.estado), platillo: nombres[String(p.principalId)] || '',
        complementos: listaDeTexto_(p.complementos).map(function (id) { return nombres[id] || id; }),
        salsas: listaDeTexto_(p.salsas).map(function (id) { return nombres[id] || id; }),
        comentarios: String(p.comentarios || ''), importe: Number(p.importe) || 0,
        origen: String(p.origen || ''), condonado: esSi_(p.condonado)
      };
    });
  pedidos.sort(function (a, b) { return a.nombre < b.nombre ? -1 : 1; });

  var conPedido = {};
  pedidos.forEach(function (p) {
    if (p.estado !== 'cancelado') {
      conPedido[p.email] = true;
    }
  });
  var faltantes = leerTodo_('Empleados')
    .filter(function (e) {
      return String(e.estado) === 'activo' && !conPedido[String(e.email)];
    })
    .map(function (e) {
      return { id: String(e.id), nombre: String(e.nombre), email: String(e.email) };
    });

  return { fecha: f, menu: menu, pedidos: pedidos, faltantes: faltantes };
}

function apiPedidoExpreso(empleadoId, datos) {
  exigirAdmin_();
  var empleado = buscarPorId_('Empleados', empleadoId);
  if (!empleado) {
    throw new Error('No encontré a ese empleado.');
  }
  var comoUsuario = {
    id: String(empleado.id), email: String(empleado.email),
    nombre: String(empleado.nombre), rol: String(empleado.rol)
  };
  bitacora_('pedido_expreso', empleadoId, { fecha: datos.fecha });
  return guardarPedido_(comoUsuario, datos, 'admin_expreso', true);
}

function apiEliminarPedido(id, motivo) {
  exigirAdmin_();
  var pedido = buscarPorId_('Pedidos', id);
  if (!pedido) {
    throw new Error('No encontré ese pedido.');
  }
  if (!String(motivo || '').trim()) {
    throw new Error('Escribe el motivo: queda registrado en la bitácora.');
  }
  bitacora_('pedido_eliminado', id, { motivo: motivo, fecha: textoFecha_(pedido.fecha) });
  borrar_('Pedidos', pedido);
  return true;
}

function apiCondonar(id, motivo, condonar) {
  exigirAdmin_();
  var pedido = buscarPorId_('Pedidos', id);
  if (!pedido) {
    throw new Error('No encontré ese pedido.');
  }
  if (condonar && !String(motivo || '').trim()) {
    throw new Error('Escribe el motivo de la condonación.');
  }
  actualizar_('Pedidos', pedido, {
    condonado: condonar ? 'SI' : 'NO',
    motivo: condonar ? String(motivo) : '',
    actualizado: ahora_()
  });
  bitacora_(condonar ? 'pedido_condonado' : 'condonacion_revertida', id, { motivo: motivo });
  return true;
}

function apiMarcarEntregados(fecha) {
  exigirAdmin_();
  var f = String(fecha);
  var cuantos = 0;
  leerTodo_('Pedidos').forEach(function (p) {
    if (textoFecha_(p.fecha) === f && String(p.estado) === 'confirmado') {
      actualizar_('Pedidos', p, { estado: 'entregado', actualizado: ahora_() });
      cuantos++;
    }
  });
  bitacora_('entrega_masiva', f, { pedidos: cuantos });
  return cuantos;
}

/* ------------------------------- ajustes ---------------------------------- */

function apiGuardarConfig(cambios) {
  exigirAdmin_();
  Object.keys(cambios).forEach(function (clave) {
    escribirConfig(clave, String(cambios[clave]));
  });
  bitacora_('config_actualizada', '', cambios);
  return configCompleta_();
}

function escaparHtml_(texto) {
  return String(texto)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
