/**
 * TLTERMINALS · Tarifarios — importación de datos.
 *
 * Los tarifarios llegan como los manda cada transportista: un Excel, un CSV, a
 * veces pegado en un correo. Aquí se traga texto separado por comas, punto y
 * coma o tabuladores (lo que sale de copiar y pegar desde Excel), se reconocen
 * las columnas aunque vengan con otro nombre, y se revisa todo ANTES de tocar
 * la base de datos: primero se ve qué va a pasar, luego se aplica.
 */

/**
 * Nombres que puede traer cada columna. La comparación ignora acentos,
 * mayúsculas y espacios, así que "Tipo de Mercancía" llega aquí como
 * "tipodemercancia".
 * @private
 */
var ALIAS = {
  proveedores: {
    nombre: ['nombre', 'proveedor', 'transportista', 'razonsocial', 'linea',
             'lineatransportista', 'empresa'],
    rfc: ['rfc'],
    contacto: ['contacto', 'nombrecontacto', 'ejecutivo', 'vendedor', 'atencion'],
    telefono: ['telefono', 'tel', 'celular', 'telefonos', 'whatsapp'],
    correo: ['correo', 'email', 'mail', 'correoelectronico'],
    ciudad: ['ciudad', 'plaza', 'ubicacion', 'sede', 'base'],
    calificacion: ['calificacion', 'rating', 'evaluacion', 'estrellas'],
    estado: ['estado', 'activo', 'status', 'situacion'],
    notas: ['notas', 'observaciones', 'comentarios', 'nota']
  },
  rutas: {
    origen: ['origen', 'desde', 'ciudadorigen', 'plazaorigen', 'salida'],
    destino: ['destino', 'hasta', 'ciudaddestino', 'plazadestino', 'llegada'],
    km: ['km', 'kms', 'kilometros', 'distancia', 'distanciakm'],
    estado: ['estado', 'activo', 'status'],
    notas: ['notas', 'observaciones', 'comentarios']
  },
  tarifas: {
    proveedor: ['proveedor', 'transportista', 'linea', 'razonsocial', 'nombre', 'empresa'],
    ruta: ['ruta', 'tramo', 'trayecto'],
    origen: ['origen', 'ciudadorigen', 'plazaorigen', 'salida'],
    destino: ['destino', 'ciudaddestino', 'plazadestino', 'llegada'],
    mercancia: ['mercancia', 'tipomercancia', 'tipodemercancia', 'carga', 'tipocarga',
                'producto', 'tipodecarga'],
    equipo: ['equipo', 'tipoequipo', 'tipodeequipo', 'unidad', 'tipounidad', 'camion',
             'tipodeunidad', 'configuracion'],
    moneda: ['moneda', 'divisa', 'currency'],
    tarifa: ['tarifa', 'tarifabase', 'flete', 'precio', 'costo', 'importe', 'monto',
             'fletebase'],
    combustiblePct: ['combustible', 'combustiblepct', 'sobrecargocombustible', 'fsc',
                     'porcentajecombustible', 'combustibleporcentaje', 'cargocombustible'],
    casetas: ['casetas', 'peajes', 'caseta', 'tolls'],
    maniobras: ['maniobras', 'maniobra', 'cargaydescarga', 'estadias'],
    otros: ['otros', 'extras', 'adicionales', 'otroscargos', 'cargosadicionales'],
    tiempoHoras: ['tiempohoras', 'horas', 'tiempo', 'tiempoentrega', 'tiempodeentrega',
                  'tiempodeentregahoras', 'transito', 'tiempotransito', 'horasentrega'],
    tiempoDias: ['dias', 'tiempodias', 'diasentrega', 'tiempodeentregadias', 'diastransito'],
    capacidadTon: ['capacidad', 'capacidadton', 'toneladas', 'tonelaje', 'pesomaximo',
                   'capacidadtoneladas'],
    vigenciaDesde: ['vigenciadesde', 'desde', 'inicio', 'vigenciainicio', 'fechainicio',
                    'inicionvigencia', 'iniciovigencia'],
    vigenciaHasta: ['vigenciahasta', 'hasta', 'fin', 'vigenciafin', 'fechafin',
                    'vencimiento', 'finvigencia'],
    estado: ['estado', 'activo', 'status'],
    notas: ['notas', 'observaciones', 'comentarios']
  }
};

