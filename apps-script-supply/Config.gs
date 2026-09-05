/**
 * Configuracion y constantes del proceso MX Supply Assurance en Apps Script.
 *
 * Todo lo que puede cambiar sin tocar codigo vive en la hoja "Config" del
 * libro de trabajo. Aqui solo quedan las constantes que describen la forma de
 * los archivos de origen, que es la misma del libro de Excel.
 */

var CFG = {
  // --- Estructura del libro MX -------------------------------------------
  HOJAS: {
    SUPPLY_PLAN: 'SupplyPlan',
    ON_HAND: 'On hand',
    GAPS: 'GAPs files',
    OPEN_PO: 'Open_PO',
    DETAILS: 'Details',
    KB: 'KB Supply',
  },

  // Bloque de 6 filas por parte en "KB Supply", igual que en el Excel.
  BLOQUE: 6,
  PRIMERA_FILA_BLOQUE: 10,
  SEMANAS: 13,               // columnas P..AB
  COL_P: 16,                 // primera columna de semana
  COL_AF: 32,                // ultima columna del bloque
  COL_RIESGO: 33,            // AG, columna auxiliar que agrega esta version

  // Filas del bloque, en el orden que las nombra la columna O.
  FILA_BASE: 0,
  FILA_ARRIBOS: 1,
  FILA_PLAN: 2,
  FILA_PROYECCION: 3,
  FILA_PO_PROMESA: 4,
  FILA_PO_NECESIDAD: 5,
  NOMBRES_SECCION: ['', 'Arrivals', 'Supply Plan', 'Projection', 'Promise. Open POs', 'Need. Open POs'],

  // --- Details -------------------------------------------------------------
  // Data trae los nueve campos en A:I desde la fila 2. En Details esos mismos
  // encabezados viven en B8:J8, porque la columna A es el consecutivo ID que
  // usa el VLOOKUP de KB Supply. Por eso Data!A va a Details!B.
  DETAILS_FILA_ENCABEZADO: 8,
  DETAILS_PRIMERA_FILA: 9,
  DETAILS_ENCABEZADOS: ['ID', 'Concat', 'ORG', 'PART', 'DESCRIPTION', 'SUPPLIER',
    'PURCH_CAT', 'LEADTIME', 'DEFAULT_BUYER', 'PROGRAM_FLAG'],

  // --- Columnas de las hojas de origen ------------------------------------
  // SupplyPlan: A=Concat, D..P = las 13 semanas
  PLAN_COL_CONCAT: 1,
  PLAN_COL_SEMANA1: 4,
  // On hand: B=Site, D=Part, E=Qty
  OH_COL_SITE: 2,
  OH_COL_PART: 4,
  OH_COL_QTY: 5,
  // GAPs files: A=Supplier, B=Part, C=On hand, D..P = 13 semanas. Fila 2 encabezado.
  GAPS_FILA_ENCABEZADO: 2,
  GAPS_COL_SUPPLIER: 1,
  GAPS_COL_PART: 2,
  GAPS_COL_OH: 3,
  GAPS_COL_SEMANA1: 4,
  // Open_PO: A=Concat, BB=PO_QTY_DUE, BC=week, BD=Year, BE=Nweek, BF=Nyear
  PO_COL_CONCAT: 1,
  PO_COL_QTY: 54,
  PO_COL_WEEK: 55,
  PO_COL_YEAR: 56,
  PO_COL_NWEEK: 57,
  PO_COL_NYEAR: 58,

  // --- Colores -------------------------------------------------------------
  // El mismo relleno del formato condicional "celda < 0" del libro de Excel.
  ROJO_FONDO: '#ffc7ce',
  ROJO_TEXTO: '#9c0006',
  MARCA: '#1f3864',
  SUBTOTAL: '#ddebf7',

  // --- Ejecucion -----------------------------------------------------------
  // Apps Script corta a los 6 minutos. Se reserva un margen para guardar el
  // estado y programar la continuacion antes de que llegue el corte.
  PRESUPUESTO_MS: 4 * 60 * 1000,
  FILAS_POR_CHUNK: 20000,        // renglones por lectura de las hojas grandes
  FILAS_POR_ESCRITURA: 600,      // filas de KB Supply por setValues

  // Nombres de los archivos y propiedades que usa el proceso.
  PROP_ESTADO: 'MXSA_ESTADO',
  PROP_CONFIG: 'MXSA_CONFIG',
  ARCHIVO_ESTADO: 'MXSA_estado.json',
  DISPARADOR: 'continuarProceso',
};

