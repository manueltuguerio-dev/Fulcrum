/**
 * Orquestador del proceso, escrito como maquina de estados.
 *
 * Apps Script corta cualquier ejecucion a los 6 minutos, y una corrida
 * completa sobre estos volumenes no cabe en una sola. Por eso el proceso
 * avanza por fases: cada una revisa el reloj, y si se le acaba el tiempo
 * guarda donde iba y programa un disparador que la retoma un minuto despues.
 * Desde afuera se ve como una sola corrida larga.
 *
 * El estado vive en un JSON en Drive y no en PropertiesService, porque los
 * acumuladores de las fuentes rebasan el limite de 9 KB por propiedad.
 */

var FASES = ['CONVERTIR', 'DATA', 'ONHAND', 'GAPS', 'PLAN', 'OPENPO',
  'CALCULAR', 'DETAILS', 'KB', 'CONSOLIDAR', 'LIMPIAR', 'FIN'];

var DESCRIPCION_FASE = {
  CONVERTIR: 'Convirtiendo el libro MX a Hojas de calculo',
  DATA: 'Leyendo el archivo Data',
  ONHAND: 'Leyendo On hand',
  GAPS: 'Leyendo GAPs files',
  PLAN: 'Leyendo SupplyPlan',
  OPENPO: 'Leyendo Open_PO',
  CALCULAR: 'Calculando proyeccion y estatus',
  DETAILS: 'Escribiendo Details',
  KB: 'Escribiendo KB Supply',
  CONSOLIDAR: 'Armando el consolidado por proveedor',
  LIMPIAR: 'Limpiando archivos temporales',
  FIN: 'Terminado',
};

// ---------------------------------------------------------------------------
// Puntos de entrada
// ---------------------------------------------------------------------------

/** Arranca una corrida nueva. Descarta cualquier estado anterior. */
function iniciarProceso() {
  borrarDisparadores();
  var p = leerParametros();
  var estado = {
    fase: 'CONVERTIR',
    inicio: new Date().toISOString(),
    parametros: p,
    cursor: 0,
    avisos: [],
    pasos: [],
    temporales: [],
    acumulado: FUENTES.acumuladoresVacios(),
  };
  guardarEstado(estado);
  bitacora('Corrida iniciada', 'info');
  return continuarProceso();
}

/**
 * Avanza el proceso hasta terminar o hasta que se acabe el presupuesto de la
 * ejecucion. Es tambien la funcion que llama el disparador de continuacion.
 */
function continuarProceso() {
  var candado = LockService.getScriptLock();
  if (!candado.tryLock(5000)) {
    return { fase: 'OCUPADO', mensaje: 'Ya hay una ejecucion en curso.' };
  }
  try {
    var estado = leerEstado();
    if (!estado) return { fase: 'SIN_ESTADO', mensaje: 'No hay ninguna corrida en curso.' };

    var reloj = nuevoReloj();
    while (estado.fase !== 'FIN') {
      if (reloj.seAcaba()) {
        guardarEstado(estado);
        programarContinuacion();
        return resumenEstado(estado, false);
      }
      ejecutarFase(estado, reloj);
      guardarEstado(estado);
    }

    borrarDisparadores();
    bitacora('Corrida terminada: ' + estado.resumen.renglonesEnRiesgo + ' renglones en riesgo', 'ok');
    return resumenEstado(estado, true);

  } catch (e) {
    borrarDisparadores();
    bitacora('Error: ' + e.message, 'error');
    var est = leerEstado();
    if (est) { est.error = e.message; guardarEstado(est); }
    throw e;
  } finally {
    candado.releaseLock();
  }
}

/** Estado de la corrida, para que la interfaz muestre el avance. */
function estadoProceso() {
  var estado = leerEstado();
  if (!estado) return { fase: 'SIN_ESTADO', descripcion: 'No hay ninguna corrida en curso.' };
  return resumenEstado(estado, estado.fase === 'FIN');
}

function resumenEstado(estado, terminado) {
  return {
    fase: estado.fase,
    descripcion: DESCRIPCION_FASE[estado.fase] || estado.fase,
    terminado: terminado,
    error: estado.error || null,
    avisos: estado.avisos || [],
    pasos: estado.pasos || [],
    resumen: estado.resumen || null,
    proveedores: estado.proveedores || [],
    cursor: estado.cursor || 0,
  };
}

/** Cancela una corrida a medias y limpia lo que dejo. */
function cancelarProceso() {
  var estado = leerEstado();
  borrarDisparadores();
  if (estado) limpiarTemporales(estado);
  borrarEstado();
  bitacora('Corrida cancelada por el usuario', 'adv');
  return { fase: 'SIN_ESTADO', descripcion: 'Corrida cancelada.' };
}

// ---------------------------------------------------------------------------
// Las fases
// ---------------------------------------------------------------------------