/* --------------------------------- lectura -------------------------------- */

/**
 * Adivina con qué está separado el archivo mirando el primer renglón fuera de
 * comillas. Copiar y pegar desde Excel da tabuladores; los CSV de por acá
 * suelen venir con punto y coma.
 * @private
 */
function delimitador_(texto) {
  var linea = String(texto).split(/\r?\n/)[0] || '';
  var conteos = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  var dentro = false;
  for (var i = 0; i < linea.length; i++) {
    var c = linea.charAt(i);
    if (c === '"') {
      dentro = !dentro;
    } else if (!dentro && conteos[c] !== undefined) {
      conteos[c]++;
    }
  }
  var mejor = ',';
  Object.keys(conteos).forEach(function (c) {
    if (conteos[c] > conteos[mejor]) {
      mejor = c;
    }
  });
  return conteos[mejor] === 0 ? ',' : mejor;
}

/**
 * Convierte el texto en una matriz. Respeta comillas dobles, saltos de línea
 * dentro de una celda y comillas escapadas ("").
 * @return {Array<Array<string>>}
 * @private
 */
function matriz_(texto, sep) {
  var filas = [];
  var fila = [];
  var celda = '';
  var dentro = false;
  var t = String(texto).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (var i = 0; i < t.length; i++) {
    var c = t.charAt(i);
    if (dentro) {
      if (c === '"') {
        if (t.charAt(i + 1) === '"') {
          celda += '"';
          i++;
        } else {
          dentro = false;
        }
      } else {
        celda += c;
      }
    } else if (c === '"') {
      dentro = true;
    } else if (c === sep) {
      fila.push(celda);
      celda = '';
    } else if (c === '\n') {
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = '';
    } else {
      celda += c;
    }
  }
  fila.push(celda);
  filas.push(fila);

  return filas.filter(function (f) {
    return f.some(function (v) { return String(v).trim() !== ''; });
  });
}

/**
 * Empareja los encabezados del archivo con los campos que entiende el sistema.
 * @return {Object} {campos: {campo: indice}, ignoradas: [...], columnas: [...]}
 * @private
 */
function mapearColumnas_(encabezados, tipo) {
  var alias = ALIAS[tipo];
  var campos = {};
  var ignoradas = [];
  var columnas = [];

  encabezados.forEach(function (bruto, i) {
    var titulo = String(bruto).trim();
    columnas.push(titulo);
    var norma = normalizar_(titulo);
    if (!norma) {
      return;
    }
    var encontrado = '';
    Object.keys(alias).forEach(function (campo) {
      if (encontrado || campos[campo] !== undefined) {
        return;
      }
      if (alias[campo].indexOf(norma) !== -1) {
        encontrado = campo;
      }
    });
    if (encontrado) {
      campos[encontrado] = i;
    } else {
      ignoradas.push(titulo);
    }
  });

  return { campos: campos, ignoradas: ignoradas, columnas: columnas };
}

/**
 * El contenido de una celda. Devuelve '' tanto si la columna no viene en el
 * archivo como si viene vacía; esa diferencia no importa para importar, pero
 * sí importa no confundir "vacío" con "cero".
 * @private
 */
function valorDe_(fila, campos, campo) {
  var i = campos[campo];
  if (i === undefined) {
    return '';
  }
  return String(fila[i] === undefined ? '' : fila[i]).trim();
}

/** Número, o '' cuando la celda venía vacía. @private */
function numeroDe_(fila, campos, campo) {
  var bruto = valorDe_(fila, campos, campo);
  return bruto === '' ? '' : numero_(bruto, 0);
}

/** 'activo' / 'inactivo', o '' cuando la celda venía vacía. @private */
function estadoDe_(fila, campos) {
  var bruto = valorDe_(fila, campos, 'estado');
  if (bruto === '') {
    return '';
  }
  return esSi_(bruto) ? 'activo' : 'inactivo';
}

/**
 * Parte "Monterrey - Guadalajara", "Monterrey → Guadalajara" o "Monterrey a
 * Guadalajara" en sus extremos. Se prueban los separadores del más claro al
 * más ambiguo y se corta en la primera coincidencia, para no destrozar nombres
 * como "Cd. Juárez" o "Puerto Vallarta - Centro".
 * @private
 */
