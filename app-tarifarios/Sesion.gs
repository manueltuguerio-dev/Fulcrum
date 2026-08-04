/**
 * TLTERMINALS · Tarifarios — quién entra, qué puede hacer y ajustes generales.
 */

/**
 * Token de la persona que hizo esta llamada. Lo fija ejecutar() al inicio de
 * cada petición; en Apps Script las variables globales viven solo lo que dura
 * una ejecución, así que no se mezclan entre usuarios.
 */
var SESION_TOKEN = '';

/**
 * Identifica a quien está usando la aplicación, por dos caminos:
 *
 *   1. Su liga personal, que trae un token. Es lo que permite entrar con
 *      correos externos —un transportista, un agente aduanal, quien sea.
 *   2. Su sesión de Google, cuando pertenece al mismo dominio de Workspace
 *      que la cuenta que publicó. Ahí no hace falta liga personal.
 *
 * @return {Object|null} Datos de la persona, o null si no se pudo identificar.
 */
function usuarioActual_() {
  var usuario = null;

  if (SESION_TOKEN) {
    var buscado = String(SESION_TOKEN).trim();
    usuario = buscar_('Usuarios', function (f) {
      return String(f.token).trim() !== '' && String(f.token).trim() === buscado;
    });
    if (!usuario) {
      return { email: '', registrado: false, tokenInvalido: true };
    }
  }

  var correo = '';
  if (!usuario) {
    try {
      correo = Session.getActiveUser().getEmail();
    } catch (err) {
      correo = '';
    }
    if (!correo) {
      return null;
    }
    usuario = buscarUsuarioPorEmail_(correo);
  }

  if (!usuario) {
    return { email: correo, registrado: false };
  }
  return {
    email: String(usuario.email),
    registrado: true,
    id: String(usuario.id),
    nombre: String(usuario.nombre),
    rol: String(usuario.rol || 'consulta'),
    estado: String(usuario.estado || 'activo')
  };
}

function exigirSesion_() {
  var u = usuarioActual_();
  if (u && u.tokenInvalido) {
    throw new Error('Tu liga de acceso ya no es válida. Pídele al administrador que te la reenvíe.');
  }
  if (!u || !u.registrado) {
    throw new Error('Tu correo no está dado de alta en los tarifarios. Pídele al administrador que te registre.');
  }
  if (u.estado !== 'activo') {
    throw new Error('Tu cuenta está desactivada.');
  }
  return u;
}

/**
 * Quien puede cambiar datos: dar de alta proveedores, capturar tarifas,
 * importar. El rol "consulta" solo compara y exporta.
 * @private
 */
function exigirAdmin_() {
  var u = exigirSesion_();
  if (u.rol !== 'admin') {
    throw new Error('Esta acción es solo para el administrador de tarifarios.');
  }
  return u;
}

function ligaApp_() {
  try {
    return ScriptApp.getService().getUrl() || '';
  } catch (err) {
    return '';
  }
}

/* ------------------------------ estado inicial ----------------------------- */

/**
 * Todo lo que el navegador necesita para pintar la primera pantalla: quién es,
 * los catálogos y las rutas con tarifa vigente.
 * @return {Object}
 */
function apiEstadoInicial() {
  var u = usuarioActual_();
  if (!u) {
    return { sesion: false };
  }
  if (u.tokenInvalido) {
    return { sesion: true, tokenInvalido: true };
  }
  if (!u.registrado) {
    return { sesion: true, registrado: false, email: u.email };
  }
  if (u.estado !== 'activo') {
    return { sesion: true, registrado: true, activo: false, usuario: u };
  }

  return {
    sesion: true,
    registrado: true,
    activo: true,
    usuario: u,
    config: configCompleta_(),
    hoy: hoyTexto_(),
    catalogos: catalogos_(),
    campos: { tarifa: campos_('tarifa', false), proveedor: campos_('proveedor', false) },
    tipoCambio: tipoCambioDelDia_(false),
    proveedores: listaProveedores_(),
    rutas: listaRutas_(),
    resumen: resumenGeneral_()
  };
}

/**
 * Cifras de la portada: cuántos proveedores, rutas y tarifas hay, y cuántas
 * están por vencer.
 * @private
 */
