/**
 * TLTERMINALS · Almacén — matriz de SLA configurable.
 *
 * CONFIG_SLA define tiempos objetivo por combinación de Cliente + Material +
 * Etapa. Cualquiera de los tres puede quedar vacío para actuar como comodín
 * (aplica a todos). Al evaluar una maniobra se elige la regla más específica
 * que coincida; si ninguna aplica, se usan los umbrales generales de Config.
 *
 * Semáforo (sobre el tiempo total consolidado):
 *   🟢 verde  <= objetivo            (<= 100%)
 *   🟡 ámbar  <= umbral ámbar        (101% – 125% por defecto)
 *   🔴 rojo   por encima, o si hay una demora activa
 */

/* -------------------------------- evaluación ------------------------------- */

/**
 * Reglas de SLA activas, con memoria por ejecución. En Apps Script las globales
 * viven solo lo que dura una petición, así que evaluar muchas maniobras (tablero,
 * historial) no vuelve a leer la hoja una y otra vez.
 * @private
 */
var _reglasSlaCache = null;
function reglasSlaActivas_() {
  if (_reglasSlaCache === null) {
    _reglasSlaCache = leerTodo_('CONFIG_SLA').filter(function (r) { return esSi_(r.activo); });
  }
  return _reglasSlaCache;
}

/**
 * Umbrales de SLA (en minutos) para una combinación dada.
 * @return {{objetivoMin:number, ambarMin:number, rojaMin:number, regla:string}}
 * @private
 */
function umbralesSla_(cliente, material, etapa) {
  var c = String(cliente || '').toLowerCase().trim();
  var mat = String(material || '').toLowerCase().trim();
  var et = String(etapa || '').toLowerCase().trim();

  var reglas = reglasSlaActivas_();
  var mejor = null, mejorPuntos = -1;
  reglas.forEach(function (r) {
    var rc = String(r.cliente || '').toLowerCase().trim();
    var rm = String(r.material || '').toLowerCase().trim();
    var re = String(r.etapa || '').toLowerCase().trim();
    // Cada campo debe coincidir o estar vacío (comodín); si no, la regla no aplica.
    if (rc && rc !== c) { return; }
    if (rm && rm !== mat) { return; }
    if (re && re !== et) { return; }
    var puntos = (rc ? 4 : 0) + (rm ? 2 : 0) + (re ? 1 : 0); // más específico gana
    if (puntos > mejorPuntos) { mejorPuntos = puntos; mejor = r; }
  });

  if (mejor) {
    var objetivo = Number(mejor.objetivoMin) || 0;
    var ambar = Number(mejor.ambarMin) || Math.round(objetivo * 1.25);
    var roja = Number(mejor.rojaMin) || ambar;
    return {
      objetivoMin: objetivo, ambarMin: ambar, rojaMin: roja,
      regla: [mejor.cliente, mejor.material, mejor.etapa].filter(String).join(' · ') || 'General'
    };
  }
  var v = Number(leerConfig('slaVerde')) || 45;
  var a = Number(leerConfig('slaAmbar')) || 90;
  return { objetivoMin: v, ambarMin: a, rojaMin: a, regla: 'General' };
}

/** Color del semáforo dados los minutos y los umbrales. @private */
function colorSla_(totalMin, umbrales, demoraActiva) {
  if (demoraActiva) {
    return 'rojo';
  }
  var t = Number(totalMin) || 0;
  if (t <= umbrales.objetivoMin) { return 'verde'; }
  if (t <= umbrales.ambarMin) { return 'ambar'; }
  return 'rojo';
}

/* ---------------------------------- CRUD ----------------------------------- */

/** Matriz completa, para el panel de administración. */
function apiSlaMatriz() {
  exigirRol_('ADMINISTRADOR');
  return leerTodo_('CONFIG_SLA')
    .map(function (r) {
      return {
        id: String(r.id), cliente: String(r.cliente || ''), material: String(r.material || ''),
        etapa: String(r.etapa || ''), objetivoMin: Number(r.objetivoMin) || 0,
        ambarMin: Number(r.ambarMin) || 0, rojaMin: Number(r.rojaMin) || 0,
        activo: esSi_(r.activo)
      };
    })
    .sort(function (a, b) { return (a.cliente + a.material + a.etapa).localeCompare(b.cliente + b.material + b.etapa); });
}

/** Alta o edición de una regla de SLA. */
function apiGuardarSla(datos) {
  var actor = exigirRol_('ADMINISTRADOR');
  datos = datos || {};
  var objetivo = Number(datos.objetivoMin) || 0;
  if (objetivo <= 0) {
    throw new Error('El tiempo objetivo debe ser mayor que cero.');
  }
  var ambar = Number(datos.ambarMin) || Math.round(objetivo * 1.25);
  var roja = Number(datos.rojaMin) || ambar;
  var campos = {
    cliente: String(datos.cliente || ''), material: String(datos.material || ''),
    etapa: String(datos.etapa || ''), objetivoMin: objetivo, ambarMin: ambar,
    rojaMin: roja, activo: datos.activo === false ? 'NO' : 'SI'
  };

  if (datos.id) {
    var r = buscarPorId_('CONFIG_SLA', datos.id);
    if (!r) {
      throw new Error('No encontré esa regla.');
    }
    actualizar_('CONFIG_SLA', r, campos);
    auditar_('', actor.nombre, 'sla_editar', campos.regla || 'regla', '', objetivo + ' min');
    return true;
  }
  campos.id = nuevoId_();
  insertar_('CONFIG_SLA', campos);
  auditar_('', actor.nombre, 'sla_alta',
    [campos.cliente, campos.material, campos.etapa].filter(String).join(' · ') || 'General',
    '', objetivo + ' min');
  return true;
}

/** Borra una regla de SLA. */
function apiBorrarSla(id) {
  var actor = exigirRol_('ADMINISTRADOR');
  var r = buscarPorId_('CONFIG_SLA', id);
  if (!r) {
    throw new Error('No encontré esa regla.');
  }
  borrar_('CONFIG_SLA', r);
  auditar_('', actor.nombre, 'sla_borrar',
    [r.cliente, r.material, r.etapa].filter(String).join(' · ') || 'General', String(r.objetivoMin), '');
  return true;
}
