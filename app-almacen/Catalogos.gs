/**
 * TLTERMINALS · Almacén — catálogos (listas desplegables) y campos dinámicos.
 *
 * CATALOGOS es una sola tabla flexible: cada renglón es un valor de una lista,
 * identificado por su 'tipo' (clientes, turnos, flujos, etapas, tiposEquipo,
 * materiales, presentaciones, montacargas, causasDemora, unidadesMedida).
 *
 * CAMPOS_CUSTOM guarda columnas extra que el MASTER agrega al acta sin tocar
 * las fórmulas de la hoja: se almacenan en camposJson dentro de cada maniobra.
 */

var TIPOS_CATALOGO = ['clientes', 'turnos', 'flujos', 'etapas', 'tiposEquipo',
  'materiales', 'presentaciones', 'montacargas', 'causasDemora', 'unidadesMedida',
  'tiposManiobra', 'aditamentos', 'transportistas'];

/* -------------------------------- lecturas --------------------------------- */

/** Catálogos activos agrupados por tipo, ordenados. @private */
function catalogosAgrupados_() {
  var salida = {};
  TIPOS_CATALOGO.forEach(function (t) { salida[t] = []; });
  leerTodo_('CATALOGOS')
    .filter(function (c) { return esSi_(c.activo); })
    .sort(function (a, b) { return (Number(a.orden) || 0) - (Number(b.orden) || 0); })
    .forEach(function (c) {
      var tipo = String(c.tipo);
      if (!salida[tipo]) {
        salida[tipo] = [];
      }
      salida[tipo].push({
        id: String(c.id),
        valor: String(c.valor),
        extra: String(c.extra || '')
      });
    });
  return salida;
}

/** Campos dinámicos activos, ordenados. @private */
function camposCustomActivos_() {
  return leerTodo_('CAMPOS_CUSTOM')
    .filter(function (c) { return esSi_(c.activo); })
    .sort(function (a, b) { return (Number(a.orden) || 0) - (Number(b.orden) || 0); })
    .map(function (c) {
      return {
        id: String(c.id),
        clave: String(c.clave),
        etiqueta: String(c.etiqueta),
        tipo: String(c.tipo || 'texto'),
        opciones: String(c.opciones || '').split(',')
          .map(function (o) { return o.trim(); })
          .filter(function (o) { return o !== ''; })
      };
    });
}

/** Vista completa de catálogos para el panel de administración. */
function apiCatalogosAdmin() {
  exigirRol_('ADMINISTRADOR');
  var porTipo = {};
  TIPOS_CATALOGO.forEach(function (t) { porTipo[t] = []; });
  leerTodo_('CATALOGOS')
    .sort(function (a, b) { return (Number(a.orden) || 0) - (Number(b.orden) || 0); })
    .forEach(function (c) {
      var tipo = String(c.tipo);
      if (!porTipo[tipo]) {
        porTipo[tipo] = [];
      }
      porTipo[tipo].push({
        id: String(c.id),
        valor: String(c.valor),
        extra: String(c.extra || ''),
        orden: Number(c.orden) || 0,
        activo: esSi_(c.activo)
      });
    });
  return { tipos: TIPOS_CATALOGO, porTipo: porTipo };
}

/* ---------------------------------- CRUD ----------------------------------- */

/** Alta o edición de un valor de catálogo. Admin o master. */
function apiGuardarCatalogo(datos) {
  var u = exigirRol_('ADMINISTRADOR');
  datos = datos || {};
  var tipo = String(datos.tipo || '').trim();
  if (TIPOS_CATALOGO.indexOf(tipo) === -1) {
    throw new Error('Tipo de catálogo no válido.');
  }
  var valor = String(datos.valor || '').trim();
  if (!valor) {
    throw new Error('El valor no puede ir vacío.');
  }

  if (datos.id) {
    var fila = buscarPorId_('CATALOGOS', datos.id);
    if (!fila) {
      throw new Error('No encontré ese elemento del catálogo.');
    }
    actualizar_('CATALOGOS', fila, {
      valor: valor,
      extra: String(datos.extra || ''),
      orden: Number(datos.orden) || fila.orden || 0,
      activo: datos.activo === false ? 'NO' : 'SI'
    });
    auditar_('', u.nombre, 'catalogo_editar', tipo, '', valor);
    return true;
  }

  insertar_('CATALOGOS', {
    id: nuevoId_(),
    tipo: tipo,
    valor: valor,
    extra: String(datos.extra || ''),
    orden: Number(datos.orden) || (leerTodo_('CATALOGOS').length + 1),
    activo: 'SI'
  });
  auditar_('', u.nombre, 'catalogo_alta', tipo, '', valor);
  return true;
}