function ejecutarFase(estado, reloj) {
  switch (estado.fase) {
    case 'CONVERTIR':   return faseConvertir(estado);
    case 'DATA':        return faseData(estado);
    case 'ONHAND':      return faseFuente(estado, 'ONHAND', FUENTES.leerOnHand, 'onHand', reloj);
    case 'GAPS':        return faseFuente(estado, 'GAPS', FUENTES.leerGaps, 'gaps', reloj);
    case 'PLAN':        return faseFuente(estado, 'PLAN', FUENTES.leerSupplyPlan, 'plan', reloj);
    case 'OPENPO':      return faseOpenPO(estado, reloj);
    case 'CALCULAR':    return faseCalcular(estado);
    case 'DETAILS':     return faseDetails(estado);
    case 'KB':          return faseKB(estado, reloj);
    case 'CONSOLIDAR':  return faseConsolidar(estado);
    case 'LIMPIAR':     return faseLimpiar(estado);
    default: throw new Error('Fase desconocida: ' + estado.fase);
  }
}

function siguienteFase(estado) {
  var i = FASES.indexOf(estado.fase);
  estado.fase = FASES[i + 1];
  estado.cursor = 0;
}

/**
 * Convierte a Hojas de calculo el libro MX y el archivo Data que estan en la
 * carpeta de Drive configurada. Los originales no se tocan: se crea una copia
 * convertida que al final se borra.
 */
function faseConvertir(estado) {
  var carpeta = carpetaPorIdOUrl(estado.parametros.carpetaEntrada);
  var archivos = archivosDeExcel(carpeta);
  if (!archivos.length) {
    throw new Error('La carpeta "' + carpeta.getName() + '" no tiene ningun archivo .xlsx.');
  }

  var patronData = estado.parametros.nombreData.toLowerCase();
  var data = null;
  var mx = null;
  for (var i = 0; i < archivos.length; i++) {
    var nombre = archivos[i].getName().toLowerCase();
    if (!data && nombre.indexOf(patronData) !== -1) data = archivos[i];
    else if (!mx) mx = archivos[i];
  }
  if (!data) throw new Error('No encontre un archivo cuyo nombre contenga "' + estado.parametros.nombreData + '".');
  if (!mx) throw new Error('Encontre el archivo Data pero no el libro MX en la misma carpeta.');

  estado.nombreMx = mx.getName();
  estado.nombreData = data.getName();
  estado.idMxSheet = convertirASheet(mx);
  estado.idDataSheet = convertirASheet(data);
  estado.temporales = [estado.idMxSheet, estado.idDataSheet];

  estado.pasos.push({
    n: 0,
    titulo: 'Archivos convertidos',
    detalle: 'Libro MX: "' + mx.getName() + '". Data: "' + data.getName() + '". '
      + 'Se convirtieron a Hojas de calculo sin modificar los originales.',
  });
  siguienteFase(estado);
}

/** Copia un .xlsx de Drive como Hoja de calculo y devuelve el id de la copia. */
function convertirASheet(archivo) {
  var copia = Drive.Files.copy(
    { title: 'MXSA temporal - ' + archivo.getName(), mimeType: MimeType.GOOGLE_SHEETS },
    archivo.getId()
  );
  return copia.id;
}

function carpetaPorIdOUrl(valor) {
  var id = valor;
  var m = /[-\w]{25,}/.exec(String(valor));
  if (m) id = m[0];
  try {
    return DriveApp.getFolderById(id);
  } catch (e) {
    throw new Error('No pude abrir la carpeta de Drive "' + valor + '". '
      + 'Pega la liga completa de la carpeta o su id, y verifica que tengas acceso.');
  }
}

function archivosDeExcel(carpeta) {
  var salida = [];
  var it = carpeta.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var n = f.getName().toLowerCase();
    if (n.slice(-5) === '.xlsx' || n.slice(-5) === '.xlsm') salida.push(f);
  }
  // El libro MX es el mas grande; asi queda primero cuando no se distingue por nombre.
  salida.sort(function (a, b) { return b.getSize() - a.getSize(); });
  return salida;
}

