/**
 * NutriApp · Fulcrum
 * Alertas por WhatsApp al nutriólogo mediante la Meta Cloud API.
 *
 * Las credenciales NO viven en este archivo: se leen de las propiedades del
 * script para que nunca terminen publicadas en el repositorio. Cárgalas una
 * sola vez con setupCredencialesWhatsApp() y bórrala después, o captúralas a
 * mano en Configuración del proyecto > Propiedades del script.
 *
 * Si las credenciales no están puestas, notificarConsultaWhatsApp() no falla:
 * lo registra en el log y la alerta viaja igual por correo.
 */

/** Nombres de las propiedades del script donde viven las credenciales. */
var WHATSAPP_TOKEN = 'WHATSAPP_TOKEN';
var PHONE_NUMBER_ID = 'WHATSAPP_PHONE_NUMBER_ID';
var NUTRIOLOGO_PHONE_NUMBER = 'NUTRIOLOGO_PHONE_NUMBER';

/** Versión de la Graph API contra la que se hace la petición. */
var META_API_VERSION = 'v18.0';

/**
 * Carga las credenciales una sola vez. Escribe tus valores, ejecútala desde el
 * editor y después vuelve a dejar los marcadores para no versionar secretos.
 */
function setupCredencialesWhatsApp() {
  var token = 'PEGA_AQUI_TU_TOKEN_PERMANENTE';
  var phoneId = 'PEGA_AQUI_TU_PHONE_NUMBER_ID';
  var telefonoNutriologo = '5215512345678';

  if (token.indexOf('PEGA_AQUI') === 0) {
    Logger.log('Todavía no cambiaste los valores. Edita esta función antes de ejecutarla.');
    return false;
  }

  PropertiesService.getScriptProperties().setProperties({
    WHATSAPP_TOKEN: token,
    WHATSAPP_PHONE_NUMBER_ID: phoneId,
    NUTRIOLOGO_PHONE_NUMBER: telefonoNutriologo
  });

  Logger.log('Credenciales guardadas. Ahora borra los valores de esta función y guarda el archivo.');
  return true;
}

/**
 * Comprueba si WhatsApp está configurado, sin revelar las credenciales.
 * @return {Object} Qué falta por configurar.
 */
function estadoWhatsApp() {
  var props = PropertiesService.getScriptProperties();
  var estado = {
    token: !!props.getProperty(WHATSAPP_TOKEN),
    phoneNumberId: !!props.getProperty(PHONE_NUMBER_ID),
    telefonoNutriologo: !!props.getProperty(NUTRIOLOGO_PHONE_NUMBER)
  };
  estado.listo = estado.token && estado.phoneNumberId && estado.telefonoNutriologo;
  Logger.log(estado.listo
    ? 'WhatsApp configurado.'
    : 'WhatsApp incompleto. Faltan: ' + Object.keys(estado).filter(function (k) {
        return k !== 'listo' && !estado[k];
      }).join(', '));
  return estado;
}

/**
 * Avisa al nutriólogo por WhatsApp que un paciente escribió en el chat.
 * @param {string} nombrePaciente El nombre del paciente.
 * @param {string} mensaje Lo que escribió.
 * @return {Object} Si se envió, y el motivo cuando no.
 */
function notificarConsultaWhatsApp(nombrePaciente, mensaje) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty(WHATSAPP_TOKEN);
  var phoneId = props.getProperty(PHONE_NUMBER_ID);
  var destino = props.getProperty(NUTRIOLOGO_PHONE_NUMBER);

  if (!token || !phoneId || !destino) {
    Logger.log('WhatsApp sin configurar; la alerta va solo por correo.');
    return { enviado: false, motivo: 'sin-credenciales' };
  }

  var texto = '🔔 Nueva consulta de paciente: ' + nombrePaciente + '.\n\n' +
    'Mensaje: ' + recortar_(mensaje, 700) + '\n\n' +
    'Responde desde el panel de administración.';

  var url = 'https://graph.facebook.com/' + META_API_VERSION + '/' + phoneId + '/messages';
  var cuerpo = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: destino,
    type: 'text',
    text: { preview_url: false, body: texto }
  };

  try {
    var respuesta = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(cuerpo),
      muteHttpExceptions: true
    });

    var codigo = respuesta.getResponseCode();
    var contenido = respuesta.getContentText();

    if (codigo >= 200 && codigo < 300) {
      Logger.log('Alerta de WhatsApp enviada a ' + destino);
      return { enviado: true, respuesta: contenido };
    }

    Logger.log('Meta respondió ' + codigo + ': ' + contenido);
    return { enviado: false, motivo: 'http-' + codigo, detalle: contenido };
  } catch (err) {
    Logger.log('Falló la llamada a Meta: ' + err.message);
    return { enviado: false, motivo: 'excepcion', detalle: err.message };
  }
}

