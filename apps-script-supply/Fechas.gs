/**
 * Conversion entre fechas y el numero de serie de Excel (base 1900).
 *
 * El libro guarda toda la fila 9 de "KB Supply" y los encabezados de
 * SupplyPlan y GAPs files como fechas seriales. Sheets las entrega como Date,
 * asi que el motor trabaja en seriales y solo convierte en las orillas.
 */

var FECHAS = (function () {
  var MS_DIA = 86400000;
  // Excel cuenta 1900 como bisiesto; el ancla que corrige ese desfase es
  // 1899-12-30 = serial 0.
  var EPOCA = Date.UTC(1899, 11, 30);
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  /**
   * Serial de una fecha. Acepta Date, numero (ya es serial) o texto ISO.
   * De un Date se toman ano, mes y dia locales: una fecha capturada en Sheets
   * representa un dia del calendario, no un instante.
   */
  function aSerial(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Math.round(v);
    if (v instanceof Date) {
      return Math.round((Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()) - EPOCA) / MS_DIA);
    }
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    if (m) return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - EPOCA) / MS_DIA);
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : aSerial(d);
  }

  function aFecha(serial) {
    if (serial === null || serial === undefined) return null;
    var d = new Date(EPOCA + Math.round(serial) * MS_DIA);
    // Se devuelve como fecha local para que Sheets la muestre sin corrimiento.
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  function aIso(serial) {
    var d = aFecha(serial);
    if (!d) return '';
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  /** "19-oct-2026", para encabezados y correos. */
  function enEspanol(serial) {
    var d = aFecha(serial);
    if (!d) return '';
    return ('0' + d.getDate()).slice(-2) + '-' + MESES[d.getMonth()] + '-' + d.getFullYear();
  }

  /** "octubre 2026", para los encabezados mensuales del consolidado. */
  function mesLargo(serial) {
    var d = aFecha(serial);
    if (!d) return '';
    return MESES_LARGO[d.getMonth()] + ' ' + d.getFullYear();
  }

  function finDeMes(serial) {
    var d = aFecha(serial);
    return aSerial(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }

  function inicioMesSiguiente(serial) {
    var d = aFecha(serial);
    return aSerial(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  function hoy() {
    var n = new Date();
    return aSerial(new Date(n.getFullYear(), n.getMonth(), n.getDate()));
  }

  return {
    aSerial: aSerial, aFecha: aFecha, aIso: aIso, enEspanol: enEspanol,
    mesLargo: mesLargo, finDeMes: finDeMes, inicioMesSiguiente: inicioMesSiguiente, hoy: hoy,
  };
})();

/** "AF" -> 32 */
function letraANumero(letra) {
  var n = 0;
  var s = String(letra).toUpperCase();
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n;
}

/** 32 -> "AF" */
function numeroALetra(n) {
  var s = '';
  while (n > 0) {
    var r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
