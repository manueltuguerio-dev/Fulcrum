/**
 * TLTERMINALS · Comedor — tareas automáticas.
 *
 * Ejecuta instalarDisparadores() una vez desde el editor. Deja dos:
 *   - jobRecordatorio, cada 15 minutos
 *   - jobCierre, cada 15 minutos
 */

function instalarDisparadores() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'jobRecordatorio' || f === 'jobCierre') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('jobRecordatorio').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('jobCierre').timeBased().everyMinutes(15).create();
  Logger.log('Listos los dos disparadores, cada 15 minutos.');
  return true;
}

/**
 * Avisa por correo a quien no ha pedido y le queda poco para la hora corte.
 * Manda un solo aviso por persona y día, controlado con una marca en las
 * propiedades del script.
 */
function jobRecordatorio() {
  var hoy = hoyTexto_();
  [hoy, sumarDias_(hoy, 1)].forEach(function (fecha) {
    var menu = menuDeFecha_(fecha);
    if (!menu.abierto) {
      return;
    }
    var anticipacion = Number(leerConfig('minutosRecordatorio')) || 60;
    if (menu.minutosRestantes > anticipacion || menu.minutosRestantes < 0) {
      return;
    }

    var pedidos = leerTodo_('Pedidos');
    var yaPidio = {};
    pedidos.forEach(function (p) {
      if (textoFecha_(p.fecha) === fecha && String(p.estado) !== 'cancelado') {
        yaPidio[String(p.empleadoId)] = true;
      }
    });

    var props = PropertiesService.getScriptProperties();
    var empresa = leerConfig('empresa') || 'TLTERMINALS';
    var liga = ligaApp_();

    leerTodo_('Empleados').forEach(function (e) {
      if (String(e.estado) !== 'activo' || yaPidio[String(e.id)]) {
        return;
      }
      var marca = 'aviso_' + fecha + '_' + e.id;
      if (props.getProperty(marca)) {
        return;
      }
      try {
        MailApp.sendEmail({
          to: String(e.email),
          subject: 'Comedor ' + empresa + ' — te faltan ' + menu.minutosRestantes
            + ' minutos para pedir',
          htmlBody: '<p>Hola ' + escaparHtml_(String(e.nombre)) + ',</p>'
            + '<p>Todavía no registras tu comida del ' + fechaBonita_(fecha)
            + '. La hora corte es a las ' + menu.horaCorte + '.</p>'
            + (liga ? '<p><a href="' + liga + '">Hacer mi pedido</a></p>' : '')
            + '<p>Si no pides antes de esa hora, queda registrado que no comes ese día.</p>'
        });
        props.setProperty(marca, '1');
      } catch (err) {
        Logger.log('No se pudo avisar a ' + e.email + ': ' + err.message);
      }
    });
  });
}

/**
 * Cierra los menús cuya hora corte ya pasó y registra "no come" a los omisos.
 */
function jobCierre() {
  var hoy = hoyTexto_();
  [sumarDias_(hoy, -1), hoy].forEach(function (fecha) {
    var menuFila = buscar_('Menus', function (m) { return textoFecha_(m.fecha) === fecha; });
    if (!menuFila || String(menuFila.estado) !== 'publicado') {
      return;
    }
    var horaCorte = textoHora_(menuFila.horaCorte) || leerConfig('horaCorte') || '11:00';
    if (new Date().getTime() < momento_(fecha, horaCorte).getTime()) {
      return;
    }

    var yaPidio = {};
    leerTodo_('Pedidos').forEach(function (p) {
      if (textoFecha_(p.fecha) === fecha && String(p.estado) !== 'cancelado') {
        yaPidio[String(p.empleadoId)] = true;
      }
    });

    var omisos = 0;
    leerTodo_('Empleados').forEach(function (e) {
      if (String(e.estado) !== 'activo' || yaPidio[String(e.id)]) {
        return;
      }
      insertar_('Pedidos', {
        id: nuevoId_(), fecha: fecha, empleadoId: String(e.id), email: String(e.email),
        nombre: String(e.nombre), estado: 'no_come', principalId: '', complementos: '',
        salsas: '', comentarios: '', importe: 0, origen: 'sistema', condonado: 'NO',
        motivo: '', creado: ahora_(), actualizado: ahora_()
      });
      omisos++;
    });

    actualizar_('Menus', menuFila, { estado: 'cerrado', cerrado: ahora_() });
    bitacora_('menu_cerrado', fecha, { omisos: omisos });

    avisarAdmins_(fecha, omisos);
  });
}

function avisarAdmins_(fecha, omisos) {
  var resumen;
  try {
    resumen = apiResumenProduccionInterno_(fecha);
  } catch (err) {
    return;
  }
  var lineas = resumen.principales.map(function (p) {
    return '<li>' + escaparHtml_(p.nombre) + ': <b>' + p.cantidad + '</b></li>';
  }).join('');

  leerTodo_('Empleados').forEach(function (e) {
    if (String(e.rol) !== 'admin' || String(e.estado) !== 'activo') {
      return;
    }
    try {
      MailApp.sendEmail({
        to: String(e.email),
        subject: 'Comedor — cerró el pedido del ' + fecha + ': ' + resumen.totalComidas + ' comidas',
        htmlBody: '<p>Ya cerró la hora corte del ' + fechaBonita_(fecha) + '.</p>'
          + '<p><b>' + resumen.totalComidas + '</b> comidas. '
          + omisos + ' personas quedaron registradas como que no comen.</p>'
          + '<ul>' + lineas + '</ul>'
          + '<p>Entra a la aplicación para ver el detalle y marcar las entregas.</p>'
      });
    } catch (err) {
      Logger.log('No se pudo avisar al admin ' + e.email + ': ' + err.message);
    }
  });
}

/** Igual que apiResumenProduccion pero sin exigir sesión: lo llama el disparador. */
function apiResumenProduccionInterno_(fecha) {
  var nombres = {};
  leerTodo_('Platillos').forEach(function (p) { nombres[String(p.id)] = String(p.nombre); });
  var principales = {};
  var total = 0;
  leerTodo_('Pedidos').forEach(function (p) {
    if (textoFecha_(p.fecha) !== String(fecha)) {
      return;
    }
    var estado = String(p.estado);
    if (estado === 'cancelado' || estado === 'no_come') {
      return;
    }
    total++;
    var n = nombres[String(p.principalId)] || String(p.principalId);
    principales[n] = (principales[n] || 0) + 1;
  });
  return { totalComidas: total, principales: aConteo_(principales) };
}