/** Hojas del libro de trabajo que crea y mantiene esta aplicacion. */
var HOJAS_TRABAJO = {
  CONFIG: 'Config',
  CONTACTOS: 'Contactos',
  CONSOLIDADO: 'Consolidado',
  RESUMEN: 'Resumen proveedores',
  DETALLE: 'Detalle por ORG',
  BITACORA: 'Bitacora',
};

/**
 * Parametros de la corrida. Se leen de la hoja "Config" para que se puedan
 * cambiar sin abrir el editor de codigo.
 */
function leerParametros() {
  var hoja = libroTrabajo().getSheetByName(HOJAS_TRABAJO.CONFIG);
  if (!hoja) throw new Error('Falta la hoja "Config". Corre "Preparar libro" desde el menu.');

  var valores = hoja.getRange(1, 1, hoja.getLastRow(), 2).getValues();
  var mapa = {};
  for (var i = 0; i < valores.length; i++) {
    var clave = String(valores[i][0]).trim();
    if (clave) mapa[clave] = valores[i][1];
  }

  var hoy = mapa['Fecha de corrida'] instanceof Date
    ? mapa['Fecha de corrida']
    : new Date();

  var p = {
    carpetaEntrada: String(mapa['Carpeta de Drive con el libro MX'] || '').trim(),
    nombreData: String(mapa['Nombre del archivo Data'] || 'data').trim(),
    hoy: FECHAS.aSerial(hoy),
    modo: String(mapa['Modo de ventana'] || 'rango').trim().toLowerCase(),
    columna: String(mapa['Columna de semana'] || 'W').trim().toUpperCase(),
    desde: mapa['Desde'] instanceof Date ? FECHAS.aSerial(mapa['Desde']) : null,
    hasta: mapa['Hasta'] instanceof Date ? FECHAS.aSerial(mapa['Hasta']) : null,
    estatus: String(mapa['Estatus a conservar'] || 'SHORTAGE')
      .split(',').map(function (s) { return s.trim().toUpperCase(); }).filter(String),
    sustituciones: {},
    incluirOpenPO: String(mapa['Leer Open_PO'] || 'SI').trim().toUpperCase() !== 'NO',
    escribirKB: String(mapa['Escribir KB Supply'] || 'SI').trim().toUpperCase() !== 'NO',
  };

  var de = String(mapa['DEFAULT_BUYER a sustituir'] || 'LZR22').trim();
  var a = String(mapa['Se escribe como'] || 'Luis Rodriguez').trim();
  if (de) p.sustituciones[de.toUpperCase()] = a;

  if (p.modo === 'rango') {
    if (!p.desde) p.desde = p.hoy;
    if (!p.hasta) p.hasta = FECHAS.finDeMes(FECHAS.inicioMesSiguiente(p.hoy));
    if (p.hasta < p.desde) throw new Error('En la hoja Config, "Hasta" es anterior a "Desde".');
  }
  if (!p.carpetaEntrada) {
    throw new Error('En la hoja Config falta "Carpeta de Drive con el libro MX".');
  }
  return p;
}

/** El libro que contiene este script. */
function libroTrabajo() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/** Escribe un renglon en la bitacora, para que quede rastro de cada corrida. */
function bitacora(mensaje, nivel) {
  try {
    var hoja = libroTrabajo().getSheetByName(HOJAS_TRABAJO.BITACORA);
    if (!hoja) return;
    hoja.insertRowAfter(1);
    hoja.getRange(2, 1, 1, 4).setValues([[
      new Date(), nivel || 'info', Session.getActiveUser().getEmail() || '', String(mensaje),
    ]]);
  } catch (e) {
    // La bitacora nunca debe tumbar el proceso.
    console.log('bitacora: ' + e.message);
  }
}