function partirRuta_(texto) {
  var t = String(texto || '').trim();
  if (!t) {
    return null;
  }
  var patrones = [/\s*(?:→|-->|->|=>|>)\s*/, /\s+[-–—]\s+/, /\s+a\s+/i, /\s*\/\s*/];
  for (var i = 0; i < patrones.length; i++) {
    var corte = t.match(patrones[i]);
    if (!corte || corte.index <= 0) {
      continue;
    }
    var origen = t.substring(0, corte.index).trim();
    var destino = t.substring(corte.index + corte[0].length).trim();
    if (origen && destino) {
      return { origen: origen, destino: destino };
    }
  }
  return null;
}

/* --------------------------------- análisis -------------------------------- */

/**
 * Revisa el archivo sin escribir nada: qué se daría de alta, qué se
 * actualizaría y qué renglones traen problemas.
 *
 * @param {string} tipo 'proveedores', 'rutas' o 'tarifas'.
 * @param {string} texto Contenido del archivo o de lo que se pegó.
 * @param {Object} opciones {crearFaltantes}
 * @return {Object} El informe.
 */
function apiImportarRevisar(tipo, texto, opciones) {
  exigirAdmin_();
  return analizar_(tipo, texto, opciones || {});
}

function analizar_(tipo, texto, opciones) {
  if (!ALIAS[tipo]) {
    throw new Error('No sé importar "' + tipo + '".');
  }
  if (!String(texto || '').trim()) {
    throw new Error('No hay nada que importar: el archivo llegó vacío.');
  }
  var crear = opciones.crearFaltantes !== false;

  var sep = delimitador_(texto);
  var datos = matriz_(texto, sep);
  if (datos.length < 2) {
    throw new Error('El archivo necesita un renglón de encabezados y al menos un renglón de datos.');
  }

  var mapa = mapearColumnas_(datos[0], tipo);
  var faltan = camposObligatorios_(tipo).filter(function (grupo) {
    return !grupo.some(function (campo) { return mapa.campos[campo] !== undefined; });
  });
  if (faltan.length) {
    throw new Error('Faltan columnas en el archivo: '
      + faltan.map(function (g) { return g.join(' o '); }).join(', ')
      + '. Las columnas que sí reconocí: '
      + (Object.keys(mapa.campos).join(', ') || 'ninguna') + '.');
  }

  var contexto = contextoImportacion_();
  var filas = [];
  var nuevos = { proveedores: {}, rutas: {}, mercancias: {}, equipos: {} };
  var conteo = { altas: 0, actualizaciones: 0, errores: 0 };

  for (var i = 1; i < datos.length; i++) {
    var renglon = leerRenglon_(tipo, datos[i], mapa.campos, contexto, nuevos, crear);
    renglon.n = i + 1;
    if (renglon.problemas.length) {
      renglon.accion = 'error';
      conteo.errores++;
    } else if (renglon.accion === 'actualiza') {
      conteo.actualizaciones++;
    } else {
      conteo.altas++;
    }
    filas.push(renglon);
  }

  return {
    tipo: tipo,
    delimitador: sep === '\t' ? 'tabulador' : sep,
    columnas: mapa.columnas,
    reconocidas: Object.keys(mapa.campos),
    ignoradas: mapa.ignoradas,
    filas: filas,
    nuevos: {
      proveedores: Object.keys(nuevos.proveedores).map(function (k) { return nuevos.proveedores[k]; }),
      rutas: Object.keys(nuevos.rutas).map(function (k) { return nuevos.rutas[k]; }),
      mercancias: Object.keys(nuevos.mercancias).map(function (k) { return nuevos.mercancias[k]; }),
      equipos: Object.keys(nuevos.equipos).map(function (k) { return nuevos.equipos[k]; })
    },
    resumen: {
      total: filas.length,
      altas: conteo.altas,
      actualizaciones: conteo.actualizaciones,
      errores: conteo.errores
    }
  };
}

/** Al menos una columna de cada grupo tiene que venir. @private */
function camposObligatorios_(tipo) {
  if (tipo === 'proveedores') {
    return [['nombre']];
  }
  if (tipo === 'rutas') {
    return [['origen'], ['destino']];
  }
  return [['proveedor'], ['ruta', 'origen'], ['tarifa']];
}

/**
 * Índices en memoria de lo que ya existe, para no recorrer las tablas en cada
 * renglón del archivo.
 * @private
 */
