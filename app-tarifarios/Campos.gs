/**
 * TLTERMINALS · Tarifarios — campos personalizados.
 *
 * Ningún tarifario se parece a otro: uno lleva cuenta o cliente, otro el número
 * de contrato, otro si la tarifa ya se revisó. En vez de adivinar todas las
 * columnas del mundo, aquí se pueden definir las que hagan falta.
 *
 * Los valores viven en la columna `extras` de la tabla, como un JSON. Así se
 * pueden agregar campos sin recorrer columnas ni tocar lo ya capturado; al
 * exportar se despliegan como columnas normales.
 */

var TIPOS_CAMPO = ['texto', 'numero', 'fecha', 'lista', 'si_no'];
var AMBITOS_CAMPO = ['tarifa', 'proveedor'];

/**
 * Los campos definidos para un ámbito, ya ordenados.
 * @param {string} ambito 'tarifa' o 'proveedor'.
 * @param {boolean} incluirInactivos
 * @return {Array<Object>}
 * @private
 */
function campos_(ambito, incluirInactivos) {
  return leerTodo_('Campos').filter(function (c) {
    return String(c.ambito) === ambito && (incluirInactivos || esSi_(c.estado));
  }).map(function (c) {
    return {
      id: String(c.id),
      ambito: String(c.ambito),
      clave: texto_(c.clave),
      etiqueta: texto_(c.etiqueta) || texto_(c.clave),
      tipo: texto_(c.tipo) || 'texto',
      opciones: listaDeTexto_(c.opciones),
      compara: esSi_(c.compara),
      orden: numero_(c.orden, 99),
      estado: esSi_(c.estado) ? 'activo' : 'inactivo'
    };
  }).sort(function (a, b) {
    if (a.orden !== b.orden) {
      return a.orden - b.orden;
    }
    return a.etiqueta < b.etiqueta ? -1 : 1;
  });
}

function listaDeTexto_(texto) {
  if (!texto) {
    return [];
  }
  return String(texto).split(/[|,;]/).map(function (t) { return t.trim(); })
    .filter(function (t) { return t !== ''; });
}

function apiCampos() {
  exigirSesion_();
  return { tarifa: campos_('tarifa', true), proveedor: campos_('proveedor', true) };
}

/**
 * Lee la columna `extras` de un renglón.
 * @return {Object} Valores por clave de campo. Nunca null.
 * @private
 */
function extrasDe_(fila) {
  var bruto = texto_(fila.extras);
  if (!bruto) {
    return {};
  }
  try {
    var objeto = JSON.parse(bruto);
    return (objeto && typeof objeto === 'object') ? objeto : {};
  } catch (err) {
    return {};
  }
}

/**
 * Valida y normaliza lo que viene del formulario contra los campos definidos.
 * Lo que no corresponda a un campo activo se descarta: es la única puerta por
 * la que entran valores a `extras`.
 *
 * @param {string} ambito 'tarifa' o 'proveedor'.
 * @param {Object} valores Lo que mandó el navegador.
 * @param {Object} previos Los valores que ya tenía el renglón.
 * @return {string} El JSON listo para guardar.
 * @private
 */
function extrasParaGuardar_(ambito, valores, previos) {
  var definidos = campos_(ambito, true);
  var salida = {};
  var entrada = valores || {};
  var antes = previos || {};

  definidos.forEach(function (campo) {
    var crudo = entrada[campo.clave];
    if (crudo === undefined) {
      // El formulario no mandó este campo: se respeta lo que ya había, que es
      // lo que pasa con los campos desactivados.
      if (antes[campo.clave] !== undefined && antes[campo.clave] !== '') {
        salida[campo.clave] = antes[campo.clave];
      }
      return;
    }
    var valor = normalizarValorCampo_(campo, crudo);
    if (valor !== '') {
      salida[campo.clave] = valor;
    }
  });

  return Object.keys(salida).length ? JSON.stringify(salida) : '';
}

/**
 * Deja el valor con la forma que pide el tipo del campo.
 * @return {string|number} '' cuando viene vacío o no se entiende.
 * @private
 */
function normalizarValorCampo_(campo, crudo) {
  var texto = texto_(crudo);
  if (texto === '') {
    return '';
  }
  if (campo.tipo === 'numero') {
    return numero_(texto, 0);
  }
  if (campo.tipo === 'fecha') {
    return fecha_(texto);
  }
  if (campo.tipo === 'si_no') {
    return esSi_(texto) ? 'SI' : 'NO';
  }
  if (campo.tipo === 'lista' && campo.opciones.length) {
    var elegida = '';
    campo.opciones.forEach(function (opcion) {
      if (!elegida && normalizar_(opcion) === normalizar_(texto)) {
        elegida = opcion;
      }
    });
    return elegida;
  }
  return texto;
}

