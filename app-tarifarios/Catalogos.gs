/**
 * TLTERMINALS · Tarifarios — proveedores, rutas y los catálogos de tipo de
 * mercancía y tipo de equipo.
 */

/* ------------------------------- proveedores ------------------------------- */

function listaProveedores_() {
  return leerTodo_('Proveedores').map(function (p) {
    return {
      id: String(p.id),
      nombre: texto_(p.nombre),
      rfc: texto_(p.rfc),
      contacto: texto_(p.contacto),
      telefono: texto_(p.telefono),
      correo: texto_(p.correo),
      ciudad: texto_(p.ciudad),
      calificacion: numero_(p.calificacion, 0),
      estado: esSi_(p.estado) ? 'activo' : 'inactivo',
      notas: texto_(p.notas)
    };
  }).sort(function (a, b) { return a.nombre < b.nombre ? -1 : 1; });
}

function apiProveedores() {
  exigirSesion_();
  var conteo = {};
  leerTodo_('Tarifas').forEach(function (t) {
    var k = String(t.proveedorId);
    conteo[k] = (conteo[k] || 0) + 1;
  });
  return listaProveedores_().map(function (p) {
    p.tarifas = conteo[p.id] || 0;
    return p;
  });
}

/**
 * Da de alta o actualiza un transportista.
 * @param {Object} datos Campos del proveedor. Con id, actualiza.
 * @return {string} Id del proveedor.
 */
function apiGuardarProveedor(datos) {
  exigirAdmin_();
  var nombre = texto_(datos.nombre);
  if (!nombre) {
    throw new Error('El proveedor necesita nombre.');
  }
  var calificacion = numero_(datos.calificacion, 0);
  if (calificacion < 0 || calificacion > 5) {
    throw new Error('La calificación va de 0 a 5.');
  }

  var campos = {
    nombre: nombre,
    rfc: texto_(datos.rfc).toUpperCase(),
    contacto: texto_(datos.contacto),
    telefono: texto_(datos.telefono),
    correo: texto_(datos.correo).toLowerCase(),
    ciudad: texto_(datos.ciudad),
    calificacion: calificacion,
    estado: datos.estado === 'inactivo' ? 'inactivo' : 'activo',
    notas: texto_(datos.notas)
  };

  var existente = datos.id ? buscarPorId_('Proveedores', datos.id) : null;
  var homonimo = proveedorPorNombre_(nombre);
  if (homonimo && (!existente || String(homonimo.id) !== String(existente.id))) {
    throw new Error('Ya hay un proveedor que se llama "' + nombre + '".');
  }

  if (existente) {
    actualizar_('Proveedores', existente, campos);
    bitacora_('proveedor_actualizado', existente.id, campos);
    return String(existente.id);
  }
  campos.id = nuevoId_();
  campos.creado = ahora_();
  insertar_('Proveedores', campos);
  bitacora_('proveedor_alta', campos.id, { nombre: nombre });
  return campos.id;
}

/**
 * Borra un proveedor. Si tiene tarifas capturadas no se borra: se desactiva,
 * para no dejar tarifas huérfanas ni perder el histórico de precios.
 */
function apiBorrarProveedor(id) {
  exigirAdmin_();
  var fila = buscarPorId_('Proveedores', id);
  if (!fila) {
    throw new Error('No encuentro ese proveedor.');
  }
  var conTarifas = leerTodo_('Tarifas').filter(function (t) {
    return String(t.proveedorId) === String(id);
  }).length;
  if (conTarifas) {
    actualizar_('Proveedores', fila, { estado: 'inactivo' });
    bitacora_('proveedor_desactivado', id, { tarifas: conTarifas });
    return { borrado: false, desactivado: true, tarifas: conTarifas };
  }
  borrar_('Proveedores', fila);
  bitacora_('proveedor_borrado', id, { nombre: texto_(fila.nombre) });
  return { borrado: true, desactivado: false, tarifas: 0 };
}

function proveedorPorNombre_(nombre) {
  var buscado = normalizar_(nombre);
  if (!buscado) {
    return null;
  }
  return buscar_('Proveedores', function (p) {
    return normalizar_(p.nombre) === buscado
      || (normalizar_(p.rfc) !== '' && normalizar_(p.rfc) === buscado);
  });
}

/**
 * Devuelve el id del proveedor, dándolo de alta si no existía. Lo usa la
 * importación: un tarifario nuevo suele traer transportistas nuevos.
 * @private
 */
function proveedorSiFalta_(nombre, crear) {
  var fila = proveedorPorNombre_(nombre);
  if (fila) {
    return String(fila.id);
  }
  if (!crear) {
    return '';
  }
  var id = nuevoId_();
  insertar_('Proveedores', {
    id: id, nombre: texto_(nombre), rfc: '', contacto: '', telefono: '',
    correo: '', ciudad: '', calificacion: 0, estado: 'activo',
    notas: 'Alta automática al importar', creado: ahora_()
  });
  return id;
}