function contextoImportacion_() {
  var ctx = {
    proveedores: {}, rutas: {}, mercancias: {}, equipos: {}, tarifas: {},
    monedaBase: String(leerConfig('monedaBase') || 'MXN').toUpperCase()
  };
  leerTodo_('Proveedores').forEach(function (p) {
    ctx.proveedores[normalizar_(p.nombre)] = p;
    if (normalizar_(p.rfc)) {
      ctx.proveedores[normalizar_(p.rfc)] = p;
    }
  });
  leerTodo_('Rutas').forEach(function (r) {
    ctx.rutas[normalizar_(r.origen) + '|' + normalizar_(r.destino)] = r;
  });
  leerTodo_('Catalogos').forEach(function (c) {
    var destino = String(c.tipo) === 'equipo' ? ctx.equipos : ctx.mercancias;
    destino[normalizar_(c.clave)] = c;
    destino[normalizar_(c.nombre)] = c;
  });
  leerTodo_('Tarifas').forEach(function (t) {
    ctx.tarifas[claveTarifa_(t.proveedorId, t.rutaId, t.mercancia, t.equipo,
                             fecha_(t.vigenciaDesde))] = t;
  });
  return ctx;
}

function claveTarifa_(proveedorId, rutaId, mercancia, equipo, desde) {
  return String(proveedorId) + '|' + String(rutaId) + '|' + normalizar_(mercancia)
    + '|' + normalizar_(equipo) + '|' + String(desde || '');
}

/** @private */
function leerRenglon_(tipo, fila, campos, ctx, nuevos, crear) {
  if (tipo === 'proveedores') {
    return renglonProveedor_(fila, campos, ctx);
  }
  if (tipo === 'rutas') {
    return renglonRuta_(fila, campos, ctx);
  }
  return renglonTarifa_(fila, campos, ctx, nuevos, crear);
}

function renglonProveedor_(fila, campos, ctx) {
  var problemas = [];
  var nombre = valorDe_(fila, campos, 'nombre');
  if (!nombre) {
    problemas.push('Falta el nombre del proveedor.');
  }
  var calificacion = numeroDe_(fila, campos, 'calificacion');
  if (calificacion !== '' && (calificacion < 0 || calificacion > 5)) {
    problemas.push('La calificación va de 0 a 5.');
  }
  var existente = ctx.proveedores[normalizar_(nombre)];

  return {
    problemas: problemas,
    accion: existente ? 'actualiza' : 'alta',
    resumen: nombre,
    datos: {
      id: existente ? String(existente.id) : '',
      nombre: nombre,
      rfc: valorDe_(fila, campos, 'rfc').toUpperCase(),
      contacto: valorDe_(fila, campos, 'contacto'),
      telefono: valorDe_(fila, campos, 'telefono'),
      correo: valorDe_(fila, campos, 'correo').toLowerCase(),
      ciudad: valorDe_(fila, campos, 'ciudad'),
      calificacion: calificacion,
      estado: estadoDe_(fila, campos),
      notas: valorDe_(fila, campos, 'notas')
    }
  };
}

function renglonRuta_(fila, campos, ctx) {
  var problemas = [];
  var origen = valorDe_(fila, campos, 'origen');
  var destino = valorDe_(fila, campos, 'destino');
  if (!origen) {
    problemas.push('Falta el origen.');
  }
  if (!destino) {
    problemas.push('Falta el destino.');
  }
  var existente = ctx.rutas[normalizar_(origen) + '|' + normalizar_(destino)];

  return {
    problemas: problemas,
    accion: existente ? 'actualiza' : 'alta',
    resumen: origen + ' → ' + destino,
    datos: {
      id: existente ? String(existente.id) : '',
      origen: origen,
      destino: destino,
      km: numeroDe_(fila, campos, 'km'),
      estado: estadoDe_(fila, campos),
      notas: valorDe_(fila, campos, 'notas')
    }
  };
}

