/**
 * TLTERMINALS · Almacén — administración del sistema (perfil MASTER).
 *
 * Gestión de usuarios y roles, reseteo de PIN, campos dinámicos del acta,
 * ajustes generales (umbrales de SLA) y consulta de la bitácora de auditoría.
 */

/* --------------------------------- usuarios -------------------------------- */

/** Lista de usuarios para el panel del MASTER. */
function apiUsuarios() {
  exigirRol_('MASTER');
  return leerTodo_('USUARIOS')
    .map(function (u) {
      return {
        id: String(u.id),
        nombre: String(u.nombre),
        email: String(u.email || ''),
        rol: String(u.rol),
        estado: String(u.estado),
        tienePin: !!u.pinHash,
        tieneClave: !!u.passHash,
        creado: String(u.creado || '')
      };
    })
    .sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
}

/**
 * Alta o edición de usuario. Reglas:
 *   OPERATIVO      necesita PIN de 4 dígitos (al crear o si se cambia).
 *   ADMINISTRADOR / MASTER  necesitan correo y contraseña (al crear).
 */
function apiGuardarUsuario(datos) {
  var actor = exigirRol_('MASTER');
  datos = datos || {};
  var nombre = String(datos.nombre || '').trim();
  var rol = String(datos.rol || '').trim();
  if (!nombre) {
    throw new Error('El nombre no puede ir vacío.');
  }
  if (['OPERATIVO', 'ADMINISTRADOR', 'MASTER'].indexOf(rol) === -1) {
    throw new Error('Rol no válido.');
  }
  var email = String(datos.email || '').toLowerCase().trim();
  if (rol !== 'OPERATIVO' && !email) {
    throw new Error('Administrador y Master necesitan correo.');
  }

  var existentePorEmail = email ? buscarUsuarioPorEmail_(email) : null;

  if (datos.id) {
    var u = buscarPorId_('USUARIOS', datos.id);
    if (!u) {
      throw new Error('No encontré a ese usuario.');
    }
    if (existentePorEmail && String(existentePorEmail.id) !== String(u.id)) {
      throw new Error('Ese correo ya lo usa otro usuario.');
    }
    var cambios = { nombre: nombre, rol: rol, email: email };
    if (datos.pin) {
      exigirPinValido_(datos.pin);
      cambios.pinHash = hashear_(String(datos.pin), u.salt);
    }
    if (datos.clave) {
      cambios.passHash = hashear_(String(datos.clave), u.salt);
    }
    actualizar_('USUARIOS', u, cambios);
    auditar_('', actor.nombre, 'usuario_editar', 'usuario', u.nombre, nombre);
    return true;
  }

  if (existentePorEmail) {
    throw new Error('Ya existe un usuario con ese correo.');
  }
  var sal = nuevoToken_();
  var nuevo = {
    id: nuevoId_(),
    nombre: nombre,
    email: email,
    pinHash: '',
    passHash: '',
    salt: sal,
    rol: rol,
    estado: 'activo',
    creado: ahora_()
  };
  if (rol === 'OPERATIVO') {
    exigirPinValido_(datos.pin);
    nuevo.pinHash = hashear_(String(datos.pin), sal);
  } else {
    if (!datos.clave) {
      throw new Error('Asigna una contraseña para el usuario.');
    }
    nuevo.passHash = hashear_(String(datos.clave), sal);
  }
  insertar_('USUARIOS', nuevo);
  auditar_('', actor.nombre, 'usuario_alta', 'usuario', '', nombre + ' (' + rol + ')');
  return true;
}

/** Activa o desactiva un usuario. No se permite dejar al sistema sin MASTER. */
function apiCambiarEstadoUsuario(id, activo) {
  var actor = exigirRol_('MASTER');
  var u = buscarPorId_('USUARIOS', id);
  if (!u) {
    throw new Error('No encontré a ese usuario.');
  }
  if (!activo && String(u.rol) === 'MASTER') {
    var mastersActivos = leerTodo_('USUARIOS').filter(function (x) {
      return String(x.rol) === 'MASTER' && String(x.estado) === 'activo';
    });
    if (mastersActivos.length <= 1) {
      throw new Error('No puedes desactivar al único Master activo.');
    }
  }
  actualizar_('USUARIOS', u, { estado: activo ? 'activo' : 'inactivo' });
  auditar_('', actor.nombre, 'usuario_estado', u.nombre,
    String(u.estado), activo ? 'activo' : 'inactivo');
  return true;
}

/** Resetea el PIN de un operativo. */
function apiResetPin(id, pin) {
  var actor = exigirRol_('MASTER');
  var u = buscarPorId_('USUARIOS', id);
  if (!u || String(u.rol) !== 'OPERATIVO') {
    throw new Error('Ese usuario no es operativo.');
  }
  exigirPinValido_(pin);
  actualizar_('USUARIOS', u, { pinHash: hashear_(String(pin), u.salt) });
  auditar_('', actor.nombre, 'reset_pin', u.nombre, '', '****');
  return true;
}

