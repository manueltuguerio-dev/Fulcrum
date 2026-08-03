/**
 * TLTERMINALS · Tarifarios de transportistas — aplicación web.
 *
 * Punto de entrada. La lógica está repartida así:
 *   Db.gs          hoja de cálculo como base de datos
 *   Sesion.gs      quién entra, qué puede hacer y los ajustes
 *   Catalogos.gs   proveedores, rutas, tipos de mercancía y de equipo
 *   Tarifas.gs     captura de tarifas y cómo se arma el costo total
 *   Comparador.gs  el orden de la mejor opción a la peor
 *   Importar.gs    lectura de CSV y de lo que se pega desde Excel
 *   Exportar.gs    CSV y hoja de cálculo en Drive
 *
 * Para instalar, ejecuta desde el editor:
 *   1. instalar()       crea la hoja de cálculo y te deja como administrador
 *   2. cargarEjemplo()  opcional: datos de prueba para ver el comparador andando
 * y luego publica: Implementar > Nueva implementación > Aplicación web.
 */

var TITULO = 'Tarifarios de transportistas';

function doGet(e) {
  var plantilla = HtmlService.createTemplateFromFile('Index');
  // La liga personal viene como ?t=TOKEN. El navegador lo guarda y lo manda
  // en cada llamada, que es lo que permite entrar con correos externos.
  plantilla.tokenInicial = (e && e.parameter && e.parameter.t)
    ? String(e.parameter.t) : '';
  return plantilla.evaluate()
    .setTitle(TITULO)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Funciones que el navegador puede invocar. Todo lo que no esté aquí es
 * inalcanzable desde el cliente.
 */
var FUNCIONES_PUBLICAS = [
  'apiEstadoInicial', 'apiUsuarios', 'apiGuardarUsuario', 'apiBorrarUsuario',
  'apiRegenerarLiga', 'apiGuardarConfig',
  'apiProveedores', 'apiGuardarProveedor', 'apiBorrarProveedor',
  'apiRutas', 'apiGuardarRuta', 'apiBorrarRuta',
  'apiCatalogos', 'apiGuardarCatalogo', 'apiBorrarCatalogo',
  'apiTarifas', 'apiGuardarTarifa', 'apiBorrarTarifa', 'apiDuplicarTarifa',
  'apiCambiarEstadoTarifa',
  'apiComparar', 'apiMejoresOpciones', 'apiHistorial',
  'apiImportarRevisar', 'apiImportarAplicar', 'apiPlantilla',
  'apiExportarCsv', 'apiExportarLibro', 'apiRespaldo'
];

/**
 * Punto único por el que pasan todas las llamadas del navegador. Fija el token
 * de la sesión y luego ejecuta la función pedida.
 *
 * @param {string} token Token de la liga personal, o cadena vacía.
 * @param {string} nombre Función a ejecutar.
 * @param {Array} args Sus argumentos.
 * @return {*} Lo que devuelva la función.
 */
function ejecutar(token, nombre, args) {
  SESION_TOKEN = token ? String(token) : '';
  if (FUNCIONES_PUBLICAS.indexOf(String(nombre)) === -1) {
    throw new Error('Operación no permitida: ' + nombre);
  }
  var fn = globalThis[nombre];
  if (typeof fn !== 'function') {
    throw new Error('No existe la función ' + nombre + '.');
  }
  return fn.apply(null, args || []);
}

/**
 * Inserta el contenido de otro archivo HTML. Lo usa Index.html.
 * @param {string} nombre Nombre del archivo, sin extensión.
 * @return {string} Su contenido.
 */
function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

/**
 * Comprobación de instalación. Ejecútala desde el editor y lee el registro.
 * @return {boolean} true si todo está listo.
 */
function verificar() {
  var problemas = [];

  ['Index', 'Estilos', 'Cliente'].forEach(function (archivo) {
    try {
      HtmlService.createHtmlOutputFromFile(archivo);
    } catch (err) {
      problemas.push('Falta el archivo HTML "' + archivo + '": ' + err.message);
    }
  });

  var id = PropertiesService.getScriptProperties().getProperty(PROP_HOJA);
  if (!id) {
    problemas.push('No hay base de datos. Ejecuta instalar() primero.');
  } else {
    try {
      var libro = SpreadsheetApp.openById(id);
      Object.keys(TABLAS).forEach(function (t) {
        if (!libro.getSheetByName(t)) {
          problemas.push('Falta la pestaña "' + t + '". Ejecuta instalar() otra vez.');
        }
      });
      Logger.log('Base de datos: ' + libro.getUrl());
    } catch (err) {
      problemas.push('No pude abrir la hoja de cálculo: ' + err.message);
    }
  }

  if (!adminsActivos_()) {
    problemas.push('No hay ningún administrador activo. Ejecuta instalar().');
  }

  var catalogo = catalogos_();
  if (!catalogo.equipo.length || !catalogo.mercancia.length) {
    problemas.push('Faltan los catálogos de mercancía o de equipo. Ejecuta instalar().');
  }

  if (problemas.length) {
    Logger.log('NO ESTÁ LISTO:');
    problemas.forEach(function (p) { Logger.log('  - ' + p); });
    return false;
  }

  Logger.log('OK — todo listo.');
  Logger.log('Proveedores: ' + leerTodo_('Proveedores').length
    + ' | Rutas: ' + leerTodo_('Rutas').length
    + ' | Tarifas: ' + leerTodo_('Tarifas').length);
  var liga = ligaApp_();
  Logger.log(liga
    ? 'Liga de la aplicación: ' + liga
    : 'Falta publicar: Implementar > Nueva implementación > Aplicación web.');
  return true;
}

/**
 * Carga proveedores, rutas y tarifas de ejemplo para ver el comparador
 * funcionando de inmediato. Solo hace algo si no hay tarifas capturadas.
 * @return {boolean} true si cargó algo.
 */
function cargarEjemplo() {
  if (leerTodo_('Tarifas').length) {
    Logger.log('Ya hay tarifas capturadas: no toco nada.');
    return false;
  }

  var proveedores = [
    ['Transportes del Norte', 'TNO950101AB1', 'Laura Méndez', '81 1234 5678',
     'ventas@tnorte.mx', 'Monterrey', 4.5],
    ['Fletes Bajío', 'FBA010203XY2', 'Jorge Ruiz', '477 890 1234',
     'jruiz@fletesbajio.mx', 'León', 4],
    ['Autolíneas del Golfo', 'AGO880715QP3', 'Sandra Cruz', '229 456 7890',
     'operaciones@agolfo.mx', 'Veracruz', 3.5],
    ['Logística Peninsular', 'LPE050920KJ8', 'Raúl Gómez', '999 321 6547',
     'raul@lpeninsular.mx', 'Mérida', 4.2]
  ].map(function (p) {
    var id = nuevoId_();
    insertar_('Proveedores', {
      id: id, nombre: p[0], rfc: p[1], contacto: p[2], telefono: p[3], correo: p[4],
      ciudad: p[5], calificacion: p[6], estado: 'activo', notas: 'Datos de ejemplo',
      creado: ahora_()
    });
    return id;
  });

  var rutas = [
    ['Monterrey', 'Guadalajara', 780],
    ['Manzanillo', 'CDMX', 810],
    ['Veracruz', 'Monterrey', 1080]
  ].map(function (r) {
    var id = nuevoId_();
    insertar_('Rutas', {
      id: id, origen: r[0], destino: r[1], km: r[2], notas: 'Datos de ejemplo',
      estado: 'activo', creado: ahora_()
    });
    return id;
  });

  // proveedor, ruta, mercancía, equipo, tarifa, combustible %, casetas, horas
  var tarifas = [
    [0, 0, 'general', 'full', 38500, 12, 2450, 18],
    [1, 0, 'general', 'full', 36900, 14, 2450, 22],
    [2, 0, 'general', 'full', 41200, 10, 2450, 16],
    [0, 0, 'general', 'sencillo', 25600, 12, 2450, 20],
    [1, 0, 'general', 'sencillo', 24800, 10, 2450, 22],
    [3, 0, 'general', 'sencillo', 27300, 9, 2450, 17],
    [0, 0, 'refrigerada', 'refrigerado', 44100, 12, 2450, 19],
    [2, 0, 'refrigerada', 'refrigerado', 42800, 15, 2450, 24],
    [1, 1, 'general', 'full', 33400, 11, 3100, 15],
    [2, 1, 'general', 'full', 31900, 13, 3100, 20],
    [3, 1, 'general', 'sencillo', 22750, 10, 3100, 18],
    [0, 1, 'general', 'sencillo', 23900, 12, 3100, 14],
    [2, 2, 'general', 'full', 47600, 13, 3850, 26],
    [0, 2, 'general', 'full', 49900, 11, 3850, 22],
    [3, 2, 'peligrosa', 'sencillo', 58200, 14, 3850, 28]
  ];

  tarifas.forEach(function (t) {
    insertar_('Tarifas', {
      id: nuevoId_(),
      proveedorId: proveedores[t[0]],
      rutaId: rutas[t[1]],
      mercancia: t[2],
      equipo: t[3],
      moneda: 'MXN',
      tarifa: t[4],
      combustiblePct: t[5],
      casetas: t[6],
      maniobras: 0,
      otros: 0,
      tiempoHoras: t[7],
      capacidadTon: t[3] === 'full' ? 48 : 24,
      vigenciaDesde: hoyTexto_(),
      vigenciaHasta: sumarDias_(hoyTexto_(), 365),
      estado: 'activo',
      notas: 'Datos de ejemplo',
      actualizado: ahora_()
    });
  });

  Logger.log('Cargué ' + proveedores.length + ' proveedores, ' + rutas.length
    + ' rutas y ' + tarifas.length + ' tarifas de ejemplo.');
  return true;
}