function renglonTarifa_(fila, campos, ctx, nuevos, crear) {
  var problemas = [];

  var proveedor = valorDe_(fila, campos, 'proveedor');
  if (!proveedor) {
    problemas.push('Falta el proveedor.');
  }
  var filaProveedor = ctx.proveedores[normalizar_(proveedor)];
  if (proveedor && !filaProveedor) {
    if (crear) {
      nuevos.proveedores[normalizar_(proveedor)] = proveedor;
    } else {
      problemas.push('El proveedor "' + proveedor + '" no está dado de alta.');
    }
  }

  var origen = valorDe_(fila, campos, 'origen');
  var destino = valorDe_(fila, campos, 'destino');
  if (!origen || !destino) {
    var partida = partirRuta_(valorDe_(fila, campos, 'ruta'));
    if (partida) {
      origen = origen || partida.origen;
      destino = destino || partida.destino;
    }
  }
  if (!origen || !destino) {
    problemas.push('Falta la ruta: se necesitan origen y destino.');
  }
  var claveRuta = normalizar_(origen) + '|' + normalizar_(destino);
  var filaRuta = ctx.rutas[claveRuta];
  if (origen && destino && !filaRuta) {
    if (crear) {
      nuevos.rutas[claveRuta] = origen + ' → ' + destino;
    } else {
      problemas.push('La ruta ' + origen + ' → ' + destino + ' no está dada de alta.');
    }
  }

  var mercancia = valorDe_(fila, campos, 'mercancia');
  var claveMercancia = '';
  if (!mercancia) {
    claveMercancia = 'general';
  } else if (ctx.mercancias[normalizar_(mercancia)]) {
    claveMercancia = texto_(ctx.mercancias[normalizar_(mercancia)].clave);
  } else if (crear) {
    claveMercancia = normalizar_(mercancia);
    nuevos.mercancias[claveMercancia] = mercancia;
  } else {
    problemas.push('El tipo de mercancía "' + mercancia + '" no está en el catálogo.');
  }

  var equipo = valorDe_(fila, campos, 'equipo');
  var claveEquipo = '';
  if (!equipo) {
    problemas.push('Falta el tipo de equipo.');
  } else if (ctx.equipos[normalizar_(equipo)]) {
    claveEquipo = texto_(ctx.equipos[normalizar_(equipo)].clave);
  } else if (crear) {
    claveEquipo = normalizar_(equipo);
    nuevos.equipos[claveEquipo] = equipo;
  } else {
    problemas.push('El tipo de equipo "' + equipo + '" no está en el catálogo.');
  }

  var tarifa = numero_(valorDe_(fila, campos, 'tarifa'), -1);
  if (tarifa < 0) {
    problemas.push('Falta la tarifa o no se entiende el número.');
  }

  var horas = numero_(valorDe_(fila, campos, 'tiempoHoras'), 0);
  var dias = numero_(valorDe_(fila, campos, 'tiempoDias'), 0);
  if (!horas && dias) {
    horas = dias * 24;
  }
  if (horas <= 0) {
    problemas.push('Falta el tiempo de entrega (en horas o en días).');
  }

  var moneda = valorDe_(fila, campos, 'moneda').toUpperCase() || ctx.monedaBase;
  if (MONEDAS.indexOf(moneda) === -1) {
    problemas.push('Moneda no reconocida: "' + moneda + '". Solo ' + MONEDAS.join(' o ') + '.');
  }

  var desdeTexto = valorDe_(fila, campos, 'vigenciaDesde');
  var hastaTexto = valorDe_(fila, campos, 'vigenciaHasta');
  var desde = fecha_(desdeTexto);
  var hasta = fecha_(hastaTexto);
  if (desdeTexto && !desde) {
    problemas.push('No entiendo la fecha de inicio de vigencia "' + desdeTexto + '".');
  }
  if (hastaTexto && !hasta) {
    problemas.push('No entiendo la fecha de fin de vigencia "' + hastaTexto + '".');
  }
  if (desde && hasta && hasta < desde) {
    problemas.push('La vigencia termina antes de empezar.');
  }

  var existente = (filaProveedor && filaRuta)
    ? ctx.tarifas[claveTarifa_(filaProveedor.id, filaRuta.id, claveMercancia, claveEquipo, desde)]
    : null;

  var datos = {
    id: existente ? String(existente.id) : '',
    proveedor: proveedor,
    origen: origen,
    destino: destino,
    km: numero_(valorDe_(fila, campos, 'km'), 0),
    mercancia: claveMercancia,
    equipo: claveEquipo,
    moneda: moneda,
    tarifa: tarifa < 0 ? 0 : tarifa,
    combustiblePct: numero_(valorDe_(fila, campos, 'combustiblePct'), 0),
    casetas: numero_(valorDe_(fila, campos, 'casetas'), 0),
    maniobras: numero_(valorDe_(fila, campos, 'maniobras'), 0),
    otros: numero_(valorDe_(fila, campos, 'otros'), 0),
    tiempoHoras: horas,
    capacidadTon: numero_(valorDe_(fila, campos, 'capacidadTon'), 0),
    vigenciaDesde: desde,
    vigenciaHasta: hasta,
    estado: estadoDe_(fila, campos) || 'activo',
    notas: valorDe_(fila, campos, 'notas')
  };

  // Lo que el archivo no traía no se toca al actualizar: un tarifario que solo
  // manda precios nuevos no debe borrar las casetas ya capturadas.
  datos._vacios = ['combustiblePct', 'casetas', 'maniobras', 'otros', 'capacidadTon',
                   'vigenciaHasta', 'notas', 'estado'].filter(function (campo) {
    return valorDe_(fila, campos, campo) === '';
  });

  return {
    problemas: problemas,
    accion: existente ? 'actualiza' : 'alta',
    resumen: proveedor + ' · ' + origen + ' → ' + destino + ' · '
      + (mercancia || 'general') + ' · ' + equipo,
    datos: datos
  };
}

