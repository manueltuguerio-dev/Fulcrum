/**
 * TLTERMINALS · Tarifarios — tipo de cambio del día.
 *
 * Las tarifas de cruce vienen en dólares y las nacionales en pesos. Para
 * compararlas hay que llevarlas a la misma moneda, y con qué tipo de cambio se
 * haga cambia quién gana: no es lo mismo 17.20 que 18.40 sobre un flete de
 * 1,325 USD.
 *
 * El dato se saca de GOOGLEFINANCE, que ya vive dentro de Google Sheets: no
 * hace falta contratar un servicio ni guardar llaves de nadie. Se consulta una
 * vez al día y se guarda; si la consulta falla, se sigue usando el último valor
 * conocido y se dice de dónde salió.
 */

var HOJA_TIPO_CAMBIO = '_TipoCambio';

/**
 * El tipo de cambio con el que hay que convertir hoy.
 * @param {boolean} forzar Si sí, vuelve a consultar aunque ya se haya
 *     consultado hoy.
 * @return {Object} {valor, fecha, origen, automatico}
 */
function tipoCambioDelDia_(forzar) {
  var cfg = configCompleta_();
  var manual = numero_(cfg.tipoCambioUSD, 17.5);
  var auto = esSi_(cfg.tipoCambioAuto);
  var fecha = texto_(cfg.tipoCambioFecha);
  var hoy = hoyTexto_();

  if (!auto) {
    return { valor: manual, fecha: fecha, origen: 'manual', automatico: false };
  }
  if (!forzar && fecha === hoy) {
    return {
      valor: manual, fecha: fecha,
      origen: texto_(cfg.tipoCambioOrigen) || 'GOOGLEFINANCE', automatico: true
    };
  }

  var consultado = consultarTipoCambio_();
  if (consultado === null) {
    // Se queda el último bueno: es preferible convertir con el de ayer que
    // dejar de comparar.
    return {
      valor: manual,
      fecha: fecha,
      origen: fecha ? 'GOOGLEFINANCE (' + fecha + ', no se pudo actualizar hoy)'
                    : 'manual (no se pudo consultar)',
      automatico: true,
      falloHoy: true
    };
  }

  escribirConfig('tipoCambioUSD', String(consultado));
  escribirConfig('tipoCambioFecha', hoy);
  escribirConfig('tipoCambioOrigen', 'GOOGLEFINANCE');
  return { valor: consultado, fecha: hoy, origen: 'GOOGLEFINANCE', automatico: true };
}

/**
 * Le pregunta a Sheets. La fórmula tarda en resolverse, así que se espera a
 * que deje de decir "Loading".
 * @return {number|null} El tipo de cambio, o null si no se pudo.
 * @private
 */
function consultarTipoCambio_() {
  try {
    var libro = libro_();
    var hoja = libro.getSheetByName(HOJA_TIPO_CAMBIO);
    if (!hoja) {
      hoja = libro.insertSheet(HOJA_TIPO_CAMBIO);
      hoja.hideSheet();
    }
    hoja.getRange('A1').setFormula('=GOOGLEFINANCE("CURRENCY:USDMXN")');
    SpreadsheetApp.flush();

    for (var intento = 0; intento < 6; intento++) {
      var valor = hoja.getRange('A1').getValue();
      if (typeof valor === 'number' && valor > 0) {
        hoja.getRange('A1').clearContent();
        return redondear_(valor, 4);
      }
      Utilities.sleep(500);
      SpreadsheetApp.flush();
    }
    hoja.getRange('A1').clearContent();
    return null;
  } catch (err) {
    Logger.log('No pude consultar el tipo de cambio: ' + err.message);
    return null;
  }
}

/**
 * Botón "actualizar ahora". Devuelve el tipo de cambio recién consultado.
 * @return {Object} {valor, fecha, origen, automatico, falloHoy}
 */
function apiActualizarTipoCambio() {
  exigirAdmin_();
  var tc = tipoCambioDelDia_(true);
  bitacora_('tipo_cambio', String(tc.valor), tc);
  return tc;
}