/**
 * Variante con plantilla aprobada de Meta. Fuera de la ventana de 24 horas de
 * atención al cliente, la API solo acepta plantillas; el texto libre se
 * rechaza. Registra tu plantilla en el administrador de WhatsApp y pasa aquí
 * su nombre.
 * @param {string} nombrePlantilla El nombre de la plantilla aprobada.
 * @param {Array<string>} parametros Los valores de las variables, en orden.
 * @param {string=} idioma Código de idioma; por omisión es_MX.
 * @return {Object} Si se envió, y el motivo cuando no.
 */
function notificarConPlantillaWhatsApp(nombrePlantilla, parametros, idioma) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty(WHATSAPP_TOKEN);
  var phoneId = props.getProperty(PHONE_NUMBER_ID);
  var destino = props.getProperty(NUTRIOLOGO_PHONE_NUMBER);

  if (!token || !phoneId || !destino) {
    return { enviado: false, motivo: 'sin-credenciales' };
  }

  var cuerpo = {
    messaging_product: 'whatsapp',
    to: destino,
    type: 'template',
    template: {
      name: nombrePlantilla,
      language: { code: idioma || 'es_MX' },
      components: [{
        type: 'body',
        parameters: (parametros || []).map(function (valor) {
          return { type: 'text', text: String(valor) };
        })
      }]
    }
  };

  try {
    var respuesta = UrlFetchApp.fetch(
      'https://graph.facebook.com/' + META_API_VERSION + '/' + phoneId + '/messages',
      {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify(cuerpo),
        muteHttpExceptions: true
      }
    );
    var codigo = respuesta.getResponseCode();
    return codigo >= 200 && codigo < 300
      ? { enviado: true }
      : { enviado: false, motivo: 'http-' + codigo, detalle: respuesta.getContentText() };
  } catch (err) {
    return { enviado: false, motivo: 'excepcion', detalle: err.message };
  }
}

/**
 * Correo de respaldo al nutriólogo, para que la consulta no se pierda si
 * WhatsApp falla o todavía no está configurado.
 * @param {string} nombrePaciente El nombre del paciente.
 * @param {string} mensaje Lo que escribió.
 * @return {boolean} true si el correo salió.
 */
function notificarConsultaCorreo_(nombrePaciente, mensaje) {
  var destinatario = obtenerCorreoNutriologo_();
  if (!destinatario) {
    return false;
  }

  var html = '' +
    '<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2933">' +
    '<div style="background:#1f6f4f;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">' +
    '<h1 style="margin:0;font-size:20px">Nueva consulta en NutriApp</h1></div>' +
    '<div style="border:1px solid #e4e7eb;border-top:0;border-radius:0 0 12px 12px;padding:24px">' +
    '<p><strong>' + escaparHtml_(nombrePaciente) + '</strong> escribió en el chat de soporte:</p>' +
    '<blockquote style="margin:16px 0;padding:12px 16px;background:#f2f7f4;border-left:4px solid #1f6f4f;border-radius:4px">' +
    escaparHtml_(mensaje) + '</blockquote>' +
    '<p style="font-size:13px;color:#6b7280">Responde desde el panel de administración de NutriApp.</p>' +
    '</div></div>';

  try {
    GmailApp.sendEmail(destinatario, 'NutriApp · Consulta de ' + nombrePaciente, mensaje, {
      name: 'NutriApp',
      htmlBody: html
    });
    return true;
  } catch (err) {
    Logger.log('No se pudo enviar el correo de respaldo: ' + err.message);
    return false;
  }
}

/**
 * Correo del nutriólogo: el primero registrado con ese rol, o el dueño del script.
 * @return {string} La dirección de correo.
 */
function obtenerCorreoNutriologo_() {
  var usuarios = leerTabla_('Usuarios');
  for (var i = 0; i < usuarios.length; i++) {
    if (String(usuarios[i].Rol) === 'Nutriologo' && usuarios[i].Email) {
      return usuarios[i].Email;
    }
  }
  return Session.getEffectiveUser().getEmail();
}

/**
 * Recorta un texto largo y le pone puntos suspensivos.
 * @param {string} texto El texto original.
 * @param {number} maximo Cuántos caracteres conservar.
 * @return {string} El texto recortado.
 */
function recortar_(texto, maximo) {
  var limpio = String(texto === undefined || texto === null ? '' : texto);
  return limpio.length <= maximo ? limpio : limpio.slice(0, maximo - 1) + '…';
}