/* -------------------------------- aplicación ------------------------------- */

/**
 * Escribe de verdad lo que el análisis dijo que iba a pasar. Los renglones con
 * problemas se saltan y se reportan; el resto entra en bloque.
 *
 * @param {string} tipo 'proveedores', 'rutas' o 'tarifas'.
 * @param {string} texto El mismo contenido que se revisó.
 * @param {Object} opciones {crearFaltantes, omitirErrores}
 * @return {Object} {altas, actualizaciones, omitidas, nuevos, errores}
 */
function apiImportarAplicar(tipo, texto, opciones) {
  exigirAdmin_();
  var op = opciones || {};
  var informe = analizar_(tipo, texto, op);

  if (informe.resumen.errores && op.omitirErrores === false) {
    throw new Error('El archivo trae ' + informe.resumen.errores
      + ' renglones con problemas. Corrígelos o marca "importar de todos modos".');
  }

  var buenas = informe.filas.filter(function (f) { return !f.problemas.length; });
  var salida;
  if (tipo === 'proveedores') {
    salida = aplicarProveedores_(buenas);
  } else if (tipo === 'rutas') {
    salida = aplicarRutas_(buenas);
  } else {
    salida = aplicarTarifas_(buenas, op.crearFaltantes !== false);
  }

  salida.omitidas = informe.resumen.errores;
  salida.errores = informe.filas.filter(function (f) { return f.problemas.length; })
    .slice(0, 50).map(function (f) {
      return { n: f.n, resumen: f.resumen, problemas: f.problemas };
    });

  bitacora_('importacion', tipo, {
    altas: salida.altas, actualizaciones: salida.actualizaciones, omitidas: salida.omitidas
  });
  olvidarCache_();
  return salida;
}

/**
 * Escribe un renglón ya localizado sin volver a leer la tabla. Importar cientos
 * de renglones releyendo la hoja cada vez se pasa del tiempo de ejecución.
 * @private
 */
function escribirFila_(nombre, numeroFila, objeto) {
  var campos = TABLAS[nombre];
  var renglon = campos.map(function (campo) {
    return objeto[campo] === undefined ? '' : objeto[campo];
  });
  hoja_(nombre).getRange(numeroFila, 1, 1, campos.length).setValues([renglon]);
}

function aplicarProveedores_(filas) {
  var porNombre = {};
  leerTodo_('Proveedores').forEach(function (p) { porNombre[normalizar_(p.nombre)] = p; });

  var nuevos = [];
  var actualizaciones = 0;
  filas.forEach(function (f) {
    var d = f.datos;
    var existente = d.id ? buscarPorId_('Proveedores', d.id) : porNombre[normalizar_(d.nombre)];
    if (existente) {
      Object.keys(d).forEach(function (campo) {
        if (campo !== 'id' && d[campo] !== '') {
          existente[campo] = d[campo];
        }
      });
      escribirFila_('Proveedores', existente._fila, existente);
      actualizaciones++;
      return;
    }
    var alta = {
      id: nuevoId_(), nombre: d.nombre, rfc: d.rfc, contacto: d.contacto,
      telefono: d.telefono, correo: d.correo, ciudad: d.ciudad,
      calificacion: d.calificacion === '' ? 0 : d.calificacion,
      estado: d.estado || 'activo', notas: d.notas, creado: ahora_()
    };
    porNombre[normalizar_(d.nombre)] = alta;
    nuevos.push(alta);
  });

  insertarVarios_('Proveedores', nuevos);
  return { altas: nuevos.length, actualizaciones: actualizaciones };
}