function exigirPinValido_(pin) {
  if (!/^\d{4}$/.test(String(pin || ''))) {
    throw new Error('El PIN son 4 dígitos.');
  }
}

/* ------------------------------ campos dinámicos --------------------------- */

/** Campos dinámicos (todos, para el panel del MASTER). */
function apiCamposCustom() {
  exigirRol_('MASTER');
  return leerTodo_('CAMPOS_CUSTOM')
    .sort(function (a, b) { return (Number(a.orden) || 0) - (Number(b.orden) || 0); })
    .map(function (c) {
      return {
        id: String(c.id),
        clave: String(c.clave),
        etiqueta: String(c.etiqueta),
        tipo: String(c.tipo || 'texto'),
        opciones: String(c.opciones || ''),
        orden: Number(c.orden) || 0,
        activo: esSi_(c.activo)
      };
    });
}

/**
 * Crea o edita un campo dinámico del acta. La 'clave' se deriva de la etiqueta
 * y no cambia una vez creada, para no perder los valores ya guardados.
 */
function apiGuardarCampoCustom(datos) {
  var actor = exigirRol_('MASTER');
  datos = datos || {};
  var etiqueta = String(datos.etiqueta || '').trim();
  if (!etiqueta) {
    throw new Error('La etiqueta no puede ir vacía.');
  }
  var tipo = String(datos.tipo || 'texto');
  if (['texto', 'numero', 'lista', 'siNo'].indexOf(tipo) === -1) {
    throw new Error('Tipo de campo no válido.');
  }

  if (datos.id) {
    var c = buscarPorId_('CAMPOS_CUSTOM', datos.id);
    if (!c) {
      throw new Error('No encontré ese campo.');
    }
    actualizar_('CAMPOS_CUSTOM', c, {
      etiqueta: etiqueta,
      tipo: tipo,
      opciones: String(datos.opciones || ''),
      orden: Number(datos.orden) || c.orden || 0,
      activo: datos.activo === false ? 'NO' : 'SI'
    });
    auditar_('', actor.nombre, 'campo_editar', String(c.clave), '', etiqueta);
    return true;
  }

  var clave = 'c_' + etiqueta.toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (buscar_('CAMPOS_CUSTOM', function (x) { return String(x.clave) === clave; })) {
    clave = clave + '_' + nuevoId_().substring(0, 4);
  }
  insertar_('CAMPOS_CUSTOM', {
    id: nuevoId_(),
    clave: clave,
    etiqueta: etiqueta,
    tipo: tipo,
    opciones: String(datos.opciones || ''),
    orden: Number(datos.orden) || (leerTodo_('CAMPOS_CUSTOM').length + 1),
    activo: 'SI'
  });
  auditar_('', actor.nombre, 'campo_alta', clave, '', etiqueta);
  return true;
}

function apiCambiarCampoCustom(id, activo) {
  var actor = exigirRol_('MASTER');
  var c = buscarPorId_('CAMPOS_CUSTOM', id);
  if (!c) {
    throw new Error('No encontré ese campo.');
  }
  actualizar_('CAMPOS_CUSTOM', c, { activo: activo ? 'SI' : 'NO' });
  auditar_('', actor.nombre, 'campo_estado', String(c.clave),
    esSi_(c.activo) ? 'activo' : 'inactivo', activo ? 'activo' : 'inactivo');
  return true;
}

/* -------------------------------- auditoría -------------------------------- */

/** Últimos movimientos de la bitácora (los más recientes primero). */
function apiAuditoria(limite) {
  exigirRol_('MASTER');
  var n = Number(limite) || 200;
  var filas = leerTodo_('LOG_AUDITORIA');
  filas.sort(function (a, b) {
    return String(b.fechaHora).localeCompare(String(a.fechaHora));
  });
  return filas.slice(0, n).map(function (l) {
    return {
      folio: String(l.folio || ''),
      usuario: String(l.usuario || ''),
      accion: String(l.accion || ''),
      campo: String(l.campo || ''),
      valorAnterior: String(l.valorAnterior || ''),
      valorNuevo: String(l.valorNuevo || ''),
      fechaHora: String(l.fechaHora || '')
    };
  });
}

/* --------------------------------- ajustes --------------------------------- */

/** Guarda los umbrales de SLA y datos generales. */
function apiGuardarConfig(datos) {
  var actor = exigirRol_('MASTER');
  datos = datos || {};
  ['empresa', 'slaVerde', 'slaAmbar', 'horasSesion'].forEach(function (clave) {
    if (datos[clave] !== undefined) {
      escribirConfig(clave, String(datos[clave]));
    }
  });
  auditar_('', actor.nombre, 'config', 'ajustes', '', JSON.stringify(datos));
  return configCompleta_();
}
