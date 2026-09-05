/**
 * NutriApp · Fulcrum
 * Autenticación, sesiones y recuperación de contraseña.
 *
 * Apps Script no trae bcrypt, así que las contraseñas se guardan como
 * "salt:hash" en la columna PasswordHash, donde hash es SHA-256 aplicado
 * repetidamente sobre salt + contraseña. No es equivalente a bcrypt, pero
 * evita que una contraseña quede legible en la hoja de cálculo y hace costoso
 * probar contraseñas una por una.
 */

/** Vueltas de hash. Más vueltas encarecen un ataque por fuerza bruta. */
var VUELTAS_HASH = 5000;

/* ===================================================================
   HASH Y VERIFICACIÓN
   =================================================================== */

/**
 * Genera el valor que se guarda en la columna PasswordHash.
 * @param {string} password La contraseña en claro.
 * @param {string=} salt Sal existente; si se omite se genera una nueva.
 * @return {string} El texto "salt:hash".
 */
function generarHash_(password, salt) {
  var sal = salt || Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  var actual = sal + ':' + password;
  for (var i = 0; i < VUELTAS_HASH; i++) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, actual, Utilities.Charset.UTF_8);
    actual = bytesAHex_(bytes);
  }
  return sal + ':' + actual;
}

/**
 * Compara una contraseña en claro contra el valor guardado.
 * @param {string} password La contraseña que escribió la persona.
 * @param {string} guardado El contenido de la columna PasswordHash.
 * @return {boolean} true si coinciden.
 */
function verificarPassword_(password, guardado) {
  var texto = String(guardado || '');
  var separador = texto.indexOf(':');
  if (separador < 0) {
    return false;
  }
  var sal = texto.slice(0, separador);
  return generarHash_(password, sal) === texto;
}

/**
 * Convierte el arreglo de bytes que devuelve computeDigest a hexadecimal.
 * @param {Array<number>} bytes Los bytes con signo.
 * @return {string} La cadena hexadecimal.
 */
function bytesAHex_(bytes) {
  var salida = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    salida += (b < 16 ? '0' : '') + b.toString(16);
  }
  return salida;
}

/* ===================================================================
   SESIONES
   =================================================================== */

/**
 * Crea un token y lo registra en la pestaña Sesiones.
 * @param {Object} usuario La fila del usuario.
 * @param {string} tipo "sesion" o "recuperacion".
 * @return {string} El token generado.
 */
function crearToken_(usuario, tipo) {
  var horas = tipo === 'recuperacion' ? HORAS_RECUPERACION : HORAS_SESION;
  var token = Utilities.getUuid();
  agregarFila_('Sesiones', {
    Token: token,
    ID_Usuario: usuario.ID,
    Rol: usuario.Rol,
    Tipo: tipo,
    Expira: new Date(Date.now() + horas * 3600 * 1000)
  });
  return token;
}

/**
 * Valida un token de sesión y devuelve el usuario dueño.
 * Todas las funciones del API la usan antes de tocar datos.
 * @param {string} token El token que envió el navegador.
 * @param {string=} rolRequerido Si se indica, exige ese rol.
 * @return {Object} La fila del usuario.
 */
function requerirSesion_(token, rolRequerido) {
  var sesiones = leerTabla_('Sesiones');
  var ahora = new Date();
  var encontrada = null;

  for (var i = 0; i < sesiones.length; i++) {
    if (sesiones[i].Token === token && sesiones[i].Tipo === 'sesion') {
      encontrada = sesiones[i];
      break;
    }
  }

  if (!encontrada) {
    throw new Error('Tu sesión no es válida. Vuelve a entrar.');
  }
  if (new Date(encontrada.Expira) < ahora) {
    throw new Error('Tu sesión expiró. Vuelve a entrar.');
  }
  if (rolRequerido && encontrada.Rol !== rolRequerido) {
    throw new Error('No tienes permiso para esta operación.');
  }

  var usuario = buscarUsuarioPorId_(encontrada.ID_Usuario);
  if (!usuario) {
    throw new Error('El usuario de la sesión ya no existe.');
  }
  return usuario;
}

/**
 * Borra las sesiones vencidas. La instala setupTriggers() para correr a diario.
 */
function limpiarSesionesVencidas() {
  var hoja = hoja_('Sesiones');
  var sesiones = leerTabla_('Sesiones');
  var ahora = new Date();
  var borradas = 0;

  for (var i = sesiones.length - 1; i >= 0; i--) {
    if (new Date(sesiones[i].Expira) < ahora) {
      hoja.deleteRow(sesiones[i]._fila);
      borradas++;
    }
  }
  Logger.log('Sesiones vencidas borradas: ' + borradas);
  return borradas;
}