function aplicarRutas_(filas) {
  var porClave = {};
  leerTodo_('Rutas').forEach(function (r) {
    porClave[normalizar_(r.origen) + '|' + normalizar_(r.destino)] = r;
  });

  var nuevas = [];
  var actualizaciones = 0;
  filas.forEach(function (f) {
    var d = f.datos;
    var clave = normalizar_(d.origen) + '|' + normalizar_(d.destino);
    var existente = porClave[clave];
    if (existente && existente._fila) {
      if (d.km !== '') {
        existente.km = d.km;
      }
      if (d.estado !== '') {
        existente.estado = d.estado;
      }
      if (d.notas) {
        existente.notas = d.notas;
      }
      escribirFila_('Rutas', existente._fila, existente);
      actualizaciones++;
      return;
    }
    if (existente) {
      return;
    }
    var alta = {
      id: nuevoId_(), origen: d.origen, destino: d.destino,
      km: d.km === '' ? 0 : d.km, notas: d.notas,
      estado: d.estado || 'activo', creado: ahora_()
    };
    porClave[clave] = alta;
    nuevas.push(alta);
  });

  insertarVarios_('Rutas', nuevas);
  return { altas: nuevas.length, actualizaciones: actualizaciones };
}

function aplicarTarifas_(filas, crear) {
  var ctx = contextoImportacion_();

  // 1. Lo que falta se da de alta primero, en bloque, para que las tarifas ya
  //    encuentren a quién y a dónde apuntar.
  var proveedoresNuevos = [];
  var rutasNuevas = [];
  var catalogosNuevos = [];

  filas.forEach(function (f) {
    var d = f.datos;
    var claveProveedor = normalizar_(d.proveedor);
    if (crear && claveProveedor && !ctx.proveedores[claveProveedor]) {
      var proveedor = {
        id: nuevoId_(), nombre: d.proveedor, rfc: '', contacto: '', telefono: '',
        correo: '', ciudad: '', calificacion: 0, estado: 'activo',
        notas: 'Alta automática al importar', creado: ahora_()
      };
      ctx.proveedores[claveProveedor] = proveedor;
      proveedoresNuevos.push(proveedor);
    }
    var claveRuta = normalizar_(d.origen) + '|' + normalizar_(d.destino);
    if (crear && d.origen && d.destino && !ctx.rutas[claveRuta]) {
      var ruta = {
        id: nuevoId_(), origen: d.origen, destino: d.destino, km: d.km,
        notas: 'Alta automática al importar', estado: 'activo', creado: ahora_()
      };
      ctx.rutas[claveRuta] = ruta;
      rutasNuevas.push(ruta);
    }
    [['mercancia', 'mercancias'], ['equipo', 'equipos']].forEach(function (par) {
      var clave = normalizar_(d[par[0]]);
      if (!crear || !clave || ctx[par[1]][clave]) {
        return;
      }
      var registro = {
        id: nuevoId_(), tipo: par[0], clave: clave, nombre: d[par[0]],
        orden: 99, estado: 'activo'
      };
      ctx[par[1]][clave] = registro;
      catalogosNuevos.push(registro);
    });
  });

  insertarVarios_('Proveedores', proveedoresNuevos);
  insertarVarios_('Rutas', rutasNuevas);
  insertarVarios_('Catalogos', catalogosNuevos);

  // 2. Ahora sí las tarifas: las que ya existían se sobrescriben en su renglón,
  //    las demás se agregan de un jalón.
  var nuevas = [];
  var actualizaciones = 0;
  var sinReferencia = 0;
  var momento = ahora_();

  filas.forEach(function (f) {
    var d = f.datos;
    var proveedor = ctx.proveedores[normalizar_(d.proveedor)];
    var ruta = ctx.rutas[normalizar_(d.origen) + '|' + normalizar_(d.destino)];
    if (!proveedor || !ruta) {
      sinReferencia++;
      return;
    }
    var campos = {
      proveedorId: String(proveedor.id),
      rutaId: String(ruta.id),
      mercancia: d.mercancia,
      equipo: d.equipo,
      moneda: d.moneda,
      tarifa: d.tarifa,
      combustiblePct: d.combustiblePct,
      casetas: d.casetas,
      maniobras: d.maniobras,
      otros: d.otros,
      tiempoHoras: d.tiempoHoras,
      capacidadTon: d.capacidadTon,
      vigenciaDesde: d.vigenciaDesde,
      vigenciaHasta: d.vigenciaHasta,
      estado: d.estado,
      notas: d.notas,
      actualizado: momento
    };
    var clave = claveTarifa_(campos.proveedorId, campos.rutaId, campos.mercancia,
                             campos.equipo, campos.vigenciaDesde);
    var vacios = d._vacios || [];
    var existente = ctx.tarifas[clave];
    if (existente && existente._fila) {
      campos.id = String(existente.id);
      Object.keys(campos).forEach(function (c) {
        if (vacios.indexOf(c) === -1) {
          existente[c] = campos[c];
        }
      });
      escribirFila_('Tarifas', existente._fila, existente);
      actualizaciones++;
      return;
    }
    if (existente) {
      // El archivo trae la misma combinación dos veces: gana el último renglón.
      Object.keys(campos).forEach(function (c) {
        if (vacios.indexOf(c) === -1) {
          existente[c] = campos[c];
        }
      });
      return;
    }
    campos.id = nuevoId_();
    ctx.tarifas[clave] = campos;
    nuevas.push(campos);
  });

  insertarVarios_('Tarifas', nuevas);

  return {
    altas: nuevas.length,
    actualizaciones: actualizaciones,
    sinReferencia: sinReferencia,
    nuevos: {
      proveedores: proveedoresNuevos.length,
      rutas: rutasNuevas.length,
      catalogos: catalogosNuevos.length
    }
  };
}