/* ---------------------------------- rutas ---------------------------------- */

function listaRutas_() {
  return leerTodo_('Rutas').map(function (r) {
    return {
      id: String(r.id),
      origen: texto_(r.origen),
      destino: texto_(r.destino),
      nombre: texto_(r.origen) + ' → ' + texto_(r.destino),
      km: numero_(r.km, 0),
      notas: texto_(r.notas),
      estado: esSi_(r.estado) ? 'activo' : 'inactivo'
    };
  }).sort(function (a, b) { return a.nombre < b.nombre ? -1 : 1; });
}

function apiRutas() {
  exigirSesion_();
  var conteo = {};
  leerTodo_('Tarifas').forEach(function (t) {
    var k = String(t.rutaId);
    conteo[k] = (conteo[k] || 0) + 1;
  });
  return listaRutas_().map(function (r) {
    r.tarifas = conteo[r.id] || 0;
    return r;
  });
}

function apiGuardarRuta(datos) {
  exigirAdmin_();
  var origen = texto_(datos.origen);
  var destino = texto_(datos.destino);
  if (!origen || !destino) {
    throw new Error('La ruta necesita origen y destino.');
  }
  var campos = {
    origen: origen,
    destino: destino,
    km: numero_(datos.km, 0),
    notas: texto_(datos.notas),
    estado: datos.estado === 'inactivo' ? 'inactivo' : 'activo'
  };

  var existente = datos.id ? buscarPorId_('Rutas', datos.id) : null;
  var homonima = rutaPorExtremos_(origen, destino);
  if (homonima && (!existente || String(homonima.id) !== String(existente.id))) {
    throw new Error('Ya existe la ruta ' + origen + ' → ' + destino + '.');
  }

  if (existente) {
    actualizar_('Rutas', existente, campos);
    bitacora_('ruta_actualizada', existente.id, campos);
    return String(existente.id);
  }
  campos.id = nuevoId_();
  campos.creado = ahora_();
  insertar_('Rutas', campos);
  bitacora_('ruta_alta', campos.id, { origen: origen, destino: destino });
  return campos.id;
}

function apiBorrarRuta(id) {
  exigirAdmin_();
  var fila = buscarPorId_('Rutas', id);
  if (!fila) {
    throw new Error('No encuentro esa ruta.');
  }
  var conTarifas = leerTodo_('Tarifas').filter(function (t) {
    return String(t.rutaId) === String(id);
  }).length;
  if (conTarifas) {
    actualizar_('Rutas', fila, { estado: 'inactivo' });
    bitacora_('ruta_desactivada', id, { tarifas: conTarifas });
    return { borrado: false, desactivado: true, tarifas: conTarifas };
  }
  borrar_('Rutas', fila);
  bitacora_('ruta_borrada', id, { origen: texto_(fila.origen), destino: texto_(fila.destino) });
  return { borrado: true, desactivado: false, tarifas: 0 };
}

function rutaPorExtremos_(origen, destino) {
  var o = normalizar_(origen);
  var d = normalizar_(destino);
  if (!o || !d) {
    return null;
  }
  return buscar_('Rutas', function (r) {
    return normalizar_(r.origen) === o && normalizar_(r.destino) === d;
  });
}

/** Igual que proveedorSiFalta_, pero para rutas. @private */
function rutaSiFalta_(origen, destino, crear, km) {
  var fila = rutaPorExtremos_(origen, destino);
  if (fila) {
    return String(fila.id);
  }
  if (!crear) {
    return '';
  }
  var id = nuevoId_();
  insertar_('Rutas', {
    id: id, origen: texto_(origen), destino: texto_(destino),
    km: numero_(km, 0), notas: 'Alta automática al importar',
    estado: 'activo', creado: ahora_()
  });
  return id;
}

/* -------------------------- mercancías y equipos --------------------------- */

/**
 * Los dos catálogos que describen "de qué tipo es este viaje": qué se mueve y
 * en qué se mueve.
 * @return {Object} {mercancia: [...], equipo: [...]}
 * @private
 */
function catalogos_() {
  var salida = { mercancia: [], equipo: [] };
  leerTodo_('Catalogos').forEach(function (c) {
    var tipo = String(c.tipo);
    if (!salida[tipo]) {
      return;
    }
    salida[tipo].push({
      id: String(c.id),
      clave: texto_(c.clave),
      nombre: texto_(c.nombre) || texto_(c.clave),
      orden: numero_(c.orden, 99),
      estado: esSi_(c.estado) ? 'activo' : 'inactivo'
    });
  });
  Object.keys(salida).forEach(function (tipo) {
    salida[tipo].sort(function (a, b) {
      if (a.orden !== b.orden) {
        return a.orden - b.orden;
      }
      return a.nombre < b.nombre ? -1 : 1;
    });
  });
  return salida;
}

