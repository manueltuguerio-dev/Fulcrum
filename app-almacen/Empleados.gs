/**
 * TLTERMINALS · Almacén — personal (cuadrillas) y equipos (montacargas por SKU).
 *
 * EMPLEADOS es el padrón de gente que ejecuta maniobras (distinto de USUARIOS,
 * que son las cuentas que entran a la app). Un empleado tiene un puesto:
 * Montacarguista, Ayudante de Patio, Inspector de Calidad o Supervisor.
 *
 * MONTACARGAS es el inventario de maquinaria con SKU único, para trazabilidad
 * de activos (qué equipo se usó en cada maniobra, con quién y en qué turno).
 */

var PUESTOS = ['Montacarguista', 'Ayudante de Patio', 'Inspector de Calidad', 'Supervisor'];

/* -------------------------------- empleados -------------------------------- */

/** Empleados activos, para los selectores de cuadrilla. @private */
function empleadosActivos_() {
  return leerTodo_('EMPLEADOS')
    .filter(function (e) { return String(e.estado) !== 'INACTIVO' && String(e.estado) !== 'inactivo'; })
    .map(function (e) {
      return { id: String(e.id), nombre: String(e.nombreCompleto), puesto: String(e.puesto) };
    })
    .sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
}

/** Padrón completo, para el panel de administración. */
function apiEmpleados() {
  exigirRol_('ADMINISTRADOR');
  return {
    puestos: PUESTOS,
    empleados: leerTodo_('EMPLEADOS')
      .map(function (e) {
        return {
          id: String(e.id), nombreCompleto: String(e.nombreCompleto),
          puesto: String(e.puesto), estado: String(e.estado || 'ACTIVO')
        };
      })
      .sort(function (a, b) { return a.nombreCompleto.localeCompare(b.nombreCompleto); })
  };
}

/** Alta o edición de empleado. */
function apiGuardarEmpleado(datos) {
  var actor = exigirRol_('ADMINISTRADOR');
  datos = datos || {};
  var nombre = String(datos.nombreCompleto || '').trim();
  var puesto = String(datos.puesto || '').trim();
  if (!nombre) {
    throw new Error('El nombre no puede ir vacío.');
  }
  if (PUESTOS.indexOf(puesto) === -1) {
    throw new Error('Puesto no válido.');
  }

  if (datos.id) {
    var e = buscarPorId_('EMPLEADOS', datos.id);
    if (!e) {
      throw new Error('No encontré a ese empleado.');
    }
    actualizar_('EMPLEADOS', e, { nombreCompleto: nombre, puesto: puesto });
    auditar_('', actor.nombre, 'empleado_editar', 'empleado', e.nombreCompleto, nombre);
    return true;
  }
  insertar_('EMPLEADOS', {
    id: nuevoId_(), nombreCompleto: nombre, puesto: puesto,
    estado: 'ACTIVO', creado: ahora_()
  });
  auditar_('', actor.nombre, 'empleado_alta', 'empleado', '', nombre + ' (' + puesto + ')');
  return true;
}

/** Activa o desactiva un empleado (no se borra para no romper historial). */
function apiCambiarEstadoEmpleado(id, activo) {
  var actor = exigirRol_('ADMINISTRADOR');
  var e = buscarPorId_('EMPLEADOS', id);
  if (!e) {
    throw new Error('No encontré a ese empleado.');
  }
  actualizar_('EMPLEADOS', e, { estado: activo ? 'ACTIVO' : 'INACTIVO' });
  auditar_('', actor.nombre, 'empleado_estado', e.nombreCompleto,
    String(e.estado), activo ? 'ACTIVO' : 'INACTIVO');
  return true;
}

/* ------------------------------- montacargas ------------------------------- */

/** Equipos activos, para el selector de maquinaria. @private */
function maquinasActivas_() {
  return leerTodo_('MONTACARGAS')
    .filter(function (m) { return String(m.estado) !== 'INACTIVO' && String(m.estado) !== 'inactivo'; })
    .map(function (m) {
      return {
        id: String(m.id), sku: String(m.skuEquipo),
        tipo: String(m.tipo || ''), capacidad: String(m.capacidad || '')
      };
    })
    .sort(function (a, b) { return a.sku.localeCompare(b.sku); });
}

/** Inventario completo de maquinaria, para el panel de administración. */
function apiMontacargas() {
  exigirRol_('ADMINISTRADOR');
  return leerTodo_('MONTACARGAS')
    .map(function (m) {
      return {
        id: String(m.id), skuEquipo: String(m.skuEquipo), tipo: String(m.tipo || ''),
        capacidad: String(m.capacidad || ''), estado: String(m.estado || 'ACTIVO')
      };
    })
    .sort(function (a, b) { return a.skuEquipo.localeCompare(b.skuEquipo); });
}

/** Alta o edición de equipo. El SKU es único. */
function apiGuardarMontacargas(datos) {
  var actor = exigirRol_('ADMINISTRADOR');
  datos = datos || {};
  var sku = String(datos.skuEquipo || '').trim().toUpperCase();
  if (!sku) {
    throw new Error('El SKU del equipo no puede ir vacío.');
  }
  var choque = buscar_('MONTACARGAS', function (m) {
    return String(m.skuEquipo).trim().toUpperCase() === sku;
  });

  if (datos.id) {
    var m = buscarPorId_('MONTACARGAS', datos.id);
    if (!m) {
      throw new Error('No encontré ese equipo.');
    }
    if (choque && String(choque.id) !== String(m.id)) {
      throw new Error('Ya existe un equipo con el SKU ' + sku + '.');
    }
    actualizar_('MONTACARGAS', m, {
      skuEquipo: sku, tipo: String(datos.tipo || ''), capacidad: String(datos.capacidad || '')
    });
    auditar_('', actor.nombre, 'equipo_editar', sku, '', sku);
    return true;
  }
  if (choque) {
    throw new Error('Ya existe un equipo con el SKU ' + sku + '.');
  }
  insertar_('MONTACARGAS', {
    id: nuevoId_(), skuEquipo: sku, tipo: String(datos.tipo || ''),
    capacidad: String(datos.capacidad || ''), estado: 'ACTIVO', creado: ahora_()
  });
  auditar_('', actor.nombre, 'equipo_alta', sku, '', sku);
  return true;
}

/** Activa o desactiva un equipo. */
function apiCambiarEstadoMontacargas(id, activo) {
  var actor = exigirRol_('ADMINISTRADOR');
  var m = buscarPorId_('MONTACARGAS', id);
  if (!m) {
    throw new Error('No encontré ese equipo.');
  }
  actualizar_('MONTACARGAS', m, { estado: activo ? 'ACTIVO' : 'INACTIVO' });
  auditar_('', actor.nombre, 'equipo_estado', String(m.skuEquipo),
    String(m.estado), activo ? 'ACTIVO' : 'INACTIVO');
  return true;
}