/* -------------------------------- plantillas ------------------------------- */

/**
 * Archivo de ejemplo con las columnas que el sistema entiende. Es la manera
 * rápida de pedirle su tarifario a un transportista: "llénalo aquí".
 * @return {Object} {nombre, contenido}
 */
function apiPlantilla(tipo) {
  exigirSesion_();
  var plantillas = {
    proveedores: {
      columnas: ['nombre', 'rfc', 'contacto', 'telefono', 'correo', 'ciudad',
                 'calificacion', 'estado', 'notas'],
      ejemplos: [
        ['Transportes del Norte', 'TNO950101AB1', 'Laura Méndez', '81 1234 5678',
         'ventas@tnorte.mx', 'Monterrey', '4.5', 'activo', 'Crédito 30 días'],
        ['Fletes Bajío', 'FBA010203XY2', 'Jorge Ruiz', '477 890 1234',
         'jruiz@fletesbajio.mx', 'León', '4', 'activo', '']
      ]
    },
    rutas: {
      columnas: ['origen', 'destino', 'km', 'estado', 'notas'],
      ejemplos: [
        ['Monterrey', 'Guadalajara', '780', 'activo', ''],
        ['Manzanillo', 'CDMX', '810', 'activo', 'Corredor de importación']
      ]
    },
    tarifas: {
      columnas: ['proveedor', 'origen', 'destino', 'mercancia', 'equipo', 'moneda',
                 'tarifa', 'combustible', 'casetas', 'maniobras', 'otros',
                 'tiempoHoras', 'capacidad', 'vigenciaDesde', 'vigenciaHasta',
                 'estado', 'notas'],
      ejemplos: [
        ['Transportes del Norte', 'Monterrey', 'Guadalajara', 'general', 'full',
         'MXN', '38500', '12', '2450', '0', '0', '18', '48',
         '2026-01-01', '2026-12-31', 'activo', 'Incluye seguro de carga'],
        ['Fletes Bajío', 'Monterrey', 'Guadalajara', 'general', 'sencillo',
         'MXN', '24800', '10', '2450', '800', '0', '22', '24',
         '2026-01-01', '2026-12-31', 'activo', '']
      ]
    }
  };

  var p = plantillas[tipo];
  if (!p) {
    throw new Error('No hay plantilla para "' + tipo + '".');
  }
  var lineas = [p.columnas].concat(p.ejemplos).map(function (fila) {
    return fila.map(celdaCsv_).join(',');
  });
  return {
    nombre: 'plantilla-' + tipo + '.csv',
    contenido: lineas.join('\n')
  };
}