function resumenGeneral_() {
  var hoy = hoyTexto_();
  var aviso = Number(leerConfig('diasAvisoVencimiento')) || 30;
  var limite = sumarDias_(hoy, aviso);
  var vigentes = 0;
  var porVencer = 0;
  var vencidas = 0;
  var sinTiempo = 0;

  leerTodo_('Tarifas').forEach(function (t) {
    if (!esSi_(t.estado)) {
      return;
    }
    if (numero_(t.tiempoHoras, 0) <= 0) {
      sinTiempo++;
    }
    var hasta = fecha_(t.vigenciaHasta);
    if (hasta && hasta < hoy) {
      vencidas++;
      return;
    }
    vigentes++;
    if (hasta && hasta <= limite) {
      porVencer++;
    }
  });

  return {
    proveedores: leerTodo_('Proveedores').filter(function (p) {
      return esSi_(p.estado);
    }).length,
    rutas: leerTodo_('Rutas').filter(function (r) { return esSi_(r.estado); }).length,
    tarifas: leerTodo_('Tarifas').length,
    vigentes: vigentes,
    porVencer: porVencer,
    vencidas: vencidas,
    sinTiempo: sinTiempo
  };
}

function sumarDias_(fechaTexto, dias) {
  var partes = String(fechaTexto).split('-');
  var d = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
  d.setDate(d.getDate() + dias);
  return Utilities.formatDate(d, zona_(), 'yyyy-MM-dd');
}

/* --------------------------------- usuarios -------------------------------- */

function apiUsuarios() {
  exigirAdmin_();
  var base = ligaApp_();
  return leerTodo_('Usuarios').map(function (u) {
    return {
      id: String(u.id), email: String(u.email), nombre: String(u.nombre),
      rol: String(u.rol), estado: String(u.estado),
      liga: (base && String(u.token)) ? base + '?t=' + String(u.token) : ''
    };
  });
}

/**
 * Da de alta o actualiza a quien puede entrar. Los correos externos necesitan
 * su liga personal; los del mismo dominio entran con su cuenta de Google.
 * @return {string} Id del usuario.
 */
function apiGuardarUsuario(datos) {
  exigirAdmin_();
  var email = String(datos.email || '').toLowerCase().trim();
  if (!email || email.indexOf('@') === -1) {
    throw new Error('Escribe un correo válido.');
  }
  var campos = {
    email: email,
    nombre: String(datos.nombre || email.split('@')[0]).trim(),
    rol: datos.rol === 'admin' ? 'admin' : 'consulta',
    estado: datos.estado === 'inactivo' ? 'inactivo' : 'activo'
  };

  var existente = datos.id ? buscarPorId_('Usuarios', datos.id) : buscarUsuarioPorEmail_(email);
  if (existente) {
    var otro = buscarUsuarioPorEmail_(email);
    if (otro && String(otro.id) !== String(existente.id)) {
      throw new Error('Ya hay otro usuario con ese correo.');
    }
    if (campos.rol !== 'admin' && String(existente.rol) === 'admin' && adminsActivos_() <= 1) {
      throw new Error('No puedes quitar al último administrador.');
    }
    if (campos.estado !== 'activo' && String(existente.rol) === 'admin' && adminsActivos_() <= 1) {
      throw new Error('No puedes desactivar al último administrador.');
    }
    actualizar_('Usuarios', existente, campos);
    bitacora_('usuario_actualizado', existente.id, campos);
    return String(existente.id);
  }

  campos.id = nuevoId_();
  campos.token = nuevoToken_();
  campos.creado = ahora_();
  insertar_('Usuarios', campos);
  bitacora_('usuario_alta', campos.id, { email: email, rol: campos.rol });
  return campos.id;
}

function apiBorrarUsuario(id) {
  exigirAdmin_();
  var fila = buscarPorId_('Usuarios', id);
  if (!fila) {
    throw new Error('No encuentro ese usuario.');
  }
  if (String(fila.rol) === 'admin' && adminsActivos_() <= 1) {
    throw new Error('No puedes borrar al último administrador.');
  }
  borrar_('Usuarios', fila);
  bitacora_('usuario_borrado', id, { email: String(fila.email) });
  return true;
}

/**
 * Imprime en el registro tu propia liga de acceso. Se ejecuta desde el editor y
 * es la manera de entrar la primera vez: quien instala queda como
 * administrador, pero sin esta liga no tiene por dónde pasar.
 *
 * @return {string} La liga, o cadena vacía si algo falta.
 */
function miLiga() {
  var correo = Session.getEffectiveUser().getEmail();
  var usuario = buscarUsuarioPorEmail_(correo);
  if (!usuario) {
    Logger.log('No encuentro a ' + correo + ' entre los usuarios. Ejecuta instalar() primero.');
    return '';
  }
  if (!String(usuario.token)) {
    actualizar_('Usuarios', usuario, { token: nuevoToken_() });
  }
  var base = ligaApp_();
  if (!base) {
    Logger.log('Todavía no publicas la aplicación web, así que no hay liga que armar.');
    Logger.log('Ve a Implementar > Nueva implementación > Aplicación web y vuelve a '
      + 'ejecutar miLiga().');
    Logger.log('Tu clave de acceso, para cuando la tengas: ' + String(usuario.token));
    return '';
  }
  var liga = base + '?t=' + String(usuario.token);
  Logger.log('');
  Logger.log('TU LIGA PERSONAL (ábrela en el navegador y guárdala en favoritos):');
  Logger.log(liga);
  Logger.log('');
  Logger.log('Es personal: quien la tenga entra como ' + String(usuario.email)
    + ' con rol ' + String(usuario.rol) + '.');
  return liga;
}