/* ===================================================================
   USUARIOS
   =================================================================== */

/**
 * Busca un usuario por correo, sin distinguir mayúsculas ni espacios.
 * @param {string} email El correo.
 * @return {Object|null} La fila del usuario o null.
 */
function buscarUsuarioPorEmail_(email) {
  var buscado = normalizarTexto_(email);
  var usuarios = leerTabla_('Usuarios');
  for (var i = 0; i < usuarios.length; i++) {
    if (normalizarTexto_(usuarios[i].Email) === buscado) {
      return usuarios[i];
    }
  }
  return null;
}

/**
 * Busca un usuario por su ID.
 * @param {string} id El identificador.
 * @return {Object|null} La fila del usuario o null.
 */
function buscarUsuarioPorId_(id) {
  var usuarios = leerTabla_('Usuarios');
  for (var i = 0; i < usuarios.length; i++) {
    if (String(usuarios[i].ID) === String(id)) {
      return usuarios[i];
    }
  }
  return null;
}

/**
 * Crea el usuario nutriólogo la primera vez, con una contraseña temporal.
 * El correo sale del dueño del script.
 * @return {Object} Datos del nutriólogo y, si es nuevo, su contraseña temporal.
 */
function crearNutriologoInicial_() {
  var email = Session.getEffectiveUser().getEmail();
  var existente = buscarUsuarioPorEmail_(email);
  if (existente) {
    return { email: existente.Email, nuevo: false };
  }

  var temporal = 'Nutri' + Math.floor(1000 + Math.random() * 9000) + '!';
  agregarFila_('Usuarios', {
    ID: nuevoId_('USR'),
    Email: email,
    PasswordHash: generarHash_(temporal),
    Rol: 'Nutriologo',
    Nombre: 'Nutriólogo',
    FechaRegistro: new Date(),
    Activo: 'SI'
  });
  return { email: email, nuevo: true, passwordTemporal: temporal };
}

/* ===================================================================
   API PÚBLICA DE AUTENTICACIÓN
   =================================================================== */

/**
 * Valida credenciales y abre sesión.
 * @param {string} email El correo.
 * @param {string} password La contraseña.
 * @return {Object} Token, rol, nombre e ID del usuario.
 */
function loginUser(email, password) {
  if (!email || !password) {
    throw new Error('Escribe tu correo y tu contraseña.');
  }

  var usuario = buscarUsuarioPorEmail_(email);
  if (!usuario || !verificarPassword_(password, usuario.PasswordHash)) {
    Utilities.sleep(600);
    throw new Error('Correo o contraseña incorrectos.');
  }
  if (String(usuario.Activo).toUpperCase() === 'NO') {
    throw new Error('Tu cuenta está desactivada. Contacta a tu nutriólogo.');
  }

  return {
    token: crearToken_(usuario, 'sesion'),
    rol: usuario.Rol,
    nombre: usuario.Nombre,
    idUsuario: usuario.ID,
    email: usuario.Email
  };
}

/**
 * Cierra la sesión borrando el token.
 * @param {string} token El token activo.
 * @return {Object} Confirmación.
 */
function logoutUser(token) {
  var hoja = hoja_('Sesiones');
  var sesiones = leerTabla_('Sesiones');
  for (var i = sesiones.length - 1; i >= 0; i--) {
    if (sesiones[i].Token === token) {
      hoja.deleteRow(sesiones[i]._fila);
    }
  }
  return { ok: true };
}

/**
 * Envía por correo un enlace con token temporal para restablecer la contraseña.
 * Responde igual exista o no el correo, para no revelar quién está registrado.
 * @param {string} email El correo capturado.
 * @return {Object} Mensaje neutro para mostrar en pantalla.
 */
function recoverPassword(email) {
  var respuesta = {
    ok: true,
    mensaje: 'Si el correo está registrado, en un momento llegará el mensaje con las instrucciones.'
  };

  var usuario = buscarUsuarioPorEmail_(email);
  if (!usuario) {
    return respuesta;
  }

  var token = crearToken_(usuario, 'recuperacion');
  var url = ScriptApp.getService().getUrl() + '?recuperar=' + token;

  GmailApp.sendEmail(usuario.Email, 'NutriApp · Restablecer tu contraseña', armarTextoRecuperacion_(usuario, token), {
    name: 'NutriApp',
    htmlBody: armarHtmlRecuperacion_(usuario, token, url)
  });

  return respuesta;
}