/** Lee el archivo Data, arma la lista de partes y las llaves de interes. */
function faseData(estado) {
  var libroData = SpreadsheetApp.openById(estado.idDataSheet);
  var filas = FUENTES.leerData(libroData, null);
  var lectura = MOTOR.leerPartes(filas, estado.parametros.sustituciones);

  if (!lectura.partes.length) {
    throw new Error('El archivo Data no tiene ningun renglon con ORG y PART.');
  }
  for (var i = 0; i < lectura.omitidas.length; i++) {
    estado.avisos.push('Fila ' + lectura.omitidas[i].fila + ' del archivo Data ignorada por no traer '
      + 'ORG ni PART: "' + lectura.omitidas[i].concat + '"');
  }

  estado.partes = lectura.partes;
  estado.claves = MOTOR.clavesDeInteres(lectura.partes);
  estado.encabezado = FUENTES.leerEncabezado(SpreadsheetApp.openById(estado.idMxSheet));

  var sust = [];
  for (var k in estado.parametros.sustituciones) sust.push(k + ' -> ' + estado.parametros.sustituciones[k]);
  estado.pasos.push({
    n: 1,
    titulo: 'Details llenado desde Data',
    detalle: lectura.partes.length + ' partes leidas. DEFAULT_BUYER sustituido en '
      + lectura.sustituidas + ' renglones: ' + sust.join(', ') + '.',
  });
  siguienteFase(estado);
}

/** Fases de lectura de las hojas grandes, todas con la misma mecanica. */
function faseFuente(estado, nombreFase, lector, llaveAcumulado, reloj) {
  var libro = SpreadsheetApp.openById(estado.idMxSheet);
  var r = lector(libro, estado.claves, estado.acumulado[llaveAcumulado], estado.cursor || undefined, reloj);
  if (r.terminado) siguienteFase(estado);
  else estado.cursor = r.siguiente;
}

function faseOpenPO(estado, reloj) {
  if (!estado.parametros.incluirOpenPO) {
    estado.avisos.push('No se leyo Open_PO por configuracion. Las filas "Promise. Open POs" '
      + 'y "Need. Open POs" quedan en cero; no intervienen en la proyeccion ni en el estatus.');
    siguienteFase(estado);
    return;
  }
  faseFuente(estado, 'OPENPO', FUENTES.leerOpenPO, 'openPO', reloj);
}

/** Calcula, filtra y deja listos los registros para escribirse. */
function faseCalcular(estado) {
  var c = MOTOR.calcular(estado.partes, estado.acumulado, estado.encabezado, estado.parametros.hoy);
  var ventana = MOTOR.resolverVentana(estado.encabezado.semanas, estado.parametros);
  var filtrados = MOTOR.filtrar(c.registros, estado.parametros.estatus, ventana.indices);

  estado.registros = c.registros;
  estado.ventana = ventana;
  estado.idsFiltrados = filtrados.map(function (r) { return r.id; });

  // Los acumuladores ya no hacen falta y son lo mas pesado del estado.
  estado.acumulado = null;
  estado.claves = null;
  estado.partes = null;

  var porEstatus = {};
  for (var i = 0; i < c.registros.length; i++) {
    porEstatus[c.registros[i].estatus] = (porEstatus[c.registros[i].estatus] || 0) + 1;
  }
  var partesUnicas = {};
  var proveedores = {};
  for (var j = 0; j < filtrados.length; j++) {
    partesUnicas[String(filtrados[j].part)] = true;
    proveedores[String(filtrados[j].supplier)] = true;
  }

  if (c.avisos.sinGaps === c.registros.length) {
    estado.avisos.push('Ninguna de las ' + c.registros.length + ' partes aparece en la hoja '
      + '"GAPs files". Supplier OH y la fila Arrivals quedan en cero para todas, tal como los '
      + 'calcularia Excel: la proyeccion solo resta el plan de suministro al inventario propio.');
  }
  if (c.avisos.sinPlan) {
    estado.avisos.push(c.avisos.sinPlan + ' partes no tienen renglon en SupplyPlan; su demanda cuenta como cero.');
  }
  var recortes = [['onHandRec', 'On hand'], ['gapsRec', 'GAPs files'], ['planRec', 'SupplyPlan']];
  for (var z = 0; z < recortes.length; z++) {
    if (c.avisos[recortes[z][0]]) {
      estado.avisos.push(c.avisos[recortes[z][0]] + ' coincidencias en ' + recortes[z][1]
        + ' requirieron ignorar espacios sobrantes en la llave.');
    }
  }

  var ultimaFila = CFG.PRIMERA_FILA_BLOQUE + c.registros.length * CFG.BLOQUE - 1;
  estado.ultimaFilaKB = ultimaFila;
  estado.pasos.push({
    n: 2,
    titulo: 'KB Supply calculado',
    detalle: 'Bloque de 6 filas por parte, ' + c.registros.length + ' bloques, hasta la fila '
      + ultimaFila + '. Se escriben los valores calculados, no las formulas.',
  });
  estado.pasos.push({
    n: 3,
    titulo: 'Filtros aplicados',
    detalle: 'Estatus ' + estado.parametros.estatus.join(' / ') + '; proyeccion negativa en '
      + ventana.descripcion + '. Quedan ' + filtrados.length + ' renglones de ' + c.registros.length + '.',
  });

  estado.resumen = {
    hoy: FECHAS.aIso(estado.parametros.hoy),
    totalPartes: c.registros.length,
    porEstatus: porEstatus,
    estatusFiltrado: estado.parametros.estatus,
    ventana: ventana.descripcion,
    desde: FECHAS.aIso(ventana.desde),
    hasta: FECHAS.aIso(ventana.hasta),
    renglonesEnRiesgo: filtrados.length,
    partesUnicas: Object.keys(partesUnicas).length,
    proveedores: Object.keys(proveedores).length,
  };
  siguienteFase(estado);
}

