/**
 * TLTERMINALS · Almacén — control de acceso (RBAC).
 *
 * Tres perfiles, autenticados contra la pestaña USUARIOS:
 *   OPERATIVO       entra con PIN de 4 dígitos (rápido en tableta/celular).
 *   ADMINISTRADOR   entra con correo + contraseña.
 *   MASTER          entra con correo + contraseña; además administra usuarios.
 *
 * Al entrar se emite un token de sesión que el navegador guarda y reenvía en
 * cada llamada. ejecutar() lo fija en SESION_TOKEN al inicio de cada petición;
 * en Apps Script las globales viven solo lo que dura una ejecución, así que no
 * se mezclan entre usuarios.
 */

var SESION_TOKEN = '';

var JERARQUIA = { OPERATIVO: 1, ADMINISTRADOR: 2, MASTER: 3 };

/* --------------------------------- sesión ---------------------------------- */

/**
 * Emite un token de sesión para un usuario y lo guarda con su vencimiento.
 * @private
 */
function abrirSesion_(usuario) {
  var horas = Number(leerConfig('horasSesion')) || 12;
  var token = nuevoToken_();
  insertar_('SESIONES', {
    token: token,
    usuarioId: usuario.id,
    creado: ahora_(),
    expira: new Date(Date.now() + horas * 3600 * 1000).getTime()
  });
  return token;
}

/**
 * Usuario detrás del token de la llamada actual, o null si no hay sesión válida.
 * De paso limpia la sesión si ya venció.
 * @private
 */
function usuarioActual_() {
  if (!SESION_TOKEN) {
    return null;
  }
  var token = String(SESION_TOKEN).trim();
  var sesion = buscar_('SESIONES', function (s) {
    return String(s.token).trim() === token;
  });
  if (!sesion) {
    return null;
  }
  if (Number(sesion.expira) && Date.now() > Number(sesion.expira)) {
    borrar_('SESIONES', sesion);
    return null;
  }
  var usuario = buscarPorId_('USUARIOS', sesion.usuarioId);
  if (!usuario || String(usuario.estado) !== 'activo') {
    return null;
  }
  return usuarioParaCliente_(usuario);
}

function usuarioParaCliente_(u) {
  return {
    id: String(u.id),
    nombre: String(u.nombre),
    email: String(u.email || ''),
    rol: String(u.rol || 'OPERATIVO'),
    estado: String(u.estado || 'activo')
  };
}

function exigirSesion_() {
  var u = usuarioActual_();
  if (!u) {
    throw new Error('Tu sesión terminó. Vuelve a entrar.');
  }
  return u;
}

/** Exige un rol mínimo según la jerarquía OPERATIVO < ADMINISTRADOR < MASTER. */
function exigirRol_(rolMinimo) {
  var u = exigirSesion_();
  if ((JERARQUIA[u.rol] || 0) < (JERARQUIA[rolMinimo] || 99)) {
    throw new Error('No tienes permiso para esta acción.');
  }
  return u;
}

/* ----------------------------- lo que llama el login ----------------------- */

/**
 * Lista mínima de operativos para la pantalla de PIN: nombre e id, sin datos
 * sensibles. Así el operador solo toca su nombre y teclea su PIN.
 */
function apiOperativos() {
  return leerTodo_('USUARIOS')
    .filter(function (u) {
      return String(u.rol) === 'OPERATIVO' && String(u.estado) === 'activo';
    })
    .map(function (u) { return { id: String(u.id), nombre: String(u.nombre) }; })
    .sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
}

/** Entrada de operativo: id de la persona + su PIN de 4 dígitos. */
function apiEntrarPin(usuarioId, pin) {
  var u = buscarPorId_('USUARIOS', usuarioId);
  if (!u || String(u.rol) !== 'OPERATIVO' || String(u.estado) !== 'activo') {
    throw new Error('Ese operador no está disponible.');
  }
  var limpio = String(pin || '').trim();
  if (!/^\d{4}$/.test(limpio)) {
    throw new Error('El PIN son 4 dígitos.');
  }
  if (!u.pinHash || hashear_(limpio, u.salt) !== String(u.pinHash)) {
    throw new Error('PIN incorrecto.');
  }
  var token = abrirSesion_(u);
  auditar_('', u.nombre, 'login', 'PIN', '', '');
  return { token: token, usuario: usuarioParaCliente_(u) };
}

/** Entrada de administrador/master: correo + contraseña. */
function apiEntrarClave(email, clave) {
  var u = buscarUsuarioPorEmail_(email);
  if (!u || String(u.estado) !== 'activo'
      || (String(u.rol) !== 'ADMINISTRADOR' && String(u.rol) !== 'MASTER')) {
    throw new Error('Correo o contraseña incorrectos.');
  }
  if (!u.passHash || hashear_(String(clave || ''), u.salt) !== String(u.passHash)) {
    throw new Error('Correo o contraseña incorrectos.');
  }
  var token = abrirSesion_(u);
  auditar_('', u.nombre, 'login', 'clave', '', '');
  return { token: token, usuario: usuarioParaCliente_(u) };
}

/** Cierra la sesión actual. */
function apiSalir() {
  if (SESION_TOKEN) {
    var token = String(SESION_TOKEN).trim();
    var sesion = buscar_('SESIONES', function (s) {
      return String(s.token).trim() === token;
    });
    if (sesion) {
      borrar_('SESIONES', sesion);
    }
  }
  return true;
}

/* ------------------------------- bitácora ---------------------------------- */

/**
 * Deja constancia en LOG_AUDITORIA. El MASTER lo consulta para saber quién
 * cambió qué, con el valor anterior y el nuevo.
 * @private
 */
function auditar_(folio, usuario, accion, campo, anterior, nuevo) {
  insertar_('LOG_AUDITORIA', {
    id: nuevoId_(),
    folio: folio || '',
    usuario: usuario || 'sistema',
    accion: accion,
    campo: campo || '',
    valorAnterior: anterior === undefined || anterior === null ? '' : String(anterior),
    valorNuevo: nuevo === undefined || nuevo === null ? '' : String(nuevo),
    fechaHora: ahora_()
  });
}