/** Activa o desactiva un valor de catálogo (no se borra para no romper historial). */
function apiCambiarCatalogo(id, activo) {
  var u = exigirRol_('ADMINISTRADOR');
  var fila = buscarPorId_('CATALOGOS', id);
  if (!fila) {
    throw new Error('No encontré ese elemento del catálogo.');
  }
  actualizar_('CATALOGOS', fila, { activo: activo ? 'SI' : 'NO' });
  auditar_('', u.nombre, 'catalogo_estado', String(fila.tipo),
    esSi_(fila.activo) ? 'activo' : 'inactivo', activo ? 'activo' : 'inactivo');
  return true;
}

/* ------------------------- carga inicial de ejemplo ------------------------ */

/**
 * Llena los catálogos con opciones típicas de patio para poder probar de
 * inmediato. Solo agrega si el catálogo está vacío.
 */
function cargarEjemplo() {
  if (leerTodo_('CATALOGOS').length) {
    Logger.log('Los catálogos ya tienen datos: no toco nada.');
    return false;
  }
  var ejemplo = {
    clientes: ['Cliente A', 'Cliente B', 'Cliente C'],
    turnos: ['Matutino', 'Vespertino', 'Nocturno'],
    flujos: ['Descarga', 'Carga', 'Traspaleo', 'Acomodo'],
    etapas: ['Arribo', 'Maniobra', 'Verificación', 'Liberación'],
    tiposEquipo: ['Caja seca 53', 'Contenedor 40', 'Contenedor 20', 'Tolva', 'Plataforma'],
    materiales: ['Costal', 'Caja', 'Tambor', 'Rollo', 'Celulosa', 'Granel'],
    presentaciones: ['Estibado', 'Suelto', 'Paletizado', 'Amarrado', 'Atado'],
    montacargas: ['MC-01', 'MC-02', 'MC-03'],
    causasDemora: ['Falta de personal', 'Documentación', 'Espera de unidad',
      'Falla de montacargas', 'Producto dañado', 'Reacomodo', 'Comida'],
    unidadesMedida: ['Piezas', 'Cajas', 'Tarimas', 'Toneladas', 'Costales'],
    aditamentos: ['Ninguno', 'Cuchillas', 'Roll Clamp'],
    transportistas: ['Transportes del Norte', 'Fletes Bajío', 'Autolíneas TL']
  };
  // Los tipos de maniobra llevan un CÓDIGO en 'extra' para armar el folio.
  var maniobras = [
    ['Descarga de furgón', 'DESC'], ['Carga de furgón', 'CARG'],
    ['Carga plataforma desde piso', 'CPPI'], ['Acomodo en almacén', 'ACOM'],
    ['Traspaleo', 'TRAS']
  ];
  var orden = 1;
  Object.keys(ejemplo).forEach(function (tipo) {
    ejemplo[tipo].forEach(function (valor) {
      insertar_('CATALOGOS', {
        id: nuevoId_(), tipo: tipo, valor: valor, extra: '',
        orden: orden++, activo: 'SI'
      });
    });
  });
  maniobras.forEach(function (m) {
    insertar_('CATALOGOS', {
      id: nuevoId_(), tipo: 'tiposManiobra', valor: m[0], extra: m[1],
      orden: orden++, activo: 'SI'
    });
  });
  Logger.log('Catálogos de ejemplo cargados.');
  return true;
}