/** Cómo se ve un valor en pantalla y en las exportaciones. @private */
function valorCampoTexto_(campo, valor) {
  if (valor === undefined || valor === null || valor === '') {
    return '';
  }
  if (campo.tipo === 'si_no') {
    return esSi_(valor) ? 'Sí' : 'No';
  }
  return String(valor);
}

/* --------------------------------- la API ---------------------------------- */

function apiGuardarCampo(datos) {
  exigirAdmin_();
  var ambito = String(datos.ambito);
  if (AMBITOS_CAMPO.indexOf(ambito) === -1) {
    throw new Error('El campo tiene que ser de tarifa o de proveedor.');
  }
  var etiqueta = texto_(datos.etiqueta);
  if (!etiqueta) {
    throw new Error('Ponle nombre al campo.');
  }
  var tipo = String(datos.tipo || 'texto');
  if (TIPOS_CAMPO.indexOf(tipo) === -1) {
    throw new Error('Ese tipo de campo no existe.');
  }
  var clave = normalizar_(datos.clave || etiqueta);
  if (!clave) {
    throw new Error('La clave no puede quedar vacía.');
  }
  var opciones = listaDeTexto_(datos.opciones);
  if (tipo === 'lista' && !opciones.length) {
    throw new Error('Un campo de lista necesita sus opciones, separadas por | o por comas.');
  }
  // Un campo que separa la comparación tiene que tener un valor claro: con
  // texto libre cada quien escribiría "Tuny", "TUNY" y "tuny" y saldrían tres
  // tableros distintos para la misma cuenta.
  var compara = esSi_(datos.compara);
  if (compara && tipo !== 'lista' && tipo !== 'si_no' && tipo !== 'texto') {
    throw new Error('Solo los campos de texto, lista o sí/no pueden separar la comparación.');
  }

  var campos = {
    ambito: ambito,
    clave: clave,
    etiqueta: etiqueta,
    tipo: tipo,
    opciones: opciones.join(' | '),
    compara: compara ? 'SI' : 'NO',
    orden: numero_(datos.orden, 99),
    estado: datos.estado === 'inactivo' ? 'inactivo' : 'activo'
  };

  var existente = datos.id ? buscarPorId_('Campos', datos.id) : null;
  var homonimo = buscarCampo_(ambito, clave);
  if (homonimo && (!existente || String(homonimo.id) !== String(existente.id))) {
    throw new Error('Ya hay un campo con esa clave en ' + ambito + '.');
  }

  if (existente) {
    if (normalizar_(existente.clave) !== clave) {
      throw new Error('La clave de un campo ya creado no se cambia: los valores '
        + 'capturados quedarían huérfanos. Crea otro campo.');
    }
    actualizar_('Campos', existente, campos);
    bitacora_('campo_actualizado', existente.id, campos);
    return String(existente.id);
  }
  campos.id = nuevoId_();
  insertar_('Campos', campos);
  bitacora_('campo_alta', campos.id, campos);
  return campos.id;
}

/**
 * Borra la definición de un campo. Los valores ya capturados se quedan en la
 * columna extras: si el campo se vuelve a crear con la misma clave, reaparecen.
 */
function apiBorrarCampo(id) {
  exigirAdmin_();
  var fila = buscarPorId_('Campos', id);
  if (!fila) {
    throw new Error('No encuentro ese campo.');
  }
  var tabla = String(fila.ambito) === 'proveedor' ? 'Proveedores' : 'Tarifas';
  var clave = texto_(fila.clave);
  var conValor = leerTodo_(tabla).filter(function (f) {
    return extrasDe_(f)[clave] !== undefined && extrasDe_(f)[clave] !== '';
  }).length;

  if (conValor) {
    actualizar_('Campos', fila, { estado: 'inactivo' });
    bitacora_('campo_desactivado', id, { con_valor: conValor });
    return { borrado: false, desactivado: true, registros: conValor };
  }
  borrar_('Campos', fila);
  bitacora_('campo_borrado', id, { etiqueta: texto_(fila.etiqueta) });
  return { borrado: true, desactivado: false, registros: 0 };
}