function apiCatalogos() {
  exigirSesion_();
  return catalogos_();
}

function apiGuardarCatalogo(datos) {
  exigirAdmin_();
  var tipo = String(datos.tipo);
  if (tipo !== 'mercancia' && tipo !== 'equipo') {
    throw new Error('El catálogo solo puede ser de mercancía o de equipo.');
  }
  var nombre = texto_(datos.nombre);
  if (!nombre) {
    throw new Error('Ponle nombre.');
  }
  var clave = normalizar_(datos.clave || nombre);
  if (!clave) {
    throw new Error('La clave no puede quedar vacía.');
  }

  var campos = {
    tipo: tipo,
    clave: clave,
    nombre: nombre,
    orden: numero_(datos.orden, 99),
    estado: datos.estado === 'inactivo' ? 'inactivo' : 'activo'
  };

  var existente = datos.id ? buscarPorId_('Catalogos', datos.id) : null;
  var homonimo = buscarCatalogo_(tipo, clave);
  if (homonimo && (!existente || String(homonimo.id) !== String(existente.id))) {
    throw new Error('Ya existe "' + nombre + '" en ese catálogo.');
  }

  if (existente) {
    var claveVieja = texto_(existente.clave);
    actualizar_('Catalogos', existente, campos);
    if (claveVieja !== clave) {
      renombrarEnTarifas_(tipo, claveVieja, clave);
    }
    bitacora_('catalogo_actualizado', existente.id, campos);
    return String(existente.id);
  }
  campos.id = nuevoId_();
  insertar_('Catalogos', campos);
  bitacora_('catalogo_alta', campos.id, campos);
  return campos.id;
}

function apiBorrarCatalogo(id) {
  exigirAdmin_();
  var fila = buscarPorId_('Catalogos', id);
  if (!fila) {
    throw new Error('No encuentro ese registro del catálogo.');
  }
  var campo = String(fila.tipo) === 'equipo' ? 'equipo' : 'mercancia';
  var enUso = leerTodo_('Tarifas').filter(function (t) {
    return normalizar_(t[campo]) === normalizar_(fila.clave);
  }).length;
  if (enUso) {
    actualizar_('Catalogos', fila, { estado: 'inactivo' });
    bitacora_('catalogo_desactivado', id, { tarifas: enUso });
    return { borrado: false, desactivado: true, tarifas: enUso };
  }
  borrar_('Catalogos', fila);
  bitacora_('catalogo_borrado', id, { nombre: texto_(fila.nombre) });
  return { borrado: true, desactivado: false, tarifas: 0 };
}

/** Cuando cambia una clave del catálogo, las tarifas la siguen. @private */
function renombrarEnTarifas_(tipo, claveVieja, claveNueva) {
  var campo = tipo === 'equipo' ? 'equipo' : 'mercancia';
  leerTodo_('Tarifas').forEach(function (t) {
    if (normalizar_(t[campo]) === normalizar_(claveVieja)) {
      var cambios = {};
      cambios[campo] = claveNueva;
      actualizar_('Tarifas', t, cambios);
    }
  });
}

/**
 * Traduce lo que escribió alguien —"Full", "full", "Doble remolque"— a la clave
 * del catálogo. Devuelve '' si no reconoce nada.
 * @param {string} tipo 'mercancia' o 'equipo'.
 * @param {string} valor Clave o nombre.
 * @param {boolean} crear Si sí, da de alta lo que no exista.
 * @return {string} La clave del catálogo.
 * @private
 */
function claveCatalogo_(tipo, valor, crear) {
  var buscado = normalizar_(valor);
  if (!buscado) {
    return '';
  }
  var fila = buscar_('Catalogos', function (c) {
    return String(c.tipo) === tipo
      && (normalizar_(c.clave) === buscado || normalizar_(c.nombre) === buscado);
  });
  if (fila) {
    return texto_(fila.clave);
  }
  if (!crear) {
    return '';
  }
  insertar_('Catalogos', {
    id: nuevoId_(), tipo: tipo, clave: buscado, nombre: texto_(valor),
    orden: 99, estado: 'activo'
  });
  return buscado;
}

/** Nombre bonito de una clave del catálogo, para las tablas. @private */
function nombreCatalogo_(tipo, clave) {
  var fila = buscarCatalogo_(tipo, clave);
  return fila ? texto_(fila.nombre) : texto_(clave);
}