/**
 * Cambia la contraseña usando el token que llegó por correo.
 * @param {string} token El token de recuperación.
 * @param {string} passwordNueva La contraseña nueva.
 * @return {Object} Confirmación.
 */
function resetPassword(token, passwordNueva) {
  if (!passwordNueva || String(passwordNueva).length < 8) {
    throw new Error('La contraseña nueva necesita al menos 8 caracteres.');
  }

  var sesiones = leerTabla_('Sesiones');
  var valida = null;
  for (var i = 0; i < sesiones.length; i++) {
    if (sesiones[i].Token === token && sesiones[i].Tipo === 'recuperacion') {
      valida = sesiones[i];
      break;
    }
  }

  if (!valida || new Date(valida.Expira) < new Date()) {
    throw new Error('El enlace ya no sirve. Pide uno nuevo desde "Olvidé mi contraseña".');
  }

  var usuario = buscarUsuarioPorId_(valida.ID_Usuario);
  if (!usuario) {
    throw new Error('El usuario ya no existe.');
  }

  actualizarFila_('Usuarios', usuario._fila, { PasswordHash: generarHash_(passwordNueva) });
  hoja_('Sesiones').deleteRow(valida._fila);

  return { ok: true, mensaje: 'Contraseña actualizada. Ya puedes entrar con ella.' };
}

/**
 * Cambia la contraseña de quien tiene la sesión abierta.
 * @param {string} token El token de sesión.
 * @param {string} actual La contraseña vigente.
 * @param {string} nueva La contraseña nueva.
 * @return {Object} Confirmación.
 */
function cambiarPassword(token, actual, nueva) {
  var usuario = requerirSesion_(token);
  if (!verificarPassword_(actual, usuario.PasswordHash)) {
    throw new Error('La contraseña actual no coincide.');
  }
  if (!nueva || String(nueva).length < 8) {
    throw new Error('La contraseña nueva necesita al menos 8 caracteres.');
  }
  actualizarFila_('Usuarios', usuario._fila, { PasswordHash: generarHash_(nueva) });
  return { ok: true, mensaje: 'Contraseña actualizada.' };
}

/**
 * Da de alta un paciente. Solo el nutriólogo puede llamarla.
 * @param {string} token El token de sesión del nutriólogo.
 * @param {Object} datos Nombre, email, y opcionalmente estatura, sexo y fecha de nacimiento.
 * @return {Object} El paciente creado y su contraseña temporal.
 */
function crearPaciente(token, datos) {
  requerirSesion_(token, 'Nutriologo');

  if (!datos || !datos.email || !datos.nombre) {
    throw new Error('Hacen falta el nombre y el correo del paciente.');
  }
  if (buscarUsuarioPorEmail_(datos.email)) {
    throw new Error('Ya hay una cuenta con ese correo.');
  }

  var temporal = 'Nutri' + Math.floor(100000 + Math.random() * 900000);
  var id = nuevoId_('PAC');

  agregarFila_('Usuarios', {
    ID: id,
    Email: String(datos.email).trim(),
    PasswordHash: generarHash_(temporal),
    Rol: 'Paciente',
    Nombre: String(datos.nombre).trim(),
    FechaRegistro: new Date(),
    Activo: 'SI'
  });

  agregarFila_('Config_Paciente', {
    ID_Paciente: id,
    CaloriasObjetivo: META_CALORICA_BASE,
    ProteinaObjetivo_g: '',
    FactorActividad: aNumero_(datos.factorActividad) || 1.375,
    Estatura_cm: aNumero_(datos.estatura) || '',
    FechaNacimiento: datos.fechaNacimiento || '',
    Sexo: datos.sexo || '',
    AjusteManual: 'NO',
    FechaActualizacion: new Date(),
    ActualizadoPor: 'Alta inicial'
  });

  try {
    GmailApp.sendEmail(datos.email, 'NutriApp · Tu acceso', armarTextoBienvenida_(datos.nombre, datos.email, temporal), {
      name: 'NutriApp',
      htmlBody: armarHtmlBienvenida_(datos.nombre, datos.email, temporal)
    });
  } catch (err) {
    Logger.log('No se pudo enviar el correo de bienvenida: ' + err.message);
  }

  return { ok: true, idPaciente: id, passwordTemporal: temporal };
}

/* ===================================================================
   PLANTILLAS DE CORREO
   =================================================================== */

/**
 * Versión en texto plano del correo de recuperación.
 * @param {Object} usuario El destinatario.
 * @param {string} token El token temporal.
 * @return {string} El cuerpo del correo.
 */