/**
 * Manda la liga personal por correo. Es lo que se usa para dar acceso a alguien
 * más sin tener que pasarle la clave por WhatsApp.
 * @param {string} id Id del usuario.
 * @return {Object} {enviado, correo, liga}
 */
function apiInvitar(id) {
  exigirAdmin_();
  var usuario = buscarPorId_('Usuarios', id);
  if (!usuario) {
    throw new Error('No encuentro ese usuario.');
  }
  var base = ligaApp_();
  if (!base) {
    throw new Error('Publica primero la aplicación web: la invitación necesita la liga.');
  }
  if (!String(usuario.token)) {
    actualizar_('Usuarios', usuario, { token: nuevoToken_() });
  }
  var liga = base + '?t=' + String(usuario.token);
  var empresa = leerConfig('empresa') || 'TLTERMINALS';

  try {
    MailApp.sendEmail({
      to: String(usuario.email),
      subject: 'Tarifarios ' + empresa + ' — tu acceso',
      htmlBody: '<p>Hola ' + escaparHtml_(String(usuario.nombre)) + ',</p>'
        + '<p>Ya tienes acceso a los tarifarios de transportistas de '
        + escaparHtml_(empresa) + '. Entra desde esta liga:</p>'
        + '<p><a href="' + liga + '">' + liga + '</a></p>'
        + '<p>Ahí puedes comparar transportistas por ruta y ver cuál conviene.</p>'
        + '<p><b>Esta liga es tuya y personal.</b> No la compartas: quien la tenga '
        + 'entra con tu nombre. Guárdala en favoritos para no tener que buscarla.</p>'
    });
  } catch (err) {
    // Sin cuota de correo o sin permiso: la liga sirve igual, se pasa a mano.
    bitacora_('invitacion_fallida', id, { error: err.message });
    return { enviado: false, correo: String(usuario.email), liga: liga, error: err.message };
  }

  bitacora_('invitacion_enviada', id, { correo: String(usuario.email) });
  return { enviado: true, correo: String(usuario.email), liga: liga };
}

function escaparHtml_(texto) {
  return String(texto === null || texto === undefined ? '' : texto)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Genera una liga personal nueva y anula la anterior. */
function apiRegenerarLiga(id) {
  exigirAdmin_();
  var fila = buscarPorId_('Usuarios', id);
  if (!fila) {
    throw new Error('No encuentro ese usuario.');
  }
  var base = ligaApp_();
  if (!base) {
    throw new Error('Publica primero la aplicación web: la liga sale de ahí.');
  }
  var token = nuevoToken_();
  actualizar_('Usuarios', fila, { token: token });
  bitacora_('liga_regenerada', id, { email: String(fila.email) });
  return base + '?t=' + token;
}

function adminsActivos_() {
  return leerTodo_('Usuarios').filter(function (u) {
    return String(u.rol) === 'admin' && String(u.estado) === 'activo';
  }).length;
}

/* --------------------------------- ajustes --------------------------------- */

function apiGuardarConfig(cambios) {
  exigirAdmin_();
  var permitidas = Object.keys(CONFIG_INICIAL);
  Object.keys(cambios).forEach(function (clave) {
    if (permitidas.indexOf(clave) === -1) {
      return;
    }
    escribirConfig(clave, String(cambios[clave]));
  });

  if (cambios.tipoCambioUSD !== undefined) {
    // Si alguien captura el tipo de cambio a mano, ese gana hasta que se vuelva
    // a consultar: se marca de dónde salió para que no haya dudas después.
    escribirConfig('tipoCambioOrigen', 'manual');
    escribirConfig('tipoCambioFecha', hoyTexto_());
  }

  // Los pesos del puntaje se guardan como porcentajes que suman 100.
  var precio = numero_(leerConfig('pesoPrecio'), 70);
  var tiempo = numero_(leerConfig('pesoTiempo'), 30);
  if (precio + tiempo !== 100) {
    var total = precio + tiempo;
    if (total <= 0) {
      precio = 70;
      tiempo = 30;
    } else {
      precio = redondear_(precio * 100 / total, 0);
      tiempo = 100 - precio;
    }
    escribirConfig('pesoPrecio', String(precio));
    escribirConfig('pesoTiempo', String(tiempo));
  }

  bitacora_('config_actualizada', '', cambios);
  return configCompleta_();
}