function faseDetails(estado) {
  ESCRITURA.escribirDetails(estado.registros);
  siguienteFase(estado);
}

function faseKB(estado, reloj) {
  if (!estado.parametros.escribirKB) {
    estado.avisos.push('No se escribio la hoja KB Supply por configuracion.');
    siguienteFase(estado);
    return;
  }
  var r = ESCRITURA.escribirKB(estado, estado.cursor || 0, reloj);
  if (r.terminado) siguienteFase(estado);
  else estado.cursor = r.siguiente;
}

function faseConsolidar(estado) {
  var filtradosSet = {};
  for (var i = 0; i < estado.idsFiltrados.length; i++) filtradosSet[estado.idsFiltrados[i]] = true;
  var filtrados = estado.registros.filter(function (r) { return filtradosSet[r.id]; });

  var proveedores = REPORTE.consolidar(filtrados, estado.ventana.indices);
  REPORTE.escribirConsolidado(proveedores, filtrados, estado);

  estado.proveedores = proveedores.map(function (p) {
    return {
      nombre: p.nombre,
      partes: p.totalPartes,
      renglones: p.totalRenglones,
      faltante: Math.round(p.totalFaltante * 100) / 100,
      fecha: p.fechaMasProxima ? FECHAS.aIso(p.fechaMasProxima) : null,
      correos: CONTACTOS.correosDe(p.nombre),
    };
  });
  estado.pasos.push({
    n: 4,
    titulo: 'Consolidado listo',
    detalle: proveedores.length + ' proveedores, ' + estado.resumen.partesUnicas
      + ' numeros de parte unicos. Ve la hoja "' + HOJAS_TRABAJO.CONSOLIDADO + '".',
  });

  // Los registros completos ya cumplieron; se conserva solo lo filtrado para
  // que la pantalla de correo pueda armar los mensajes sin recalcular.
  estado.registros = filtrados;
  siguienteFase(estado);
}

function faseLimpiar(estado) {
  limpiarTemporales(estado);
  siguienteFase(estado);
}

function limpiarTemporales(estado) {
  var ids = estado.temporales || [];
  for (var i = 0; i < ids.length; i++) {
    try { DriveApp.getFileById(ids[i]).setTrashed(true); }
    catch (e) { console.log('No se pudo borrar el temporal ' + ids[i] + ': ' + e.message); }
  }
  estado.temporales = [];
}

// ---------------------------------------------------------------------------
// Estado persistente y disparadores
// ---------------------------------------------------------------------------

function guardarEstado(estado) {
  var contenido = JSON.stringify(estado);
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(CFG.PROP_ESTADO);
  var blob = Utilities.newBlob(contenido, 'application/json', CFG.ARCHIVO_ESTADO);
  if (id) {
    try { DriveApp.getFileById(id).setContent(contenido); return; }
    catch (e) { /* se volvera a crear abajo */ }
  }
  var archivo = carpetaDelLibro().createFile(blob);
  props.setProperty(CFG.PROP_ESTADO, archivo.getId());
}

function leerEstado() {
  var id = PropertiesService.getScriptProperties().getProperty(CFG.PROP_ESTADO);
  if (!id) return null;
  try {
    var texto = DriveApp.getFileById(id).getBlob().getDataAsString();
    return texto ? JSON.parse(texto) : null;
  } catch (e) {
    return null;
  }
}

function borrarEstado() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(CFG.PROP_ESTADO);
  if (id) {
    try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* ya no existe */ }
  }
  props.deleteProperty(CFG.PROP_ESTADO);
}

/** Carpeta donde vive el libro de trabajo; ahi se guarda el estado. */
function carpetaDelLibro() {
  var archivo = DriveApp.getFileById(libroTrabajo().getId());
  var padres = archivo.getParents();
  return padres.hasNext() ? padres.next() : DriveApp.getRootFolder();
}

function programarContinuacion() {
  borrarDisparadores();
  ScriptApp.newTrigger(CFG.DISPARADOR).timeBased().after(60 * 1000).create();
}

function borrarDisparadores() {
  var todos = ScriptApp.getProjectTriggers();
  for (var i = 0; i < todos.length; i++) {
    if (todos[i].getHandlerFunction() === CFG.DISPARADOR) ScriptApp.deleteTrigger(todos[i]);
  }
}