function armarTextoRecuperacion_(usuario, token) {
  return 'Hola ' + usuario.Nombre + ',\n\n' +
    'Recibimos una solicitud para restablecer tu contraseña de NutriApp.\n\n' +
    'Tu código temporal es: ' + token + '\n\n' +
    'Cópialo en la pantalla de "Olvidé mi contraseña" de la aplicación. ' +
    'Vence en ' + HORAS_RECUPERACION + ' horas.\n\n' +
    'Si no fuiste tú, ignora este mensaje: tu contraseña sigue igual.';
}

/**
 * Versión HTML del correo de recuperación.
 * @param {Object} usuario El destinatario.
 * @param {string} token El token temporal.
 * @param {string} url La liga de la aplicación.
 * @return {string} El cuerpo HTML.
 */
function armarHtmlRecuperacion_(usuario, token, url) {
  return '' +
    '<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2933">' +
    '<div style="background:#1f6f4f;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">' +
    '<h1 style="margin:0;font-size:20px">NutriApp</h1>' +
    '<p style="margin:4px 0 0;opacity:.9;font-size:14px">Restablecer contraseña</p></div>' +
    '<div style="border:1px solid #e4e7eb;border-top:0;border-radius:0 0 12px 12px;padding:24px">' +
    '<p>Hola <strong>' + escaparHtml_(usuario.Nombre) + '</strong>,</p>' +
    '<p>Recibimos una solicitud para restablecer tu contraseña. Usa este código temporal:</p>' +
    '<p style="background:#f2f7f4;border:1px dashed #1f6f4f;border-radius:8px;padding:16px;text-align:center;' +
    'font-family:monospace;font-size:15px;letter-spacing:1px;word-break:break-all">' + escaparHtml_(token) + '</p>' +
    '<p style="text-align:center;margin:24px 0">' +
    '<a href="' + escaparHtml_(url) + '" style="background:#1f6f4f;color:#fff;text-decoration:none;' +
    'padding:12px 24px;border-radius:8px;display:inline-block">Abrir NutriApp</a></p>' +
    '<p style="font-size:13px;color:#6b7280">El código vence en ' + HORAS_RECUPERACION + ' horas. ' +
    'Si no pediste el cambio, ignora este correo: tu contraseña sigue igual.</p>' +
    '</div></div>';
}

/**
 * Versión en texto plano del correo de bienvenida.
 * @param {string} nombre Nombre del paciente.
 * @param {string} email Su correo.
 * @param {string} temporal La contraseña temporal.
 * @return {string} El cuerpo del correo.
 */
function armarTextoBienvenida_(nombre, email, temporal) {
  return 'Hola ' + nombre + ',\n\n' +
    'Tu nutriólogo te dio de alta en NutriApp.\n\n' +
    'Usuario: ' + email + '\n' +
    'Contraseña temporal: ' + temporal + '\n\n' +
    'Entra y cámbiala desde el menú de tu perfil.';
}

/**
 * Versión HTML del correo de bienvenida.
 * @param {string} nombre Nombre del paciente.
 * @param {string} email Su correo.
 * @param {string} temporal La contraseña temporal.
 * @return {string} El cuerpo HTML.
 */
function armarHtmlBienvenida_(nombre, email, temporal) {
  return '' +
    '<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2933">' +
    '<div style="background:#1f6f4f;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">' +
    '<h1 style="margin:0;font-size:20px">NutriApp</h1>' +
    '<p style="margin:4px 0 0;opacity:.9;font-size:14px">Tu acceso está listo</p></div>' +
    '<div style="border:1px solid #e4e7eb;border-top:0;border-radius:0 0 12px 12px;padding:24px">' +
    '<p>Hola <strong>' + escaparHtml_(nombre) + '</strong>, tu nutriólogo te dio de alta.</p>' +
    '<table style="width:100%;border-collapse:collapse;margin:16px 0">' +
    '<tr><td style="padding:8px 0;color:#6b7280">Usuario</td>' +
    '<td style="padding:8px 0;text-align:right"><strong>' + escaparHtml_(email) + '</strong></td></tr>' +
    '<tr><td style="padding:8px 0;color:#6b7280">Contraseña temporal</td>' +
    '<td style="padding:8px 0;text-align:right;font-family:monospace"><strong>' + escaparHtml_(temporal) + '</strong></td></tr>' +
    '</table>' +
    '<p style="font-size:13px;color:#6b7280">Cámbiala en cuanto entres, desde el menú de tu perfil.</p>' +
    '</div></div>';
}

/**
 * Escapa texto para incrustarlo con seguridad en HTML.
 * @param {*} texto El texto original.
 * @return {string} El texto escapado.
 */
function escaparHtml_(texto) {
  return String(texto === undefined || texto === null ? '' : texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
